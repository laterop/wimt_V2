import csv, json
from collections import defaultdict

occitanie_stops = json.load(open("occitanie-stops.json", encoding="utf-8"))
occitanie_stop_ids = set(s["stop_id"] for s in occitanie_stops)
print("occitanie stop_ids:", len(occitanie_stop_ids))

routes = {}
with open("gtfs/routes.txt", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        routes[row["route_id"]] = row

trips = {}
with open("gtfs/trips.txt", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        trips[row["trip_id"]] = row
print("routes:", len(routes), "trips:", len(trips))

stop_times_by_trip = defaultdict(list)
with open("gtfs/stop_times.txt", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        stop_times_by_trip[row["trip_id"]].append(row)

print("trips with stop_times:", len(stop_times_by_trip))

occitanie_trip_ids = set()
for trip_id, sts in stop_times_by_trip.items():
    if any(st["stop_id"] in occitanie_stop_ids for st in sts):
        occitanie_trip_ids.add(trip_id)

print("occitanie trips:", len(occitanie_trip_ids))

occitanie_route_ids = set()
for trip_id in occitanie_trip_ids:
    t = trips.get(trip_id)
    if t:
        occitanie_route_ids.add(t["route_id"])

print("occitanie routes:", len(occitanie_route_ids))

# Sample of route names for sanity check
sample = [routes[r]["route_short_name"] + " : " + routes[r]["route_long_name"] for r in list(occitanie_route_ids)[:40] if r in routes]
for s in sample:
    print(" -", s)

json.dump(sorted(occitanie_route_ids), open("occitanie-route-ids.json", "w", encoding="utf-8"))
json.dump(sorted(occitanie_trip_ids), open("occitanie-trip-ids.json", "w", encoding="utf-8"))
