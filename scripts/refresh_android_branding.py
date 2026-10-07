"""Refresh only raster icon resources in a previously verified release bundle."""
import sys, zipfile, hashlib
from io import BytesIO
from pathlib import Path
from PIL import Image

source, target, icon = map(Path, sys.argv[1:])
art = Image.open(icon).convert('RGBA')
assert art.width == art.height
changed = []
with zipfile.ZipFile(source) as before, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as after:
    for item in before.infolist():
        name = item.filename
        if name.startswith('META-INF/') and (name.endswith(('.SF', '.RSA', '.DSA', '.EC')) or name == 'META-INF/MANIFEST.MF'):
            continue
        data = before.read(name)
        raster = name.startswith('base/res/') and (Path(name).name == 'splashscreen_logo.png' or Path(name).name in {'ic_launcher.webp', 'ic_launcher_foreground.webp', 'ic_launcher_round.webp', 'ic_launcher_monochrome.webp'})
        if raster:
            old = Image.open(BytesIO(data))
            out = BytesIO()
            art.resize(old.size, Image.Resampling.LANCZOS).save(out, format=old.format)
            data = out.getvalue()
            changed.append(name)
        after.writestr(item, data)
assert len(changed) == 25, changed
with zipfile.ZipFile(source) as before, zipfile.ZipFile(target) as after:
    for name in after.namelist():
        if name not in changed:
            assert before.read(name) == after.read(name), name
print('Replaced 25 icon/splash images; all other bundle contents identical.')
for name in changed: print(name)
