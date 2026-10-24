import "./style.css";
import { WorldPicker, worldTitle } from "./world-picker";
import { MapScene } from "./scene";
import { allObjects, matchesObject, ownerLabel,ownerIdentity,objectTitle,kindName,modeVisible } from "../core/exploration";
import { installGameFonts } from "./fonts";
import type { Library, LevelData } from "../shared/types";
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div id="viewport"></div><div class="vignette"></div>
<header><span class="brand">△ <b>UPRISING</b><span>LEVEL EXPLORER</span></span><span class="badge">READ ONLY</span><button id="folder" title="Change game folder">Game folder ↗</button><button id="hide" title="Hide interface (H)">Hide UI</button></header>
<main id="interface" hidden>
 <section class="panel navigator"><div class="eyebrow">EXPLORE THE WORLDS</div><button id="mission-button" class="mission-button"><span id="mission-title">Choose a mission</span><span>⌄</span></button><div id="mission-menu" hidden><input id="mission-search" placeholder="Find a mission…" aria-label="Find a mission"><div id="mission-list"></div></div><div id="mission-meta" class="muted"></div><div class="tabs"><button data-reader="briefing">Briefing</button><button data-reader="script">Script</button><button data-reader="environment">Environment</button></div><div class="object-search"><span>⌕</span><input id="object-search" placeholder="Find an object…" aria-label="Find an object"></div><div id="objects" hidden></div></section>
 <aside class="panel layers"><div class="eyebrow">LAYERS <span id="counts"></span></div>${[
   ["objects", "Objects"],
   ["gates", "Gates"],
   ["shadows", "Ground shadows"],
   ["starts", "Player starts"],
   ["citadels", "Citadels"],
   ["routes", "Movement paths"],
   ["teleporters", "Teleporters"],
 ]
   .map(
     ([id, label]) =>
       `<label><input type="checkbox" data-layer="${id}" checked><span>${label}</span><i class="dot ${id}"></i></label>`,
   )
   .join(
     "",
   )}<div class="divider"></div><label><input type="checkbox" id="environment" checked><span>Sky & atmosphere</span></label><label class="select-label">Terrain<select id="surface"><option value="textured">Textured</option><option value="height">Elevation</option><option value="wireframe">Wireframe</option></select></label><label class="select-label" id="player-technology-row" hidden>Player technology<select id="player-technology" aria-label="Player technology"><option value="0">Tier 1</option><option value="1">Tier 2</option><option value="2">Tier 3</option><option value="3">Tier 4</option><option value="4">Tier 5</option></select></label><div class="fine" id="player-technology-note" hidden>Player preview · mission AI uses its own settings.</div></aside>
 <section class="panel selection" id="selection" hidden><div class="eyebrow">SELECTED OBJECT<button id="deselect" class="quiet">×</button></div><h2 id="selection-title"></h2><div id="selection-body"></div><button id="focus" class="secondary">Focus object ↗</button></section>
 <section class="panel reader" id="reader" hidden><div class="reader-toolbar"><span class="eyebrow" id="reader-title"></span><div><button id="dock" title="Toggle docked reading view">Dock</button><button id="expand" title="Expand reading panel">Expand</button><button id="close-reader" title="Close reading panel">×</button></div></div><div class="reader-search"><input id="text-search" placeholder="Find in text…" aria-label="Find in text"><span id="matches"></span><button id="wrap">Wrap</button></div><div id="reader-content"></div></section>
 <nav class="panel camera"><button data-camera="orbit" class="active">Orbit</button><button data-camera="fly">Fly</button><button data-camera="top">Top</button><span></span><button id="reset" title="Reset camera">↺</button><label class="speed" title="Flight speed">Speed <input id="speed" type="range" min="5" max="100" value="25" aria-label="Flight speed"></label></nav><div id="camera-help">Drag to orbit · scroll to zoom · right drag to pan</div>
