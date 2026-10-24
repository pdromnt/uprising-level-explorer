"""Check default owner palettes and primary citadel factory requests with native C."""
import argparse,json,re,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('game_root',type=Path);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
source=args.game_root.resolve()/'source'
words={int(a,16):int(v,16) for a,v in re.findall(r'\{0x([0-9a-f]+)u,\s*0x([0-9a-f]+)u\}',(source/'core/initial_numeric_records.inc').read_text(encoding='utf-8'))}
rows=','.join(str(words[0x589748+i*4])+'u' for i in range(7))
code=r'''
#include "gameplay_state.h"
#include <stdio.h>
#include <string.h>
static unsigned char bytes[0x200000];
uint8_t game_memory_read_u8(GameMemory *m,GameAddress a){if(a<0x400000||a>=0x600000){m->fault=1;return 0;}return bytes[a-0x400000];}
uint16_t game_memory_read_u16(GameMemory *m,GameAddress a){return game_memory_read_u8(m,a)|((uint16_t)game_memory_read_u8(m,a+1)<<8);}
uint32_t game_memory_read_u32(GameMemory *m,GameAddress a){return game_memory_read_u16(m,a)|((uint32_t)game_memory_read_u16(m,a+2)<<16);}
void game_memory_write_u8(GameMemory *m,GameAddress a,uint8_t v){if(a<0x400000||a>=0x600000){m->fault=1;return;}bytes[a-0x400000]=v;}
void game_memory_write_u16(GameMemory *m,GameAddress a,uint16_t v){game_memory_write_u8(m,a,v);game_memory_write_u8(m,a+1,v>>8);}
void game_memory_write_u32(GameMemory *m,GameAddress a,uint32_t v){game_memory_write_u16(m,a,v);game_memory_write_u16(m,a+2,v>>16);}
static unsigned captured_kind,captured_slot;
static int catalog(void *c,GameAddress owner,uint8_t kind,unsigned property,uint32_t *v){(void)c;(void)owner;if(kind!=35||property!=3)return 0;*v=1;return 1;}
static int create(void *c,uint8_t kind,uint16_t slot,GameAddress *out){(void)c;captured_kind=kind;captured_slot=slot;*out=0x420000;return 1;}
int main(void){GameMemory m={0};unsigned i,j;const unsigned colors[]={ROWS};GameplayGroupServices s={0};
for(i=0;i<7;i++)game_memory_write_u32(&m,0x589748+i*4,colors[i]);
printf("{\"owner_maps\":[");for(i=0;i<7;i++){gameplay_state_apply_palette(&m,0x400000,i);printf("%s[",i?",":"");for(j=0;j<4;j++)printf("%s%u",j?",":"",game_memory_read_u8(&m,0x40000c+j));printf("]");}
s.catalog_value=catalog;s.create=create;game_memory_write_u32(&m,0x410054,0x430000);
if(!gameplay_group_primary_construct(&m,&s,0x440000,0x410000))return 2;
printf("],\"primary_kind\":%u,\"factory_slot\":%u,\"payload\":%u}\n",captured_kind,captured_slot,game_memory_read_u32(&m,0x440048));return m.fault?3:0;}
'''.replace('ROWS',rows)
with tempfile.TemporaryDirectory(prefix='uprising-exploration-') as tmp:
    tmp=Path(tmp);probe=tmp/'probe.c';probe.write_text(code,encoding='utf-8');exe=tmp/'probe.exe'
    subprocess.run(['gcc','-O2','-flto','-ffunction-sections','-fdata-sections','-I'+str(source/'core'),str(probe),str(source/'core/gameplay_state.c'),'-Wl,--gc-sections','-o',str(exe)],check=True,capture_output=True,text=True)
    report=json.loads(subprocess.check_output([str(exe)],text=True))
report.update(source_commit=subprocess.check_output(['git','-C',str(args.game_root),'rev-parse','HEAD'],text=True).strip(),scope='Actual gameplay_state_apply_palette for seven default rows, and gameplay_group_primary_construct with captured factory ports. Does not verify campaign/network color assignment or full citadel activation.')
args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
