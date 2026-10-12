/* =========================================================
   DualSense — WebGL layer (Three.js r169)
   Procedural model of the PS5 DualSense wireless controller.
   Reads window.NX.target (written by scripts.js) and renders.

   Model space (1 unit ≈ 1 cm):
     x → right, y → toward the triggers (front edge), z → out of the face.
   Every shell is extruded flat, tessellated, then bent by deformZ():
   grips droop and thicken, the face arches. Buttons, sticks and
   triggers are placed with surf(), which samples that same function,
   so everything sits on the curved surface.
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const NX = (window.NX = window.NX || {});
const signalReady = () => { NX.ready = true; window.dispatchEvent(new Event('nx:ready')); };

const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  canvas.remove();
  signalReady();
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
camera.position.set(0, 0, 40);

scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x050507, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-8, 12, 16);
scene.add(key);
const rim = new THREE.PointLight(0x1f6bff, 520, 0, 2);
rim.position.set(14, 6, -10);
scene.add(rim);
const fill = new THREE.PointLight(0xcfe0ff, 140, 0, 2);
fill.position.set(-14, -8, 8);
scene.add(fill);

/* ---------- Materials ---------- */
const BLUE = new THREE.Color(0x1f6bff);
const M = {
  white: new THREE.MeshPhysicalMaterial({ color: 0xeef0f4, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.55, sheen: 0.3, sheenColor: 0xffffff, sheenRoughness: 0.8 }),
  touch: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f6, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.58, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x24252a, roughness: 0.9 }),
  well: new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.7 }),
  clear: new THREE.MeshPhysicalMaterial({ color: 0xc9d2de, roughness: 0.08, transparent: true, opacity: 0.78, clearcoat: 1, depthWrite: false }),
  recess: new THREE.MeshStandardMaterial({ color: 0xc3c8d0, roughness: 0.6 }),
  symbol: new THREE.MeshStandardMaterial({ color: 0x6d737e, roughness: 0.4 }),
  light: new THREE.MeshStandardMaterial({ color: 0x1f6bff, emissive: 0x1f6bff, emissiveIntensity: 1.7, roughness: 0.3 }),
  port: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9a9ca6, roughness: 0.28, metalness: 1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24252c, roughness: 0.45, metalness: 0.4 }),
  coil: new THREE.MeshStandardMaterial({ color: 0x4d9bff, emissive: 0x1f6bff, emissiveIntensity: 1.2, roughness: 0.3 }),
  trigger: new THREE.MeshPhysicalMaterial({ color: 0x1b1c20, roughness: 0.62, clearcoat: 0.15 })
};
M.pcb = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1a14';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(77,155,255,.7)';
  g.lineWidth = 2;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 110; i++) {
    let x = rnd() * 512, y = rnd() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      if (rnd() > 0.5) x += (rnd() - 0.5) * 140; else y += (rnd() - 0.5) * 140;
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(230,236,245,.85)';
    g.fillRect(x - 3, y - 3, 6, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0x1f6bff, emissiveMap: tex, emissiveIntensity: 0.45, roughness: 0.55, metalness: 0.3 });
})();

/* ---------- Surface: one function bends every shell ---------- */
const sstep = (a, b, t) => {
  const k = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
function deformZ(x, y, z) {
  const g = sstep(-0.8, -6.9, y);          // 0 on the body, 1 at the grip tips
  const zc = -0.65;
  z = zc + (z - zc) * (1 + 0.55 * g);      // grips get rounder
  z -= 2.8 * Math.pow(g, 1.4);              // …and drop toward the palms
  z -= 0.011 * x * x;                       // gentle arch across the face
  return z;
}
const Zup = new THREE.Vector3(0, 0, 1);
function surf(x, y, z0) {
  const e = 0.01;
  const dzdx = (deformZ(x + e, y, z0) - deformZ(x - e, y, z0)) / (2 * e);
  const dzdy = (deformZ(x, y + e, z0) - deformZ(x, y - e, z0)) / (2 * e);
  return { p: new THREE.Vector3(x, y, deformZ(x, y, z0)), n: new THREE.Vector3(-dzdx, -dzdy, 1).normalize() };
}
function place(obj, x, y, z0, lift = 0, spin = 0) {
  const s = surf(x, y, z0);
  obj.position.copy(s.p).addScaledVector(s.n, lift);
  obj.quaternion.setFromUnitVectors(Zup, s.n);
  if (spin) obj.rotateZ(spin);
  return obj;
}

/* Extrude → tessellate → bend → smooth normals → planar UVs */
function shellGeo(points, { bottom, top, bevel, edge = 0.32 }) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.02, top - bottom - 2 * bevel);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 1,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 7
  });
  g.translate(0, 0, bottom + bevel);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = new TessellateModifier(edge, 14).modify(g);
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, deformZ(x, y, p.getZ(i)));
    uv[i * 2] = x / 16.4 + 0.5;
    uv[i * 2 + 1] = (y + 2.4) / 10.8 + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* ---------- Outline (top view), traced from the reference shots ---------- */
