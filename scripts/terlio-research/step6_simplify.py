import json, math

def perp_dist(pt, a, b):
    # approx planar distance (fine at this tolerance/scale)
    if a == b:
        return math.hypot(pt[0]-a[0], pt[1]-a[1])
    x, y = pt; x1, y1 = a; x2, y2 = b
    dx, dy = x2-x1, y2-y1
    t = ((x-x1)*dx + (y-y1)*dy) / (dx*dx + dy*dy)
    t = max(0, min(1, t))
    px, py = x1 + t*dx, y1 + t*dy
    return math.hypot(x-px, y-py)

def rdp(points, epsilon):
    if len(points) < 3:
        return points
    dmax = 0; index = 0
    for i in range(1, len(points)-1):
        d = perp_dist(points[i], points[0], points[-1])
        if d > dmax:
            index = i; dmax = d
    if dmax > epsilon:
        left = rdp(points[:index+1], epsilon)
        right = rdp(points[index:], epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]

EPS = 0.00015  # ~15-17m, imperceptible at map zoom levels used for a regional map

d = json.load(open("terlio-routes.json", encoding="utf-8"))
total_before = 0
total_after = 0
for k, v in d.items():
    pts = [tuple(p) for p in v["polyline"]]
    total_before += len(pts)
    simplified = rdp(pts, EPS)
    total_after += len(simplified)
    v["polyline"] = [[p[0], p[1]] for p in simplified]

json.dump(d, open("terlio-routes.simplified.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"points before: {total_before}, after: {total_after} ({100*total_after/total_before:.1f}%)")
