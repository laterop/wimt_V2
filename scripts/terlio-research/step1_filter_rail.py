import json

SRC = "lignes-region.geojson"
OUT_GEOJSON = "occitanie-rail.geojson"
OUT_SEGMENTS = "occitanie-rail-segments.json"

OCCITANIE_OLD_REGIONS = {"Languedoc-Roussillon", "Midi-Pyrénées"}

d = json.load(open(SRC, encoding="utf-8"))
feats = d["features"]

kept = []
segments = []
for f in feats:
    props = f["properties"]
    if props.get("region") not in OCCITANIE_OLD_REGIONS:
        continue
    geom = f["geometry"]
    if geom["type"] != "LineString":
        continue
    coords = geom["coordinates"]  # [lon, lat] pairs
    kept.append(f)
    segments.append({
        "code_ligne": props.get("code_ligne"),
        "lib_ligne": props.get("lib_ligne"),
        "region": props.get("region"),
        "pkd": props.get("pkd"),
        "pkf": props.get("pkf"),
        "coords": [[c[1], c[0]] for c in coords],
    })

out_geojson = {"type": "FeatureCollection", "features": kept}
json.dump(out_geojson, open(OUT_GEOJSON, "w", encoding="utf-8"))
json.dump(segments, open(OUT_SEGMENTS, "w", encoding="utf-8"))

print(f"Segments Occitanie retenus : {len(segments)} / {len(feats)}")
total_pts = sum(len(s["coords"]) for s in segments)
print(f"Points totaux : {total_pts}")