const RIGHT = [
  [0, 2.55], [1.5, 2.6], [2.75, 2.68], [4.3, 2.75], [5.7, 2.55], [6.9, 1.9], [7.6, 0.8],
  [7.85, -0.6], [7.75, -2.6], [7.35, -4.6], [6.8, -6.2], [6.1, -7.2], [5.3, -7.5],
  [4.6, -7.1], [4.15, -6.0], [3.75, -4.6], [3.3, -3.2], [2.5, -2.55], [1.3, -2.35]
];
const LOOP = [...RIGHT, [0, -2.3], ...RIGHT.slice(1).reverse().map(([x, y]) => [-x, y])];
const outline = new THREE.CatmullRomCurve3(LOOP.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal')
  .getSpacedPoints(520).slice(0, -1).map(v => [v.x, v.y]);

// White side panel boundary (right): from the touchpad edge, around the stick, down the inner grip
const WING_EDGE = new THREE.CatmullRomCurve3(
  [[2.75, 2.68], [2.82, 1.6], [2.95, 0.55], [3.35, -0.6], [3.95, -2.0], [4.35, -3.4], [4.55, -4.8], [4.65, -6.1], [4.95, -7.28]]
    .map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal'
).getPoints(70).map(v => [v.x, v.y]);

const nearest = ([px, py]) => {
  let best = 0, d = Infinity;
  outline.forEach(([x, y], i) => {
    const dd = (x - px) ** 2 + (y - py) ** 2;
    if (x > 0 && dd < d) { d = dd; best = i; }
  });
  return best;
};
function wingPoints(side) {
  const iA = nearest(WING_EDGE[0]);
  const iJ = nearest(WING_EDGE[WING_EDGE.length - 1]);
  const pts = [...outline.slice(iA, iJ + 1), ...WING_EDGE.slice(1, -1).reverse()];
  return side > 0 ? pts : pts.map(([x, y]) => [-x, y]).reverse();
}
function roundedRect(x0, x1, y0, y1, r, rb = r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + rb, y0);
  s.lineTo(x1 - rb, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + rb);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + rb);
  s.quadraticCurveTo(x0, y0, x0 + rb, y0);
  return s.getSpacedPoints(160).slice(0, -1).map(v => [v.x, v.y]);
}

/* ---------- Scene graph ---------- */
const root = new THREE.Group();
const tilt = new THREE.Group();
const model = new THREE.Group();
model.position.set(0, 2.3, 0.9);
root.add(tilt);
tilt.add(model);
scene.add(root);

const parts = [];
const MATS = new WeakMap();
const matsOf = g => { if (!MATS.has(g)) MATS.set(g, []); return MATS.get(g); };
const anchors = {};
const coils = [];
const triggerPivots = [];
const lightMats = [];
const edgeOnly = [];

const ROLE = new Map([[M.white, 'white'], [M.touch, 'touch'], [M.black, 'black'], [M.light, 'light']]);
function part(name, dir, bom) {
  const g = new THREE.Group();
  g.name = name;
  g.userData = { dir: new THREE.Vector3(...dir), base: new THREE.Vector3(), bom, h: 0 };
  model.add(g);
  parts.push(g);
  return g;
}
function mesh(parent, geo, mat, owner = parent) {
  const m = mat.clone();
  m.userData.baseIntensity = m.emissiveIntensity || 0;
  matsOf(owner).push(m);
  if (mat === M.light) lightMats.push(m);
  const me = new THREE.Mesh(geo, m);
  me.userData.part = owner.name;
  me.userData.role = ROLE.get(mat) || '';
  parent.add(me);
  return me;
}
const zCyl = (r, h, seg = 40) => new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2).translate(0, 0, h / 2);
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.slice().reverse().map(([r, h]) => new THREE.Vector2(r, h)), seg).rotateX(Math.PI / 2);
const flat = (shape, depth = 0.03) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });

