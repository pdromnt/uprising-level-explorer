"""Compare exported preview slots with the actual native defaults/catalog functions."""
import argparse,json,re,subprocess,tempfile
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('game_root',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
source=args.game_root.resolve()/'source';project=Path(__file__).resolve().parent.parent
catalog=json.loads((project/'src/core/model-catalog.json').read_text());requests=[]
fields={32:0x2e0,33:0x2a0,34:0x2c0,35:0x2d0,36:0x2cc,37:0x2c4,38:0x2b0,39:0x2a4,40:0x2c8,41:0x2b8,64:0x29c,128:0x29c,129:0x2a0,130:0x2a4,131:0x2b0,132:0x29c,133:0x2a0,134:0x2a4,135:0x2b0}
for manager,banks in catalog['catalogs'].items():
    mapping=fields
    if manager!='player':
        text=(source/'game/level_player_catalog.c').read_text();text=text.split('static AiFamily '+('ai_family' if manager=='clan' else 'imperial_family'))[1].split('}return result;')[0]
        mapping={int(k,16):int(f,16) for k,f in re.findall(r'case 0x([0-9a-f]+):result=\(AiFamily\)\{0x([0-9a-f]+),0x[0-9a-f]+\}',text)}
    for kind,slots in banks.items():
        for choice,slot in enumerate(slots):requests.append((manager,int(kind),mapping[int(kind)],choice,slot))
methods={'player':0x47e280,'clan':0x477e00,'imperial':0x479990}
rows=',\n'.join('{%d,%d,%d,%d,%d}'%(methods[m],k,f,c,s) for m,k,f,c,s in requests)
code=r'''
#include "application_entry.h"
#include "unit_defaults.h"
#include "level_player_resources.h"
#include "game_state_ops.h"
#include "screen_primitives.h"
#include <math.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
static unsigned char bytes[0x400000];
uint32_t game_memory_read_u32(GameMemory *m,GameAddress a){uint32_t value;if(a<0x400000||a>0x7ffffc){m->fault=1;return 0;}memcpy(&value,bytes+a-0x400000,4);return value;}
void game_memory_write_u32(GameMemory *m,GameAddress a,uint32_t v){if(a<0x400000||a>0x7ffffc){m->fault=1;return;}memcpy(bytes+a-0x400000,&v,4);}
typedef struct Chain{GameAddress base,source;unsigned width,count;}Chain;
static const Chain chains[]={
#include "unit_inheritance.inc"
{0x5e7d50,0,21,4},{0x5e4fc0,0,21,15},{0x5e6d80,0,21,1}};
static const unsigned requests[][5]={REQUEST_ROWS};
int main(void){GameApplication a={0};unsigned i,j,mismatches=0;uint32_t value;
for(i=0;i<sizeof(chains)/sizeof(*chains);i++)for(j=0;j<chains[i].count;j++)game_state_reset_pair_array(&a.memory,chains[i].base+j*(chains[i].width==21?176:112),chains[i].width,chains[i].width*4);
if(!game_menu_game_defaults(&a))return 2;
for(i=0;i<sizeof(requests)/sizeof(*requests);i++){const unsigned *r=requests[i];game_memory_write_u32(&a.memory,0x700000,0x701000);game_memory_write_u32(&a.memory,0x701044,r[0]);game_memory_write_u32(&a.memory,0x700000+r[2],r[3]);if(!game_level_player_catalog_value(&a,0x700000,r[1],3,0,&value)||value!=r[4]){++mismatches;fprintf(stderr,"row %u: %u != %u\n",i,value,r[4]);}}
{const int dimensions[][2]={{64,64},{128,64},{64,128}};
for(i=0;i<3;i++){int w=dimensions[i][0],h=dimensions[i][1];float s=256.0f*(w<h?(float)w/h:1),t=256.0f*(h<w?(float)h/w:1);GameWorldVertexInput in={0};GameRenderVertex out;GameWorldPolygonParams p={0};in.depth=1;in.u=w-1;in.v=h-1;p.width=w;p.height=h;p.fog_scale=256;if(!game_screen_build_world_polygon(&out,&in,1,&p)||fabsf(out.sow0/s-in.u/w)>1e-6f||fabsf(out.tow0/t-in.v/h)>1e-6f)++mismatches;}}
printf("{\"queries\":%u,\"uv_cases\":3,\"mismatches\":%u}\n",(unsigned)(sizeof(requests)/sizeof(*requests)),mismatches);return mismatches?1:0;}
'''.replace('REQUEST_ROWS',rows)
with tempfile.TemporaryDirectory(prefix='uprising-model-catalog-') as temp:
    temp=Path(temp);probe=temp/'probe.c';probe.write_text(code);exe=temp/'probe.exe'
    command=['gcc','-O2','-flto','-ffunction-sections','-fdata-sections','-I'+str(source/'core'),'-I'+str(source/'game'),str(probe),str(source/'game/unit_defaults.c'),str(source/'game/level_player_catalog.c'),str(source/'core/gameplay_catalog.c'),str(source/'core/game_state_ops.c'),str(source/'core/screen_primitives.c'),'-Wl,--gc-sections','-o',str(exe)]
    subprocess.run(command,check=True,capture_output=True,text=True)
    run=subprocess.run([str(exe)],check=True,capture_output=True,text=True);report=json.loads(run.stdout)
report.update(source_commit=subprocess.check_output(['git','-C',str(args.game_root),'rev-parse','HEAD'],text=True).strip(),catalog_source_commit=catalog['source_commit'],scope='Actual unit defaults/catalog queries and screen UV normalization with bounded memory I/O adapter; no game execution')
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
