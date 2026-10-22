"""
Loop Master – seeded wireframe city, rendered with Freestyle.

Builds the same city as the live Three.js hero (src/scripts/city.ts: same
mulberry32 PRNG, same seed, same call order) and renders a seamless rotation
loop: visible edges as solid lines, hidden edges as faint dashed lines, plus
orange cross-contour loops around some buildings (also visible / hidden).

Usage (Blender 4.x, from the repo root):

    blender -b -P tools/blender/city_loop.py -- [options]

Options:
    --framing hero|center   hero: city pushed right like the home page (default)
                            center: centred square-ish framing for hover loops
    --size 1920x1080        output resolution
    --frames 240            frames for one full 360° turn (seamless)
    --fps 24
    --still                 render only frame 1 (poster / reduced-motion fallback)
    --out render/hero/      output directory (relative to the repo root)
    --seed 1729             override the seed (keep in sync with city.ts!)
    --save city.blend       also save the generated .blend

Outputs a PNG sequence (city_0001.png …). Encode it for the web with e.g.:

    ffmpeg -framerate 24 -i render/hero/city_%04d.png -c:v libvpx-vp9 -b:v 0 -crf 36 \
           -pix_fmt yuv420p -an public/media/city-loop.webm
    ffmpeg -i render/hero/city_0001.png -q:v 82 public/media/city-still.webp

Don't run this as part of the site build; it's a manual asset step.
"""

import argparse
import math
import os
import sys

import bpy

# --- Keep in sync with src/scripts/city.ts ----------------------------------

SEED = 1729
GRID = 11
CELL = 1.0

M32 = 0xFFFFFFFF


def _imul(a, b):
    return (a * b) & M32


