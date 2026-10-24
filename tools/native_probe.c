/* Research harness: invoke the checkout's real parsers without game startup. */
#include "level_manifest.h"
#include "level_player_slots.h"
#include "level_citadels.h"
#include "level_objects.h"
#include "level_movement_paths.h"
#include "level_teleporters.h"
#include "terrain_asset.h"
#include "asset_mesh.h"
#include "asset_sdf.h"
#include "resource_file.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int slot(void *c,uint32_t i,uint32_t n,const LevelPlayerSlot *p){(void)c;(void)i;(void)n;(void)p;return 1;}
static int count_begin(void *c,uint32_t n){(void)c;(void)n;return 1;}
static int citadel(void *c,uint32_t i,const LevelCitadelDefinition *p){(void)c;(void)i;(void)p;return 1;}
static int objects_begin(void *c,uint32_t n,uint32_t at){(void)c;(void)n;(void)at;return 1;}
static int object(void *c,uint32_t i,const LevelObjectDefinition *p,uint32_t *id){(void)c;(void)p;*id=i+1;return 1;}
static int link_objects(void *c,uint32_t a,uint32_t b){(void)c;return a && b;}
static void objects_end(void *c){(void)c;}
static int paths_begin(void *c,uint32_t n,const LevelMovementPath *p){(void)c;(void)n;(void)p;return 1;}
static int path(void *c,uint32_t i,const LevelMovementPath *p,int *gate){(void)c;(void)i;(void)p;*gate=0;return 1;}
static int publish(void *c){(void)c;return 1;}
static int teleporter(void *c,uint32_t i,const LevelTeleporterDefinition *p,uint32_t *a,uint32_t *b){(void)c;(void)p;*a=i*2+1;*b=i*2+2;return 1;}
static int map_probe(const char *name){
    LevelManifest manifest;ResourceFile *file;char line[256];int w,h,n,i;size_t size;
    uint8_t *payload;TerrainAsset terrain={0};uint32_t seed=1,next;
    LevelPlayerSlotsStats slots;LevelCitadelsStats citadels;LevelObjectsStats objects;
    LevelMovementPathsStats paths;LevelTeleportersStats teleporters;
    uint32_t hash=2166136261u;
    if(!level_manifest_read(name,&manifest))return 1;
    file=resource_file_open(name);if(!file)return 2;
    if(!resource_file_seek(file,manifest.terrain_offset,SEEK_SET) ||
       !resource_file_line(file,line,sizeof(line)) || sscanf(line,"%d %d %d",&w,&h,&n)!=3)return 3;
    for(i=0;i<n;++i)if(!resource_file_line(file,line,sizeof(line)))return 4;
    size=terrain_asset_payload_size(w,h);payload=malloc(size);if(!payload)return 5;
    if(resource_file_read(file,payload,size)!=size || !terrain_asset_decode(payload,size,w,h,1,&seed,&terrain))return 6;
    free(payload);resource_file_close(file);
    for(i=0;i<65536;++i){TerrainCell *cell=&terrain.cells[i];
        hash=(hash^(uint16_t)cell->height)*16777619u;hash=(hash^cell->tile)*16777619u;
        hash=(hash^cell->flags)*16777619u;hash=(hash^cell->light)*16777619u;
    }
    if(!level_player_slots_load(name,manifest.slots_offset,NULL,slot,&next))return 7;
    if(!level_citadels_load(name,next,NULL,count_begin,citadel,&next))return 8;
    if(!level_objects_load(name,next,NULL,objects_begin,object,link_objects,objects_end,&next))return 9;
    if(!level_movement_paths_load(name,next,NULL,paths_begin,path,publish,&next))return 10;
    if(!level_teleporters_load(name,next,NULL,teleporter,&next))return 11;
    level_player_slots_stats(&slots);level_citadels_stats(&citadels);level_objects_stats(&objects);
    level_movement_paths_stats(&paths);level_teleporters_stats(&teleporters);
    printf("{\"width\":%d,\"height\":%d,\"tiles\":%d,\"slots\":%u,\"citadels\":%u,\"objects\":%u,\"routes\":%u,\"teleporters\":%u,\"end\":%u,\"height_min\":%d,\"height_max\":%d,\"terrain_fnv_words\":%u,\"lighting_seed_start\":1,\"lighting_seed_end\":%u}\n",
        w,h,n,slots.count,citadels.count,objects.count,paths.count,teleporters.count,next,terrain.minimum,terrain.maximum,hash,seed);
    terrain_asset_release(&terrain);return 0;
}
static size_t read_stream(void *c,void *p,size_t n){return fread(p,1,n,c);}
static int model_probe(const char *name,int format){
    FILE *file=fopen(name,"rb");ResourceStream stream={0};AssetModel model={0};int result;
    long end,size;
    if(!file)return 1;stream.context=file;stream.read=read_stream;
    result=asset_model_read_format(&stream,(AssetModelFormat)format,&model);
    end=ftell(file);fseek(file,0,SEEK_END);size=ftell(file);fclose(file);
    if(result)printf("{\"format\":%d,\"consumed\":%ld,\"size\":%ld,\"vertices\":%u,\"triangles\":%u,\"materials\":%u,\"extra_meshes\":%u,\"parts\":%u,\"markers\":%u,\"planes\":%u}\n",
        format,end,size,model.mesh.vertex_count,model.mesh.triangle_count,model.mesh.material_count,model.extra_mesh_count,model.part_count,model.marker_count,model.plane_count);
    asset_model_release(&model);return !result;
}
int main(int argc,char **argv){
    if(argc==3 && !strcmp(argv[1],"map"))return map_probe(argv[2]);
    if(argc==4 && !strcmp(argv[1],"bdm"))return model_probe(argv[3],atoi(argv[2]));
    return 64;
}
