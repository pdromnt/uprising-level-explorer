"""Export native math tables and bounded lighting fixtures for the static viewer."""
import argparse,json,re,struct,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('game_root',type=Path);a=p.parse_args();source=a.game_root.resolve()/'source';project=Path(__file__).resolve().parent.parent
words={int(x,16):int(v,16) for x,v in re.findall(r'\{0x([0-9a-f]+)u,\s*0x([0-9a-f]+)u\}',(source/'core/initial_numeric_records.inc').read_text(encoding='utf-8'))}
strings={int(x,16):v for x,v in re.findall(r'\{0x([0-9a-f]+)u,\s*"([^"]*)"\}',(source/'core/initial_strings.inc').read_text(encoding='utf-8'))}
corpus=json.loads((project/'docs/evidence/corpus.json').read_text(encoding='utf-8'))
routes=[r for level in corpus['levels'] for r in level['routes'] if r['name'].lower().startswith('gate')]
route_rows=','.join('{"%s",%d,0,{%s}}'%(r['name'],len(r['points_x_z_y']),','.join('{%sf,%sf,%sf}'%tuple(str(float(v)) for v in point) for point in r['points_x_z_y'])) for r in routes)
code=r'''
#include "menu_runtime_tables.h"
#include "terrain_asset.h"
#include "gameplay_geometry.h"
#include "level_routes.c"
#define get vehicle_get
#define put vehicle_put
#define real vehicle_real
#define store vehicle_store
#define signed_word vehicle_signed_word
#include "vehicle_update.c"
#undef get
#undef put
#undef real
#undef store
#undef signed_word
#include "player_terrain_contact.c"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
static unsigned char bytes[0x400000];
uint8_t game_memory_read_u8(GameMemory *m,GameAddress a){if(a<0x400000||a>=0x800000){m->fault=1;return 0;}return bytes[a-0x400000];}
uint16_t game_memory_read_u16(GameMemory *m,GameAddress a){return game_memory_read_u8(m,a)|((uint16_t)game_memory_read_u8(m,a+1)<<8);}
uint32_t game_memory_read_u32(GameMemory *m,GameAddress a){return game_memory_read_u16(m,a)|((uint32_t)game_memory_read_u16(m,a+2)<<16);}
void game_memory_write_u8(GameMemory *m,GameAddress a,uint8_t v){if(a<0x400000||a>=0x800000){m->fault=1;return;}bytes[a-0x400000]=v;}
void game_memory_write_u16(GameMemory *m,GameAddress a,uint16_t v){game_memory_write_u8(m,a,v);game_memory_write_u8(m,a+1,v>>8);}
void game_memory_write_u32(GameMemory *m,GameAddress a,uint32_t v){game_memory_write_u16(m,a,v);game_memory_write_u16(m,a+2,v>>16);}
int game_memory_write(GameMemory *m,GameAddress a,const void *p,size_t n){const uint8_t *bytes=p;size_t i;for(i=0;i<n;i++)game_memory_write_u8(m,a+i,bytes[i]);return !m->fault;}
static const struct {unsigned at,value;} initial[]={
#include "initial_numeric_records.inc"
};
static const LevelMovementPath routes[]={ROUTE_ROWS};
static unsigned gate_cursor=0x710000,gate_count;
GameAddress game_level_gate_create(GameApplication *a){(void)a;gate_cursor+=0x100;return gate_cursor;}
int game_level_gate_place(GameApplication *a,GameAddress o,uint32_t id,const float p[3],uint16_t yaw,int first){unsigned i;(void)id;(void)first;for(i=0;i<3;i++){uint32_t bits;memcpy(&bits,p+i,4);game_memory_write_u32(&a->memory,o+0x18+i*4,bits);}printf("%s[%.9g,%.9g,%.9g,%u]",gate_count++?",":"",p[0]/512.0,p[2]/512.0,p[1]/512.0,yaw);return 1;}
static int probe_normal(void *c,float out[3],float x,float z){return gameplay_geometry_terrain_normal_values(c,out,x,z);}
int main(void){GameMemory m={0};unsigned i,j;float light[3];uint32_t seed=1;
for(i=0;i<sizeof(initial)/sizeof(*initial);i++)game_memory_write_u32(&m,initial[i].at,initial[i].value);
if(!game_menu_trig_tables(&m)||!game_menu_scalar_tables(&m))return 2;
printf("{\"waves\":[");for(j=0;j<2;j++){printf("%s[",j?",":"");for(i=0;i<64;i++)printf("%s%d",i?",":"",(int16_t)game_memory_read_u16(&m,(j?0x5e13c8:0x5e1348)+i*2));printf("]");}
printf("],\"atan\":[");for(i=0;i<=2048;i++)printf("%s%u",i?",":"",game_memory_read_u16(&m,0x62e8b0+i*2));
printf("],\"sine\":[");for(i=0;i<2048;i++){uint32_t bits=game_memory_read_u32(&m,0x6298a8+i*4);float v;memcpy(&v,&bits,4);printf("%s%.9g",i?",":"",(double)v);}
printf("],\"asin\":[");for(i=0;i<=2048;i++)printf("%s%d",i?",":"",(int16_t)game_memory_read_u16(&m,0x62f8b8+i*2));
printf("],\"asinHigh\":[");for(i=0;i<=2048;i++)printf("%s%d",i?",":"",(int16_t)game_memory_read_u16(&m,0x62b8a8+i*2));
terrain_asset_light_direction(light);printf("],\"lightDirection\":[%.9g,%.9g,%.9g],\"lighting\":[",light[0],light[1],light[2]);
for(i=0;i<256;i++){int16_t c=(i*173)%4000-2000,e=c+(i%17)*32,s=c-(i%13)*45,w=c-(i%19)*29,n=c+(i%23)*20;uint8_t v=terrain_asset_light(c,e,s,w,n,light,&seed);printf("%s[%d,%d,%d,%d,%d,%u]",i?",":"",c,e,s,w,n,v);}
printf("],\"heightSamples\":[");
{TerrainAsset terrain={0};terrain.cells=calloc(65536,sizeof(TerrainCell));m.terrain=&terrain;
for(i=0;i<65536;i++){unsigned x=i%256,z=i/256;terrain.cells[i].height=(int16_t)((x*17+z*37+(x*z%11)*100)%4000-2000);}
for(i=0;i<128;i++){float x=(float)((int)i-5)*.2731f,z=(float)((int)i-4)*.3179f,n[3];long double height=gameplay_geometry_terrain_height(&m,x*512,z*512);if(!gameplay_geometry_terrain_normal_values(&m,n,x*512,z*512))return 4;printf("%s[%.9g,%.9g,%.12g,%.9g,%.9g,%.9g]",i?",":"",x,z,(double)(height/512),n[0],n[1],n[2]);}
printf("],\"attitudeSamples\":[");
for(i=0;i<64;i++){
  unsigned tick,corner;uint16_t heading=(i*137)&2047;float x=512*(12.25f+i*.13f),z=512*(24.75f+i*.17f);GameAddress o=0x730000;
  VehicleNavigationServices services={0};services.context=&m;services.normal=probe_normal;
  vehicle_store(&m,o+0x18,x);vehicle_store(&m,o+0x20,z);game_memory_write_u16(&m,o+0x24,heading);game_memory_write_u16(&m,o+0x26,0);game_memory_write_u16(&m,o+0x28,0);
  for(corner=0;corner<4;corner++){vehicle_store(&m,o+0x228+corner*12,corner==0||corner==3?200:-200);vehicle_store(&m,o+0x230+corner*12,corner<2?300:-300);}
  for(tick=0;tick<256;tick++)if(!navigation_attitude(&m,o,&services,0))return 7;
  printf("%s[%.9g,%.9g,%u,%d,%d]",i?",":"",x/512,z/512,heading,(int16_t)game_memory_read_u16(&m,o+0x26),(int16_t)game_memory_read_u16(&m,o+0x28));
}
printf("],\"playerSamples\":[");
for(i=0;i<64;i++){
  unsigned tick,corner;uint16_t heading=(i*137)&2047;float x=512*(12.25f+i*.13f),z=512*(24.75f+i*.17f),cos,sin,height;
  PresentationPose pose={0};PlayerControls controls={0};PlayerRig rig={0};TerrainContactPoint points[4];TerrainNormal normal;TerrainFrame frame={&pose,&controls,&rig,140};
  pose.local_position[0]=x;pose.local_position[2]=z;pose.local_angles[2]=heading;
  for(corner=0;corner<4;corner++){rig.ground_corners[corner][0]=(corner==0||corner==3?200:-200)*terrain_read_float(&m,0x574d34);rig.ground_corners[corner][2]=(corner<2?300:-300)*terrain_read_float(&m,0x574d34);}
  terrain_sample_footprint(&m,&frame,points,&cos,&sin);normal=terrain_supporting_normal(points);height=terrain_ground_height(&frame,&points[1],&normal);
  for(tick=0;tick<256;tick++)terrain_update_attitude(&m,&frame,normal,cos,sin);
  printf("%s[%.9g,%.9g,%u,%d,%d,%.12g]",i?",":"",x/512,z/512,heading,(int16_t)pose.local_angles[1],(int16_t)pose.local_angles[0],height/512.0);
}
m.terrain=NULL;free(terrain.cells);}
printf("],\"gates\":[");
{GameApplication a={0};a.memory=m;game_memory_write_u32(&a.memory,0x5f0210,0x700000);for(i=0;i<sizeof(routes)/sizeof(*routes);i++)if(!construct_gate(&a,0x708000,&routes[i]))return 5;if(a.memory.fault)return 6;}
printf("]}\n");return m.fault?3:0;}
'''
code=code.replace('ROUTE_ROWS',route_rows)
with tempfile.TemporaryDirectory(prefix='uprising-accuracy-') as tmp:
    tmp=Path(tmp);probe=tmp/'probe.c';probe.write_text(code,encoding='utf-8');exe=tmp/'probe.exe'
    cmd=['gcc','-O2','-flto','-ffunction-sections','-fdata-sections','-I'+str(source/'core'),'-I'+str(source/'game'),str(probe),str(source/'game/menu_runtime_tables.c'),str(source/'core/gameplay_state.c'),str(source/'core/terrain_asset.c'),str(source/'core/gameplay_geometry.c'),'-Wl,--gc-sections','-o',str(exe)]
    compiled=subprocess.run(cmd,capture_output=True,text=True)
    if compiled.returncode:raise RuntimeError(compiled.stderr)
    data=json.loads(subprocess.check_output([str(exe)],text=True))
