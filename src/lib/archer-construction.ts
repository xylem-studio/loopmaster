// Simple mannequin construction for the archer illustration (home-archer.jpg,
// 1493×2000): sphere head, one "bean" torso, cylinder limbs with joint spheres
// and a gesture line, each form wrapped in one or two cross-contour loops.
// Revealed by the x-ray lens: everything starts as simple forms.

type P = [number, number];

export const ARCHER_VIEWBOX = '0 0 1493 2000';

export interface Construction {
  solid: string[]; // form outlines and the visible half of each loop
  dashed: string[]; // hidden back half of each loop
  gesture: string; // the line of action, drawn separately
}

const f = (n: number) => Math.round(n * 10) / 10;

// Half of an ellipse (centre c, semi-axes a along angle th, b across), from angle t0 over π.
function halfEllipse(c: P, a: number, b: number, th: number, t0: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = t0 + (i / 24) * Math.PI;
    const x = a * Math.cos(t), y = b * Math.sin(t);
    pts.push(`${i ? 'L' : 'M'}${f(c[0] + x * Math.cos(th) - y * Math.sin(th))} ${f(c[1] + x * Math.sin(th) + y * Math.cos(th))}`);
  }
  return pts.join('');
}

function loop(out: Construction, c: P, a: number, b: number, th: number) {
  out.solid.push(halfEllipse(c, a, b, th, 0));
  out.dashed.push(halfEllipse(c, a, b, th, Math.PI));
}

function sphere(out: Construction, c: P, r: number) {
  out.solid.push(halfEllipse(c, r, r, 0, 0), halfEllipse(c, r, r, 0, Math.PI));
}

function cylinder(out: Construction, a: P, b: P, r1: number, r2: number, loops = [0.5]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len; // across the limb
  out.solid.push(
    `M${f(a[0] + nx * r1)} ${f(a[1] + ny * r1)}L${f(b[0] + nx * r2)} ${f(b[1] + ny * r2)}`,
    `M${f(a[0] - nx * r1)} ${f(a[1] - ny * r1)}L${f(b[0] - nx * r2)} ${f(b[1] - ny * r2)}`,
  );
  const th = Math.atan2(ny, nx);
  for (const t of loops) {
    const r = r1 + (r2 - r1) * t;
    loop(out, [a[0] + dx * t, a[1] + dy * t], r, r * 0.36, th);
  }
}

// Joints, in image pixels.
const J = {
  head: [708, 486] as P,
  shoulderBow: [806, 640] as P,
  elbowBow: [1024, 628] as P,
  handBow: [1250, 592] as P,
  shoulderDraw: [596, 646] as P,
  elbowDraw: [420, 556] as P,
  handDraw: [622, 580] as P,
  hipL: [640, 1110] as P,
  kneeL: [628, 1440] as P,
  ankleL: [626, 1796] as P,
  hipR: [754, 1110] as P,
  kneeR: [900, 1446] as P,
  ankleR: [1008, 1776] as P,
};

export function archerConstruction(): Construction {
  const out: Construction = {
    solid: [],
    dashed: [],
    gesture: 'M716 380C690 640 730 880 694 1060S614 1500 626 1840',
  };

  // Head: sphere, its equator and a centre line, tipped toward the arrow.
  sphere(out, J.head, 96);
  loop(out, [J.head[0] + 4, J.head[1] + 18], 94, 28, 0.12);
  loop(out, J.head, 96, 34, 0.12 + Math.PI / 2);

  // Torso: one bean, ribcage into pelvis, with a slight twist at the waist.
  out.solid.push(
    'M598 640C640 588 772 586 818 638C852 742 812 864 790 930C846 1000 838 1112 704 1138C576 1146 548 1030 604 936C620 850 566 742 598 640Z',
  );
  loop(out, [710, 760], 112, 36, 0.04); // chest
  loop(out, [700, 935], 92, 28, -0.02); // waist
  loop(out, [698, 1062], 120, 38, -0.06); // pelvis

  // Arms
  cylinder(out, J.shoulderBow, J.elbowBow, 40, 32);
  cylinder(out, J.elbowBow, J.handBow, 32, 24);
  cylinder(out, J.shoulderDraw, J.elbowDraw, 40, 32);
  cylinder(out, J.elbowDraw, J.handDraw, 32, 24);

  // Legs
  cylinder(out, J.hipL, J.kneeL, 66, 48);
  cylinder(out, J.kneeL, J.ankleL, 46, 30);
  cylinder(out, J.hipR, J.kneeR, 66, 48);
  cylinder(out, J.kneeR, J.ankleR, 46, 30);

  // Joint spheres
  for (const [p, r] of [
    [J.shoulderBow, 34], [J.elbowBow, 26], [J.shoulderDraw, 34], [J.elbowDraw, 26],
    [J.hipL, 44], [J.hipR, 44],
    [J.kneeL, 40], [J.kneeR, 40], [J.ankleL, 26], [J.ankleR, 26],
  ] as [P, number][]) {
    sphere(out, p, r);
  }

  return out;
}
