import csv, json
import numpy as np

# 1. Load Occitanie rail points (lat, lon) from the segments file
segs = json.load(open("occitanie-rail-segments.json", encoding="utf-8"))
rail_pts = []
for s in segs:
    rail_pts.extend(s["coords"])
rail_pts = np.array(rail_pts)  # shape (N, 2) -> [lat, lon]
print("rail points:", rail_pts.shape)

# 2. Load all SNCF stops, prefilter by a generous bounding box around Occitanie
LAT_MIN, LAT_MAX = 41.8, 45.3
LON_MIN, LON_MAX = -0.8, 4.8

stops = []
with open("gtfs/stops.txt", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            lat = float(row["stop_lat"]); lon = float(row["stop_lon"])
        except (KeyError, ValueError):
            continue
        if LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX:
            stops.append({"stop_id": row["stop_id"], "stop_name": row.get("stop_name", ""), "lat": lat, "lon": lon})

print("stops in bbox:", len(stops))

# 3. Vectorized haversine min-distance from each stop to nearest rail point
R = 6371000.0
rail_lat = np.radians(rail_pts[:, 0])
rail_lon = np.radians(rail_pts[:, 1])

def min_dist_to_rail(lat, lon, chunk=20000):
    lat_r = np.radians(lat)
    lon_r = np.radians(lon)
    best = np.inf
    n = rail_lat.shape[0]
    for i in range(0, n, chunk):
        rlat = rail_lat[i:i+chunk]
        rlon = rail_lon[i:i+chunk]
        dlat = rlat - lat_r
        dlon = rlon - lon_r
        a = np.sin(dlat/2)**2 + np.cos(lat_r)*np.cos(rlat)*np.sin(dlon/2)**2
        d = 2*R*np.arcsin(np.sqrt(np.clip(a, 0, 1)))
        m = d.min()
        if m < best:
            best = m
    return best

THRESHOLD_M = 3000
occitanie_stops = []
for i, st in enumerate(stops):
    dist = min_dist_to_rail(st["lat"], st["lon"])
    if dist <= THRESHOLD_M:
        st["dist_m"] = round(float(dist))
        occitanie_stops.append(st)

print(f"Gares retenues (<= {THRESHOLD_M} m du reseau Occitanie) : {len(occitanie_stops)} / {len(stops)}")
json.dump(occitanie_stops, open("occitanie-stops.json", "w", encoding="utf-8"), ensure_ascii=False)

# quick sanity sample
for st in sorted(occitanie_stops, key=lambda s: s["stop_name"])[:15]:
    print(st["stop_name"], st["dist_m"])
