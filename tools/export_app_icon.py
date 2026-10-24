"""Convert the extracted rblbmps/rabfly.bmp into the bundled app icons.

Requires Pillow. Pass the original BMP extracted through GameLibrary.read().
The PNG preserves all 128x128 source pixels; the ICO includes Windows sizes.
"""
from pathlib import Path
import argparse
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("bitmap", type=Path)
args = parser.parse_args()
image = Image.open(args.bitmap).convert("RGBA")
if image.size != (128, 128):
    raise ValueError("Expected the original 128x128 rabfly texture")
output = Path(__file__).resolve().parents[1] / "public"
image.save(output / "app-icon.png")
image.resize((256, 256), Image.Resampling.NEAREST).save(
    output / "app-icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
)
image.resize((1024, 1024), Image.Resampling.NEAREST).save(output / "app-icon.icns")