</main><footer><span id="status">Choose your game folder to begin.</span><span id="coordinates"></span><span class="north">N ↑</span></footer>
<div id="welcome"><div class="welcome-card"><div class="eyebrow">A DIFFERENT VIEW OF THE WAR</div><h1>Explore the Worlds</h1><p>Every ridge. Every outpost.<br>A closer look at the worlds you fought for.</p><button id="choose" class="primary">Choose game folder ↗</button><div class="fine">Select your installed Uprising folder.<br>Your game files are only read.</div></div></div><div id="loading" hidden><span class="spinner"></span><span id="loading-label">Loading mission…</span></div><div id="error" role="alert" hidden><span></span><button aria-label="Dismiss error">×</button></div>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string, value: string) => (el(id).textContent = value);
el("environment").nextElementSibling!.textContent="Sky";
el("environment").closest("label")!.insertAdjacentHTML("afterend",`<label title="Show distance fog; stays on until you turn it off"><input type="checkbox" id="fog"><span>Fog</span></label>`);
el<HTMLInputElement>("fog").checked=localStorage.getItem("fog-enabled")==="true";
el("objects").insertAdjacentHTML("beforebegin", `<div class="explore-toolbar"><button id="browse-objects" aria-expanded="false">Browse objects</button><button id="clear-filters" title="Clear search and filters" hidden>Clear</button></div><div id="object-filters" hidden><label>Owner<select id="owner-filter" aria-label="Filter by owner"><option value="all">All owners</option></select></label><label>Type<select id="type-filter" aria-label="Filter by type"><option value="all">All types</option><option value="vehicles">Vehicles</option><option value="soldiers">Soldiers</option><option value="defenses">Defenses</option><option value="buildings">Buildings</option><option value="scenery">Scenery</option><option value="citadels">Citadels</option></select></label></div><div id="object-results" class="fine" hidden aria-live="polite"></div>`);
el("focus").insertAdjacentHTML("afterend",`<div class="selection-nav"><button id="previous-object" title="Previous filtered object ([)">← Previous</button><span id="selection-index"></span><button id="next-object" title="Next filtered object (])">Next →</button></div>`);
el("fog").closest("label")!.insertAdjacentHTML("afterend",`<label><input type="checkbox" id="faction-colors" checked><span>Faction colors</span></label>`);
el("faction-colors").closest("label")!.insertAdjacentHTML("afterend",`<label title="Use bundled game fonts; turn off to restore the original system typography"><input type="checkbox" id="game-fonts" checked><span>Game typography</span></label>`);
el<HTMLInputElement>("game-fonts").checked=localStorage.getItem("game-fonts")!=="false";
const applyTypography=()=>document.body.classList.toggle("game-typography",el<HTMLInputElement>("game-fonts").checked && el<HTMLInputElement>("game-fonts").disabled===false);
el<HTMLInputElement>("game-fonts").disabled=true;
const fontsReady=installGameFonts().then(available=>{el<HTMLInputElement>("game-fonts").disabled=!available;applyTypography();});
el("game-fonts").onchange=()=>{localStorage.setItem("game-fonts",String(el<HTMLInputElement>("game-fonts").checked));applyTypography();};
new ResizeObserver(()=>document.documentElement.style.setProperty("--layers-bottom",`${el("counts").closest(".layers")!.getBoundingClientRect().bottom+12}px`)).observe(el("counts").closest(".layers")!);
el<HTMLInputElement>("faction-colors").checked=localStorage.getItem("faction-colors")!=="false";
el("faction-colors").onchange=()=>{
  localStorage.setItem("faction-colors",String(el<HTMLInputElement>("faction-colors").checked));
  if(level) void load(level.mission.id,true);
};
let browsing=false;
el("player-technology-row").insertAdjacentHTML("beforebegin",`<label class="select-label">Scene preview<select id="scene-preview" aria-label="Scene preview"><option value="all">All map records</option><option value="single">Single player</option><option value="multi">Multiplayer</option></select></label><div class="fine" id="preview-note">All placements · includes inactive owners.</div>`);
el("scene-preview").onchange=()=>{text("preview-note",el<HTMLSelectElement>("scene-preview").value==="all"?"All placements · includes inactive owners.":"Native default slot bindings · saved/network assignments are not loaded.");renderObjects();};
el<HTMLSelectElement>("type-filter").append(new Option("Gates","gates"),new Option("Player starts","players"),new Option("Teleporters","teleporters"));
let library: Library | null = null,
  level: LevelData | null = null,
  scene: MapScene | null = null,
  selected: number | null = null,
  reader = "briefing",
  generation = 0;
