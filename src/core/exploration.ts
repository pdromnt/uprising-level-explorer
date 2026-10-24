import type { Citadel, LevelData, Placement } from "../shared/types";

// Native HUD names: level_hud_widgets.c / initial_strings 0x590688..0x59080c.
export const kindName = (kind: number) =>
  ({32:"Wraith",33:"Tank",34:"Medium turret",35:"Citadel turret",36:"SAM site",37:"Light turret",38:"Bomber",39:"AAV",40:"Heavy turret",41:"Convoy",64:"Infantry",
    96:"Infantry Factory",98:"AAV Factory",99:"Tank Factory",100:"Bomber Factory",
    119:"Generator",120:"Needle",121:"Tech Center",122:"Power Plant",
    128:"Infantry Upgrade",129:"Tank Upgrade",130:"AAV Upgrade",131:"Bomber Upgrade",
    132:"Infantry Booster",133:"Tank Booster",134:"AAV Booster",135:"Bomber Booster",136:"Energy Building",137:"KillSat Upgrade",
    161:"Teleporter",162:"Gate"} as Record<number,string>)[kind] ?? (kind>=176&&kind<=190?"Scenery":"Object");
export const ownerIdentity=(owner:number)=>owner===8?5:owner;
export function ownerLabel(raw:number) {
  const owner=ownerIdentity(raw);
  return owner===-1?"Unclaimed":owner===6?"Neutral":owner===4?"Imperium":owner===5?"Rabble":owner>=0&&owner<4?`Player ${owner+1}`:"Unknown faction";
}
export const ownerSearch=(owner:number)=>`${ownerLabel(owner)}${ownerIdentity(owner)===5?" Native Forces Clan":""}`;
export function objectTitle(o:Placement) {
  if(o.name&&o.name!=="NULL")return o.name;
  return o.kind>=176?kindName(o.kind):`${ownerLabel(o.owner)} ${kindName(o.kind)}`;
}

const upgradeKinds = [128,129,130,131,137,132,133,134,135,136];
export function citadelPlacements(citadels: Citadel[]): Placement[] {
  return citadels.flatMap(c => [c.base, ...c.upgrades].flatMap((place, slot) => {
    const upgrade = slot ? c.upgrades[slot-1].kind : 0;
    // Zero is an empty slot; unclaimed sites do not instantiate any payload.
    if (slot && (upgrade < 1 || upgrade > 10 || c.owner === -1)) return [];
    return [{
      id: 1000000 + c.id*16 + slot, kind: slot ? upgradeKinds[upgrade-1] : 35,
      owner:c.owner, x:place.x, z:place.z, y:0,
      // The native settled descriptor uses base heading for primary/third
      // families, indexed heading only for the repair (identity 5) family.
      heading: upgrade===5 ? place.heading : c.base.heading,
      name:`Citadel ${c.id+1}${slot ? ` · upgrade ${slot}` : c.owner===-1 ? " · unclaimed site" : " · base"}`,
      attribute:"NULL", parent:"NULL", flags:0, group:0, variant:0, sourceOffset:-1,
      citadel:{id:c.id,slot,upgrade,empty:c.owner===-1},
    }];
  }));
}
export const allObjects = (level: LevelData) => [...level.objects, ...level.citadelObjects, ...level.derivedObjects];
export function objectType(o: Placement) {
  if (o.citadel) return "citadels";
  if (o.derived?.type==="gate") return "gates";
  if (o.derived?.type==="player-start") return "players";
  if (o.derived?.type==="teleporter") return "teleporters";
  if (o.kind>=176) return "scenery";
  if (o.kind>=96) return "buildings";
  if (o.kind===64) return "soldiers";
  if ([33,38,39,41].includes(o.kind)) return "vehicles";
  return "defenses";
}
export function matchesObject(o: Placement, query: string, owner: string, type: string, label = "") {
  return (owner==="all" || ownerIdentity(o.owner)===ownerIdentity(Number(owner))) && (type==="all" || objectType(o)===type)
    && `${objectTitle(o)} ${kindName(o.kind)} ${ownerSearch(o.owner)} ${label} ${o.owner} ${o.kind.toString(16)}`.toLowerCase().includes(query.trim().toLowerCase());
}
export function modeVisible(o:Placement,mode:string,config:Record<string,string>) {
  if(mode==="all" || o.owner<0 || o.kind>=176 || o.derived?.type==="teleporter")return true;
  const owner=o.owner===8?5:o.owner;
  if(owner===4)return config.USE_CLAN_AI!=="0";
  if(owner===5)return config.USE_RABBLE!=="0";
  return owner>=0&&owner<(mode==="single"?1:4);
}
