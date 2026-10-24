import * as T from "three";
import { bleedCutoutEdges } from "../src/core/cutout";
import { modelPrototype } from "../src/renderer/models";
import type { StaticModel } from "../src/shared/types";
declare global {
  interface Window {
    probeSceneryCutout: () => {
      samples: number;
      fringes: number;
      emptyScales: number;
    };
  }
}
window.probeSceneryCutout = () => {
  const size = 32,
    rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4,
        solid = x >= 10 && x < 22;
      rgba.set(solid ? [0, 180, 0, 255] : [255, 0, 255, 0], at);
    }
  bleedCutoutEdges(rgba, size, size);
  const model: StaticModel = {
    file: "fixture",
    label: "fixture",
    warnings: [],
    materials: {
      leaf: {
        path: "fixture",
        image: { width: size, height: size, rgba },
        transparent: true,
        uvScale: [size, size],
      },
    },
    data: {
      format: 0,
      meshes: [
        {
          materials: ["leaf"],
          positions: Float32Array.of(
            -512,
            -512,
            0,
            512,
            -512,
            0,
            512,
            512,
            0,
            -512,
            512,
            0,
          ),
          indices: Uint16Array.of(0, 1, 2, 0, 2, 3),
          uvs: Float32Array.of(0, 0, 32, 0, 32, 32, 0, 0, 32, 32, 0, 32),
          materialIndices: Uint16Array.of(0, 0),
          radius: 1,
          center: [512, 512, 0],
          auxiliary: 0,
        },
      ],
      radius: 1,
      center: [512, 512, 0],
      markerCount: 0,
      planeCount: 0,
      pointCount: 0,
      secondaryPointCount: 0,
      groups: [],
      anchors: [],
      parts: [],
      endOffset: 0,
    },
  };
  const renderer = new T.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  const textures = new Map<string, T.DataTexture>(),
    root = modelPrototype(model, textures),
    scene = new T.Scene();
  scene.background = new T.Color(0);
  scene.add(root, new T.AmbientLight(0xffffff, Math.PI));
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 3;
  camera.lookAt(0, 0, 0);
  let samples = 0,
    fringes = 0,
    emptyScales = 0;
  for (const scale of [128, 32, 8, 2]) {
    renderer.setSize(scale, scale);
    renderer.render(scene, camera);
    const gl = renderer.getContext(),
      pixels = new Uint8Array(scale * scale * 4);
    gl.readPixels(0, 0, scale, scale, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      samples++;
      if (pixels[i] > 3 || pixels[i + 2] > 3) fringes++;
      if (pixels[i + 1] > 30) visible++;
    }
    if (!visible) emptyScales++;
  }
  root.traverse((node) => {
    if (node instanceof T.Mesh) {
      node.geometry.dispose();
      for (const m of node.material) m.dispose();
    }
  });
  textures.forEach((t) => t.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return { samples, fringes, emptyScales };
};
