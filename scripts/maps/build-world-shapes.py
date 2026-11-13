#!/usr/bin/env python3
"""
Country outlines for the zoomed world map, in the projection of app/lib/maps/world.json
(equirectangular, x = lon + 180, y = 78 - lat). Natural Earth 1:110m admin-0 (public domain).

  curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
  python3 scripts/maps/build-world-shapes.py ne_110m_admin_0_countries.geojson
"""
import json, sys
from pathlib import Path
from shapely.geometry import shape, MultiPolygon

ROOT = Path(__file__).resolve().parents[2] / "app/lib/maps"
isos = {c["iso"] for c in json.loads((ROOT / "world.json").read_text())["countries"]}
out = {}
for ft in json.load(open(sys.argv[1]))["features"]:
    p = ft["properties"]
    iso = p.get("ISO_A2_EH") or p.get("ISO_A2")
    if iso not in isos:
        continue
    geom = shape(ft["geometry"]).simplify(0.06, preserve_topology=True)
    for q in geom.geoms if isinstance(geom, MultiPolygon) else [geom]:
        if q.area < 0.02:
            continue
        pts = [(x + 180, 78 - y) for x, y in q.exterior.coords]
        out[iso] = out.get(iso, "") + "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts[:-1]) + "Z"
(ROOT / "world-shapes.json").write_text(json.dumps(out, separators=(",", ":")))
print(f"{len(out)} countries")
