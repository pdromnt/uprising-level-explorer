# Application icon

The application uses the original 128x128 `rblbmps/rabfly.bmp` texture referenced
by `models/rab1.bdm` (format 1), the top landing-pad panel of kind `0x62`.
It was extracted read-only through the viewer's existing `GameLibrary` asset
reader. The BMP's embedded palette reproduces the orange marking and dark panel.

Original BMP SHA-256:
`219ef3b23cf38c5da5472195ede30c13ca07fcb81d9a8beaedf056fae1f02385`.

`public/app-icon.png` preserves every original pixel without cropping or
repainting. `public/app-icon.ico` contains 16, 24, 32, 48, 64, 128 and 256 pixel
versions; the 256-pixel source uses nearest-neighbor enlargement.
The ICNS contains macOS sizes derived from a nearest-neighbor 1024-pixel source.
Recreate all three formats with Pillow using
`python tools/export_app_icon.py <extracted-rabfly.bmp>`.

Vite copies the icons into `dist/`. BrowserWindow and the page favicon use the PNG;
Packaging embeds the ICO into the Windows executable's icon resources and uses
the ICNS for the macOS app bundle.

Validation: all seven embedded EXE icon images match the ICO byte-for-byte. The
running packaged window's actual 32x32 Win32 icon was extracted and visually
checked against the texture (`artifacts/icon-source/live-window-icon.png`).
The production build and packaged desktop suite passed after the icon change.
