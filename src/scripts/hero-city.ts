import {
  BoxGeometry, BufferAttribute, BufferGeometry, Float32BufferAttribute, Fog, GreaterDepth, GridHelper, Group,
  LessEqualDepth, LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh, MeshBasicMaterial, OrthographicCamera,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector4, Vector3, WebGLRenderTarget, WebGLRenderer,
} from 'three';
import { generateCity, generateLoops, type CityBox, type CityLoop } from './city';

const INK = 0x000f07;
const LINE = 0xe8efe9;
const ACCENT = 0xff9933;
const SPIN = 0.06; // rad / s

// 8 corners -> 12 edges, as a flat LineSegments position array.
function boxEdges(b: CityBox, out: number[]) {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const y0 = b.y, y1 = b.y + b.h;
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const e = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  for (const k of e) out.push(...c[k]);
}

// A loop is the box's cross-section at height y, nudged out so it sits on the faces.
function loopEdges(b: CityBox, y: number, out: number[]) {
  const e = 0.004;
  const x0 = b.x - b.w / 2 - e, x1 = b.x + b.w / 2 + e;
  const z0 = b.z - b.d / 2 - e, z1 = b.z + b.d / 2 + e;
  out.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
}

function boxSolid(b: CityBox) {
  const g = new BoxGeometry(b.w, b.h, b.d);
  g.translate(b.x, b.y + b.h / 2, b.z);
  return g;
}

