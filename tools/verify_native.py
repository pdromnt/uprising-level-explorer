"""Compile a temporary parser harness; compare the corpus report to native C.

Models are decoded to temporary files only, removed with the temporary build.
No game executable is built or started. Construction callbacks are inert.
"""
import argparse
import json
import io
import struct
from pathlib import Path
import subprocess
import tempfile

from audit_assets import Assets, require


def bounded_candidate(data, format):
    """Preflight lengths before native allocation; format probing is audit only."""
    stream = io.BytesIO(data)

    def take(n):
        if n < 0 or n > len(data) - stream.tell():
            raise ValueError("bounds")
        return stream.read(n)

    def u32():
        return struct.unpack("<I", take(4))[0]

    def counted(size):
        n = u32()
        take(n * size)
        return n

    def mesh():
        materials, vertices, triangles = struct.unpack("<HII", take(10))
        if materials >= 32768:
            materials = 0
        for _ in range(materials):
            raw = stream.readline(255)
            if not raw:
                raise ValueError("material")
        take(vertices * 12 + triangles * 32 + 20)

    try:
        for _ in range({0:1, 1:1, 2:3, 3:8}[format]):
            mesh()
        take(16)
        counted(28)
        if format == 1:
            planes = u32()
            if planes > len(data) // 16:
                return False
            for _ in range(planes):
                vertices = u32()
                take(12 + vertices * 24)
        if format == 2:
            take(8 + 36)
        if format == 3:
            take(16 + 72 + 8)
        if format != 3:
            counted(12)
        if format == 1:
            counted(12)
        parts = counted(12)
        for _ in range(parts):
            mesh()
        return stream.tell() == len(data)
    except (ValueError, struct.error):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game_root", type=Path)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--compiler", default="gcc")
    args = parser.parse_args()
    root = args.game_root.resolve()
    corpus = json.loads(args.corpus.read_text(encoding="utf-8"))
    current_commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    require(current_commit == corpus["source_commit"], "regenerate corpus for this checkout commit")
    assets = Assets(root)
    sources = ["resource_file", "host_file", "resource_archive", "resource_payload",
               "level_manifest", "terrain_asset", "level_player_slots", "level_citadels",
               "level_objects", "level_movement_paths", "level_teleporters", "asset_mesh"]
    report = dict(source_commit=corpus["source_commit"],
                  compiler=subprocess.check_output([args.compiler, "--version"], text=True).splitlines()[0],
                  scope="native parsing with inert construction callbacks; no gameplay/rendering validation",
                  maps=[], models=[], mismatches=[])
    with tempfile.TemporaryDirectory(prefix="uprising-parser-audit-") as temp:
        executable = Path(temp) / "probe.exe"
        command = [args.compiler, "-std=c11", "-O2", "-flto", "-ffunction-sections", "-fdata-sections",
                   "-I", str(root / "source/core"), str(Path(__file__).with_name("native_probe.c"))]
        command += [str(root / "source/core" / (name + ".c")) for name in sources]
        command += ["-Wl,--gc-sections", "-lm", "-o", str(executable)]
        build = subprocess.run(command, capture_output=True, text=True)
        require(build.returncode == 0, build.stderr)
        report["compile_flags"] = ["-std=c11", "-O2", "-flto", "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections", "-lm"]
        for level in corpus["levels"]:
            run = subprocess.run([str(executable), "map", str(root / "GRIDS" / level["name"])],
                                 capture_output=True, text=True)
            row = dict(name=level["name"], exit_code=run.returncode)
            if run.returncode == 0:
                row.update(json.loads(run.stdout))
                expected = {"width":level["width"], "height":level["height"], "tiles":level["tile_count"],
                    "slots":len(level["slots"]), "citadels":len(level["citadels"]), "objects":len(level["objects"]),
                    "routes":len(level["routes"]), "teleporters":len(level["teleporters"]),
                    "end":level["size"]-level["trailing_bytes"], "height_min":level["decoded_height_range"][0],
                    "height_max":level["decoded_height_range"][1]}
                for key, value in expected.items():
                    if row[key] != value:
                        report["mismatches"].append(dict(file=level["name"], key=key, expected=value, native=row[key]))
            else:
                report["mismatches"].append(dict(file=level["name"], exit_code=run.returncode, stderr=run.stderr))
            report["maps"].append(row)
        for name in sorted(assets.index):
            if not name.endswith(".bdm"):
                continue
            source, data = assets.resolve(name)
            path = Path(temp) / "model.bdm"
            path.write_bytes(data)
            candidates = []
            for format in range(4):
                if not bounded_candidate(data, format):
                    continue
                run = subprocess.run([str(executable), "bdm", str(format), str(path)], capture_output=True, text=True, timeout=10)
                if run.returncode == 0:
                    result = json.loads(run.stdout)
                    if result["consumed"] == result["size"]:
                        candidates.append(result)
            report["models"].append(dict(name=name, source=source, exact_parse_candidates=candidates))
    report["summary"] = dict(native_maps_passed=sum(m["exit_code"] == 0 for m in report["maps"]),
        mismatches=len(report["mismatches"]), models_examined=len(report["models"]),
        models_with_exact_candidate=sum(bool(m["exact_parse_candidates"]) for m in report["models"]),
        ambiguous_models=[m["name"] for m in report["models"] if len(m["exact_parse_candidates"]) > 1],
        models_without_exact_candidate=[m["name"] for m in report["models"] if not m["exact_parse_candidates"]])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    require(not report["mismatches"], "native corpus mismatch")


if __name__ == "__main__":
    main()
