#!/usr/bin/env python3
"""Build icons/icon.svg (hanko 愛 on washi) with the kanji as a path, so the
icon does not depend on installed fonts. PNGs are rendered from it with
Playwright by tools/render-icons.mjs.

Usage: python3 tools/build-icons.py <path-to>/ShipporiMincho_700Bold.ttf
"""
import sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = pathlib.Path(__file__).resolve().parent.parent
font = TTFont(sys.argv[1])
gs = font.getGlyphSet()
name = font.getBestCmap()[ord('愛')]
bp = BoundsPen(gs); gs[name].draw(bp)
x0, y0, x1, y1 = bp.bounds
pen = SVGPathPen(gs); gs[name].draw(pen)
path = pen.getCommands()

def svg(size_frac, washi=True, maskable=False):
    # Seal circle radius as a fraction of the 512 canvas; glyph fits inside.
    r = 256 * size_frac
    gw, gh = x1 - x0, y1 - y0
    target = r * 1.15
    s = target / max(gw, gh)
    cx = 256 - (x0 + gw / 2) * s
    cy = 256 + (y0 + gh / 2) * s
    bg = '<rect width="512" height="512" fill="#F6F1E7"/>' if washi else ''
    if maskable: bg = '<rect width="512" height="512" fill="#F6F1E7"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{bg}'
            f'<circle cx="256" cy="256" r="{r:.1f}" fill="#C8412B"/>'
            f'<circle cx="256" cy="256" r="{r * .86:.1f}" fill="none" stroke="#FFFDF8" stroke-width="{r * .035:.1f}" opacity=".85"/>'
            f'<path transform="translate({cx:.2f} {cy:.2f}) scale({s:.5f} {-s:.5f})" fill="#FFFDF8" d="{path}"/></svg>\n')

(ROOT / 'icons' / 'icon.svg').write_text(svg(.88), encoding='utf-8')
(ROOT / 'icons' / 'maskable.svg').write_text(svg(.62, maskable=True), encoding='utf-8')
print('ok')
