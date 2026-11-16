// Zone collision and terrain, shared by the browser and the game server (no rendering here).
export function makeGrid(Z) {
  const { grid: g, W, H, cell: c } = Z;
  const ch = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : g[y][x];
  const hf = (x, z) => Z.amp ? Z.amp * (.55 + .2 * (Math.sin(x * .05) + Math.cos(z * .043)) + .1 * Math.sin(x * .11 + z * .09)) : 0;
  let s = W * 31 + H; const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const vh = new Float32Array((W + 1) * (H + 1)); let water = false;
  for (let iy = 0; iy <= H; iy++) for (let ix = 0; ix <= W; ix++) {
    const wet = ch(ix, iy) === '~' || ch(ix - 1, iy) === '~' || ch(ix, iy - 1) === '~' || ch(ix - 1, iy - 1) === '~';
    vh[iy * (W + 1) + ix] = wet ? -1.4 : hf(ix * c, iy * c); if (wet) water = true;
  }
  const obs = new Array(W * H), trees = [], rocks = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = g[y][x];
    if (a === 'T') { const k = .8 + R() * .7, o = { x: x * c + c / 2 + (R() - .5) * 2, z: y * c + c / 2 + (R() - .5) * 2, r: .55 * k, s: k, rot: R() * 6, sy: .9 + R() * .4 }; obs[y * W + x] = o; trees.push(o); }
    else if (a === '^') { const k = .8 + R() * 1.1, o = { x: x * c + c / 2, z: y * c + c / 2, r: 1.25 * k, s: k }; obs[y * W + x] = o; rocks.push(o); }
  }
  const solid = (cx, cy) => ch(cx, cy) === '#';
  const free = (x, z, r) => {
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((z - r) / c), y1 = Math.floor((z + r) / c);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (solid(xx, yy)) return false;
    return true;
  };
  return {
    Z, W, H, c, ch, hf, vh, water, obs, trees, rocks, solid, free,
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
    flow(x, z, dist) {
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
  };
}
