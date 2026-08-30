import csv, json
from collections import defaultdict

occitanie_stops = json.load(open("occitanie-stops.json", encoding="utf-8"))
occitanie_stop_ids = set(s["stop_id"] for s in occitanie_stops)

occitanie_route_ids = set(json.load(open("occitanie-route-ids.json", encoding="utf-8")))
occitanie_trip_ids = set(json.load(open("occitanie-trip-ids.json", encoding="utf-8")))

routes = {}
with open("gtfs/routes.txt", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        routes[row["route_id"]] = row

trips = {}
with open("gtfs/trips.txt", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        if row["route_id"] in occitanie_route_ids and row["trip_id"] in occitanie_trip_ids:
            trips[row["trip_id"]] = row

stop_times_by_trip = defaultdict(list)
with open("gtfs/stop_times.txt", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        if row["trip_id"] in trips:
            stop_times_by_trip[row["trip_id"]].append(row)

for tid in stop_times_by_trip:
    stop_times_by_trip[tid].sort(key=lambda r: int(r["stop_sequence"]))

def occitanie_stop_seq(tid):
    sts = stop_times_by_trip.get(tid, [])
    seq = [st["stop_id"] for st in sts if st["stop_id"] in occitanie_stop_ids]
    out = []
    for sid in seq:
        if not out or out[-1] != sid:
            out.append(sid)
    return out

trips_by_route_dir = defaultdict(list)
for tid, t in trips.items():
    d = t.get("direction_id", "0") or "0"
    trips_by_route_dir[(t["route_id"], d)].append(tid)

out = {}
for (route_id, direction), tids in trips_by_route_dir.items():
    best_tid, best_seq = None, []
    for tid in tids:
        seq = occitanie_stop_seq(tid)
        if len(seq) > len(best_seq):
            best_tid, best_seq = tid, seq
    if best_tid is None or len(best_seq) < 2:
        continue
    route = routes.get(route_id, {})
    out[f"{route_id}::{direction}"] = {
        "route_id": route_id,
        "direction": direction,
        "short_name": route.get("route_short_name"),
        "long_name": route.get("route_long_name"),
        "color": route.get("route_color"),
        "text_color": route.get("route_text_color"),
        "route_type": route.get("route_type"),
        "stop_ids": best_seq,
    }

json.dump(out, open("route-dir-sequences.json", "w", encoding="utf-8"), ensure_ascii=False)
print("route/direction with sequence:", len(out))
lens = [len(v["stop_ids"]) for v in out.values()]
print("avg stops:", sum(lens)/len(lens), "max:", max(lens))
