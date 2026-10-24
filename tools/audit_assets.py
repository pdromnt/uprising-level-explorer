"""Read-only corpus audit; research tooling, not a viewer implementation.

Only the JSON report is written. Game files are never extracted or modified.
Script references are lexical observations, not evaluated mission behavior.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import subprocess


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def line(stream):
    while raw := stream.readline():
        text = raw.decode("cp1252").strip()
        if text and not text.startswith("#"):
            return text
    raise ValueError(f"unexpected EOF at {stream.tell()}")


class Assets:
    def __init__(self, root):
        self.root = root
        asset_dirs = {"grids", "models", "models2", "bitmaps", "impbmps", "rblbmps", "tiles1", "fonts"}
        self.loose = {p.relative_to(root).as_posix().lower(): p
                      for directory in root.iterdir() if directory.is_dir() and directory.name.lower() in asset_dirs
                      for p in directory.rglob("*") if p.is_file()}
        self.archive = (root / "uprising.cln").read_bytes()
        stream = io.BytesIO(self.archive)

        def word():
            return struct.unpack("<I", stream.read(4))[0]

        self.records = []
        self.index = {}
        for _ in range(word()):
            name = stream.read(word()).rstrip(b"\0").decode("cp1252")
            unpacked, packed, offset = word(), word(), word()
            record = dict(name=name, unpacked_size=unpacked,
                          packed_size=packed, header_offset=offset)
            self.records.append(record)
            if name and unpacked and offset:
                self.index[name.replace("\\", "/").lower()] = record
        self.index_end = stream.tell()

    def resolve(self, name):
        key = name.replace("\\", "/").lower()
        path = self.loose.get(key, self.root / key)
        if path.is_file():
            return "loose", path.read_bytes()
        record = self.index.get(key)
        if not record:
            return "missing", None
        start = record["header_offset"] + 12
        size = record["packed_size"] or record["unpacked_size"]
        require(start + size <= len(self.archive), f"archive bounds: {name}")
        data = self.archive[start:start + size]
        if record["packed_size"]:
            require(len(data) % 2 == 0, f"odd RLE size: {name}")
            require(sum(data[::2]) == record["unpacked_size"], f"RLE length: {name}")
            data = b"".join(bytes([v]) * n for n, v in zip(data[::2], data[1::2]))
        require(len(data) == record["unpacked_size"], f"decoded length: {name}")
        return "archive", data


def fields(data):
    result = collections.defaultdict(list)
    for raw in data.decode("cp1252").splitlines():
        if raw.lstrip().startswith("#"):
            continue
        match = re.match(r"([A-Z0-9_]+):\s*(.*)", raw)
        if match:
            result[match[1]].append(match[2].strip())
    return dict(result)


def parse_level(path):
    data = path.read_bytes()
    stream = io.BytesIO(data)
    slick = line(stream)
    require(slick.startswith("SLICK "), "SLK magic")
    terrain_offset = int(line(stream).split()[1])
    slots_offset = int(line(stream).split()[1])
    preamble = data[stream.tell():terrain_offset].decode("cp1252")
    stream.seek(terrain_offset)
    width, height, tile_count = map(int, line(stream).split())
    require(0 < width <= 256 and 0 < height <= 256, "terrain dimensions")
    tiles = [line(stream) for _ in range(tile_count)]
    binary_start = stream.tell()
    binary_size = width * height * 3 + (width + 1) * (height + 1) * 2
    require(binary_start + binary_size <= len(data), "terrain payload bounds")
    cells = width * height
    tile_ids = struct.unpack_from(f"<{cells}H", data, binary_start)
    require(all((v & 0x3fff) < tile_count for v in tile_ids), "masked tile range")
    flags = data[binary_start + cells * 2:binary_start + cells * 3]
    height_start = binary_start + cells * 3
    heights = [struct.unpack_from("<h", data, height_start + (y * (width + 1) + x) * 2)[0]
               for y in range(height) for x in range(width)]
    stream.seek(slots_offset)
    section_offsets = {}

    def section(name):
        before = stream.tell()
        words = line(stream).split()
        require(words[0] == name, f"expected {name}, got {words}")
        section_offsets[name] = before
        return int(words[1])

    slots = [list(map(float, line(stream).split())) for _ in range(section("slots"))]
    require(all(len(s) == 3 for s in slots), "slot fields")
    citadels = []
    for _ in range(section("num_citadels")):
        words = line(stream).split()
        require(words[0] == "citadel" and len(words) == 5, "citadel fields")
        owner, footprints, upgrades, health = map(int, words[1:])
        rects = [list(map(int, line(stream).split())) for _ in range(footprints)]
        require(line(stream) == "claim 1", "claim count")
        claim = list(map(int, line(stream).split()))
        base = line(stream)
        require(base.startswith("base "), "citadel base")
        require(line(stream) == f"upgrades {upgrades}", "upgrade count")
        upgrade_rows = [line(stream) for _ in range(upgrades)]
        citadels.append(dict(owner=owner, health=health, footprints=rects,
                             claim=claim, base=base, upgrades=upgrade_rows))
    objects = []
    for _ in range(section("objects")):
        offset = stream.tell()
        words = line(stream).split()
        require(len(words) == 12, "object field count")
        objects.append(dict(offset=offset, kind=int(words[0]), owner=int(words[1]),
                            position_x_z_y=list(map(float, words[2:5])),
                            heading=float(words[5]), name=words[6], attribute=words[7],
                            parent=words[8], flags=int(words[9]), group=int(words[10]),
                            variant=int(words[11])))
    names = {o["name"] for o in objects}
    require(all(o["parent"] == "NULL" or o["parent"] in names for o in objects), "parent name")
    routes = []
    for _ in range(section("movement_paths")):
        name, count, route_flags = line(stream).split()
        points = [list(map(float, line(stream).split())) for _ in range(int(count))]
        require(all(len(p) == 3 for p in points), "route fields")
        routes.append(dict(name=name, flags=int(route_flags), points_x_z_y=points))
    teleporters = []
    for _ in range(section("teleporters")):
        words = line(stream).split()
        require(len(words) == 8, "teleporter fields")
        teleporters.append(dict(name=words[0], values=list(map(float, words[1:]))))
    end = stream.tell()
    return dict(name=path.name, sha256=sha(data), size=len(data), slick=slick,
                terrain_offset=terrain_offset, slots_offset=slots_offset,
                preamble=preamble, width=width, height=height, tile_count=tile_count,
                tile_names=tiles, binary_offset=binary_start, binary_size=binary_size,
                binary_end=binary_start + binary_size,
                bytes_between_payload_and_slots=slots_offset - binary_start - binary_size,
                tile_id_histogram=dict(sorted(collections.Counter(tile_ids).items())),
                tile_orientation_histogram=dict(sorted(collections.Counter(v >> 14 for v in tile_ids).items())),
                raw_flag_histogram=dict(sorted(collections.Counter(flags).items())),
                raw_height_range=[min(heights), max(heights)],
                decoded_height_range=[int(v * struct.unpack("<f", struct.pack("<I", 0x3f03126f))[0])
                                      for v in (min(heights), max(heights))],
                section_offsets=section_offsets, slots=slots, citadels=citadels,
                objects=objects, routes=routes, teleporters=teleporters,
                trailing_bytes=len(data) - end, trailing_sha256=sha(data[end:]),
                trailing_nonzero_bytes=sum(v != 0 for v in data[end:]),
                trailing_preview=data[end:end+80].decode("cp1252"))


def script_inventory(data):
    text = data.decode("cp1252")
    locations, commands = [], collections.Counter()
    for number, raw in enumerate(text.splitlines(), 1):
        if raw.lstrip().startswith("#"):
            continue
        for match in re.finditer(r"\b(LOC|VEC)\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)", raw):
            x, z, y = map(float, match.groups()[1:])
            locations.append(dict(line=number, kind=match[1], raw=[x, z, y],
                                  world=[131072 - x * 512 if match[1] == "LOC" else -x * 512,
                                         y * 512, z * 512]))
        for word in re.findall(r"\b(?:CREATE_[A-Z_]+|START_SECTION[A-Z_]*|END_SECTION|VDECL)\b", raw):
            commands[word] += 1
    return dict(sha256=sha(data), size=len(data), lexical_command_counts=dict(sorted(commands.items())),
                literal_locations=locations, interpretation="lexical only; conditions and mutations are not evaluated")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game_root", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.game_root.resolve()
    assets = Assets(root)
    report = dict(schema_version=1, source_commit=subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip(),
        archive=dict(sha256=sha(assets.archive), size=len(assets.archive),
                     records=len(assets.records), usable_names=len(assets.index),
                     index_end=assets.index_end,
                     extensions=dict(sorted(collections.Counter(Path(k).suffix for k in assets.index).items()))),
        levels=[], missions=[], diagnostics=[])
    # Validate every indexed payload against the native loader's RLE contract.
    for name in assets.index:
        record = assets.index[name]
        start = record["header_offset"] + 12
        length = record["packed_size"] or record["unpacked_size"]
        require(start + length <= len(assets.archive), f"payload bounds: {name}")
        if record["packed_size"]:
            packed = assets.archive[start:start + length]
            require(len(packed) % 2 == 0 and sum(packed[::2]) == record["unpacked_size"], f"RLE: {name}")
    report["archive"]["all_payload_bounds_and_rle_lengths_valid"] = True
    for path in sorted((p for p in (root / "GRIDS").iterdir() if p.suffix.lower() == ".slk"), key=lambda p: p.name.lower()):
        try:
            level = parse_level(path)
            pack_name = f"grids/packs/{path.stem}_01.pak"
            source, pack = assets.resolve(pack_name)
            level["tile_pack"] = dict(path=pack_name, source=source)
            if pack is not None:
                require(pack[:4] == b"\x20\0\x20\0", "pack dimensions")
                require(len(pack) >= 4 + level["tile_count"] * 1024, "pack tile capacity")
                level["tile_pack"].update(sha256=sha(pack), size=len(pack), tile_capacity=(len(pack) - 4) // 1024)
            else:
                missing = [name for name in level["tile_names"] if assets.resolve("tiles1/" + name)[0] == "missing"]
                level["tile_pack"]["missing_named_tiles"] = missing
            report["levels"].append(level)
        except (ValueError, struct.error, UnicodeError) as error:
            report["diagnostics"].append(dict(file=path.name, error=str(error)))
    for path in sorted((p for p in (root / "GRIDS").iterdir() if p.suffix.lower() == ".lfl"), key=lambda p: p.name.lower()):
        data = path.read_bytes()
        config = fields(data)
        mission = dict(name=path.name, sha256=sha(data), config=config, dependencies={})
        for key in ("SLK_FILE", "SCRIPT_FILE", "MAP_TEXT", "PALETTE"):
            if key not in config:
                continue
            name = "grids/" + ("palettes/" if key == "PALETTE" else "") + config[key][-1]
            source, payload = assets.resolve(name)
            mission["dependencies"][key] = dict(path=name, source=source)
            if payload is not None and key == "SCRIPT_FILE":
                mission["script"] = script_inventory(payload)
            if payload is not None and key == "MAP_TEXT":
                text = payload.decode("cp1252")
                mission["briefing"] = dict(sha256=sha(payload), size=len(payload),
                    high_bytes=sum(v >= 128 for v in payload),
                    sections={marker: len(re.findall(marker + "_BEGIN", text))
                              for marker in ("OBJECTIVE", "DESCRIPTION", "SPYINFO")})
        sky = config.get("POLY_SKY", [""])[-1]
        sky_base = sky.rsplit(".", 1)[0] if "." in sky else sky
        sky_paths = [f"grids/skies/{sky_base}{suffix}.bmp" for suffix in ("", "2", "t")]
        # The current sky renderer reads loose BMPs through host_file_open.
        mission["sky"] = dict(requested=sky, requested_layers=[dict(path=p, loose_exists=p.lower() in assets.loose) for p in sky_paths],
                              fallback_base_exists="grids/skies/tempsky.bmp" in assets.loose)
        report["missions"].append(mission)
    report["summary"] = dict(levels_parsed=len(report["levels"]), missions=len(report["missions"]),
        placed_objects=sum(len(l["objects"]) for l in report["levels"]),
        citadels=sum(len(l["citadels"]) for l in report["levels"]),
        routes=sum(len(l["routes"]) for l in report["levels"]),
        teleporters=sum(len(l["teleporters"]) for l in report["levels"]),
        dimensions=dict(collections.Counter(f'{l["width"]}x{l["height"]}' for l in report["levels"])),
        object_kinds=dict(sorted(collections.Counter(o["kind"] for l in report["levels"] for o in l["objects"]).items())),
        missing_mission_dependencies=[dict(mission=m["name"], key=k, path=v["path"])
            for m in report["missions"] for k,v in m["dependencies"].items() if v["source"] == "missing"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(json.dumps(dict(summary=report["summary"], archive=report["archive"], diagnostics=report["diagnostics"]), indent=2))
    return bool(report["diagnostics"])


if __name__ == "__main__":
    raise SystemExit(main())
