# CI and releases

The workflows follow the structure of Uprising's native CI: a reusable build
workflow and a separate manually dispatched release workflow. Only **Windows
x64** and **macOS ARM64** application builds are configured.

## Commit verification

[Desktop builds](../.github/workflows/build.yml) runs on branch pushes and pull
requests. Changes consisting only of Markdown files (`**/*.md`) skip it. JSON
fixtures, source, scripts, icons, fonts and workflow edits still trigger builds.
It can also be dispatched manually. Commits are not cancelled by newer commits;
each triggered run retains its own verification result.

| Platform | Runner | Distributable |
| --- | --- | --- |
| Windows x64 | `windows-2022` | Single no-install portable EXE |
| macOS ARM64 | `macos-15` | DMG with an ARM64 app bundle |

Each job checks its native Node architecture, installs with `npm ci`, runs the
asset-free test suite, type-checks/builds and packages. The Windows job launches
the actual portable EXE. The macOS job mounts the generated DMG read-only,
checks the bundle's ARM64 binary and ad-hoc signature, then launches that app.
The smoke test checks startup, fonts, sandboxed IPC, persisted controls and
WebGL terrain without requiring or downloading a game installation.
It selects native ANGLE/Metal on macOS and SwiftShader on Windows, without
changing normal application startup. GPU diagnostics are retained on failure.

Installed-map/corpus comparisons still require `UPRISING_TEST_ROOT` locally and
report skips on CI. This is explicit: asset-free package verification does not
claim full retail compatibility or real-player GPU/display acceptance.

Successful jobs upload `runtime-windows-x64` and `runtime-macos-arm64` artifacts
for seven days. Each contains its distributable, a SHA-256 sidecar and the source
commit. Failed smoke runs retain available screenshots for seven days.
Snapshot filenames use the package version plus `-dev.g<commit>`.

## Manual release

1. Create and push a version tag at the intended commit, for example `v0.1.0`.
   The tagged source must contain the packaging scripts/configuration.
2. Open **Actions → Build release → Run workflow** on the main branch.
3. Enter that existing tag in **release_tag**, then run the workflow.

The action does not create tags or run automatically when a tag is pushed. It
resolves the tag to an immutable commit, calls the same two-platform build
workflow and waits for both package smoke checks. Release filenames/version
metadata derive from the requested tag; `0.2` is normalized to `0.2.0` and an
optional leading `v` is removed from the application version.

The publishing job verifies that the tag has not moved, that both artifacts
record the expected source commit, and that their checksums match. It then
creates the GitHub release with generated notes, or replaces assets on an
existing release for the same tag. Uploaded assets are the portable EXE, ARM64
DMG and combined `SHA256SUMS.txt`. Release runs for the same tag are serialized.

Only the publishing job receives `contents: write`; builds use read-only
permissions and never publish automatically. No personal access token or game
assets are required in repository secrets; publishing uses `GITHUB_TOKEN`.

## Local packaging

On the supported native host:

```powershell
npm ci
npm run package
```

Outputs are under ignored `releases/distribution/`. Set `PACKAGE_VERSION` to a
version tag when reproducing a release; otherwise local packages use
`package.json` and CI snapshots include their source commit. Packaging never
publishes by itself. `npm run package:folder` retains the earlier developer-only
folder bundle; it is not a release target.

Windows binaries currently have no publisher certificate. macOS bundles are
ad-hoc signed to validate the ARM64 runtime, without Developer ID signing or
Apple notarization. These workflows do not imply a trusted publisher identity;
downloaded apps may receive the OS's normal unsigned/unnotarized-app prompts.

## Verified baseline

On 2026-10-23, [run 40053785918](https://github.com/pdromnt/uprising-level-explorer/actions/runs/40053785918)
passed both jobs at commit `02fd626adf5a5e80854dc8686736156e978e6a0c`.
Windows launched the actual portable EXE using SwiftShader; macOS mounted the
DMG, verified the ARM64 bundle and launched it with native Metal. Both checked
69,700 terrain pixels without neighboring-tile contamination, along with app
startup, fonts, sandboxed IPC and preference persistence. Both distributable
artifacts and checksum sidecars were uploaded successfully.

The release workflow was checked with `actionlint`; no tag or GitHub release was
created during setup. The full installed-game corpus remains a separate local
check, as described above.
