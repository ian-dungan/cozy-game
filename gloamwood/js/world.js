// Rendering: procedural textures, zone geometry, collision helpers, low-poly models.
import * as THREE from '../vendor/three.module.min.js';

const texCache = {};
function mkTex(kind) {
  if (texCache[kind]) return texCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), d = g.createImageData(64, 64);
  let s = kind.length * 7919 + 13; const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    let v = 160 + R() * 60;
    if (kind === 'brick') { const row = y >> 3, off = (row & 1) * 8; if (y % 8 === 0 || (x + off) % 16 === 0) v *= .55; else v += ((row * 7 + ((x + off) >> 4) * 13) % 5) * 7 - 14; }
    else if (kind === 'bark') v = 130 + R() * 40 + (Math.sin(x * 1.3) + Math.sin(x * .5 + 2)) * 30;
    else if (kind === 'leaf') { v = 120 + R() * 110; if (R() < .12) v *= .5; }
    else if (kind === 'rock') v = 140 + R() * 50 + Math.sin((x + y) * .4) * 20 + Math.sin(y * .9) * 12;
    else if (R() < .05) v -= 50;
    const i = (y * 64 + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.max(0, Math.min(255, v)); d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return texCache[kind] = t;
}
const texRep = (kind, rx, ry) => { const t = mkTex(kind).clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t; };

