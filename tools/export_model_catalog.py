"""Export semantic factory slots from the traced native unit defaults (no game execution)."""
import argparse, json, re, subprocess
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('game_root',type=Path)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args(); source=args.game_root/'source'; words={}
for filename in ['core/initial_numeric_records.inc','game/unit_defaults.inc']:
    for address,value in re.findall(r'\{0x([0-9a-f]+)u,\s*0x([0-9a-f]+)u\}',(source/filename).read_text()):words[int(address,16)]=int(value,16)
chains=[tuple(int(v,16) if i<2 else int(v) for i,v in enumerate(row)) for row in re.findall(r'\{0x([0-9a-f]+)u,0x([0-9a-f]+)u,(\d+)u,(\d+)u\}',(source/'game/unit_inheritance.inc').read_text())]
chains += [(0x5e7d50,0,21,4),(0x5e4fc0,0,21,15),(0x5e6d80,0,21,1)]
counts={base:count for base,_,width,count in chains if width==21}
for base,previous,width,count in chains:
    stride=176 if width==21 else 112
    for row in range(count):
        address=base+row*stride
        # Before defaults, each declared record is initialized to the -2 inherit sentinel.
        for field in range(width):
            at=address+field*4
            if words.get(at,0xfffffffe)==0xfffffffe:words[at]=words.get((previous or (0x5e9210 if width==21 else 0x5e4678))+field*4,0)
        previous=address
families=json.loads((Path(__file__).parent.parent/'docs/evidence/model-families.json').read_text())['families']
family_map={f['kind']:f for f in families}
catalogs={}
for manager,function in [('clan','ai_family'),('imperial','imperial_family')]:
    text=(source/'game/level_player_catalog.c').read_text();body=text.split('static AiFamily '+function)[1].split('}return result;')[0]
    catalogs[manager]={int(kind,16):int(base,16) for kind,base in re.findall(r'case 0x([0-9a-f]+):result=\(AiFamily\)\{0x[0-9a-f]+,0x([0-9a-f]+)\}',body)}
catalogs['player']={k:b for k,b in zip(range(0x20,0x2b),[0x5e40f8,0x5e8a80,0x5e7440,0x5edfd8,0x5e9a38,0x5e7a90,0x5e1488,0x5eaaf8,0x5ec788,0x5ed6c8,0x5eb418])}
catalogs['player'].update({k:b for k,b in zip(range(0x80,0x8a),[0x5ea418,0x5ebad8,0x5e3b58,0x5e21f8,0x5e31b8,0x5e4308,0x5ec838,0x5ea788,0x5ee348,0x5e2fa8])})
catalogs['player'][64]=0x5ef648
result={}
for manager,banks in catalogs.items():
    result[manager]={}
    for kind,base in banks.items():
        family=family_map.get(kind)
        if not family and kind!=64:continue
        slots=[words.get(base+i*176+12,0) for i in range(counts[base])]
        assert all(slot<(len(family['labels']) if family else 1) for slot in slots),(manager,kind,slots)
        result[manager][str(kind)]=slots
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(dict(source_commit=subprocess.check_output(['git','-C',str(args.game_root),'rev-parse','HEAD'],text=True).strip(),families=family_map,catalogs=result),indent=2)+'\n')
print(json.dumps(result,indent=2))