/* Face-button symbols (thin raised outlines) */
function symbolGeo(kind, s = 0.2) {
  if (kind === 'triangle' || kind === 'square' || kind === 'circle') {
    const outer = new THREE.Shape(), inner = new THREE.Path();
    if (kind === 'circle') {
      outer.absarc(0, 0, s, 0, Math.PI * 2);
      inner.absarc(0, 0, s - 0.045, 0, Math.PI * 2, true);
    } else if (kind === 'square') {
      const a = s * 0.82, b = a - 0.045;
      outer.moveTo(-a, -a); outer.lineTo(a, -a); outer.lineTo(a, a); outer.lineTo(-a, a);
      inner.moveTo(-b, -b); inner.lineTo(-b, b); inner.lineTo(b, b); inner.lineTo(b, -b);
    } else {
      const tri = r => [[0, r], [r * 0.866, -r * 0.5], [-r * 0.866, -r * 0.5]];
      const o = tri(s * 1.1), i = tri(s * 1.1 - 0.09);
      outer.moveTo(...o[0]); outer.lineTo(...o[1]); outer.lineTo(...o[2]);
      inner.moveTo(...i[0]); inner.lineTo(...i[2]); inner.lineTo(...i[1]);
    }
    outer.holes.push(inner);
    return flat(outer);
  }
  // cross
  const bar = new RoundedBoxGeometry(s * 2.1, 0.045, 0.03, 1, 0.01);
  const a = bar.clone().rotateZ(Math.PI / 4);
  const b = bar.clone().rotateZ(-Math.PI / 4);
  return mergeGeos([a, b]);
}
function mergeGeos(list) {
  // tiny merge for non-indexed-compatible geometries
  const nonIdx = list.map(g => (g.index ? g.toNonIndexed() : g));
  const total = nonIdx.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  nonIdx.forEach(g => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/* Profile in the y–z plane extruded along x (for L2/R2) */
function sideProfileGeo(pts, width, bevel = 0.14) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([u, v]) => new THREE.Vector3(u, v, 0)), true, 'centripetal');
  const shape = new THREE.Shape(curve.getSpacedPoints(80).slice(0, -1).map(v => new THREE.Vector2(v.x, v.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 5, curveSegments: 1 });
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  g.translate(-(width - 2 * bevel) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

/* ---------- Build ---------- */
const Z = { coreTop: 0.5, coreBot: -1.75, wingTop: 0.78, wingBot: -1.82, padTop: 0.8, padBot: 0.3 };

function buildProcedural() {
  /* 00 · white side panels with D-pad, face buttons, Create / Options */
  [-1, 1].forEach(sd => {
    const wing = part(sd < 0 ? 'wingL' : 'wingR', [sd * 1.9, 0, 0.6], 0);
    mesh(wing, shellGeo(wingPoints(sd), { bottom: Z.wingBot, top: Z.wingTop, bevel: 0.55 }), M.white);

    const cx = sd * 4.95, cy = 0.3;
    if (sd < 0) {
      // D-pad: four translucent arrow keys pointing at the centre
      const key = new THREE.Shape();
      key.moveTo(-0.29, 0.5); key.lineTo(0.29, 0.5); key.lineTo(0.29, -0.08); key.lineTo(0, -0.36); key.lineTo(-0.29, -0.08); key.closePath();
      const keyGeo = new THREE.ExtrudeGeometry(key, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 4 });
      const arrow = new THREE.Shape();
      arrow.moveTo(0, 0.12); arrow.lineTo(0.09, -0.04); arrow.lineTo(-0.09, -0.04); arrow.closePath();
      const arrowGeo = flat(arrow, 0.02);
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(a => {
        const off = new THREE.Vector2(0, 0.64).rotateAround(new THREE.Vector2(), a);
        const holder = place(new THREE.Group(), cx + off.x, cy + off.y, Z.wingTop, 0.01);
        holder.rotateZ(a);
        mesh(holder, keyGeo, M.clear, wing);
        const ar = mesh(holder, arrowGeo, M.symbol, wing);
        ar.position.set(0, 0.16, 0.19);
        wing.add(holder);
      });
      const recess = place(new THREE.Group(), cx, cy, Z.wingTop, 0.004);
      const plate = new THREE.Shape();
      const w = 0.36, l = 1.12;
      plate.moveTo(-w, l); plate.lineTo(w, l); plate.lineTo(w, w); plate.lineTo(l, w); plate.lineTo(l, -w); plate.lineTo(w, -w); plate.lineTo(w, -l);
      plate.lineTo(-w, -l); plate.lineTo(-w, -w); plate.lineTo(-l, -w); plate.lineTo(-l, w); plate.lineTo(-w, w); plate.closePath();
      mesh(recess, new THREE.ShapeGeometry(plate), M.recess, wing);
      wing.add(recess);
    } else {
      // Face buttons △ ○ ✕ □
      const capGeo = lathe([[0, 0.26], [0.26, 0.255], [0.36, 0.23], [0.41, 0.17], [0.42, 0.0]]);
      [['triangle', 0, 0.95], ['circle', 0.95, 0], ['cross', 0, -0.95], ['square', -0.95, 0]].forEach(([k, dx, dy]) => {
        const holder = place(new THREE.Group(), cx + dx, cy + dy, Z.wingTop, 0.0);
        mesh(holder, new THREE.CircleGeometry(0.5, 48), M.recess, wing).position.z = 0.004;
        mesh(holder, capGeo, M.clear, wing);
        const sym = mesh(holder, symbolGeo(k), M.symbol, wing);
        sym.position.z = 0.265;
        wing.add(holder);
      });
    }
    // Create (left) / Options (right): small slanted pills by the touchpad
    const pill = place(new THREE.Group(), sd * 3.5, 1.95, Z.wingTop, 0.0, sd * 0.32);
    mesh(pill, new RoundedBoxGeometry(0.2, 0.55, 0.2, 3, 0.09), M.white, wing);
    wing.add(pill);
  });

  /* 01 · touchpad + light bar */
  const pad = part('touchpad', [0, 0.7, 2.1], 1);
  mesh(pad, shellGeo(roundedRect(-2.6, 2.6, 0.48, 2.58, 0.3, 0.5), { bottom: Z.padBot, top: Z.padTop, bevel: 0.1, edge: 0.28 }), M.touch);
  [-1, 1].forEach(sd => {
    const pts = [[2.72, 2.56, 0.42], [2.72, 2.4, 0.62], [2.72, 2.1, 0.66], [2.72, 1.1, 0.66], [2.68, 0.55, 0.64], [2.45, 0.35, 0.6]]
      .map(([x, y, z]) => new THREE.Vector3(sd * x, y, deformZ(x, y, z)));
    mesh(pad, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 60, 0.05, 8), M.light);
  });

  /* 02 · thumbsticks */
  const sticks = part('sticks', [0, 0, 1.5], 2);
  [-1, 1].forEach(sd => {
    const g = place(new THREE.Group(), sd * 2.15, -0.75, Z.coreTop, -0.02);
    mesh(g, new THREE.TorusGeometry(0.84, 0.07, 14, 64), M.well, sticks);
    const dome = mesh(g, new THREE.SphereGeometry(0.74, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.rubber, sticks);
    dome.scale.z = 0.42;
    mesh(g, zCyl(0.2, 0.62), M.rubber, sticks).position.z = 0.2;
    const cap = mesh(g, lathe([[0, 0.86], [0.3, 0.88], [0.5, 0.94], [0.6, 0.98], [0.65, 0.95], [0.66, 0.84], [0.6, 0.78], [0.32, 0.74], [0.2, 0.7]], 64), M.rubber, sticks);
    cap.position.z = 0.02;
    const grip = mesh(g, new THREE.TorusGeometry(0.6, 0.045, 10, 64), M.rubber, sticks);
    grip.position.z = 0.98;
    sticks.add(g);
    if (sd < 0) {
      const a = new THREE.Object3D();
      a.position.z = 1.0;
      g.add(a);
      anchors.stickL = a;
    }
  });

  /* 03 · main board */
  const pcb = part('pcb', [0, 0, 0.8], 3);
  const board = place(new THREE.Group(), 0, 0.55, -0.35);
  board.quaternion.identity();
  mesh(board, flat(new THREE.Shape(roundedRect(-4.4, 4.4, -1.6, 1.8, 0.6).map(([x, y]) => new THREE.Vector2(x, y))), 0.06), M.pcb, pcb);
  [[0, 0.2, 1.1, 0.9, M.dark], [1.9, 0.9, 0.6, 0.45, M.dark], [-1.8, 1.0, 0.5, 0.7, M.dark], [0.4, -1.0, 0.9, 0.3, M.coil]].forEach(([x, y, w, h, mt]) => {
    const chip = mesh(board, new RoundedBoxGeometry(w, h, 0.12, 2, 0.02), mt, pcb);
    chip.position.set(x, y, 0.12);
  });
  pcb.add(board);

  /* 04 · dual actuators (voice-coil, one per grip) */
  [-1, 1].forEach(sd => {
    const g = part(sd < 0 ? 'actL' : 'actR', [sd * 1.1, -0.4, 0.2], 4);
    const holder = place(new THREE.Group(), sd * 5.45, -3.7, -0.75);
    const body = mesh(holder, new THREE.CylinderGeometry(0.55, 0.55, 1.2, 40), M.metal, g);
    body.rotation.z = 0.35 * sd;
    const coil = mesh(holder, new THREE.TorusGeometry(0.56, 0.06, 10, 48).rotateX(Math.PI / 2), M.coil, g);
    coil.rotation.z = 0.35 * sd;
    coils.push({ coil, side: sd });
    const a = new THREE.Object3D();
    a.position.z = 0.6;
    holder.add(a);
    anchors[sd < 0 ? 'motorL' : 'motorR'] = a;
    g.add(holder);
  });

  /* 05 · battery */
  const bat = part('battery', [0, 0, -1.1], 5);
  const cell = place(new THREE.Group(), 0, -0.7, -1.0);
  cell.quaternion.identity();
  mesh(cell, new RoundedBoxGeometry(4.2, 1.5, 0.85, 3, 0.15), M.dark, bat);
  mesh(cell, new RoundedBoxGeometry(3.2, 0.12, 0.87, 2, 0.04), M.coil, bat);
  bat.add(cell);

  /* 06 · adaptive triggers L1/L2 · R1/R2 */
  const trig = part('triggers', [0, 1.7, 0.1], 6);
  const archAt = x => deformZ(x, 2.8, 0) - 0;
  [-1, 1].forEach(sd => {
    const x = sd * 4.45;
    const bumper = mesh(trig, new RoundedBoxGeometry(2.2, 0.8, 0.62, 4, 0.24), M.trigger);
    bumper.position.set(x, 2.92, 0.08 + archAt(x));
    const pivot = new THREE.Group();
    pivot.position.set(x, 2.55, -0.38 + archAt(x));
    const blade = mesh(pivot, sideProfileGeo([[2.45, -0.35], [3.2, -0.3], [3.55, -0.8], [3.52, -1.6], [3.25, -2.3], [2.8, -2.65], [2.45, -2.4], [2.55, -1.3]], 2.0), M.trigger, trig);
    blade.position.set(0, -2.55, 0.38);
    trig.add(pivot);
    triggerPivots.push(pivot);
  });

  /* 07 · black core: body, PS button, speaker, mute, mic, USB-C, (Edge paddles) */
  const core = part('core', [0, 0, -1.9], 7);
  const coreLoop = outline.map(([x, y]) => [x * 0.992, (y + 2.3) * 0.992 - 2.3]);
  mesh(core, shellGeo(coreLoop, { bottom: Z.coreBot, top: Z.coreTop, bevel: 0.55 }), M.black);

  const ps = place(new THREE.Group(), 0, -0.82, Z.coreTop, 0);
  mesh(ps, lathe([[0, 0.12], [0.22, 0.11], [0.3, 0.06], [0.31, 0]]), M.black, core).material.color.set(0x0c0c0e);
  core.add(ps);

  const grille = place(new THREE.Group(), 0, -0.1, Z.coreTop, 0.0);
  const holeGeo = new THREE.CircleGeometry(0.055, 16);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 6; c++) {
      const h = mesh(grille, holeGeo, M.port, core);
      h.position.set(-0.5 + c * 0.2 + (r ? 0.1 : 0), r ? -0.2 : 0, 0.012);
      if (r && c === 5) h.visible = false;
    }
  }
  core.add(grille);

  const mute = place(new THREE.Group(), 0, -1.62, Z.coreTop, 0.02);
  mesh(mute, new RoundedBoxGeometry(0.62, 0.17, 0.1, 3, 0.07), M.white, core);
  core.add(mute);
  const mic = place(new THREE.Group(), 0, -1.98, Z.coreTop, 0.012);
  mesh(mic, new THREE.CircleGeometry(0.04, 12), M.port, core);
  core.add(mic);

  const usb = mesh(core, new RoundedBoxGeometry(0.95, 0.3, 0.28, 2, 0.12), M.port);
  usb.position.set(0, 2.48, deformZ(0, 2.5, -0.75));

  // DualSense Edge back buttons — only shown in the Edge render
  [-1, 1].forEach(sd => {
    const paddle = mesh(core, new RoundedBoxGeometry(0.5, 1.35, 0.3, 3, 0.13), M.metal);
    paddle.material.color.set(0x5a5d68);
    paddle.position.set(sd * 2.3, -1.25, deformZ(sd * 2.3, -1.25, Z.coreBot) - 0.18);
    paddle.rotation.z = sd * -0.55;
    paddle.visible = false;
    edgeOnly.push(paddle);
  });

  parts.forEach(p => p.userData.base.copy(p.position));
}

