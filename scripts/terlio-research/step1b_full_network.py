import json

d = json.load(open("lignes-region.geojson", encoding="utf-8"))
feats = d["features"]

segments = []
for f in feats:
    props = f["properties"]
    geom = f["geometry"]
    if geom["type"] != "LineString":
        continue
    coords = geom["coordinates"]
    segments.append({
        "code_ligne": props.get("code_ligne"),
        "region": props.get("region"),
        "coords": [[c[1], c[0]] for c in coords],
    })

json.dump(segments, open("all-rail-segments.json", "w", encoding="utf-8"))
print("total segments:", len(segments))
total_pts = sum(len(s["coords"]) for s in segments)
print("total points:", total_pts)
