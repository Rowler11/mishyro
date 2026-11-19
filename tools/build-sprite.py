#!/usr/bin/env python3
"""Build icons/sprite.svg with ONLY the icons the app uses.

Usage: python3 tools/build-sprite.py <path-to>/lucide-static/icons

Lucide icons (ISC license) are found by scanning js/ for icon('name'),
icon: 'name', iconName: 'name' and the ICONS list of the style guide.
Custom Japanese icons (jp-*) are original drawings defined below.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LUCIDE = pathlib.Path(sys.argv[1])

# Original Japanese icon set: 24x24, stroke 1.5, round caps (drawn for Aishiteru).
JP = {
  'jp-sakura': '<path d="M12 12c-1.6-1.9-2.4-4-1.6-5.8.5-1.1 1.6-1.7 1.6-1.7s1.1.6 1.6 1.7c.8 1.8 0 3.9-1.6 5.8Z"/><path d="M12 12c2.4-.6 4.6-.3 5.9 1.1.8.9.9 2.2.9 2.2s-1.2.5-2.4.3c-1.9-.4-3.4-1.9-4.4-3.6Z"/><path d="M12 12c-2.4-.6-4.6-.3-5.9 1.1-.8.9-.9 2.2-.9 2.2s1.2.5 2.4.3c1.9-.4 3.4-1.9 4.4-3.6Z"/><path d="M12 12c.9 2.3.8 4.6-.5 6-.8.9-2.1 1.2-2.1 1.2s-.6-1.2-.4-2.4c.3-1.9 1.6-3.6 3-4.8Z"/><path d="M12 12c-.9 2.3-.8 4.6.5 6 .8.9 2.1 1.2 2.1 1.2s.6-1.2.4-2.4c-.3-1.9-1.6-3.6-3-4.8Z"/><circle cx="12" cy="12" r=".8"/>',
  'jp-torii': '<path d="M3 5.5c3 .8 6 1.1 9 1.1s6-.3 9-1.1"/><path d="M4.5 9h15"/><path d="M6.5 6.6V21M17.5 6.6V21"/><path d="M12 6.6V9"/><path d="M5 21h3M16 21h3"/>',
  'jp-chochin': '<path d="M12 2v2"/><path d="M9 4h6"/><path d="M8 20h8"/><path d="M12 20v2"/><ellipse cx="12" cy="12" rx="6" ry="8"/><path d="M6.4 9h11.2M6 12h12M6.4 15h11.2"/>',
  'jp-sensu': '<path d="M12 20 3.5 9.5a11 11 0 0 1 17 0Z"/><path d="M12 20 7.6 6.3M12 20V5.5M12 20l4.4-13.7"/><circle cx="12" cy="20" r=".9"/>',
  'jp-tsuru': '<path d="M2.5 14.5 9 12l3-7 3 7 6.5-4-4 8H9.5Z"/><path d="M9 12l3 4 3-4"/><path d="M17.5 16l2 3.5"/><path d="M2.5 14.5l-.5-2 2 .5"/>',
  'jp-omamori': '<path d="M7 7.5 12 4l5 3.5V20H7Z"/><path d="M9.5 3.2c1 .8 1.5 1.5 2.5 1.5s1.5-.7 2.5-1.5"/><path d="M9.5 12h5M9.5 15h5"/><circle cx="12" cy="9" r=".9"/>',
  'jp-moon': '<path d="M16 3.5a8.5 8.5 0 1 0 4.5 12.8A7 7 0 0 1 16 3.5Z"/><path d="M19 4.5v2M18 5.5h2"/>',
  'jp-wave': '<path d="M2 18a5 5 0 0 1 10 0 5 5 0 0 1 10 0"/><path d="M4.5 18a2.5 2.5 0 0 1 5 0M14.5 18a2.5 2.5 0 0 1 5 0"/><path d="M7 13a5 5 0 0 1 10 0"/><path d="M9.5 13a2.5 2.5 0 0 1 5 0"/>',
  'jp-futo': '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 7.5 12 11l7-3.5"/><circle cx="12" cy="11.5" r="2"/>',
  'jp-ticket': '<path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4Z"/><path d="M15 5v14" stroke-dasharray="1.5 2"/><path d="M8 10h4M8 14h3"/>',
}

def used_names():
    names = set()
    pats = [r"icon\(\s*'([a-z0-9-]+)'", r"(?:icon|iconName)\s*:\s*'([a-z0-9-]+)'", r"\bart\s*:\s*'(jp-[a-z-]+)'"]
    for f in (ROOT / 'js').rglob('*.js'):
        src = f.read_text(encoding='utf-8')
        for p in pats:
            names.update(re.findall(p, src))
        m = re.search(r"export const ICONS = \[(.*?)\];", src, re.S)
        if m: names.update(re.findall(r"'([a-z0-9-]+)'", m.group(1)))
    # Icons referenced through the ART maps in ui.js / placeholder art keys.
    names.update(JP.keys())
    return sorted(names)

def lucide_symbol(name):
    svg = (LUCIDE / f'{name}.svg').read_text(encoding='utf-8')
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    inner = re.sub(r'<!--.*?-->', '', inner, flags=re.S)
    inner = re.sub(r'\s+', ' ', inner).strip()
    return f'<symbol id="{name}" viewBox="0 0 24 24">{inner}</symbol>'

def main():
    out, missing = [], []
    for n in used_names():
        if n in JP:
            out.append(f'<symbol id="{n}" viewBox="0 0 24 24" stroke-width="1.5">{JP[n]}</symbol>')
        elif (LUCIDE / f'{n}.svg').exists():
            out.append(lucide_symbol(n))
        else:
            missing.append(n)
    if missing:
        sys.exit(f'Missing icons: {", ".join(missing)}')
    sprite = ('<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" '
              'stroke-linecap="round" stroke-linejoin="round">\n'
              '<!-- Lucide icons (ISC License, https://lucide.dev) + original Japanese icons (jp-*) -->\n'
              + '\n'.join(out) + '\n</svg>\n')
    (ROOT / 'icons' / 'sprite.svg').write_text(sprite, encoding='utf-8')
    print(f'{len(out)} icons')

main()
