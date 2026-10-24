"""Record frozen frame direction ranges using the actual native effect sampler."""
import argparse, json, subprocess, tempfile
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('game_root',type=Path)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args(); source=args.game_root.resolve()/'source'
code=r'''
#include "effect_profile.h"
#include <stdio.h>
#include <string.h>
static unsigned char bytes[1024];
uint8_t game_memory_read_u8(GameMemory *m,GameAddress a){if(a<0x1000||a>=0x1400){m->fault=1;return 0;}return bytes[a-0x1000];}
uint16_t game_memory_read_u16(GameMemory *m,GameAddress a){return game_memory_read_u8(m,a)|(game_memory_read_u8(m,a+1)<<8);}
uint32_t game_memory_read_u32(GameMemory *m,GameAddress a){return game_memory_read_u16(m,a)|((uint32_t)game_memory_read_u16(m,a+2)<<16);}
static void put(unsigned at,unsigned value,unsigned size){memcpy(bytes+at,&value,size);}
int main(void){GameMemory m={0};EffectProfileSample sample;unsigned i,start=0,last=0,mirror=0;int visible;
put(0,0x1100,4);put(4,3,2);put(6,4,2);put(0x20,9,1);put(0x22,256,2);put(0x1c,0x3e000000,4);
for(i=0;i<12;i++)put(0x100+i*4,(i/3==3?1:i/3)*3+i%3,4);
printf("{\"angles\":2048,\"ranges\":[");
for(i=0;i<2048;i++){
if(!effect_profile_sample(&m,0x1000,i,0,&sample,&visible)||!visible)return 2;
if(i && (sample.texture!=last || sample.mirrored!=mirror)){printf("[%u,%u,%u,%u],",start,i-1,last,mirror);start=i;}
last=sample.texture;mirror=sample.mirrored;
}
printf("[%u,2047,%u,%u]]}\n",start,last,mirror);return m.fault?3:0;}
'''
with tempfile.TemporaryDirectory(prefix='uprising-soldier-native-') as tmp:
    tmp=Path(tmp); probe=tmp/'probe.c';probe.write_text(code,encoding='utf-8');exe=tmp/'probe.exe'
    command=['gcc','-O2','-flto','-ffunction-sections','-fdata-sections','-I'+str(source/'core'),str(probe),str(source/'core/effect_profile.c'),'-Wl,--gc-sections','-o',str(exe)]
    subprocess.run(command,check=True,capture_output=True,text=True)
    report=json.loads(subprocess.check_output([str(exe)],text=True))
report.update(source_commit=subprocess.check_output(['git','-C',str(args.game_root),'rev-parse','HEAD'],text=True).strip(),scope='Actual effect_profile_sample at tick 0 with insit metadata and folded frame handles; bounded memory adapter. Does not verify camera bearing or original-game pixels.')
args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