export function mountHeroCity(
  canvas: HTMLCanvasElement,
  opts: { reducedMotion: boolean; zone?: HTMLElement | null },
) {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null; // no WebGL: the CSS fallback stays visible
  }
  renderer.setClearColor(INK, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  const fog = new Fog(INK, 18, 36);
  scene.fog = fog;

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const target = new Vector3(0, 1.1, 0);

  const tilt = new Group(); // follows the cursor
  const spin = new Group(); // continuous rotation
  tilt.add(spin);
  scene.add(tilt);

  const boxes = generateCity();

  // 1. Invisible solids fill the depth buffer. Pushed back slightly so edges
  //    lying on their faces still pass the visible-line depth test.
  const solids = boxes.map(boxSolid);
  const merged = mergeBoxes(solids);
  solids.forEach((g) => g.dispose());
  const occluder = new Mesh(
    merged,
    new MeshBasicMaterial({
      colorWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  occluder.renderOrder = 0;
  spin.add(occluder);

  // 2. Edges, drawn twice from the same geometry.
  const pos: number[] = [];
  boxes.forEach((b) => boxEdges(b, pos));
  const edges = new BufferGeometry();
  edges.setAttribute('position', new Float32BufferAttribute(pos, 3));

  // Hidden pass: only where the edge is *behind* a surface (depth test reversed).
  const hidden = new LineSegments(
    edges,
    new LineDashedMaterial({
      color: LINE,
      dashSize: 0.07,
      gapSize: 0.07,
      transparent: true,
      opacity: 0.38,
      depthFunc: GreaterDepth,
      depthWrite: false,
    }),
  );
  hidden.computeLineDistances();
  hidden.renderOrder = 1;

  // Visible pass: normal depth test.
  const visible = new LineSegments(
    edges,
    new LineBasicMaterial({ color: LINE, depthFunc: LessEqualDepth }),
  );
  visible.renderOrder = 2;
  spin.add(hidden, visible);

  // 3. Orange cross-contour loops, with the same visible / hidden split.
  const loopPos: number[] = [];
  generateLoops(boxes).forEach((l: CityLoop) => loopEdges(boxes[l.box], l.y, loopPos));
  const loops = new BufferGeometry();
  loops.setAttribute('position', new Float32BufferAttribute(loopPos, 3));
  const loopsHidden = new LineSegments(
    loops,
    new LineDashedMaterial({
      color: ACCENT,
      dashSize: 0.06,
      gapSize: 0.06,
      transparent: true,
      opacity: 0.6,
      depthFunc: GreaterDepth,
      depthWrite: false,
    }),
  );
  loopsHidden.computeLineDistances();
  loopsHidden.renderOrder = 1;
  const loopsVisible = new LineSegments(loops, new LineBasicMaterial({ color: ACCENT, depthFunc: LessEqualDepth }));
  loopsVisible.renderOrder = 3;
  spin.add(loopsHidden, loopsVisible);

  // Faint ground grid, occluded by buildings like everything else.
  const grid = new GridHelper(17, 17, LINE, LINE);
  const gridMat = grid.material as LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.08;
  grid.position.y = -0.002;
  grid.renderOrder = 2;
  spin.add(grid);

  // 4. The "unseen zone": behind the headline every line switches to the faint
  //    dashed hidden-line style, so the text sits on calm ground without a black box.
  const zoneEdges = new LineDashedMaterial({
    color: LINE,
    dashSize: 0.07,
    gapSize: 0.09,
    transparent: true,
    opacity: 0.22,
    depthFunc: LessEqualDepth,
  });
  const zoneLoops = new LineDashedMaterial({
    color: ACCENT,
    dashSize: 0.06,
    gapSize: 0.08,
    transparent: true,
    opacity: 0.4,
    depthFunc: LessEqualDepth,
  });
  // The hidden-line version is rendered off-screen, then blended over the normal
  // render through a soft, slowly breathing mask around the text block.
  const zoneTarget = new WebGLRenderTarget(1, 1, { samples: 4 });
  const zoneMask = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tZone: { value: zoneTarget.texture },
      rect: { value: new Vector4() }, // centre x, y, half w, half h — device px, origin bottom-left
      feather: { value: new Vector2(0.75, 1.45) }, // fade from 75% to 145% of the half size
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tZone;
      uniform vec4 rect;
      uniform vec2 feather;
      uniform float time;
      varying vec2 vUv;
      void main() {
        vec2 d = gl_FragCoord.xy - rect.xy;
        vec2 q = abs(d) / rect.zw;
        float r = pow(pow(q.x, 3.0) + pow(q.y, 3.0), 1.0 / 3.0); // rounded "squircle" distance
        float a = atan(d.y, d.x);
        // A few slow, low-frequency ripples keep the edge from reading as a shape.
        float wobble = 0.07 * sin(a * 3.0 + time * 0.35) + 0.04 * sin(a * 5.0 - time * 0.22 + 1.7);
        float m = 1.0 - smoothstep(feather.x + wobble, feather.y + wobble, r);
        gl_FragColor = vec4(texture2D(tZone, vUv).rgb, m);
        #include <colorspace_fragment>
      }
    `,
  });
  const maskScene = new Scene();
  maskScene.add(new Mesh(new PlaneGeometry(2, 2), zoneMask));
  const maskCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let hasZone = false;

  function measureZone() {
    if (!opts.zone) return;
    const c = canvas.getBoundingClientRect();
    const r = opts.zone.getBoundingClientRect();
    const pr = renderer.getPixelRatio();
    zoneMask.uniforms.rect.value.set(
      (r.left - c.left + r.width / 2) * pr,
      (c.bottom - r.bottom + r.height / 2) * pr,
      (r.width / 2) * pr,
      (r.height / 2) * pr,
    );
    hasZone = r.width > 0;
  }

  function draw(now = 0) {
    if (hasZone) {
      const edgeMat = visible.material, loopMat = loopsVisible.material;
      visible.material = zoneEdges;
      loopsVisible.material = zoneLoops;
      hidden.visible = loopsHidden.visible = false;
      renderer.setRenderTarget(zoneTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      visible.material = edgeMat;
      loopsVisible.material = loopMat;
      hidden.visible = loopsHidden.visible = true;
    }

    renderer.render(scene, camera);

    if (hasZone) {
      zoneMask.uniforms.time.value = now / 1000;
      renderer.autoClear = false;
      renderer.render(maskScene, maskCamera);
      renderer.autoClear = true;
    }
  }

  // Sizing --------------------------------------------------------------
  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    zoneTarget.setSize(Math.round(w * pr), Math.round(h * pr));
    const aspect = w / h;
    camera.aspect = aspect;
    // Big, close city. Pull back on narrow screens.
    const dist = 15.5 / Math.min(1, Math.pow(aspect, 0.75));
    camera.position.set(0, dist * 0.42, dist);
    camera.lookAt(target);
    fog.near = dist - 2;
    fog.far = dist + 22;
    // Nudge the busy centre away from the text: right on wide screens, up on narrow ones.
    if (aspect > 1.1) camera.setViewOffset(w, h, -w * 0.12, 0, w, h);
    else camera.setViewOffset(w, h, 0, h * 0.12, w, h);
    // Narrow screens: the text block nearly fills the width, so keep its whole area calm.
    zoneMask.uniforms.feather.value.set(aspect > 1.1 ? 0.75 : 1.0, aspect > 1.1 ? 1.45 : 1.5);
    camera.updateProjectionMatrix();
    measureZone();
  }

  // Motion --------------------------------------------------------------
  const pointer = { x: 0, y: 0 };
  let running = false;
  let visibleOnScreen = true;
  let raf = 0;
  let last = performance.now();

  spin.rotation.y = -0.6; // pleasant starting angle (also the reduced-motion still)

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    spin.rotation.y += SPIN * dt;
    const k = 1 - Math.exp(-dt * 3);
    tilt.rotation.x += (pointer.y * 0.08 - tilt.rotation.x) * k;
    tilt.rotation.y += (pointer.x * 0.14 - tilt.rotation.y) * k;
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || opts.reducedMotion || !visibleOnScreen || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const ro = new ResizeObserver(() => {
    resize();
    if (!running) draw();
  });
  ro.observe(canvas);
  if (opts.zone) ro.observe(opts.zone); // re-measure when the web font swaps in
  resize();
  draw();

  if (opts.reducedMotion) return { stop };

  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const io = new IntersectionObserver(([entry]) => {
    visibleOnScreen = entry.isIntersecting;
    visibleOnScreen ? start() : stop();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();

  return { stop };
}

function mergeBoxes(geoms: BufferGeometry[]) {
  // Tiny local merge so we don't pull in BufferGeometryUtils.
  let vCount = 0;
  let iCount = 0;
  for (const g of geoms) {
    vCount += g.attributes.position.count;
    iCount += g.index!.count;
  }
  const positions = new Float32Array(vCount * 3);
  const index = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    positions.set(g.attributes.position.array as Float32Array, vo * 3);
    const src = g.index!.array;
    for (let i = 0; i < src.length; i++) index[io + i] = src[i] + vo;
    vo += g.attributes.position.count;
    io += src.length;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(positions, 3));
  out.setIndex(new BufferAttribute(index, 1));
  return out;
}
