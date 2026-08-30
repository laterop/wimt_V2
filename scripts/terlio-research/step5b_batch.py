import sys, json, math, heapq, pickle, os
import numpy as np

R = 6371000.0
def haversine(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1; dlon = lon2 - lon1
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2 * R * math.asin(min(1, math.sqrt(h)))

occitanie_stops = json.load(open("occitanie-stops.json", encoding="utf-8"))
stop_pos = {s["stop_id"]: (s["lat"], s["lon"]) for s in occitanie_stops}
stop_name = {s["stop_id"]: s["stop_name"] for s in occitanie_stops}

sequences = json.load(open("route-dir-sequences.json", encoding="utf-8"))
keys = sorted(sequences.keys())

OUT_FILE = "terlio-routes.json"
results = {}
if os.path.exists(OUT_FILE):
    results = json.load(open(OUT_FILE, encoding="utf-8"))

todo = [k for k in keys if k not in results]
print(f"total keys: {len(keys)}, already done: {len(results)}, todo: {len(todo)}")

START = int(sys.argv[1]) if len(sys.argv) > 1 else 0
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 15
batch = todo[START:START+COUNT]
print(f"processing batch of {len(batch)}: {batch}")

if not batch:
    print("nothing to do")
    sys.exit(0)

with open("osm_graph.pkl", "rb") as f:
    g = pickle.load(f)
node_pos = g["node_pos"]
adj = g["adj"]
node_ids = list(node_pos.keys())
node_arr = np.radians(np.array([node_pos[n] for n in node_ids]))

def nearest_node(pt, max_dist_m=2000):
    lat_r = math.radians(pt[0]); lon_r = math.radians(pt[1])
    dlat = node_arr[:,0] - lat_r
    dlon = node_arr[:,1] - lon_r
    a = np.sin(dlat/2)**2 + math.cos(lat_r)*np.cos(node_arr[:,0])*np.sin(dlon/2)**2
    dist = 2*R*np.arcsin(np.sqrt(np.clip(a,0,1)))
    idx = int(np.argmin(dist))
    d = float(dist[idx])
    if d > max_dist_m:
        return None, d
    return node_ids[idx], d

def dijkstra(src, dst):
    if src == dst: return [src], 0.0
    dist = {src: 0.0}; prev = {}
    pq = [(0.0, src)]; visited=set()
    while pq:
        d,u = heapq.heappop(pq)
        if u in visited: continue
        visited.add(u)
        if u == dst: break
        for v,w in adj.get(u, []):
            nd = d+w
            if nd < dist.get(v, math.inf):
                dist[v] = nd; prev[v]=u
                heapq.heappush(pq, (nd,v))
    if dst not in dist: return None, None
    path=[dst]
    while path[-1]!=src: path.append(prev[path[-1]])
    path.reverse()
    return path, dist[dst]

_nn_cache = {}
def cached_nearest(pt):
    key = (round(pt[0],5), round(pt[1],5))
    if key not in _nn_cache:
        _nn_cache[key] = nearest_node(pt)
    return _nn_cache[key]

def path_between(a, b):
    straight = haversine(a, b)
    na, da = cached_nearest(a)
    nb, db = cached_nearest(b)
    if na is None or nb is None:
        return [a, b], straight
    path, plen = dijkstra(na, nb)
    if path is None:
        return [a, b], straight
    total = da + plen + db
    if total > straight * 2.5 and straight > 1500:
        return [a, b], straight
    poly = [a] + [node_pos[n] for n in path] + [b]
    return poly, total

for key in batch:
    entry = sequences[key]
    best_seq = entry["stop_ids"]
    polyline = []
    stop_arc = {}
    cum = 0.0
    for i, sid in enumerate(best_seq):
        pt = stop_pos[sid]
        if i == 0:
            polyline.append(pt)
            stop_arc[sid] = 0.0
            continue
        prev_pt = stop_pos[best_seq[i-1]]
        seg_poly, seg_len = path_between(prev_pt, pt)
        polyline.extend(seg_poly[1:])
        cum += seg_len
        stop_arc[sid] = cum
    results[key] = {
        **entry,
        "stop_names": [stop_name.get(s) for s in best_seq],
        "stop_arc_m": stop_arc,
        "polyline": [[round(p[0],6), round(p[1],6)] for p in polyline],
        "length_m": round(cum),
    }
    print(f"done {key} ({entry.get('short_name')}) len={cum/1000:.1f}km pts={len(polyline)}")

json.dump(results, open(OUT_FILE, "w", encoding="utf-8"), ensure_ascii=False)
print(f"saved, total done now: {len(results)}")
