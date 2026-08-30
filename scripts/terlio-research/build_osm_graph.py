import json, math, heapq, pickle
from collections import defaultdict, deque

R = 6371000.0
def haversine(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1; dlon = lon2 - lon1
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2 * R * math.asin(min(1, math.sqrt(h)))

d = json.load(open("osm_occitanie.json", encoding="utf-8"))
elements = d["elements"]
print("ways:", len(elements))

node_pos = {}  # node_id -> (lat, lon)
adj = defaultdict(list)  # node_id -> [(neighbor, weight)]

for e in elements:
    nodes = e["nodes"]
    geom = e["geometry"]
    if len(nodes) != len(geom):
        continue
    for nid, g in zip(nodes, geom):
        node_pos[nid] = (g["lat"], g["lon"])
    for i in range(len(nodes) - 1):
        a, b = nodes[i], nodes[i+1]
        pa, pb = node_pos[a], node_pos[b]
        w = haversine(pa, pb)
        if w == 0:
            continue
        adj[a].append((b, w))
        adj[b].append((a, w))

print("distinct nodes:", len(node_pos))
print("nodes with edges:", len(adj))

# connectivity check
seen = set()
comps = []
for n in adj:
    if n in seen: continue
    q = deque([n]); seen.add(n); comp = [n]
    while q:
        u = q.popleft()
        for v, w in adj[u]:
            if v not in seen:
                seen.add(v); q.append(v); comp.append(v)
    comps.append(comp)
comps.sort(key=len, reverse=True)
print("num components:", len(comps))
print("top sizes:", [len(c) for c in comps[:10]])

with open("osm_graph.pkl", "wb") as f:
    pickle.dump({"node_pos": node_pos, "adj": dict(adj)}, f)
print("saved osm_graph.pkl")
