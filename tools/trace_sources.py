"""Generate pinned source references and declared model-family tables."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess


SOURCES = [
    ("resources", "game/application_services.c", "int game_application_load_blob("),
    ("archive-index", "core/resource_index.c", "ResourceIndexStatus resource_index_read_record("),
    ("archive-payload", "core/resource_archive.c", "ResourceLoadResult resource_archive_load("),
    ("rle", "core/resource_payload.c", "ResourcePayloadStatus resource_payload_decode_rle("),
    ("host-paths", "core/host_file.c", "int host_file_path("),
    ("mission-settings", "game/level_settings.c", "int game_level_settings_line("),
    ("startup", "game/level_startup.c", "int game_level_startup("),
    ("load-order", "game/level_load.c", "static int stage("),
    ("manifest", "core/level_manifest.c", "int level_manifest_read("),
    ("terrain-file", "core/level_terrain.c", "int level_terrain_load("),
    ("terrain-tiles", "game/level_terrain_runtime.c", "static int terrain_tiles("),
    ("terrain-decoder", "core/terrain_asset.c", "int terrain_asset_decode("),
    ("terrain-uv", "core/gameplay_geometry.c", "void gameplay_geometry_terrain_triangles("),
    ("terrain-height", "core/gameplay_geometry.c", "long double gameplay_geometry_terrain_height("),
    ("terrain-draw", "core/gameplay_geometry.c", "static int world_emit_cell("),
    ("terrain-depth", "game/level_terrain_depth.c", "int game_level_terrain_depth_begin("),
    ("tile-pixels", "core/asset_texture.c", "int asset_texture_terrain_tile("),
    ("bitmap", "core/asset_texture.c", "int asset_texture_bitmap("),
    ("palette", "game/level_transition_assets.c", "int game_level_palette_load("),
    ("sky", "platform/portable_gl1_sky.inc", "static void gl1_sky_select("),
    ("world", "game/level_world_surface.c", "int game_level_world_surface_draw("),
    ("render", "game/level_world_render.c", "int game_level_world_render("),
    ("scene-collection", "game/level_scene_render.c", "int game_level_world_present("),
    ("model-submission", "game/model_submission.c", "int game_model_graph_update("),
    ("scene-submission", "core/scene_submission.c", "int scene_submission_owned("),
    ("world-submission", "core/world_renderer.c", "int world_renderer_submit_owned("),
    ("mesh", "core/asset_mesh.c", "int asset_mesh_read("),
    ("bdm", "core/asset_mesh.c", "int asset_model_read_format("),
    ("model-load", "core/scene_asset_loader.c", "int scene_asset_load("),
    ("model-fallback", "game/model_assets.c", "int game_model_definition_read("),
    ("model-materials", "game/model_assets.c", "GameAddress game_model_mesh_project("),
    ("text-model", "game/model_assets.c", "int game_model_text_definition_load("),
    ("sdf", "core/asset_sdf.c", "int asset_sdf_read("),
    ("scene", "core/scene_model.c", "int scene_model_take("),
    ("object-parser", "core/level_objects.c", "int level_objects_load("),
    ("object-placement", "game/level_objects.c", "static int construct("),
    ("factory", "game/level_factory.c", "static GameAddress operation("),
    ("catalog", "game/level_player_catalog.c", "int game_level_player_catalog_value("),
    ("catalog-record", "core/gameplay_catalog.c", "uint32_t gameplay_catalog_value("),
    ("vehicle-family", "core/vehicle_presentation.c", "const VehiclePresentationFamily *vehicle_presentation_family("),
    ("building-family", "core/presentation_state_copy.c", "static const GamePresentationFactoryFamily presentation_families[]="),
    ("player-model", "game/level_player_factory.c", "static int definition_read("),
    ("slot-parser", "core/level_player_slots.c", "int level_player_slots_load("),
    ("citadel-parser", "core/level_citadels.c", "int level_citadels_load("),
    ("citadel-placement", "game/level_citadel.c", "static int construct("),
    ("path-parser", "core/level_movement_paths.c", "int level_movement_paths_load("),
    ("path-placement", "game/level_routes.c", "static int construct("),
    ("teleporter-parser", "core/level_teleporters.c", "int level_teleporters_load("),
    ("teleporter-placement", "game/level_teleport.c", "static int construct("),
    ("script-load", "game/level_script.c", "int game_level_script_load_path("),
    ("script-lexer", "game/level_script.c", "int game_script_next("),
    ("script-location", "game/level_script.c", "static int spatial_point_parse("),
    ("script-types", "game/level_script.c", "static int script_unit_kind("),
    ("briefing", "game/level_selection.c", "int game_level_description_load("),
    ("campaign-text", "game/campaign_catalog.c", "static int mission_metadata("),
    ("overview", "game/level_geometry.c", "static int overview_image("),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game_root", type=Path)
    parser.add_argument("--docs", type=Path, required=True)
    args = parser.parse_args()
    root = args.game_root.resolve()
    commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    refs = []
    for key, name, symbol in SOURCES:
        path = root / "source" / name
        data = path.read_bytes()
        matches = [i for i, text in enumerate(data.decode("utf-8").splitlines(), 1) if symbol in text]
        if len(matches) != 1:
            raise ValueError(f"ambiguous source anchor: {key}: {matches}")
        refs.append(dict(key=key, path="source/" + name, symbol=symbol, line=matches[0],
                         sha256=hashlib.sha256(data).hexdigest(),
                         url=f"https://github.com/pdromnt/uprising_decomp/blob/{commit}/source/{name}#L{matches[0]}"))
    args.docs.mkdir(parents=True, exist_ok=True)
    (args.docs / "evidence/source-index.json").write_text(json.dumps(dict(commit=commit, sources=refs), indent=2) + "\n", encoding="utf-8")
    lines = ["# Pinned source index", "", f"Checkout: `{commit}`. Each reference resolves to the inspected commit.", ""]
    for ref in refs:
        lines += [f'## {ref["key"]}', "", f'[{ref["path"]}:{ref["line"]}]({ref["url"]})', "", f'`{ref["symbol"]}`', ""]
    (args.docs / "source-index.md").write_text("\n".join(lines), encoding="utf-8")
    # Reconstruct declaration bytes in the same order as game_initial_data.c.
    base = 0x400000
    image = bytearray(0x400000)
    for filename in ("initial_numeric_records.inc", "initial_method_ids.inc"):
        for address, value in re.findall(r"\{0x([0-9a-f]+)u, 0x([0-9a-f]+)u\}", (root / "source/core" / filename).read_text()):
            struct.pack_into("<I", image, int(address, 16) - base, int(value, 16))
    for address, literal in re.findall(r'\{0x([0-9a-f]+)u, ("(?:[^"\\]|\\.)*")\}', (root / "source/core/initial_strings.inc").read_text()):
        value = ast.literal_eval(literal.replace(r"\?", "?")).encode("cp1252") + b"\0"
        at = int(address, 16) - base
        image[at:at+len(value)] = value

    def names(table, count):
        result = []
        for i in range(count):
            address = struct.unpack_from("<I", image, table - base + i * 4)[0]
            at = address - base
            result.append(image[at:image.index(0, at)].decode("cp1252"))
        return result

    families = []
    text = (root / "source/core/vehicle_presentation.c").read_text()
    for kind, count, table in re.findall(r"\{0x([0-9a-f]+),(\d+),0x[0-9a-f]+,0x[0-9a-f]+,0x([0-9a-f]+),", text):
        families.append(dict(kind=int(kind,16), format=2, names_table=table, labels=names(int(table,16),int(count))))
    text = (root / "source/core/presentation_state_copy.c").read_text()
    for kind, count, table in re.findall(r"\{0x([0-9a-f]+)u,(\d+)u,0x[0-9a-f]+u,0x([0-9a-f]+)u,", text):
        families.append(dict(kind=int(kind,16), format=1, names_table=table, labels=names(int(table,16),int(count))))
    for kind, count, table, format in [(0x20,1,0x5846d4,2),(0x26,11,0x584708,0),
            (0x27,11,0x584738,0),(0x29,4,0x584768,0),(0xb0,15,0x5847a0,0)]:
        families.append(dict(kind=kind, format=format, names_table=f"{table:x}", labels=names(table,count)))
    next(f for f in families if f["kind"] == 0x20)["scope"] = "primary label sample only; not the entire 15-slot player pool"
    (args.docs / "evidence/model-families.json").write_text(json.dumps(dict(commit=commit,
        scope="declared label tables; final slot still depends on catalog and mission/player choices; not a complete factory inventory",
        families=sorted(families,key=lambda f:f["kind"])), indent=2) + "\n", encoding="utf-8")
    print(f"Pinned {len(refs)} source anchors; decoded {len(families)} model-family name tables.")


if __name__ == "__main__":
    main()
