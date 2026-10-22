"""
Prepare a source image (e.g. from temp/) for the site.

- Caps the long side (default 2000 px) and saves a high-quality progressive JPEG
  into src/assets/img/. Astro then builds the responsive webp versions.
- Shifts the image's background colour onto the site ink (#000f07) so it blends
  into the page with no visible box. Only dark tones are moved; the correction
  fades out by --falloff, so the artwork itself is untouched.

Usage (from the repo root):
    python3 tools/optimize_art.py temp/dragon-construction.jpeg about-hero.jpg
    python3 tools/optimize_art.py temp/mech.jpeg about-inspiration.jpg --cap 1600
"""

import argparse
import os

from PIL import Image

INK = (0, 15, 7)


def background(im):
    """Median colour of small patches in the four corners and edge midpoints."""
    w, h = im.size
    pts = [(x, y) for x in (12, 40, w - 40, w - 12) for y in (12, 40, h - 40, h - 12)]
    pts += [(w // 2, 12), (w // 2, h - 12), (12, h // 2), (w - 12, h // 2)]
    return [sorted(im.getpixel(p)[c] for p in pts)[len(pts) // 2] for c in range(3)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("name", help="output file name inside src/assets/img/")
    ap.add_argument("--cap", type=int, default=2000, help="max long side in px")
    ap.add_argument("--falloff", type=float, default=96, help="tone value where the background shift fades out")
    ap.add_argument("--quality", type=int, default=86)
    args = ap.parse_args()

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    dst = os.path.join(root, "src", "assets", "img", args.name)

    im = Image.open(args.src).convert("RGB")
    scale = args.cap / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)

    bg = background(im)
    luts = []
    for c in range(3):
        d = INK[c] - bg[c]
        luts += [max(0, min(255, round(v + d * max(0.0, 1 - v / args.falloff)))) for v in range(256)]
    im = im.point(luts)

    im.save(dst, quality=args.quality, optimize=True, progressive=True)
    print(f"{args.name}: {im.size[0]}x{im.size[1]}, bg {tuple(bg)} -> ink, "
          f"{os.path.getsize(args.src) // 1024} KB -> {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    main()