def mulberry32(seed):
    a = seed & M32

    def rand():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = _imul(a ^ (a >> 15), a | 1)
        t = ((t + _imul(t ^ (t >> 7), t | 61)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rand


def generate_city(seed=SEED, grid=GRID, cell=CELL):
    """Returns boxes as dicts in Three.js coordinates (y up)."""
    rand = mulberry32(seed)
    half = (grid - 1) / 2
    max_dist = math.sqrt(half * half * 2)
    boxes = []
    for i in range(grid):
        for j in range(grid):
            r_empty = rand()
            rw = rand()
            rd = rand()
            rh = rand()
            r_top = rand()
            r_top_size = rand()

            if r_empty < 0.14:
                continue

            x = (i - half) * cell
            z = (j - half) * cell
            di = i - half
            dj = j - half
            dist = math.sqrt(di * di + dj * dj) / max_dist
            w = cell * (0.48 + rw * 0.32)
            d = cell * (0.48 + rd * 0.32)
            h = 0.3 + rh * rh * 3.4 * (1 - 0.6 * dist)
            boxes.append(dict(x=x, z=z, y=0.0, w=w, d=d, h=h))

            if r_top < 0.3 and h > 1.2:
                s = 0.5 + r_top_size * 0.25
                boxes.append(dict(x=x, z=z, y=h, w=w * s, d=d * s, h=h * (0.25 + r_top_size * 0.35)))
    return boxes


def generate_loops(boxes, seed=SEED):
    """Cross-contour loops: (box index, height). Own stream (seed + 1), like city.ts."""
    rand = mulberry32(seed + 1)
    loops = []
    for i, b in enumerate(boxes):
        r_pick = rand()
        if b["h"] < 0.6 or r_pick > 0.6:
            continue
        n = max(2, math.floor(b["h"] / 0.22 + 0.5))
        for k in range(1, n):
            loops.append((i, b["y"] + b["h"] * k / n))
    return loops


# Hero camera, matching src/scripts/hero-city.ts
FOV_Y_DEG = 30
CAM_DIST = 21
CAM_HEIGHT = 0.42  # × dist
TARGET_Y = 1.1
START_ROT = -0.6  # radians, same starting angle as the web hero

INK = (0.0, 15 / 255, 7 / 255)
LINE = (232 / 255, 239 / 255, 233 / 255)
ACCENT = (1.0, 0x99 / 255, 0x33 / 255)

# ----------------------------------------------------------------------------


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--framing", choices=["hero", "center"], default="hero")
    p.add_argument("--size", default="1920x1080")
    p.add_argument("--frames", type=int, default=240)
    p.add_argument("--fps", type=int, default=24)
    p.add_argument("--still", action="store_true")
    p.add_argument("--out", default="render/hero/")
    p.add_argument("--seed", type=int, default=SEED)
    p.add_argument("--save", default="")
    return p.parse_args(argv)


def three_to_blender(x, y, z):
    # Three.js is y-up, Blender is z-up.
    return (x, -z, y)


def srgb_to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def make_collection(scene, name):
    coll = bpy.data.collections.new(name)
    scene.collection.children.link(coll)
    return coll


def flat_material(name, rgb):
    """Emission in the background colour: solids are invisible but still occlude."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*srgb_to_linear(rgb), 1)
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def build_city(coll, boxes, mat):
    verts, faces = [], []
    for b in boxes:
        x0, x1 = b["x"] - b["w"] / 2, b["x"] + b["w"] / 2
        z0, z1 = b["z"] - b["d"] / 2, b["z"] + b["d"] / 2
        y0, y1 = b["y"], b["y"] + b["h"]
        base = len(verts)
        for (x, y, z) in [
            (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
            (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1),
        ]:
            verts.append(three_to_blender(x, y, z))
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            faces.append(tuple(base + k for k in f))

    mesh = bpy.data.meshes.new("City")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new("City", mesh)
    coll.objects.link(obj)
    return obj


def build_loops(coll, boxes, loops, mat):
    """Freestyle ignores loose edges, so each loop is a hair-thin band around the
    building; only its bottom ring is edge-marked and drawn."""
    e, band = 0.004, 0.002
    verts, faces, marked = [], [], []
    for (i, y) in loops:
        b = boxes[i]
        x0, x1 = b["x"] - b["w"] / 2 - e, b["x"] + b["w"] / 2 + e
        z0, z1 = b["z"] - b["d"] / 2 - e, b["z"] + b["d"] / 2 + e
        base = len(verts)
        ring = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
        for (x, z) in ring:
            verts.append(three_to_blender(x, y, z))
        for (x, z) in ring:
            verts.append(three_to_blender(x, y + band, z))
        for k in range(4):
            a, c = base + k, base + (k + 1) % 4
            faces.append((a, c, c + 4, a + 4))
            marked.append((a, c))

    mesh = bpy.data.meshes.new("Loops")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    marked = {tuple(sorted(m)) for m in marked}
    for edge in mesh.edges:
        edge.use_freestyle_mark = tuple(sorted(edge.vertices)) in marked
    obj = bpy.data.objects.new("Loops", mesh)
    coll.objects.link(obj)
    return obj


def build_ground(coll, mat, size=17, divisions=17):
    """Ground grid; every edge is Freestyle-marked so it draws like GridHelper."""
    mesh = bpy.data.meshes.new("Ground")
    step = size / divisions
    half = size / 2
    verts = [(-half + i * step, -half + j * step, -0.002) for j in range(divisions + 1) for i in range(divisions + 1)]
    faces = []
    n = divisions + 1
    for j in range(divisions):
        for i in range(divisions):
            a = j * n + i
            faces.append((a, a + 1, a + n + 1, a + n))
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    for e in mesh.edges:
        e.use_freestyle_mark = True
    obj = bpy.data.objects.new("Ground", mesh)
    coll.objects.link(obj)
    return obj


def setup_camera(scene, args, width, height):
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(FOV_Y_DEG)
    cam = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    aspect = width / height
    dist = CAM_DIST / min(1.0, aspect ** 0.9)
    cam.location = three_to_blender(0, dist * CAM_HEIGHT, dist)

    target = bpy.data.objects.new("CamTarget", None)
    target.location = three_to_blender(0, TARGET_Y, 0)
    scene.collection.objects.link(target)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    if args.framing == "hero":
        # Same as camera.setViewOffset in hero-city.ts. Blender's shift is in
        # units of the larger image side.
        if aspect > 1.1:
            cam_data.shift_x = -0.24
            cam_data.shift_y = -0.04 * (height / width)
        else:
            cam_data.shift_y = -0.2
    return cam


def setup_world(scene):
    world = bpy.data.worlds.new("Ink")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*srgb_to_linear(INK), 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world


def setup_render(scene, args, width, height):
    r = scene.render
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            r.engine = engine
            break
        except TypeError:
            continue
    r.resolution_x = width
    r.resolution_y = height
    r.resolution_percentage = 100
    r.fps = args.fps
    r.film_transparent = False
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    r.use_freestyle = True
    r.line_thickness_mode = "ABSOLUTE"
    r.line_thickness = max(1.0, height / 720)


def add_lineset(view_layer, name, coll, visibility, alpha, dashed=False, edge_mark=False, thickness=1.0, color=LINE):
    fs = view_layer.freestyle_settings
    ls = fs.linesets.new(name)
    ls.select_by_visibility = True
    ls.visibility = visibility
    ls.select_by_collection = True
    ls.collection = coll
    ls.select_by_edge_types = True
    ls.select_silhouette = not edge_mark
    ls.select_border = not edge_mark
    ls.select_crease = not edge_mark
    ls.select_edge_mark = edge_mark

    style = ls.linestyle
    style.color = color
    style.alpha = alpha
    style.thickness = thickness
    style.caps = "ROUND"
    style.use_dashed_line = dashed
    if dashed:
        style.dash1 = 5
        style.gap1 = 5
    return ls


def setup_freestyle(scene, city_coll, ground_coll, loops_coll):
    vl = scene.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.mode = "EDITOR"
    fs.crease_angle = math.radians(134)
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)

    # Hidden first so visible lines sit on top.
    add_lineset(vl, "Hidden", city_coll, "HIDDEN", alpha=0.38, dashed=True)
    add_lineset(vl, "Visible", city_coll, "VISIBLE", alpha=1.0)
    add_lineset(vl, "Ground", ground_coll, "VISIBLE", alpha=0.08, edge_mark=True)
    add_lineset(vl, "LoopsHidden", loops_coll, "HIDDEN", alpha=0.45, dashed=True, edge_mark=True, color=ACCENT)
    add_lineset(vl, "LoopsVisible", loops_coll, "VISIBLE", alpha=1.0, edge_mark=True, color=ACCENT)


def animate_spin(scene, pivot, frames):
    """One full turn over `frames`; frame frames+1 == frame 1, so the loop is seamless."""
    scene.frame_start = 1
    scene.frame_end = frames
    pivot.rotation_euler = (0, 0, START_ROT)
    pivot.keyframe_insert("rotation_euler", index=2, frame=1)
    pivot.rotation_euler = (0, 0, START_ROT + 2 * math.pi)
    pivot.keyframe_insert("rotation_euler", index=2, frame=frames + 1)


def main():
    args = parse_args()
    width, height = (int(v) for v in args.size.lower().split("x"))

    # LINEAR before any keyframe is created, so the turn has constant speed and loops cleanly.
    scene = reset_scene()
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"

    setup_world(scene)
    setup_render(scene, args, width, height)

    city_coll = make_collection(scene, "City")
    ground_coll = make_collection(scene, "Ground")
    loops_coll = make_collection(scene, "Loops")
    mat = flat_material("Ink", INK)

    pivot = bpy.data.objects.new("Spin", None)
    scene.collection.objects.link(pivot)

    boxes = generate_city(seed=args.seed)
    city = build_city(city_coll, boxes, mat)
    ground = build_ground(ground_coll, mat)
    loops = build_loops(loops_coll, boxes, generate_loops(boxes, seed=args.seed), mat)
    for obj in (city, ground, loops):
        obj.parent = pivot

    setup_camera(scene, args, width, height)
    setup_freestyle(scene, city_coll, ground_coll, loops_coll)
    animate_spin(scene, pivot, args.frames)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    out_dir = os.path.join(repo_root, args.out)
    os.makedirs(out_dir, exist_ok=True)
    scene.render.filepath = os.path.join(out_dir, "city_")

    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(repo_root, args.save))

    print(f"[city_loop] {len(boxes)} boxes, seed {args.seed}, {width}x{height}, framing={args.framing}")
    if args.still:
        scene.frame_set(1)
        scene.render.filepath = os.path.join(out_dir, "city_0001.png")
        bpy.ops.render.render(write_still=True)
    else:
        bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
