// Build-time SVG drawings of simple forms with cross-contour loops.
// Orthographic view along -z; a point is "front" when its surface normal faces +z.
// Every line is split into visible (solid) and hidden (dashed) runs.

type V3 = [number, number, number];
interface Sample { p: V3; front: boolean }

export interface FormDrawing {
  shape: string[]; // visible outline/edges
  shapeHidden: string[]; // hidden edges
  loops: { vis: string[]; hid: string[] }[];
}

const VIEW = 200;
const C = VIEW / 2;

function rotation(ax: number, ay: number) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
  // Rotate about Y, then about X (tilts the top toward the viewer for ax > 0).
  return (v: V3): V3 => {
    const x = v[0] * cy + v[2] * sy;
    const z0 = -v[0] * sy + v[2] * cy;
    return [x, v[1] * cx - z0 * sx, v[1] * sx + z0 * cx];
  };
}

const fmt = (n: number) => Math.round(n * 10) / 10;

function toPaths(samples: { xy: [number, number]; front: boolean }[], scale: number) {
  const vis: string[] = [];
  const hid: string[] = [];
  let run: [number, number][] = [];
  let runFront: boolean | null = null;
  const flush = () => {
    if (run.length > 1) {
      const d = run.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(C + x * scale)} ${fmt(C - y * scale)}`).join('');
      (runFront ? vis : hid).push(d);
    }
  };
  for (const s of samples) {
    if (runFront !== null && s.front !== runFront) {
      // Share the boundary point so solid and dashed runs meet.
      const last = run[run.length - 1];
      flush();
      run = [last];
    }
    runFront = s.front;
    run.push(s.xy);
  }
  flush();
  return { vis, hid };
}

function drawer(ax: number, ay: number, scale: number) {
  const R = rotation(ax, ay);
  const facing = (n: V3) => R(n)[2] > 1e-6;
  const project = (p: V3): [number, number] => {
    const r = R(p);
    return [r[0], r[1]];
  };
  const curve = (samples: Sample[]) => toPaths(samples.map((s) => ({ xy: project(s.p), front: s.front })), scale);
  return { R, facing, curve };
}

const ring = (n: number) => Array.from({ length: n + 1 }, (_, i) => (i / n) * Math.PI * 2);

export function cube(): FormDrawing {
  const { facing, curve } = drawer(0.45, 0.62, 44);
  const faceFront = (axis: number, sign: number) => {
    const n: V3 = [0, 0, 0];
    n[axis] = sign;
    return facing(n);
  };
  const shape: string[] = [];
  const shapeHidden: string[] = [];
  // 12 edges: along axis k, the other two coordinates at ±1.
  for (let k = 0; k < 3; k++) {
    const [i, j] = [0, 1, 2].filter((a) => a !== k);
    for (const si of [-1, 1]) {
      for (const sj of [-1, 1]) {
        const a: V3 = [0, 0, 0], b: V3 = [0, 0, 0];
        a[i] = b[i] = si;
        a[j] = b[j] = sj;
        a[k] = -1;
        b[k] = 1;
        const front = faceFront(i, si) || faceFront(j, sj);
        const { vis, hid } = curve([{ p: a, front }, { p: b, front }]);
        shape.push(...vis);
        shapeHidden.push(...hid);
      }
    }
  }
  // Loops are the cube's sections: around the sides at three heights, and one vertical.
  const square = (fixed: number, at: number, around: [number, number]) => {
    const [u, v] = around;
    const corners: [number, number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
    const vis: string[] = [], hid: string[] = [];
    for (let c = 0; c < 4; c++) {
      const [u0, v0] = corners[c], [u1, v1] = corners[c + 1];
      const p0: V3 = [0, 0, 0], p1: V3 = [0, 0, 0];
      p0[fixed] = p1[fixed] = at;
      p0[u] = u0; p0[v] = v0; p1[u] = u1; p1[v] = v1;
      // Which face does this side lie on?
      const onU = u0 === u1;
      const front = onU ? faceFront(u, u0) : faceFront(v, v0);
      const r = curve([{ p: p0, front }, { p: p1, front }]);
      vis.push(...r.vis);
      hid.push(...r.hid);
    }
    return { vis, hid };
  };
  const loops = [square(1, 0.5, [0, 2]), square(1, 0, [0, 2]), square(1, -0.5, [0, 2]), square(0, 0, [1, 2])];
  return { shape, shapeHidden, loops };
}

export function sphere(): FormDrawing {
  const r = 1.3;
  const { R, curve } = drawer(0.5, 0.3, 58);
  const at = (p: V3): Sample => ({ p, front: R(p)[2] > 0 });
  const outline = Array.from({ length: 97 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return `${i ? 'L' : 'M'}${fmt(C + Math.cos(a) * r * 58)} ${fmt(C + Math.sin(a) * r * 58)}`;
  }).join('');
  const lat = (phi: number) =>
    curve(ring(120).map((t) => at([r * Math.cos(phi) * Math.cos(t), r * Math.sin(phi), r * Math.cos(phi) * Math.sin(t)])));
  const lon = (beta: number) =>
    curve(ring(120).map((t) => at([r * Math.cos(t) * Math.cos(beta), r * Math.sin(t), r * Math.cos(t) * Math.sin(beta)])));
  return {
    shape: [outline],
    shapeHidden: [],
    loops: [lat(0.9), lat(0.45), lat(0), lat(-0.45), lat(-0.9), lon(0.4), lon(0.4 + Math.PI / 2)],
  };
}

// Cylinder pieces, reusable for instruction diagrams: the form, any loop, and the
// "wrong" flat chord across it (a straight line that ignores the curvature).
export function cylinderKit(tilt = 0.42, roll = 0.25, scale = 52) {
  const H = 1.25;
  const { R, facing, curve } = drawer(tilt, roll, scale);
  const rim = (y: number, capNormal: V3) =>
    curve(ring(120).map((t) => {
      const n: V3 = [Math.cos(t), 0, Math.sin(t)];
      return { p: [n[0], y, n[2]], front: facing(n) || facing(capNormal) };
    }));
  const top = rim(H, [0, 1, 0]);
  const bottom = rim(-H, [0, -1, 0]);
  // Silhouette where the side normal is perpendicular to the view: A cos t + B sin t = 0.
  const A = R([1, 0, 0])[2], B = R([0, 0, 1])[2];
  const t0 = Math.atan2(-A, B);
  const edge = (t: number, y: number): V3 => [Math.cos(t), y, Math.sin(t)];
  const sil = [t0, t0 + Math.PI].flatMap((t) =>
    curve([{ p: edge(t, -H), front: true }, { p: edge(t, H), front: true }]).vis,
  );
  const loop = (y: number) =>
    curve(ring(120).map((t) => {
      const n: V3 = [Math.cos(t), 0, Math.sin(t)];
      return { p: [n[0], y, n[2]], front: facing(n) };
    }));
  const chord = (y: number) => curve([{ p: edge(t0, y), front: true }, { p: edge(t0 + Math.PI, y), front: true }]).vis[0];
  return {
    shape: [...top.vis, ...top.hid, ...bottom.vis, ...sil],
    shapeHidden: bottom.hid,
    loop,
    chord,
  };
}

export function cylinder(): FormDrawing {
  const k = cylinderKit();
  return { shape: k.shape, shapeHidden: k.shapeHidden, loops: [0.75, 0.25, -0.25, -0.75].map(k.loop) };
}

export function cone(): FormDrawing {
  const apex = 1.25, base = -1.05, Rb = 1.15;
  const h = apex - base;
  const { R, facing, curve } = drawer(0.38, 0.2, 54);
  const sideNormal = (t: number): V3 => [h * Math.cos(t), Rb, h * Math.sin(t)];
  const rim = curve(ring(120).map((t) => ({
    p: [Rb * Math.cos(t), base, Rb * Math.sin(t)],
    front: facing(sideNormal(t)) || facing([0, -1, 0]),
  })));
  // Silhouette generators: solve h(A cos t + B sin t) + Rb·Cy = 0.
  const A = R([1, 0, 0])[2], B = R([0, 0, 1])[2], Cy = R([0, 1, 0])[2];
  const amp = h * Math.hypot(A, B);
  const sil: string[] = [];
  if (Math.abs(Rb * Cy) < amp) {
    const phi = Math.atan2(B, A);
    const d = Math.acos((-Rb * Cy) / amp);
    for (const t of [phi + d, phi - d]) {
      sil.push(...curve([{ p: [0, apex, 0], front: true }, { p: [Rb * Math.cos(t), base, Rb * Math.sin(t)], front: true }]).vis);
    }
  }
  const loop = (y: number) => {
    const r = (Rb * (apex - y)) / h;
    return curve(ring(120).map((t) => ({ p: [r * Math.cos(t), y, r * Math.sin(t)], front: facing(sideNormal(t)) })));
  };
  return {
    shape: [...rim.vis, ...sil],
    shapeHidden: rim.hid,
    loops: [loop(0.55), loop(0.05), loop(-0.45)],
  };
}

export const VIEWBOX = `0 0 ${VIEW} ${VIEW}`;