def real(at):return struct.unpack('<f',struct.pack('<I',words[at]))[0]
data.update(gateModel=strings[words[0x5848f0]],teleporterModel=strings[words[0x5848ec]],gateStep=real(0x57389c),gateSink=[real(0x573880),real(0x57387c)],teleporterHeight=real(0x573994),source_commit=subprocess.check_output(['git','-C',str(a.game_root),'rev-parse','HEAD'],text=True).strip())
fixtures=data.pop('lighting')
height_samples=data.pop('heightSamples');gates=data.pop('gates')
attitude_samples=data.pop('attitudeSamples');player_samples=data.pop('playerSamples')
data['attitudeConstants']=[real(at) for at in [0x574cf8,0x574cfc,0x574d00,0x574cc8]]
data['playerCornerScale']=real(0x574d34)
(project/'src/core/accuracy-tables.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
(project/'docs/evidence/accuracy-native.json').write_text(json.dumps(dict(source_commit=data['source_commit'],lighting=fixtures,heightSamples=height_samples,gates=gates,attitudeSamples=attitude_samples,playerSamples=player_samples,scope='Actual native trig/scalar tables, terrain light/height/normal, settled vehicle/player contact math, and construct_gate with captured factory ports. Seed 1. Research harness only.'),indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in data.items() if k not in ['waves','atan','sine','asin','asinHigh']}))
