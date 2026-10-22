// Seeded wireframe city. tools/blender/city_loop.py mirrors this generator
// call-for-call, so keep the two in sync if you change anything here.

export interface CityBox {
  x: number; // centre on the ground plane
  z: number;
  y: number; // base height
  w: number; // size along x
  d: number; // size along z
  h: number; // height
}

export interface CityLoop {
  box: number; // index into the boxes array
  y: number; // height of the loop
}

export const CITY = {
  seed: 1729,
  grid: 11,
  cell: 1,
};

export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCity({ seed, grid, cell } = CITY): CityBox[] {
  const rand = mulberry32(seed);
  const half = (grid - 1) / 2;
  const maxDist = Math.sqrt(half * half * 2);
  const boxes: CityBox[] = [];

  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      // Always draw the same number of values per cell so the layout is stable.
      const rEmpty = rand();
      const rw = rand();
      const rd = rand();
      const rh = rand();
      const rTop = rand();
      const rTopSize = rand();

      if (rEmpty < 0.14) continue;

      const x = (i - half) * cell;
      const z = (j - half) * cell;
      const di = i - half;
      const dj = j - half;
      const dist = Math.sqrt(di * di + dj * dj) / maxDist;
      const w = cell * (0.48 + rw * 0.32);
      const d = cell * (0.48 + rd * 0.32);
      const h = 0.3 + rh * rh * 3.4 * (1 - 0.6 * dist);
      boxes.push({ x, z, y: 0, w, d, h });

      // Some taller blocks get a set-back tower on top.
      if (rTop < 0.3 && h > 1.2) {
        const s = 0.5 + rTopSize * 0.25;
        boxes.push({ x, z, y: h, w: w * s, d: d * s, h: h * (0.25 + rTopSize * 0.35) });
      }
    }
  }
  return boxes;
}

// Cross-contour loops wrapped around some buildings. Uses its own stream
// (seed + 1) so adding or tuning loops never moves a building.
export function generateLoops(boxes: CityBox[], seed = CITY.seed): CityLoop[] {
  const rand = mulberry32(seed + 1);
  const loops: CityLoop[] = [];
  boxes.forEach((b, i) => {
    const rPick = rand();
    if (b.h < 0.6 || rPick > 0.6) return;
    const n = Math.max(2, Math.floor(b.h / 0.22 + 0.5));
    for (let k = 1; k < n; k++) loops.push({ box: i, y: b.y + (b.h * k) / n });
  });
  return loops;
}
