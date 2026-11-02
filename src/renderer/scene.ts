import * as T from "three";
import { modelPrototype } from "./models";
import { makeSoldier, spriteMaterials } from "./sprites";
import { allObjects } from "../core/exploration";
import { paletteOwner } from "../core/faction-colors";
import {accuracyTables,detailHeight,terrainHeight} from "../core/accuracy";
import {makeSky} from "./environment";
import {restingAttitude,orientationMatrix,applyWraithGun} from "./grounding";
import {boundsShadow,groundShadow} from "./shadows";
import { headingRadians, modelPose, bomberSpawnHeight } from "../core/models";
import { buildTerrain } from "./terrain";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {TankRig} from "./tank";
import type { LevelData, Terrain } from "../shared/types";
export function ground(t: Terrain, x: number, z: number) {
  return terrainHeight(t,x,z);
}
export class MapScene {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(50, 1, 0.1, 1800);
  controls: OrbitControls;
  groups: Record<string, T.Group> = {};
  terrainMeshes: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>[] = [];
  sky: T.Mesh | null = null;
  private skyController:ReturnType<typeof makeSky>|null=null;
  private fogEnabled=false;
  selected: T.BoxHelper | null = null;
  private selectedId: number | null = null;
  private citadelOverlays = new Map<number,T.Group>();
  private shadowRoots = new Map<number,T.Mesh>();
  targets: T.Object3D[] = [];
  private soldiers: ReturnType<typeof makeSoldier>[] = [];
  private soldierMaterials: T.SpriteMaterial[] = [];
  data: LevelData | null = null;
  mode = "orbit";
  speed = 25;
  textures: T.Texture[] = [];
  keys = new Set<string>();
  pointer = false;
  tank:TankRig|null=null;
  pickingDrive=false;
  private tankStartVisible=true;
  last = performance.now();
  onSelect: (id: number) => void = () => {};
  onCamera: (s: string) => void = () => {};
  onModeChange:()=>void=()=>{};
  onDrivePick:()=>void=()=>{};
  onTankDistance:(distance:number)=>void=()=>{};
  constructor(private host: HTMLElement,private animate = true) {
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.scene.background = new T.Color("#9da99d");
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxDistance = 700;
    this.controls.minDistance = 1;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(128, 0, 128);
    this.reset();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.domElement.addEventListener("click", (e) => {
      if (this.dragged) return;
      const r = host.getBoundingClientRect();
      const ray = new T.Raycaster();
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        this.camera,
      );
      if(this.pickingDrive){const hit=ray.intersectObjects(this.terrainMeshes)[0];if(hit)this.driveHere(hit.point.x,hit.point.z);return;}
      if(this.mode==="tank")return;
      const hit = ray
        .intersectObjects([...this.targets, ...this.terrainMeshes], true)
        .find((h) => {
          for (let node: T.Object3D | null = h.object; node; node = node.parent)
            if (!node.visible) return false;
          return true;
        });
      if (hit && typeof hit.object.userData.id === "number")
        this.onSelect(hit.object.userData.id);
    });
    this.renderer.domElement.addEventListener("pointerdown", (e) => {
      this.pointer = true;
      this.dragged = false;
      this.down = [e.clientX, e.clientY];
    });
    window.addEventListener("pointerup", () => (this.pointer = false));
    this.renderer.domElement.addEventListener("pointermove", (e) => {
      if (!this.pointer) return;
      if (Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4)
        this.dragged = true;
      if (this.mode === "fly") {
        const rotation = new T.Euler().setFromQuaternion(
          this.camera.quaternion,
          "YXZ",
        );
        rotation.y -= e.movementX * 0.003;
        rotation.x = T.MathUtils.clamp(
          rotation.x - e.movementY * 0.003,
          -1.5,
          1.5,
        );
        rotation.z = 0;
        this.camera.quaternion.setFromEuler(rotation);
      }
      if(this.mode==="tank")this.tank?.look(e.movementX,e.movementY);
    });
    this.renderer.domElement.addEventListener("wheel",e=>{if(this.mode!=="tank"||!this.tank)return;e.preventDefault();this.tank.distance=T.MathUtils.clamp(this.tank.distance+e.deltaY*.01,4,24);this.onTankDistance(this.tank.distance);},{passive:false});
    window.addEventListener("keydown", (e) => {
      const target=e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]")&&!target.matches('input[type="range"]')) return;
      this.keys.add(e.code);
      if(e.code==="Escape"&&this.pickingDrive){this.pickDrive(false);return;}
      if(e.code==="KeyR"&&this.mode==="tank"){this.reset();e.preventDefault();}
      if (
        (this.mode === "fly"||this.mode==="tank") &&
        ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space"].includes(
          e.code,
        )
      )
        e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.pointer = false;
      if(this.tank)this.tank.state.velocity=0;
    });
    if(this.animate)requestAnimationFrame(this.frame);
  }
  private dragged = false;
  private down = [0, 0];
  resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  reset() {
    this.pickDrive(false);
    if(this.mode==="tank"&&this.tank){this.tank.reset();this.tank.update(0,new Set(),this.speed,this.camera,!!this.groups.shadows?.visible,true);this.keys.clear();return;}
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(310, 230, 330);
    this.controls.target.set(128, 4, 128);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }
  setMode(mode: string) {
    const previous=this.mode;
    if(mode==="tank"&&!this.tank)return;
    this.pointer=false;
    this.dragged=false;
    this.pickDrive(false);
    if(this.mode==="tank"&&mode!=="tank"&&this.tank){this.tank.group.visible=false;this.tank.state.velocity=0;this.restoreTankStart();}
    if ((this.mode === "fly"||this.mode==="tank") && mode !== this.mode) {
      const forward = new T.Vector3();
      this.camera.getWorldDirection(forward);
      this.controls.target
        .copy(this.camera.position)
        .addScaledVector(forward, 60);
    }
    this.mode = mode;
    this.keys.clear();
    this.controls.enabled = mode !== "fly"&&mode!=="tank";
    this.controls.enableRotate = mode === "orbit";
    if (mode === "top") {
      this.camera.position.set(128, 330, 128.001);
      this.controls.target.set(128, 0, 128);
      this.camera.lookAt(this.controls.target);
    }
    if(mode==="tank"&&this.tank){this.tank.group.visible=true;if(previous!=="tank")this.hideTankStart();this.tank.update(0,new Set(),this.speed,this.camera,!!this.groups.shadows?.visible,true);}
    else this.controls.update();
    this.syncShadows();this.onModeChange();
  }
  pickDrive(active:boolean){this.pickingDrive=active&&!!this.tank;this.renderer.domElement.style.cursor=this.pickingDrive?"crosshair":"";this.onDrivePick();}
  driveHere(x:number,z:number){if(!this.tank)return;this.tank.relocate(x,z);this.pickDrive(false);this.setMode("tank");}
  private hideTankStart(){const source=this.targets.find(o=>o.userData.id===this.tank?.start.id);if(source){this.tankStartVisible=source.visible;source.visible=false;}this.syncSelection();}
  private restoreTankStart(){const source=this.targets.find(o=>o.userData.id===this.tank?.start.id);if(source)source.visible=this.tankStartVisible;}
  private frame = () => {
    const now = performance.now(),
      dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (this.mode === "fly") {
      const speed = this.speed * (this.keys.has("ShiftLeft") ? 3.6 : 1) * dt;
      const direction = new T.Vector3(
        Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
        0,
        Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW")),
      )
        .normalize()
        .applyQuaternion(this.camera.quaternion);
      direction.y +=
        Number(this.keys.has("KeyE")) - Number(this.keys.has("KeyQ"));
      this.camera.position.addScaledVector(direction, speed);
    } else if(this.mode==="tank"&&this.tank)this.tank.update(dt,this.keys,this.speed,this.camera,!!this.groups.shadows.visible);
    else this.controls.update();
    for (const soldier of this.soldiers) soldier.update(this.camera);
    if(this.skyController) {
      const size=this.renderer.getDrawingBufferSize(new T.Vector2());
      const color=this.skyController.update(this.camera,size.x,size.y);
      this.scene.fog=this.fogEnabled?new T.Fog(color,20000/512*.67,20000/512):null;
    }
    this.renderer.render(this.scene, this.camera);
    this.onCamera(
      this.mode==="tank"&&this.tank?`Tank ${this.tank.state.x.toFixed(1)} / ${this.tank.state.z.toFixed(1)}`:`${this.camera.position.x.toFixed(0)} / ${this.camera.position.y.toFixed(0)} / ${this.camera.position.z.toFixed(0)}`,
    );
    if(this.animate)requestAnimationFrame(this.frame);
  };
  renderOnce(){this.frame();}
  clear() {
    this.keys.clear();this.pointer=false;this.pickDrive(false);this.tank=null;
    for (const material of this.soldierMaterials) {
      material.map?.dispose();
      material.dispose();
    }
    this.soldierMaterials = [];
    this.soldiers = [];
    for (const texture of this.textures) texture.dispose();
    this.textures = [];
    this.terrainMeshes = [];
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>();
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Line) {
        geometries.add(o.geometry);
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value instanceof T.Texture) textures.add(value);
        }
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.scene.clear();
    this.targets = [];
    this.groups = {};
    this.selected = null;
    this.selectedId = null;
    this.citadelOverlays.clear();
    this.shadowRoots.clear();
    this.sky = null;
    this.skyController=null;
  }
  load(data: LevelData, factionColors = true) {
    this.clear();
    this.data = data;
    const t = data.terrain;
    this.scene.background = new T.Color("#17211f");
    this.scene.fog = null;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.terrainMeshes = buildTerrain(
      t,
      data.atlas,
      data.atlasColumns,
      gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
      Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
    );
    for (const mesh of this.terrainMeshes) {
      this.scene.add(mesh);
      if (mesh.material.map)
        this.textures.push(mesh.material.map as T.DataArrayTexture);
    }
    this.scene.add(new T.HemisphereLight("#ffffff", "#706957", 2));
    const sun = new T.DirectionalLight("#fff6df", 2);
    sun.position.set(-100, 220, 100);
    this.scene.add(sun);
    if(data.sky) {
      this.skyController=makeSky(data.skyLayers);
      this.sky=this.skyController.mesh;this.textures.push(...this.skyController.textures);
      this.scene.add(this.sky);
    }
    for (const key of [
      "objects",
      "gates",
      "shadows",
      "starts",
      "citadels",
      "routes",
      "teleporters",
    ]) {
      this.groups[key] = new T.Group();
      this.scene.add(this.groups[key]);
    }
    const prototypes = new Map<string, T.Group>(),
      modelTextures = new Map<string, T.DataTexture>();
    const spriteCache = new Map<string, T.SpriteMaterial[]>();
    let bomberCount=0;
    for (const obj of allObjects(data)) {
      const bomberIndex=obj.kind===38?bomberCount++:0;
      const selection = data.modelSelections[obj.id],
        asset = selection?.model ? data.models[selection.model] : null;
      let root: T.Object3D;
      const colors = factionColors && obj.kind < 176 && obj.owner >= 0 ? {palette:data.palette,owner:paletteOwner(obj.owner)} : undefined;
      const colorKey = colors ? `:${colors.owner}` : "";
      if (obj.citadel?.empty) {
        root = new T.Group();
      } else if (asset) {
        const key=asset.file+colorKey;
        let prototype = prototypes.get(key);
        if (!prototype) {
          prototype = modelPrototype(asset, modelTextures, colors);
          prototypes.set(key, prototype);
        }
        root = prototype.clone(true);
        const pose = modelPose(obj, asset.data, (x, z) => ground(t, x, z), bomberIndex);
        root.position.set(pose.x, pose.y, pose.z);
        if(obj.derived?.type==="gate") {
          const flag=t.flags[(Math.floor(obj.z)&255)*256+(Math.floor(obj.x)&255)];
          root.position.y+=detailHeight(t,obj.x,obj.z)-((flag&64)?accuracyTables.gateSink[1]/512:(flag&16)?accuracyTables.gateSink[0]/512:0);
        }
      } else if (selection?.sprite && data.sprites[selection.sprite]) {
        const spriteAsset = data.sprites[selection.sprite];
        const key=selection.sprite+colorKey;
        let materials = spriteCache.get(key);
        if (!materials) {
          materials = spriteMaterials(spriteAsset, colors);
          spriteCache.set(key, materials);
          this.soldierMaterials.push(...materials);
        }
        const soldier = makeSoldier(spriteAsset, materials, headingRadians(obj.heading));
        root = soldier.root;
        root.position.set(obj.x, ground(t, obj.x, obj.z) + spriteAsset.centerHeight, obj.z);
        this.soldiers.push(soldier);
      } else {
        const building = obj.kind >= 96 && obj.kind < 176,
          size = building ? 3 : obj.kind >= 176 ? 1.6 : 1.2;
        root = new T.Mesh(
          new T.BoxGeometry(size, building ? 3 : 1.4, size),
          new T.MeshBasicMaterial({
            color: new T.Color().setHSL(
              (obj.owner * 0.137 + 0.04) % 1,
              0.72,
              0.65,
            ),
            wireframe: true,
          }),
        );
        const airborne = obj.kind === 38 || obj.kind === 39;
        root.position.set(
          obj.x,
          obj.kind===38 ? bomberSpawnHeight(ground(t,obj.x,obj.z),bomberIndex) : airborne ? obj.y : ground(t, obj.x, obj.z) + (building ? 1.5 : 0.7),
          obj.z,
        );
      }
      root.rotation.y = obj.citadel?.empty ? 0 : headingRadians(obj.heading);
      if(asset && [32,33,41].includes(obj.kind)) {
        const pose=restingAttitude(t,obj,asset.data);
        if(pose.height!==undefined)root.position.y=pose.height;
        root.matrix.copy(orientationMatrix(pose.heading,pose.pitch,pose.roll,root.position));
        root.matrixAutoUpdate=false;
        root.userData.attitude=pose;
        if(obj.kind===32)applyWraithGun(root,asset.data,pose);
      }
      root.traverse((node) => (node.userData.id = obj.id));
      const group=obj.citadel ? "citadels" : obj.derived?.type==="gate" ? "gates" : obj.derived?.type==="player-start" ? "starts" : obj.derived?.type==="teleporter" ? "teleporters" : "objects";
      this.groups[group].add(root);
      this.targets.push(root);
      if(!obj.citadel?.empty && !obj.derived?.type && (obj.kind===64 || obj.kind===38 || obj.kind===39)) {
        const height=Math.fround((root.position.y-ground(t,obj.x,obj.z))*512);
        const width=obj.kind===64?218.75*0.8999999761581421/512:(asset?.data.radius??512)*Math.max(0,Math.min(1,Math.fround(1-height*0.00019999999494757503)))*1.5/512;
        const shadow=groundShadow(obj.x,obj.z,width,(x,z)=>ground(t,x,z));
        shadow.userData.layer=group;this.groups.shadows.add(shadow);this.shadowRoots.set(obj.id,shadow);
      } else if(asset && !obj.derived?.model && obj.kind<176) {
        const shadow=boundsShadow(root,(x,z)=>ground(t,x,z));
        if(shadow){shadow.userData.layer=group;this.groups.shadows.add(shadow);this.shadowRoots.set(obj.id,shadow);}
      }
    }
    const line = (points: T.Vector3[], color: string, group: string) => {
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({ color }),
      );
      this.groups[group].add(line);
    };
    const raised = (x: number, z: number, y = 0.25) =>
      new T.Vector3(x, ground(t, x, z) + y, z);
    for (const s of data.starts.slice(0, data.starts.length>1?1:0)) {
      const marker = new T.Mesh(
        new T.ConeGeometry(1.4, 4, 4),
        new T.MeshBasicMaterial({ color: "#eed391", wireframe: true }),
      );
      marker.position.copy(raised(s.x, s.z, 3));
      this.groups.starts.add(marker);
    }
    for (const c of data.citadels) {
      const id=1000000+c.id*16;
      const overlay=new T.Group();
      this.groups.citadels.add(overlay);
      this.citadelOverlays.set(id,overlay);
      for (const r of [...c.footprints, c.claim]) {
        const coords = [
          [r.x1, r.z1],
          [r.x2, r.z1],
          [r.x2, r.z2],
          [r.x1, r.z2],
          [r.x1, r.z1],
        ];
        const outline = new T.Line(new T.BufferGeometry().setFromPoints(coords.map(([x,z])=>raised(x,z,.12))),new T.LineBasicMaterial({color:c.owner===-1 ? "#b4baa9" : "#edaa6a"}));
        outline.userData.id=id;
        if(c.owner===-1) this.targets.find(o=>o.userData.id===id)!.add(outline);
        else overlay.add(outline);
      }
      for(const slot of c.upgrades.filter(u=>u.kind===0)) {
        const ring=new T.Mesh(new T.RingGeometry(.35,.42,24),new T.MeshBasicMaterial({color:"#b4baa9",side:T.DoubleSide}));
        ring.rotation.x=-Math.PI/2;ring.position.copy(raised(slot.x,slot.z,.08));ring.userData.id=id;
        overlay.add(ring);
      }
    }
    for (const r of data.routes)
      line(
        r.points.map((p) => new T.Vector3(p.x, p.y + 0.3, p.z)),
        "#a4d3c4",
        "routes",
      );
    for (const p of data.teleporters) {
      line(
        [p.source, p.destination].map(
          (v) => new T.Vector3(v.x, v.y / 512 + 0.5, v.z),
        ),
        "#c4a6f0",
        "teleporters",
      );
      for (const v of [p.destination]) {
        const ring = new T.Mesh(
          new T.TorusGeometry(2, 0.15, 6, 32),
          new T.MeshBasicMaterial({ color: "#c4a6f0" }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(v.x, v.y / 512 + 0.5, v.z);
        this.groups.teleporters.add(ring);
      }
    }
    const start=data.derivedObjects.find(o=>o.derived?.type==="player-start"&&o.owner===0);
    const tankModel=start?data.modelSelections[start.id]?.model:null;
    if(start&&tankModel&&data.models[tankModel]){this.tank=new TankRig(data,data.models[tankModel],start,factionColors);this.scene.add(this.tank.group);}
    // clear() disposed the old rig; do not restore its start visibility into this level.
    this.mode="orbit";this.setMode("orbit");
    this.reset();
  }
  select(id: number, focus = false) {
    this.selectedId=id;
    if (this.selected) {
      this.scene.remove(this.selected);
      this.selected.geometry.dispose();
      (this.selected.material as T.Material).dispose();
      this.selected = null;
    }
    const target = this.targets.find((o) => o.userData.id === id);
    if (!target) return;
    target.updateWorldMatrix(true, true);
    this.selected = new T.BoxHelper(target, "#ffffff");
    this.selected.visible = target.visible && target.parent!.visible;
    this.scene.add(this.selected);
    if (focus) {
      if(this.mode==="tank")this.setMode("orbit");
      const bounds = new T.Box3().setFromObject(target),
        center = bounds.getCenter(new T.Vector3());
      const radius = bounds.getSize(new T.Vector3()).length() * 0.5;
      const distance = Math.max(
        3,
        (radius / Math.sin(T.MathUtils.degToRad(this.camera.fov * 0.5))) * 1.4,
      );
      const offset = this.camera.position
        .clone()
        .sub(this.controls.target)
        .normalize()
        .multiplyScalar(distance);
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(offset);
      this.camera.lookAt(center);
    }
  }
  layer(key: string, visible: boolean) {
    if (this.groups[key]) this.groups[key].visible = visible;
    this.syncSelection();
    this.syncShadows();
  }
  private syncSelection() {
    const target=this.targets.find(o=>o.userData.id===this.selectedId);
    if(this.selected) this.selected.visible=!!target?.visible && !!target?.parent?.visible;
  }
  filterObjects(predicate: (id:number)=>boolean) {
    for(const target of this.targets) target.visible=predicate(target.userData.id);
    for(const [id,overlay] of this.citadelOverlays) overlay.visible=predicate(id);
    if(this.mode==="tank")this.hideTankStart();
    this.syncSelection();
    this.syncShadows();
  }
  private syncShadows() {
    for(const [id,shadow] of this.shadowRoots){const target=this.targets.find(o=>o.userData.id===id);shadow.visible=!!target?.visible&&!!target?.parent?.visible;}
  }
  surface(mode: string) {
    for (const mesh of this.terrainMeshes) {
      const mat = mesh.material;
      mat.wireframe = mode === "wireframe";
      mat.vertexColors = mode === "height" || !this.data?.atlas;
      mat.map = mode === "height" ? null : mat.userData.terrainTexture;
      mat.needsUpdate = true;
    }
  }

  environment(visible: boolean) {
    if (this.sky) this.sky.visible = visible;
  }
  fog(enabled: boolean) {
    this.fogEnabled=enabled;
    if(!enabled)this.scene.fog=null;
  }
}
