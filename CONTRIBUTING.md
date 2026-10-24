# Contributing

This project is a read-only level explorer. Preserve that boundary: opening a
map, inspecting scripts and changing preview settings must not modify game
files or execute mission scripts.

See [development](docs/development.md) for setup and commands. Small changes
should include the relevant build/test result; format or rendering changes
should also identify the asset, mission and evidence used to verify them.
Distinguish installed-corpus checks, native math comparisons, desktop checks
and manual visual comparisons in reports.

Keep raw records and provenance available when adding interpreted names or
derived scene objects. Use native source or asset evidence for type, faction,
placement and material rules. Mark approximations explicitly. Missing assets
should produce diagnostics and usable fallbacks rather than hide source data.

Use the existing sandboxed IPC boundary for filesystem work. Validate asset
paths, binary lengths and counts before reading or allocating. Avoid passing
arbitrary filesystem or process capabilities into the renderer.

Commit source, the lockfile and intentional text/JSON evidence. Keep local game
installations, archives, extracted levels/models, captures, user profiles and
portable builds out of Git. The fonts and icons under `public/` are the explicit
bundled exceptions; preserve their [provenance and notices](THIRD_PARTY_NOTICES.md).
Do not add machine-specific paths or local handoff notes to shared docs.

Changes to native-derived constants or fixtures should record their source
revision and file hashes. Do not silently regenerate historical evidence from a
different checkout. Prefer adding a dated checkpoint and linking it from the
documentation index when the verification scope changes.
