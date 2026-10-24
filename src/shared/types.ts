export interface Point {
  x: number;
  z: number;
  y: number;
}
export interface Start {
  x: number;
  z: number;
  heading: number;
}
export interface Placement extends Point {
  derived?: { type: "gate" | "player-start" | "teleporter"; index: number; model?: string; format?: ModelFormat; rawY?: boolean };
  citadel?: { id: number; slot: number; upgrade: number; empty: boolean };
  id: number;
  kind: number;
  owner: number;
  heading: number;
  name: string;
  attribute: string;
  parent: string;
  flags: number;
  group: number;
  variant: number;
  sourceOffset: number;
}
export interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}
export interface Citadel {
  id: number;
  owner: number;
  health: number;
  footprints: Rect[];
  claim: Rect;
  base: Start;
  upgrades: (Start & { kind: number })[];
}
export interface Route {
  id: number;
  name: string;
  flags: number;
  points: Point[];
}
export interface Teleporter {
  id: number;
  name: string;
  heading: number;
  source: Point;
  destination: Point;
}
export interface Terrain {
  light?: Uint8Array;
  renderHeights?: Float32Array;
  detail?: Uint8Array;
  width: number;
  height: number;
  tileNames: string[];
  descriptors: Uint16Array;
  flags: Uint8Array;
  heights: Int16Array;
  minimum: number;
  maximum: number;
  terrainOffset: number;
  binaryOffset: number;
  binarySize: number;
  slotsOffset: number;
  endOffset: number;
}
export interface ParsedMap {
  terrain: Terrain;
  starts: Start[];
  citadels: Citadel[];
  objects: Placement[];
  routes: Route[];
  teleporters: Teleporter[];
  version: string;
}
export interface Mission {
  id: string;
  title: string;
  environment: string;
  categories: string[];
  config: Record<string, string>;
  mapFile: string;
}
export interface Library {
  root: string;
  missions: Mission[];
  warnings: string[];
  lastMission: string | null;
}
export interface Bitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
  palette: Uint8Array;
}
export interface ImageData {
  width: number;
  height: number;
  rgba: Uint8Array;
  indices?: Uint8Array;
}
export interface Briefing {
  objective: string;
  description: string;
  spy: string[];
  ranking: number | null;
}
export type ModelFormat = 0 | 1 | 2 | 3;
export interface ModelMesh {
  materials: string[];
  positions: Float32Array;
  indices: Uint16Array;
  uvs: Float32Array;
  materialIndices: Uint16Array;
  radius: number;
  center: number[];
  auxiliary: number;
}
export interface BinaryModel {
  format: ModelFormat;
  meshes: ModelMesh[];
  radius: number;
  center: number[];
  markerCount: number;
  planeCount: number;
  pointCount: number;
  secondaryPointCount: number;
  groups: number[];
  anchors: number[][];
  parts: { position: number[]; mesh: ModelMesh }[];
  endOffset: number;
}
export interface ModelMaterial {
  path: string;
  image: ImageData | null;
  transparent: boolean;
  uvScale: [number, number];
}
export interface StaticModel {
  file: string;
  label: string;
  data: BinaryModel;
  materials: Record<string, ModelMaterial>;
  warnings: string[];
}
export interface ModelSelection {
  model: string | null;
  sprite?: string | null;
  label: string | null;
  format: ModelFormat | null;
  manager: string;
  choice: number | null;
  slot: number | null;
  provenance: string;
  reason: string | null;
}
export interface StaticSprite {
  file: string;
  profile: string;
  width: number;
  height: number;
  centerHeight: number;
  images: ImageData[];
}
export interface LevelData extends ParsedMap {
  derivedObjects: Placement[];
  skyLayers: (ImageData | null)[];
  citadelObjects: Placement[];
  palette: Uint8Array | null;
  mission: Mission;
  briefing: Briefing;
  script: string;
  scriptFile: string | null;
  configText: string;
  briefingText: string;
  warnings: string[];
  atlas: ImageData | null;
  atlasColumns: number;
  sky: ImageData | null;
  skyFile: string | null;
  models: Record<string, StaticModel>;
  sprites: Record<string, StaticSprite>;
  modelSelections: Record<number, ModelSelection>;
  playerTechnology: number;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export interface ViewerAPI {
  bootstrap(): Promise<Result<Library | null>>;
  chooseFolder(): Promise<Result<Library | null>>;
  loadLevel(id: string, playerTechnology?: number): Promise<Result<LevelData>>;
}
declare global {
  interface Window {
    viewer: ViewerAPI;
  }
}