export function buildWorld(Z, scene) {
  const { grid: g, W, H, cell: c } = Z;
  const ch = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : g[y][x];
  const indoor = a => a === ',' || (a >= 'a' && a <= 'z');
  const hf = (x, z) => Z.amp ? Z.amp * (.55 + .2 * (Math.sin(x * .05) + Math.cos(z * .043)) + .1 * Math.sin(x * .11 + z * .09)) : 0;
  const R = (() => { let s = W * 31 + H; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();

  // Ground
  const vh = new Float32Array((W + 1) * (H + 1));
  const geo = new THREE.PlaneGeometry(W * c, H * c, W, H); geo.rotateX(-Math.PI / 2); geo.translate(W * c / 2, 0, H * c / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  let water = false;
  for (let iy = 0; iy <= H; iy++) for (let ix = 0; ix <= W; ix++) {
    const i = iy * (W + 1) + ix, around = [ch(ix, iy), ch(ix - 1, iy), ch(ix, iy - 1), ch(ix - 1, iy - 1)];
    let h = hf(ix * c, iy * c), k = Z.floorCol;
    if (around.includes('~')) { h = -1.4; k = [.2, .25, .2]; water = true; }
    else if (around.includes('=')) k = Z.pathCol;
    else if (around.some(indoor)) k = [.42, .34, .26];
    vh[i] = h; pos.setY(i, h);
    const v = .88 + R() * .24; col[i * 3] = k[0] * v; col[i * 3 + 1] = k[1] * v; col[i * 3 + 2] = k[2] * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texRep('ground', W, H), vertexColors: true })));
  if (water) {
    const wp = new THREE.Mesh(new THREE.PlaneGeometry(W * c, H * c), new THREE.MeshLambertMaterial({ color: 0x2f6a86, transparent: true, opacity: .72 }));
    wp.rotation.x = -Math.PI / 2; wp.position.set(W * c / 2, -.6, H * c / 2); scene.add(wp);
  }

  // Walls, ceilings, trees, rocks
  const walls = [], ceil = [], trees = [], rocks = [], obs = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = g[y][x];
    if (a === '#') {
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (ch(x + dx, y + dy) !== '#') { edge = true; break; }
      if (edge) walls.push([x, y]);
    } else if (a === 'T') { const s = .8 + R() * .7, o = { x: x * c + c / 2 + (R() - .5) * 2, z: y * c + c / 2 + (R() - .5) * 2, r: .55 * s, s }; obs[y * W + x] = o; trees.push(o); }
    else if (a === '^') { const s = .8 + R() * 1.1, o = { x: x * c + c / 2, z: y * c + c / 2, r: 1.25 * s, s }; obs[y * W + x] = o; rocks.push(o); }
    else if (!Z.ceiling && indoor(a)) ceil.push([x, y]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), colr = new THREE.Color();
  const inst = (geom, mat, n) => { const m = new THREE.InstancedMesh(geom, mat, n); scene.add(m); return m; };
  if (walls.length) {
    const wm = inst(new THREE.BoxGeometry(c, 1, c), new THREE.MeshLambertMaterial({ map: texRep(Z.wallTex || 'brick', 2, Z.cliff ? 4 : 3), color: Z.wallCol }), walls.length);
    walls.forEach(([x, y], i) => { const h = Z.wallH * (Z.cliff ? 1 + R() * .6 : 1) + 3; m4.compose(v3.set(x * c + c / 2, h / 2 - 3, y * c + c / 2), q, sc.set(1, h, 1)); wm.setMatrixAt(i, m4); });
  }
  if (Z.ceiling) {
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(W * c, H * c), new THREE.MeshLambertMaterial({ map: texRep('rock', W, H), color: 0x4a5048 }));
    cp.rotation.x = Math.PI / 2; cp.position.set(W * c / 2, Z.wallH, H * c / 2); scene.add(cp);
  } else if (ceil.length) {
    const cm = inst(new THREE.BoxGeometry(c, .5, c), new THREE.MeshLambertMaterial({ map: mkTex('bark'), color: 0x7a5a3a }), ceil.length);
    ceil.forEach(([x, y], i) => { m4.compose(v3.set(x * c + c / 2, Z.ceilH + .25, y * c + c / 2), q, sc.set(1, 1, 1)); cm.setMatrixAt(i, m4); });
  }
  if (trees.length) {
    const tg = new THREE.CylinderGeometry(.35, .55, 7, 6); tg.translate(0, 3.5, 0);
    const lg = new THREE.IcosahedronGeometry(3.2, 0); lg.translate(0, 8.2, 0);
    const tm = inst(tg, new THREE.MeshLambertMaterial({ map: mkTex('bark'), color: 0x6a4a30 }), trees.length);
    const lm = inst(lg, new THREE.MeshLambertMaterial({ map: mkTex('leaf') }), trees.length);
    trees.forEach((o, i) => {
      m4.compose(v3.set(o.x, hf(o.x, o.z) - .3, o.z), q.setFromAxisAngle(v3.clone().set(0, 1, 0), R() * 6), sc.set(o.s, o.s * (.9 + R() * .4), o.s));
      tm.setMatrixAt(i, m4); lm.setMatrixAt(i, m4);
      lm.setColorAt(i, colr.setRGB(.16 + R() * .12, .34 + R() * .2, .12 + R() * .08));
    });
    q.identity();
  }
  if (rocks.length) {
    const rm = inst(new THREE.DodecahedronGeometry(1.5, 0), new THREE.MeshLambertMaterial({ map: mkTex('rock'), color: 0x8a8a84 }), rocks.length);
    rocks.forEach((o, i) => { m4.compose(v3.set(o.x, hf(o.x, o.z) + .5 * o.s, o.z), q, sc.set(o.s, o.s * 1.5, o.s)); rm.setMatrixAt(i, m4); });
  }
  (Z.labels || []).forEach(l => { const s = makeLabel(l.t, '#f0d890', 1.6); s.position.set(l.x * c, l.h, l.y * c); scene.add(s); });

  const solid = (cx, cy) => ch(cx, cy) === '#';
  const free = (x, z, r) => {
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((z - r) / c), y1 = Math.floor((z + r) / c);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (solid(xx, yy)) return false;
    return true;
  };
  const dist = new Int16Array(W * H);
  return {
    ch, solid, free, obs,
    cellAt: (x, z) => ch(Math.floor(x / c), Math.floor(z / c)),
    heightAt(x, z) {
      const fx = Math.max(0, Math.min(W - .001, x / c)), fz = Math.max(0, Math.min(H - .001, z / c)), ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * (W + 1) + ix;
      return (vh[i] * (1 - tx) + vh[i + 1] * tx) * (1 - tz) + (vh[i + W + 1] * (1 - tx) + vh[i + W + 2] * tx) * tz;
    },
    // Move with wall sliding and round obstacles
    slide(x, z, nx, nz, r) {
      if (!free(nx, z, r)) nx = x;
      if (!free(nx, nz, r)) nz = z;
      const cx = Math.floor(nx / c), cy = Math.floor(nz / c);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const o = obs[yy * W + xx]; if (!o) continue;
        const ddx = nx - o.x, ddz = nz - o.z, d = Math.hypot(ddx, ddz), m = o.r + r;
        if (d < m && d > 1e-4) { nx = o.x + ddx / d * m; nz = o.z + ddz / d * m; }
      }
      return free(nx, nz, r) ? [nx, nz] : [x, z];
    },
    los(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz));
      for (let i = 1; i < n; i++) if (solid(Math.floor((a.x + dx * i / n) / c), Math.floor((a.z + dz * i / n) / c))) return false;
      return true;
    },
    // Breadth-first distance field from a point, used by monsters to path around walls
    flow(x, z) {
      dist.fill(-1); const sx = Math.floor(x / c), sy = Math.floor(z / c); if (solid(sx, sy)) return dist;
      const qx = [sx], qy = [sy]; dist[sy * W + sx] = 0;
      for (let h = 0; h < qx.length; h++) {
        const cx = qx[h], cy = qy[h], d = dist[cy * W + cx] + 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = cx + dx, yy = cy + dy;
          if (!solid(xx, yy) && dist[yy * W + xx] < 0) { dist[yy * W + xx] = d; qx.push(xx); qy.push(yy); }
        }
      }
      return dist;
    },
    dist,
  };
}