/* Optional GLB path: fit and explode children radially */
async function loadGLB(url) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  const obj = gltf.scene;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = 16 / Math.max(size.x, size.y, size.z);
  obj.scale.setScalar(k);
  obj.position.copy(center).multiplyScalar(-k);
  model.position.set(0, 0, 0);
  model.add(obj);
  [...obj.children].forEach((c, i) => {
    const g = new THREE.Group();
    g.name = c.name || 'part' + i;
    const cb = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3());
    const dir = cb.lengthSq() > 1e-4 ? cb.normalize().multiplyScalar(3) : new THREE.Vector3(0, 0, 3);
    g.userData = { dir, base: new THREE.Vector3(), bom: i % 8, h: 0 };
    c.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.baseIntensity = o.material.emissiveIntensity || 0; matsOf(g).push(o.material); } });
    obj.remove(c);
    g.add(c);
    obj.add(g);
    parts.push(g);
  });
}

/* ---------- Layout ---------- */
const MODEL_W = 16.6, MODEL_H = 11.2;
const view = { vw: 1, vh: 1, w: 1, h: 1, mobile: false, base: 1 };
function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const vw = vh * camera.aspect;
  Object.assign(view, { vw, vh, w, h, mobile: w < 768 });
  view.base = view.mobile ? (vw * 1.02) / MODEL_W : Math.min((vw * 0.47) / MODEL_W, (vh * 0.62) / MODEL_H);
}
window.addEventListener('resize', layout);
layout();

