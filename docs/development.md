# Development

## Setup

Use Node.js 24 or newer and npm. CI validates Windows x64 and macOS ARM64
packages; the full installed-game corpus was checked on Windows. The rendering
stack uses Electron and WebGL2. Linux and Intel Mac packaging are unsupported.
No game executable or native compiler is needed to run the viewer.

```powershell
npm ci
npm run dev
```

`dev` builds once, then launches Electron. After edits, close the viewer and run
it again; this command does not start a hot-reload server. `npm start` launches
the last build without rebuilding. If dependency scripts were blocked during
installation, `node node_modules/electron/install.js` installs the runtime.

Select an existing game installation containing `GRIDS` and `uprising.cln`.
Game files are read in place. Keep installations outside this repository.

## Code layout

| Location | Responsibility |
| --- | --- |
| `src/core/` | Binary/text decoders, catalog selection and scene data derivation |
| `src/main/` | Game asset resolution, image decoding, settings and Electron IPC |
| `src/shared/` | Serialized level data and IPC types |
| `src/renderer/` | Three.js scene, UI, cameras, picking and text readers |
| `public/` | Explicitly bundled fonts and application icons |
| `tests/` | Decoder/corpus tests and browser-injected GPU probes |
| `scripts/` | Application build and isolated desktop smoke test |
| `tools/` | Optional native-source research/export tools |
| `docs/evidence/` | Versioned structural reports and validation checkpoints |

The core data layer does not depend on Electron. Pose and rendering math lives
with the Three.js scene where needed. `src/main/main.ts` exposes only bootstrap,
folder selection and level loading. The sandboxed renderer receives decoded
data and has no direct Node.js/filesystem access.

`viewer.json` in Electron's application-data directory stores the selected game
folder and last mission. Renderer local storage keeps font, faction-color and
fog preferences. These files stay outside the selected game installation.

## Validation

```powershell
npm test
npm run build
```

Without an installation, corpus-dependent tests report skips. To run the full
installed corpus and desktop checks:

```powershell
$env:UPRISING_TEST_ROOT = 'C:\Games\Uprising'
npm test
npm run build
npm run test:desktop
```

The committed fixture corpus describes 30 missions from the audited decompiled
installation. A different asset set can disagree with those fixtures; report
that separately from parser failures. Retail compatibility is not yet verified.
The desktop suite creates its own user-data profile, exercises the real IPC/UI,
checks GPU rendering and persistence, and removes the profile on exit. It leaves
screenshots in ignored `artifacts/`. Optional same-camera native comparison runs
only when the locally captured view/projection files are present there.

To check the packaged build on Windows:

```powershell
npm run package
$env:UPRISING_TEST_EXE = (Get-ChildItem 'releases/distribution/*-portable.exe').FullName
npm run test:package
# For the full installed-game suite, use the already extracted application:
$env:UPRISING_TEST_EXE = (Resolve-Path 'releases/distribution/win-unpacked/Uprising Level Explorer.exe').Path
npm run test:desktop
Remove-Item Env:UPRISING_TEST_EXE
```

## Packaging and generated files

`npm run package` runs type checking, builds the main/preload/renderer bundles
and writes the native distribution to `releases/distribution/`: Windows x64
portable EXE or macOS ARM64 DMG, plus a SHA-256 sidecar. Close the packaged app
before replacing it. Keep one current release directory; use the development build
for small iterations instead of copying Electron repeatedly.

`dist/`, `electron/`, `releases/`, `node_modules/` and `artifacts/` are generated
and ignored. `public/`, source code, `package-lock.json` and intentional evidence
reports belong in version control. The package includes the built app, icons
and fonts; source, research tools, evidence and local artifacts are excluded.

The PNG supplies the window/favicon, ICO the Windows executable resource, and
ICNS the macOS app/DMG icon; see [icon provenance](evidence/app-icon.md).
`npm run package:folder` retains the older folder-only developer packaging path.
[CI and releases](ci-and-releases.md) documents architecture checks, artifact
retention, tag resolution and actual distributable smoke tests.

## Optional native research

Research tooling needs a separate decompiled source checkout, Python 3 and GCC
with LTO on `PATH`. It compiles bounded native probes in temporary directories;
the application itself does not link or launch that checkout. Pillow is needed
only by the icon conversion helper.

See [evidence reproduction](evidence/README.md) for commands and source revisions.
Keep source changes, native runtime captures and viewer changes separate. A
source hash or parser fixture is not proof of complete rendered parity.