const mats = {};
const M = (c, o) => mats[c + (o || '')] || (mats[c + (o || '')] = o ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c }));
const UB = new THREE.BoxGeometry(1, 1, 1);
const bx = (w, h, d, c, x, y, z, o) => { const m = new THREE.Mesh(UB, M(c, o)); m.scale.set(w, h, d); m.position.set(x, y, z); return m; };
const limb = (w, h, d, c, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.add(bx(w, h, d, c, 0, -h / 2, 0)); return g; };

// Models face +Z. userData carries animated parts and total height.
export function makeModel([kind, o = {}]) {
  const g = new THREE.Group(), u = { legs: [], arms: [], wings: [], segs: [], wig: [], kind };
  const s = o.s || 1; let hgt = 2;
  if (kind === 'human') {
    const skin = o.skin ?? 0xd9a57a, top = o.top ?? 0x6a5a3a, bot = o.bot ?? 0x3d3a36, t = o.bones ? .45 : 1;
    u.legs.push(limb(.26 * t, .85, .26 * t, bot, -.17, .85, 0), limb(.26 * t, .85, .26 * t, bot, .17, .85, 0));
    g.add(bx(.62 * (o.bones ? .7 : 1), .7, .34 * t, top, 0, 1.2, 0));
    u.arms.push(limb(.2 * t, .7, .2 * t, top, .42 * (o.bones ? .8 : 1), 1.52, 0), limb(.2 * t, .7, .2 * t, top, -.42 * (o.bones ? .8 : 1), 1.52, 0));
    if (o.frog) {
      g.add(bx(.72, .36, .56, skin, 0, 1.72, .08), bx(.15, .15, .15, 0xe8d44a, -.22, 1.95, .22), bx(.15, .15, .15, 0xe8d44a, .22, 1.95, .22));
      u.arms.forEach(a => a.children[0].material = M(skin));
    } else g.add(bx(.42, .42, .42, skin, 0, 1.78, 0));
    if (o.hat !== undefined) g.add(bx(.5, .16, .5, o.hat, 0, o.frog ? 2.0 : 2.04, o.frog ? .05 : 0));
    if (o.wep) u.arms[0].add(bx(.07, .07, 1, 0xc0c4cc, 0, -.68, .4));
    g.add(...u.legs, ...u.arms); hgt = 2.15;
  } else if (kind === 'quad') {
    const c = o.c, bw = o.w || .5, bh = o.h || .5, bl = o.l || 1.2, lh = o.lh || .45;
    g.add(bx(bw, bh, bl, c, 0, lh + bh / 2, 0), bx(bw * .75, bh * .75, bl * .4, c, 0, lh + bh * .8, bl / 2 + bl * .12));
    for (const [sx, sz] of [[1, 1], [-1, -1], [-1, 1], [1, -1]]) u.legs.push(limb(.15, lh, .15, c, sx * (bw / 2 - .08), lh, sz * (bl / 2 - .12)));
    if (o.tail) g.add(bx(.1, .1, .5, c, 0, lh + bh * .8, -bl / 2 - .2));
    if (o.antler) for (const sx of [-1, 1]) g.add(bx(.07, .8, .07, 0xe0d8c0, sx * .22, lh + bh + .6, bl / 2 + .1), bx(.5, .07, .07, 0xe0d8c0, sx * .42, lh + bh + .75, bl / 2 + .1), bx(.07, .4, .07, 0xe0d8c0, sx * .62, lh + bh + .95, bl / 2 + .1));
    g.add(...u.legs); hgt = lh + bh + (o.antler ? 1.3 : .35);
  } else if (kind === 'bug') {
    const c = o.c, n = (o.legs || 6) / 2;
    g.add(bx(.7, .36, .95, c, 0, .38, -.1), bx(.42, .26, .34, c, 0, .36, .52), bx(.08, .08, .08, 0xd04030, -.12, .46, .7), bx(.08, .08, .08, 0xd04030, .12, .46, .7));
    for (let i = 0; i < n; i++) for (const sx of [-1, 1]) { const l = bx(.6, .07, .07, 0x1a1a1a, sx * .6, .22, -.4 + i * .9 / n + .1); l.rotation.z = -sx * .45; u.wig.push(l); g.add(l); }
    hgt = .8;
  } else if (kind === 'flyer') {
    if (o.glow) { const a = bx(.5, .5, .5, o.c, 0, 1.3, 0, 'g'), b = bx(.36, .36, .36, 0xffffff, 0, 1.3, 0, 'g'); b.rotation.set(.8, .8, 0); g.add(a, b); u.spin = a; }
    else { g.add(bx(.22, .22, .55, o.c, 0, 1.2, 0)); for (const sx of [-1, 1]) { const w = limb(.04, .6, .45, o.c, sx * .1, 1.25, 0); w.rotation.z = sx * 1.2; w.userData.sx = sx; u.wings.push(w); g.add(w); } }
    u.fly = 1; hgt = 1.7;
  } else if (kind === 'snake') {
    for (let i = 0; i < 6; i++) { const m = bx(i === 5 ? .26 : .18, i === 5 ? .2 : .16, .32, o.c, 0, .12, -.8 + i * .3); u.segs.push(m); g.add(m); }
    hgt = .55;
  } else if (kind === 'blade') {
    g.add(bx(.1, 1.2, .03, 0xd8e0f0, 0, 1.5, 0), bx(.36, .07, .07, 0x8a6a2a, 0, .88, 0), bx(.07, .3, .07, 0x5a3a1a, 0, .72, 0));
    u.fly = 1; hgt = 2.3;
  }
  g.scale.setScalar(s); u.hgt = hgt * s; u.s = s; g.userData = u;
  return g;
}

export function animModel(g, t, moving, swing) {
  const u = g.userData, a = moving ? Math.sin(t * 9) * .7 : 0;
  u.legs.forEach((l, i) => l.rotation.x = (i % 2 ? -a : a));
  if (u.arms.length) { u.arms[0].rotation.x = swing > 0 ? -2.2 * swing : -a * .6; u.arms[1].rotation.x = a * .6; }
  u.wings.forEach(w => w.rotation.z = w.userData.sx * (1.2 + Math.sin(t * 22) * .6));
  u.segs.forEach((m, i) => m.position.x = Math.sin(t * 6 + i) * (moving ? .12 : .04));
  u.wig.forEach((l, i) => l.rotation.y = moving ? Math.sin(t * 16 + i * 2) * .35 : 0);
  if (u.spin) u.spin.rotation.set(t, t * 1.3, 0);
}

export function makeLabel(text, color = '#fff', size = .5) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), f = 'bold 30px Georgia, serif';
  g.font = f; c.width = Math.ceil(g.measureText(text).width) + 16; c.height = 40;
  g.font = f; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(text, 8, 21); g.fillStyle = color; g.fillText(text, 8, 21);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(c.width / 40 * size, size, 1);
  return s;
}