/* ---------- Light bar colours (tap the touchpad) ---------- */
const LIGHTS = [
  { hex: 0x1f6bff, name: 'Azul' },
  { hex: 0xff2d55, name: 'Vermelho' },
  { hex: 0x2ee67a, name: 'Verde' },
  { hex: 0xff5ad1, name: 'Rosa' },
  { hex: 0xf5f3ee, name: 'Branco' }
];
let lightIdx = 0;
const lightColor = new THREE.Color(LIGHTS[0].hex);
function cycleLight() {
  lightIdx = (lightIdx + 1) % LIGHTS.length;
  lightColor.set(LIGHTS[lightIdx].hex);
  NX.light = LIGHTS[lightIdx];
  window.dispatchEvent(new CustomEvent('nx:light', { detail: LIGHTS[lightIdx] }));
}
NX.light = LIGHTS[0];
NX.cycleLight = cycleLight;

/* ---------- Range renders (WebP data URIs) ---------- */
const texCache = {};
function variantTexture(kind) {
  if (texCache[kind]) return texCache[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  if (kind === 'vice') {
    const grad = g.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, '#ff7ac6');
    grad.addColorStop(0.45, '#ffb38a');
    grad.addColorStop(0.75, '#7fd8e8');
    grad.addColorStop(1, '#9b7bff');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(80,20,90,.22)';
    g.lineWidth = 6;
    for (let i = 0; i < 26; i++) {           // palm fronds
      const x = (i * 137) % 1024, y = (i * 271) % 1024, r = 120 + (i % 4) * 30;
      for (let f = 0; f < 7; f++) {
        const a = f * 0.9 + i;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.3, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7);
        g.stroke();
      }
    }
  } else if (kind === 'stars') {
    g.fillStyle = '#121216';
    g.fillRect(0, 0, 1024, 1024);
    const star = (x, y, r, col) => {
      g.fillStyle = col;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? r * 0.42 : r, a = (k * Math.PI) / 5 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    };
    for (let i = 0; i < 90; i++) star((i * 197) % 1024, (i * 331) % 1024, 8 + (i % 5) * 7, i % 3 ? '#ff8fc8' : '#f5f3ee');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[kind] = t;
  return t;
}
const VARIANTS = {
  branco: () => {},
  midnight: m => {
    if (m.userData.role === 'white' || m.userData.role === 'touch') { m.color.set(0x1e2027); m.roughness = 0.5; }
    if (m.userData.role === 'black') m.color.set(0x0d0e11);
  },
  cosmic: m => {
    if (m.userData.role === 'white') { m.color.set(0xa8102a); m.roughness = 0.45; }
    if (m.userData.role === 'touch') m.color.set(0x111214);
  },
  edge: m => {
    if (m.userData.role === 'touch') m.color.set(0x15161a);
  },
  vice: m => {
    if (m.userData.role === 'white' || m.userData.role === 'touch') {
      m.color.set(0xffffff);
      m.map = variantTexture('vice');
      m.roughness = 0.16;
      m.clearcoat = 1;
      m.iridescence = 1;
      m.iridescenceIOR = 1.7;
      m.iridescenceThicknessRange = [180, 760];
    }
  },
  lisa: m => {
    if (m.userData.role === 'white' || m.userData.role === 'touch') { m.color.set(0xffffff); m.map = variantTexture('stars'); m.roughness = 0.42; }
    if (m.userData.role === 'light') { m.color.set(0xff5ad1); m.emissive.set(0xff5ad1); }
  }
};
function renderThumbs() {
  const imgs = [...document.querySelectorAll('img[data-variant]')];
  if (!imgs.length) return;
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  root.visible = false;

  imgs.forEach(img => {
    const tweak = VARIANTS[img.dataset.variant];
    if (!tweak) return;
    const tw = +(img.dataset.w || 800), th = +(img.dataset.h || 600);
    renderer.setSize(tw, th, false);
    const tcam = new THREE.PerspectiveCamera(26, tw / th, 0.1, 200);
    tcam.position.set(0, 0, 44);
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(13)) * 44, vw = vh * (tw / th);

    edgeOnly.forEach(p => { p.visible = img.dataset.variant === 'edge'; });
    const clone = model.clone(true);
    edgeOnly.forEach(p => { p.visible = false; });
    const mats = [];
    clone.traverse(o => {
      if (!o.isMesh) return;
      const role = o.userData.role;
      o.material = o.material.clone();
      o.material.userData.role = role;
      tweak(o.material);
      mats.push(o.material);
    });
    const holder = new THREE.Group();
    holder.add(clone);
    const back = img.dataset.view === 'back';
    if (back) holder.rotation.set(0.45, Math.PI, 0);
    else holder.rotation.set(-0.62, 0.34, -0.12);
    scene.add(holder);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const fit = Math.min((vw * 0.84) / size.x, (vh * 0.84) / size.y);
    holder.scale.setScalar(fit);
    holder.position.set(-c.x * fit, -c.y * fit, -c.z * fit);
    renderer.render(scene, tcam);
    try { img.src = canvas.toDataURL('image/webp', 0.9); } catch (e) { /* keep SVG fallback */ }
    scene.remove(holder);
    mats.forEach(m => m.dispose());
  });

  root.visible = true;
  renderer.setPixelRatio(pr);
  layout();
}

