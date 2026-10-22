// "Try it": draw one cross-contour loop around the middle of a cylinder,
// then overlay the true loop (front half solid, hidden half dashed) and score it.

type V3 = [number, number, number];
type P2 = [number, number];

const R = 1; // radius
const H = 1.3; // half length

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

interface Shape {
  axis: V3;
  u: V3;
  v: V3;
}

function makeShape(tiltX: number, tiltZ: number): Shape {
  // Start upright, lean the top toward the viewer (+z), then roll sideways.
  let axis: V3 = [0, Math.cos(tiltX), Math.sin(tiltX)];
  const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  axis = norm([axis[0] * cz - axis[1] * sz, axis[0] * sz + axis[1] * cz, axis[2]]);
  const u = norm(cross(axis, [0, 0, 1])); // lies in the picture plane, so silhouettes sit at θ = 0, π
  const v = cross(axis, u);
  return { axis, u, v };
}

export function mountTryLoop(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const result = root.querySelector<HTMLElement>('[data-result]')!;
  const ctx = canvas.getContext('2d')!;
  // Shape in muted grey, your stroke bright, the answer in orange: three roles, three colours.
  const colors = { bg: css('--ink-2'), shape: css('--muted'), pen: css('--line'), accent: css('--accent'), grid: 'rgb(232 239 233 / 0.05)' };

  let shape = makeShape(0.42, -0.22);
  let stroke: P2[] = [];
  let drawing = false;
  let revealed = false;
  let w = 0, h = 0, scale = 1, cx = 0, cy = 0;

  const project = (p: V3): P2 => [cx + p[0] * scale, cy - p[1] * scale];

  // Point on the rim at height t along the axis, angle θ; returns screen point + facing.
  function rim(t: number, th: number): { p: P2; front: boolean } {
    const { axis, u, v } = shape;
    const c = Math.cos(th), s = Math.sin(th);
    const n: V3 = [c * u[0] + s * v[0], c * u[1] + s * v[1], c * u[2] + s * v[2]];
    const p: V3 = [axis[0] * t + R * n[0], axis[1] * t + R * n[1], axis[2] * t + R * n[2]];
    return { p: project(p), front: n[2] > 0 };
  }

  function ring(t: number, opts: { color: string; width: number; hiddenDash?: number[]; forceSolid?: boolean }) {
    const N = 120;
    for (const wantFront of [true, false]) {
      ctx.beginPath();
      let open = false;
      for (let i = 0; i <= N; i++) {
        const { p, front } = rim(t, (i / N) * Math.PI * 2);
        const on = opts.forceSolid || front === wantFront;
        if (on) {
          open ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
          open = true;
        } else open = false;
      }
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = opts.width;
      ctx.globalAlpha = wantFront || opts.forceSolid ? 1 : 0.55;
      ctx.setLineDash(wantFront || opts.forceSolid ? [] : opts.hiddenDash ?? [6, 6]);
      ctx.stroke();
      if (opts.forceSolid) break;
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  function line(a: P2, b: P2) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  function render() {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    // Faint drafting grid.
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (w / 2) % 32; x < w; x += 32) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = (h / 2) % 32; y < h; y += 32) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Cylinder: near cap fully visible, far cap half hidden, two silhouette lines.
    ring(H, { color: colors.shape, width: 2, forceSolid: true });
    ring(-H, { color: colors.shape, width: 2, hiddenDash: [5, 7] });
    ctx.strokeStyle = colors.shape;
    ctx.lineWidth = 2;
    for (const th of [0, Math.PI]) line(rim(-H, th).p, rim(H, th).p);

    // Ticks marking the middle on both silhouettes.
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    for (const th of [0, Math.PI]) {
      const { p } = rim(0, th);
      const dir = th === 0 ? 1 : -1;
      const ux = shape.u[0] * dir, uy = -shape.u[1] * dir;
      line([p[0] + ux * 6, p[1] + uy * 6], [p[0] + ux * 18, p[1] + uy * 18]);
    }

    if (revealed) ring(0, { color: colors.accent, width: 3.5, hiddenDash: [7, 7] });

    if (stroke.length > 1) {
      ctx.strokeStyle = colors.pen;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = revealed ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(stroke[0][0], stroke[0][1]);
      for (const p of stroke) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const oldScale = scale, oldCx = cx, oldCy = cy;
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * devicePixelRatio);
    canvas.height = Math.round(h * devicePixelRatio);
    scale = Math.min(w, h) / (2 * (H + R) + 0.6);
    cx = w / 2;
    cy = h / 2;
    // Keep an existing stroke attached to the shape.
    if (stroke.length && oldScale) {
      stroke = stroke.map(([x, y]) => [cx + ((x - oldCx) / oldScale) * scale, cy + ((y - oldCy) / oldScale) * scale]);
    }
    render();
  }

  function score() {
    const truth: { p: P2; front: boolean }[] = [];
    for (let i = 0; i < 360; i++) truth.push(rim(0, (i / 360) * Math.PI * 2));
    const rpx = R * scale;

    // Mean distance from each drawn point to the true loop.
    let sum = 0;
    for (const s of stroke) {
      let best = Infinity;
      for (const { p } of truth) best = Math.min(best, (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2);
      sum += Math.sqrt(best);
    }
    const dev = sum / stroke.length / rpx;

    // How much of each half of the true loop the stroke actually covered.
    const tol = (0.14 * rpx) ** 2;
    let frontHit = 0, frontN = 0, backHit = 0, backN = 0;
    for (const { p, front } of truth) {
      const hit = stroke.some((s) => (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2 < tol);
      if (front) { frontN++; if (hit) frontHit++; } else { backN++; if (hit) backHit++; }
    }
    const front = frontHit / frontN;
    const back = backHit / backN;
    const total = Math.round(100 * ((front + back) / 2) * Math.max(0, 1 - dev / 0.35));
    return { dev, front, back, total };
  }

  function reveal() {
    revealed = true;
    render();
    if (stroke.length < 8) {
      result.innerHTML = `Here's the true loop. The <strong>dashed half</strong> is the side you can't see — draw it anyway.`;
      return;
    }
    const s = score();
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    let note: string;
    if (s.back < 0.35) note = 'Now carry the line around the hidden back half — that\'s the unseen part.';
    else if (s.dev > 0.18) note = 'Watch the curve: the loop should be parallel to the end caps, not to the page.';
    else if (s.total >= 80) note = 'That loop hugs the form. Try another angle.';
    else note = 'Close. Keep the loop the same shape as the end ellipses.';
    result.innerHTML =
      `<span class="score">${s.total}</span><span>/100</span>` +
      `<span class="stats label">Off by ${pct(s.dev)} of the radius · front ${pct(s.front)} · hidden ${pct(s.back)}</span>` +
      `<span class="note">${note}</span>`;
  }

  function reset(newShape = false) {
    if (newShape) shape = makeShape(0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.9);
    stroke = [];
    revealed = false;
    result.textContent = 'Draw one loop around the middle of the cylinder, between the orange ticks.';
    render();
  }

  const pt = (e: PointerEvent): P2 => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (revealed) reset();
    drawing = true;
    stroke = [pt(e)];
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const batch = e.getCoalescedEvents?.() ?? [];
    for (const ce of batch.length ? batch : [e]) stroke.push(pt(ce));
    render();
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (stroke.length > 8) reveal();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  root.querySelector('[data-action=clear]')?.addEventListener('click', () => reset());
  root.querySelector('[data-action=new]')?.addEventListener('click', () => reset(true));
  root.querySelector('[data-action=reveal]')?.addEventListener('click', reveal);

  resize(); // size synchronously so a stroke can't be scored before the first observer tick
  new ResizeObserver(resize).observe(canvas);
  reset();
}