try {
  scene = new MapScene(el("viewport"));
  scene.onSelect = (id) => select(id);
  scene.onCamera = (s) => text("coordinates", s);
} catch (e) {
  showError(
    `3D renderer unavailable: ${(e as Error).message}. Mission text inspection is still available.`,
  );
}
function showError(message: string) {
  el("error").hidden = false;
  el("error").querySelector("span")!.textContent = message;
}
el("error").querySelector("button")!.onclick = () =>
  (el("error").hidden = true);
function busy(value: boolean, label = "Loading mission…") {
  el("loading").hidden = !value;
  text("loading-label", label);
  el<HTMLButtonElement>("folder").disabled = value;
  el<HTMLButtonElement>("choose").disabled = value;
}
async function folder() {
  busy(true, "Opening game folder…");
  try {
    const result = await window.viewer.chooseFolder();
    if (!result.ok) showError(result.error);
    else if (result.data) await useLibrary(result.data);
  } catch (e) {
    showError(String(e));
  } finally {
    busy(false);
  }
}
el("choose").onclick = folder;
el("folder").onclick = folder;
async function useLibrary(data: Library) {
  library = data;
  await fontsReady;
  el("welcome").hidden = true;
  el("interface").hidden = false;
  renderMissions();
  await load(
    data.lastMission && data.missions.some((m) => m.id === data.lastMission)
      ? data.lastMission
      : data.missions[0].id,
  );
}
const worldPicker = new WorldPicker((id) => {
  void load(id);
});
function renderMissions() {
  worldPicker.update(library?.missions ?? [], level?.mission.id ?? null);
}
const savedTechnology = Number(localStorage.getItem("player-technology") ?? 0);
el<HTMLSelectElement>("player-technology").value = String(
  Number.isInteger(savedTechnology) &&
    savedTechnology >= 0 &&
    savedTechnology <= 4
    ? savedTechnology
    : 0,
);
el("player-technology").onchange = () => {
  localStorage.setItem(
    "player-technology",
    el<HTMLSelectElement>("player-technology").value,
  );
  if (level) void load(level.mission.id, true);
};
async function load(id: string, preserveCamera = false) {
  const pose =
    preserveCamera && scene
      ? {
          position: scene.camera.position.clone(),
          target: scene.controls.target.clone(),
          rotation: scene.camera.quaternion.clone(),
          mode: scene.mode,
        }
      : null;
  const previousSelection = preserveCamera ? selected : null;
  const token = ++generation;
  busy(true);
  try {
    const result = await window.viewer.loadLevel(
      id,
      Number(el<HTMLSelectElement>("player-technology").value),
    );
    if (token !== generation) return;
    if (!result.ok) {
      showError(result.error);
      return;
    }
    level = result.data;
    scene?.load(level,el<HTMLInputElement>("faction-colors").checked);
    const ownerSelect=el<HTMLSelectElement>("owner-filter"), priorOwner=ownerSelect.value;
    ownerSelect.replaceChildren(new Option("All owners","all"),...Array.from(new Set(allObjects(level).map(o=>ownerIdentity(o.owner)))).sort((a,b)=>a-b).map(owner=>new Option(ownerLabel(owner),String(owner))));
    ownerSelect.value=Array.from(ownerSelect.options).some(o=>o.value===priorOwner)?priorOwner:"all";
    if (pose && scene) {
      scene.setMode(pose.mode);
      scene.camera.position.copy(pose.position);
      scene.camera.quaternion.copy(pose.rotation);
      scene.controls.target.copy(pose.target);
    }
    selected = null;
    el("selection").hidden = true;
    text("mission-title", worldTitle(level.mission.title));
    text(
      "mission-meta",
      `${level.mission.environment.toLowerCase()} · ${level.terrain.width} × ${level.terrain.height} · ${level.objects.length} objects`,
    );
    text("counts", `${level.objects.length} + ${level.citadels.length} sites`);
    const hasPlayerModels = allObjects(level).some(
      (o) => o.owner >= 0 && o.owner < 4 && (level!.modelSelections[o.id]?.model || level!.modelSelections[o.id]?.sprite),
    );
    el("player-technology-row").hidden = !hasPlayerModels;
    el("player-technology-note").hidden = !hasPlayerModels;
    const rendered = allObjects(level).filter(o=>!o.citadel?.empty);
    const modelCount = rendered.filter(o=>level!.modelSelections[o.id]?.model).length;
    const spriteCount = rendered.filter(o=>level!.modelSelections[o.id]?.sprite).length;
    text(
      "status",
      `${level.mission.mapFile} · ${modelCount} models / ${spriteCount} sprites / ${rendered.length - modelCount - spriteCount} wireframes · ${level.warnings.length ? level.warnings.length + " asset notices" : "Assets loaded"}`,
    );
    el("status").title = library?.root ?? "";
    for (const checkbox of document.querySelectorAll<HTMLInputElement>(
      "[data-layer]",
    ))
      scene?.layer(checkbox.dataset.layer!, checkbox.checked);
    scene?.surface(el<HTMLSelectElement>("surface").value);
    scene?.environment(el<HTMLInputElement>("environment").checked);
    scene?.fog(el<HTMLInputElement>("fog").checked);
    document
      .querySelectorAll("[data-camera]")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          (b as HTMLElement).dataset.camera === (pose?.mode ?? "orbit"),
        ),
      );
    text(
      "camera-help",
      pose?.mode === "fly"
        ? "Drag to look · W A S D to move · Q / E down / up · Shift faster"
        : pose?.mode === "top"
          ? "Drag to pan · scroll to zoom"
          : "Drag to orbit · scroll to zoom · right drag to pan",
    );
    renderObjects();
    renderReader();
    renderMissions();
    if (previousSelection !== null) {
      select(previousSelection);
      if (!el("reader").hidden) el("selection").hidden = true;
    }
  } catch (e) {
    showError((e as Error).message);
  } finally {
    if (token === generation) busy(false);
  }
}
function renderObjects() {
  const q = el<HTMLInputElement>("object-search").value.trim().toLowerCase(),
    list = el("objects");
  list.replaceChildren();
  const owner=el<HTMLSelectElement>("owner-filter").value, type=el<HTMLSelectElement>("type-filter").value;
  const active=!!q || owner!=="all" || type!=="all";
  list.hidden = !q && !browsing && !active;
  el("object-filters").hidden=!q && !browsing && !active;
  el("object-results").hidden=list.hidden;
  el("clear-filters").hidden=!active;
  if (!level) return;
  const matches=filteredObjects();
  const ids=new Set(matches.map(o=>o.id));
  scene?.filterObjects(id=>ids.has(id));
  if(selected!==null && !ids.has(selected)) {selected=null;scene?.select(-1);el("selection").hidden=true;}
  text("object-results",`${matches.length} of ${allObjects(level).length} objects & sites`);
  for (const o of matches) {
    const button = document.createElement("button");
    button.className = "object-row";
    button.textContent = o.name&&o.name!=="NULL"?`${objectTitle(o)} · ${o.citadel ? "Citadel" : kindName(o.kind)} · ${ownerLabel(o.owner)}`:objectTitle(o);
    button.classList.toggle("selected",selected===o.id);
    button.setAttribute("aria-current",selected===o.id ? "true" : "false");
    button.dataset.objectId=String(o.id);
    button.onclick = () => {
      select(o.id, true);
      if(!browsing) list.hidden = true;
    };
    list.append(button);
  }
  if (!list.childElementCount) list.textContent = "No matching objects.";
  updateNavigation();
}
function filteredObjects() {
  if(!level) return [];
  return allObjects(level).filter(o=>modeVisible(o,el<HTMLSelectElement>("scene-preview").value,level!.mission.config)&&matchesObject(o,el<HTMLInputElement>("object-search").value,el<HTMLSelectElement>("owner-filter").value,el<HTMLSelectElement>("type-filter").value,`${kindName(o.kind)} ${level!.modelSelections[o.id]?.label??""}`));
}
function updateNavigation() {
  const objects=filteredObjects(),index=objects.findIndex(o=>o.id===selected);
  text("selection-index",index<0 ? "" : `${index+1} / ${objects.length}`);
  el<HTMLButtonElement>("previous-object").disabled=objects.length<2;
  el<HTMLButtonElement>("next-object").disabled=objects.length<2;
  document.querySelectorAll<HTMLButtonElement>(".object-row").forEach(b=>{const current=Number(b.dataset.objectId)===selected;b.classList.toggle("selected",current);b.setAttribute("aria-current",String(current));});
}
function stepObject(step:number) {
  const objects=filteredObjects();if(!objects.length)return;
  const index=objects.findIndex(o=>o.id===selected);
  select(objects[(index+step+objects.length)%objects.length].id,true);
}
el("previous-object").onclick=()=>stepObject(-1);
el("next-object").onclick=()=>stepObject(1);
el("browse-objects").onclick=()=>{browsing=!browsing;el("browse-objects").setAttribute("aria-expanded",String(browsing));text("browse-objects",browsing?"Close browser":"Browse objects");renderObjects();};
el("owner-filter").onchange=renderObjects;
el("type-filter").onchange=renderObjects;
el("clear-filters").onclick=()=>{el<HTMLInputElement>("object-search").value="";el<HTMLSelectElement>("owner-filter").value="all";el<HTMLSelectElement>("type-filter").value="all";renderObjects();};
document.addEventListener("keydown",e=>{if(e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable]"))return;if((e.key==="["||e.key==="]") && !e.ctrlKey && !e.metaKey){e.preventDefault();stepObject(e.key==="["?-1:1);}});
el("object-search").oninput = renderObjects;
function details(rows: [string, string][], host: HTMLElement) {
  const dl = document.createElement("dl");
  for (const [label, value] of rows) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    dl.append(dt, dd);
  }
  host.append(dl);
}
function select(id: number, focus = false) {
  if (!level) return;
  const o = allObjects(level).find((o) => o.id === id);
  if (!o) return;
  selected = id;
  scene?.select(id, focus);
  el("selection").hidden = false;
  el("selection").scrollTop = 0;
  text(
    "selection-title",
    objectTitle(o),
  );
  const host = el("selection-body");
  host.replaceChildren();
  details(
    [
      ["Type", kindName(o.kind)],
      ["Owner", ownerLabel(o.owner)],
      ["Position (x, z, y)", `${o.x}, ${o.z}, ${o.y}`],
      ["Heading", `${o.heading}°`],
      ["Parent", o.parent],
      ["Source", o.derived ? `${level.mission.mapFile} · ${o.derived.type} ${o.derived.index+1}` : o.citadel ? `${level.mission.mapFile} · citadel ${o.citadel.id+1}, ${o.citadel.slot ? `upgrade ${o.citadel.slot}` : "base"}` : `${level.mission.mapFile} @ ${o.sourceOffset}`],
      ["Source IDs", `Object ${o.id} · kind 0x${o.kind.toString(16).toUpperCase()} · owner ${o.owner}`],
    ],
    host,
  );
  if(o.citadel) {
    const site=level.citadels[o.citadel.id];
    details([["Citadel",String(site.id+1)],["Health",String(site.health===-1?5000:site.health)],["Upgrade slots",`${site.upgrades.filter(u=>u.kind>0).length} occupied / ${site.upgrades.length} defined`],["Footprints",String(site.footprints.length)]],host);
  }
  const modelSelection = level.modelSelections[o.id];
  if (modelSelection) {
    details(
      [
        [
          "Presentation",
          o.citadel?.empty ? "Unclaimed site" : modelSelection.model ? "Static model" : modelSelection.sprite ? "Static sprite · frame 0" : "Wireframe placeholder",
        ],
        [
          modelSelection.sprite ? "Sprite" : "Model",
          modelSelection.model ?? (modelSelection.sprite ? level.sprites[modelSelection.sprite].file : null) ?? modelSelection.reason ?? "Unsupported",
        ],
        [
          "Catalog",
          `${modelSelection.manager} / choice ${modelSelection.choice ?? "-"} / slot ${modelSelection.slot ?? "-"}`,
        ],
      ],
      host,
    );
  }
  const note = document.createElement("p");
  note.className = "fine";
  note.textContent = modelSelection?.model || modelSelection?.sprite || o.citadel?.empty
    ? modelSelection.provenance + (o.owner>=0 && o.kind<176 ? "; faction colors use the default owner palette preview" : "")
    : `${modelSelection?.reason ?? "Unsupported presentation"}. Approximate wireframe dimensions and ground offset.`;
  host.append(note);
  updateNavigation();
  el("selection").scrollTop=0;
  const model = modelSelection?.model
    ? level.models[modelSelection.model]
    : null;
  if (model?.warnings.length) {
    const warning = document.createElement("p");
    warning.className = "fine";
    warning.textContent = model.warnings.join("; ");
    host.append(warning);
  }
}
el("deselect").onclick = () => {
  el("selection").hidden = true;
  scene?.select(-1);
  selected = null;
};
el("focus").onclick = () => {
  if (selected !== null) scene?.select(selected, true);
};
document
  .querySelectorAll<HTMLInputElement>("[data-layer]")
  .forEach(
    (c) => (c.onchange = () => scene?.layer(c.dataset.layer!, c.checked)),
  );
el("environment").onchange = () =>
  scene?.environment(el<HTMLInputElement>("environment").checked);
el("fog").onchange=()=>{
  const enabled=el<HTMLInputElement>("fog").checked;
  localStorage.setItem("fog-enabled",String(enabled));
  scene?.fog(enabled);
};
el("surface").onchange = () =>
  scene?.surface(el<HTMLSelectElement>("surface").value);
document.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach(
  (b) =>
    (b.onclick = () => {
      scene?.setMode(b.dataset.camera!);
      document
        .querySelectorAll("[data-camera]")
        .forEach((c) => c.classList.toggle("active", c === b));
      text(
        "camera-help",
        b.dataset.camera === "fly"
          ? "Drag to look · W A S D to move · Q / E down / up · Shift faster"
          : b.dataset.camera === "top"
            ? "Drag to pan · scroll to zoom"
            : "Drag to orbit · scroll to zoom · right drag to pan",
      );
    }),
);
el("reset").onclick = () => {
  document.querySelector<HTMLButtonElement>("[data-camera=orbit]")!.click();
  scene?.reset();
};
el("speed").oninput = () => {
  if (scene) scene.speed = Number(el<HTMLInputElement>("speed").value);
};
document.querySelectorAll<HTMLButtonElement>("[data-reader]").forEach(
  (b) =>
    (b.onclick = () => {
      reader = b.dataset.reader!;
      el("reader").hidden = false;
      el("selection").hidden = true;
      el<HTMLInputElement>("text-search").value = "";
      renderReader();
    }),
);
function closeReader() {
  el("reader").hidden = true;
  el("selection").hidden = selected === null;
  document
    .querySelectorAll("[data-reader]")
    .forEach((b) => b.classList.remove("active"));
}
el("close-reader").onclick = closeReader;
el("expand").onclick = () => {
  el("reader").classList.toggle("expanded");
  text(
    "expand",
    el("reader").classList.contains("expanded") ? "Restore" : "Expand",
  );
};
const docked = localStorage.getItem("reader-docked") === "true";
app.classList.toggle("docked", docked);
text("dock", docked ? "Float" : "Dock");
el("dock").onclick = () => {
  const dock = app.classList.toggle("docked");
  localStorage.setItem("reader-docked", String(dock));
  text("dock", dock ? "Float" : "Dock");
};
el("wrap").onclick = () => el("reader-content").classList.toggle("wrap");
el("text-search").oninput = renderReader;
function appendHighlighted(host: HTMLElement, value: string, query: string) {
  if (!query) {
    host.append(document.createTextNode(value));
    return 0;
  }
  let from = 0,
    count = 0;
  const low = value.toLowerCase();
  for (let at = low.indexOf(query); at >= 0; at = low.indexOf(query, from)) {
    host.append(document.createTextNode(value.slice(from, at)));
    const mark = document.createElement("mark");
    mark.textContent = value.slice(at, at + query.length);
    host.append(mark);
    from = at + query.length;
    count++;
  }
  host.append(document.createTextNode(value.slice(from)));
  return count;
}
function renderReader() {
  if (!level) return;
  const host = el("reader-content");
  host.replaceChildren();
  const query = el<HTMLInputElement>("text-search").value.toLowerCase();
  let matches = 0;
  el("reader-search")?.removeAttribute("hidden");
  text(
    "reader-title",
    reader === "script"
      ? level.scriptFile || "No script"
      : reader === "briefing"
        ? "MISSION BRIEFING"
        : "ENVIRONMENT & SOURCES",
  );
  if (reader === "briefing") {
    const heading = document.createElement("h1");
    heading.textContent = level.mission.title;
    host.append(heading);
    for (const [title, value] of [
      ["Objective", level.briefing.objective],
      ["Description", level.briefing.description],
      ...level.briefing.spy.map((s, i) => [`Intel ${i + 1}`, s]),
    ]) {
      if (!value) continue;
      const h = document.createElement("h3"),
        p = document.createElement("p");
      h.textContent = title;
      matches += appendHighlighted(p, value, query);
      host.append(h, p);
    }
    if (!level.briefingText)
      host.append("No briefing file is available for this mission.");
  } else if (reader === "script") {
    const pre = document.createElement("div");
    pre.className = "source";
    const script =
      level.script || "No script file is available for this mission.";
    script.split(/\r?\n/).forEach((line, i) => {
      const row = document.createElement("div");
      row.className =
        "source-line" + (line.trim().startsWith("#") ? " comment" : "");
      const number = document.createElement("span");
      number.className = "line-number";
      number.textContent = String(i + 1);
      const code = document.createElement("code");
      if (query) matches += appendHighlighted(code, line || " ", query);
      else if (line.trim().startsWith("#")) code.textContent = line;
      else {
        for (const part of (line || " ").split(
          /(\b[A-Z][A-Z_0-9]+\b|\b\d+(?:\.\d+)?\b)/,
        )) {
          const span = document.createElement("span");
          span.textContent = part;
          span.className = /^[A-Z][A-Z_0-9]+$/.test(part)
            ? "token-keyword"
            : /^\d/.test(part)
              ? "token-number"
              : "";
          code.append(span);
        }
      }
      row.append(number, code);
      pre.append(row);
    });
    host.append(pre);
  } else {
    const h = document.createElement("h2");
    h.textContent = "The world behind the mission";
    host.append(h);
    details(
      [
        ["Map", level.mission.mapFile],
        ["Format", level.version],
        ["Terrain", `${level.terrain.width} × ${level.terrain.height} cells`],
        ["Materials", String(level.terrain.tileNames.length)],
        ["World height", `${level.terrain.minimum} → ${level.terrain.maximum}`],
        ["Sky", level.skyFile || "Disabled"],
        [
          "Placements",
          `${level.objects.length} objects · ${level.citadels.length} citadels`,
        ],
        [
          "Navigation",
          `${level.routes.length} paths · ${level.teleporters.length} teleporter pairs`,
        ],
      ],
      host,
    );
    const note = document.createElement("p");
    note.className = "fine";
    note.textContent =
      "Static inspection. Scripts are not executed. Native terrain lighting uses a fixed seed; waves and sky scrolling freeze at tick zero. Restored sky projection follows the decompiled port. Ground contact uses native height queries. Shadow opacity remains a viewer approximation; saved campaign/network assignments are not loaded.";
    host.append(note);
    if (level.warnings.length) {
      const h = document.createElement("h3");
      h.textContent = "Asset notices";
      host.append(h);
      for (const warning of level.warnings) {
        const p = document.createElement("p");
        p.textContent = warning;
        host.append(p);
      }
    }
    const h2 = document.createElement("h3");
    h2.textContent = "Mission configuration";
    const pre = document.createElement("pre");
    matches += appendHighlighted(pre, level.configText, query);
    host.append(h2, pre);
  }
  text("matches", query ? `${matches} matches` : "");
  document
    .querySelectorAll<HTMLButtonElement>("[data-reader]")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        !el("reader").hidden && b.dataset.reader === reader,
      ),
    );
}
function toggleUI() {
  worldPicker.close(false);
  const hidden = app.classList.toggle("ui-hidden");
  text("hide", hidden ? "Show UI" : "Hide UI");
}
el("hide").onclick = toggleUI;
window.addEventListener("keydown", (e) => {
  if (
    e.key.toLowerCase() === "h" &&
    !(e.target as HTMLElement).closest("input,textarea")
  )
    toggleUI();
  if (e.key === "Escape") {
    if (worldPicker.isOpen) {
      worldPicker.close();
      return;
    }
    closeReader();
    el("objects").hidden = true;
  }
});
void (async () => {
  busy(true, "Finding your game…");
  try {
    const result = await window.viewer.bootstrap();
    if (result.ok && result.data) await useLibrary(result.data);
    else if (!result.ok) showError(result.error);
  } catch (e) {
    showError(String(e));
  } finally {
    busy(false);
  }
})();