/* ---------- Pointer: hover, drag to rotate, tap the touchpad ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const drag = { x: 0, y: 0, vx: 0, vy: 0, active: false, id: null, lx: 0, ly: 0, sx: 0, sy: 0 };
let hoverDirty = false, lastPointer = null;

function hitModel(e) {
  ndc.set((e.clientX / view.w) * 2 - 1, -(e.clientY / view.h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(model, true).find(h => h.object.visible);
  return hit ? hit.object : null;
}
window.addEventListener('pointermove', e => {
  if (drag.active && e.pointerId === drag.id) {
    const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    drag.lx = e.clientX; drag.ly = e.clientY;
    drag.vy = dx * 0.009; drag.vx = dy * 0.007;
    drag.y += drag.vy;
    drag.x = THREE.MathUtils.clamp(drag.x + drag.vx, -1.1, 1.1);
    return;
  }
  lastPointer = e;
  hoverDirty = true;
}, { passive: true });
canvas.addEventListener('pointerdown', e => {
  if (!hitModel(e) || (NX.cur && NX.cur.a < 0.2)) return;
  Object.assign(drag, { active: true, id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, vx: 0, vy: 0 });
  NX.dragging = true;
  canvas.setPointerCapture(e.pointerId);
});
const release = e => {
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  NX.dragging = false;
  const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
  if (e.type === 'pointerup' && moved < 6) {
    const obj = hitModel(e);
    if (obj && obj.userData.part === 'touchpad') cycleLight();
  }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { NX.hover = false; NX.hoverPart = null; });

/* ---------- Render loop ---------- */
const DEF = { x: 0.2, y: 0, s: 1, rx: -0.55, ry: 0.35, rz: -0.12, ex: 0, a: 1, hapL: 0, hapR: 0, bom: -1 };
const cur = (NX.cur = { ...DEF });
const tmpV = new THREE.Vector3();
const clock = new THREE.Clock();
let shown = -1;

