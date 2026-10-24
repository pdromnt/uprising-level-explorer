// Browser-only regression probe, injected by the desktop test, never shipped.
import * as T from "three";
import { buildTerrain } from "../src/renderer/terrain";
import type { Terrain } from "../src/shared/types";

declare global {
  interface Window {
    probeTerrainSeams: () => {
      samples: number;
      contaminated: number;
      shaderErrors: string[];
    };
  }
}
window.probeTerrainSeams = () => {
  const renderer = new T.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const shaderErrors: string[] = [];
  renderer.debug.onShaderError = (gl, program, vertex, fragment) =>
    shaderErrors.push(
      [
        gl.getProgramInfoLog(program),
        gl.getShaderInfoLog(vertex),
        gl.getShaderInfoLog(fragment),
      ].join("\n"),
    );
  const rgba = new Uint8Array(96 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 4;
      rgba[i + Math.floor(x / 32)] = 255;
      rgba[i + 3] = 255;
    }
  const terrain: Terrain = {
    width: 2,
    height: 2,
    tileNames: ["red", "green", "unused-blue"],
    descriptors: Uint16Array.of(0, 1 | (1 << 14), 0 | (2 << 14), 1 | (3 << 14)),
    flags: new Uint8Array(4),
    heights: new Int16Array(65536),
    minimum: 0,
    maximum: 0,
    terrainOffset: 0,
    binaryOffset: 0,
    binarySize: 0,
    slotsOffset: 0,
    endOffset: 0,
  };
  const meshes = buildTerrain(
      terrain,
      { width: 96, height: 32, rgba },
      3,
      1,
      1,
    ),
    scene = new T.Scene();
  // Lambert's 1/PI response: unit-color materials should render at full color.
  scene.add(new T.AmbientLight(0xffffff, Math.PI));
  meshes.forEach((m) => scene.add(m));
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.set(1, 8, 1);
  camera.up.set(0, 0, -1);
  camera.lookAt(1, 0, 1);
  let samples = 0,
    contaminated = 0;
  // Magnification, ordinary minification and deepest mip. Different rotations
  // meet on both sides of the central horizontal seam; red/green meet vertically.
  for (const size of [256, 64, 8, 2]) {
    renderer.setSize(size, size);
    renderer.render(scene, camera);
    const gl = renderer.getContext(),
      pixels = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4,
          expected = x < size / 2 ? 0 : 1,
          other = 1 - expected;
        if (
          pixels[i + expected] < 250 ||
          pixels[i + other] > 2 ||
          pixels[i + 2] > 2 ||
          pixels[i + 3] !== 255
        )
          contaminated++;
        samples++;
      }
  }
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.map?.dispose();
    mesh.material.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return { samples, contaminated, shaderErrors };
};