function project(obj) {
  obj.getWorldPosition(tmpV).project(camera);
  return { x: (tmpV.x + 1) * 0.5 * view.w, y: (1 - tmpV.y) * 0.5 * view.h };
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const T = NX.target || DEF;
  const k = 1 - Math.exp(-dt * 5);
  for (const p of ['x', 'y', 's', 'rx', 'ry', 'rz', 'ex', 'a', 'hapL', 'hapR']) {
    if (T[p] !== undefined) cur[p] += (T[p] - cur[p]) * k;
  }
  cur.bom = T.bom;

  if (!drag.active) {
    drag.vx *= Math.exp(-dt * 4);
    drag.vy *= Math.exp(-dt * 4);
    drag.y += drag.vy;
    drag.x = THREE.MathUtils.clamp(drag.x + drag.vx, -1.1, 1.1);
    drag.x *= Math.exp(-dt * 0.9);
    drag.y *= Math.exp(-dt * 0.9);
  }
  NX.dragX = drag.x;
  NX.dragY = drag.y;

  const intro = NX.intro ?? 1;
  const xFactor = view.mobile ? 0.2 : 1;
  const yShift = view.mobile ? 0.14 : 0;
  root.position.set(cur.x * view.vw * xFactor, (cur.y + yShift) * view.vh, 0);
  root.scale.setScalar(view.base * cur.s * (0.72 + 0.28 * intro));

  const bob = Math.sin(time * 0.9) * 0.025;
  tilt.rotation.set(cur.rx + drag.x + bob, cur.ry + drag.y + (1 - intro) * -1.8, cur.rz + Math.sin(time * 0.6) * 0.015);

  // haptics: shake + actuator coils pulse
  const hap = Math.max(cur.hapL, cur.hapR);
  tilt.position.set((Math.random() - 0.5) * 0.05 * hap, (Math.random() - 0.5) * 0.05 * hap, 0);
  coils.forEach(({ coil, side }) => {
    const h = side < 0 ? cur.hapL : cur.hapR;
    coil.scale.setScalar(1 + h * 0.18 * Math.abs(Math.sin(time * (side < 0 ? 22 : 48))));
  });

  triggerPivots.forEach(p => { p.rotation.x = -(NX.trig || 0) * 0.38; });

  // light bar colour eases toward the selected one
  lightMats.forEach(m => { m.color.lerp(lightColor, k); m.emissive.lerp(lightColor, k); });

  // explode + highlight
  const e = cur.ex;
  for (const g of parts) {
    const u = g.userData;
    g.position.copy(u.base).addScaledVector(u.dir, e);
    let want = (cur.bom === u.bom && e > 0.25) ? 1 : 0;
    if (u.bom === 4 && hap > 0.05) want = Math.max(want, g.name === 'actL' ? cur.hapL : cur.hapR);
    u.h += (want - u.h) * (1 - Math.exp(-dt * 8));
    for (const m of matsOf(g)) {
      if (!m.emissive || lightMats.includes(m)) continue;
      if (m.userData.baseIntensity > 0) {
        m.emissiveIntensity = m.userData.baseIntensity * (1 + u.h * 0.8);
      } else {
        m.emissive.copy(BLUE);
        m.emissiveIntensity = u.h * 0.35;
      }
    }
  }

  const a = THREE.MathUtils.clamp(cur.a, 0, 1);
  if (Math.abs(a - shown) > 0.002) { canvas.style.opacity = a.toFixed(3); shown = a; }
  root.visible = a > 0.01;

  if (hoverDirty && lastPointer) {
    hoverDirty = false;
    const obj = lastPointer.target === canvas && root.visible ? hitModel(lastPointer) : null;
    NX.hover = !!obj;
    NX.hoverPart = obj ? obj.userData.part : null;
  }

  renderer.render(scene, camera);

  NX.anchors = {
    stickL: anchors.stickL ? project(anchors.stickL) : null,
    motorL: anchors.motorL ? project(anchors.motorL) : null,
    motorR: anchors.motorR ? project(anchors.motorR) : null
  };
  requestAnimationFrame(tick);
}

/* ---------- Boot ---------- */
(async () => {
  const url = window.NEXUS_MODEL_URL;
  if (url) {
    try { await loadGLB(url); }
    catch (err) { console.warn('[DualSense] model load failed, using procedural model', err); buildProcedural(); }
  } else {
    buildProcedural();
  }
  renderer.compile(scene, camera);
  renderThumbs();
  requestAnimationFrame(tick);
  signalReady();
})();
