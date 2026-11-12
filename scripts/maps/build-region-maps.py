#!/usr/bin/env python3
"""
Build compact region maps (SVG paths) for the origin map from Natural Earth admin-1 data.

  pip install shapely
  curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
  python3 scripts/maps/build-region-maps.py ne_10m_admin_1_states_provinces.geojson            # all countries below
  python3 scripts/maps/build-region-maps.py ne_10m_admin_1_states_provinces.geojson FR ES      # selected ones

Writes app/lib/maps/regions/<iso>.json = { iso, viewBox, regions: [{ id, name, names, aliases, d }] }.
To add a country: add an entry to COUNTRIES, run the script, and register the file in app/lib/maps/regions/index.ts.
Natural Earth is public domain.
"""
import json, math, re, sys, unicodedata
from pathlib import Path
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.ops import unary_union, polylabel

OUT = Path(__file__).resolve().parents[2] / "app/lib/maps/regions"

# group: "name" (one area per admin-1 unit) or "region" (merge units by their region field)
# exclude: overseas / remote parts that would shrink the mainland; tol: simplification in projected units
COUNTRIES = {
    "CH": {"group": "name"},
    "AT": {"group": "name"},
    "DE": {"group": "name"},
    "FR": {"group": "region", "exclude": ["Guyane française", "Martinique", "Guadeloupe", "La Réunion", "Mayotte"]},
    "ES": {"group": "region", "exclude": ["Canary Is.", "Ceuta", "Melilla"]},
    "PT": {"group": "region", "exclude": ["Azores", "Madeira"]},
    "GR": {"group": "name"},
    "HU": {"group": "region"},
    "SI": {"group": "region"},
    "HR": {"group": "name"},
    "US": {"group": "name", "exclude": ["Alaska", "Hawaii"]},
    "AR": {"group": "name"},
    "CL": {"group": "name", "minlon": -76},
    "ZA": {"group": "name"},
    "AU": {"group": "name", "exclude": ["Macquarie Island", "Jervis Bay Territory", "Lord Howe Island", "Ashmore and Cartier Islands", "Coral Sea Islands"]},
    "NZ": {"group": "region", "exclude": ["New Zealand Outlying Islands", "Chatham Islands"]},
}

# Wine & speciality regions → administrative region (so ERP/supplier values like "Bordeaux" or "Rioja Alta" land on the map),
# plus German names for merged regions. Keys are region ids, values are free-text names (slugified when matching).
EXTRA = {
    "FR": {
        "nouvelle-aquitaine": ["Bordeaux", "Médoc", "Saint-Émilion", "Pomerol", "Graves", "Sauternes", "Cognac", "Bergerac", "Jurançon"],
        "bourgogne-franche-comte": ["Bourgogne", "Burgund", "Burgundy", "Chablis", "Côte d'Or", "Côte de Beaune", "Côte de Nuits", "Mâconnais", "Jura"],
        "grand-est": ["Champagne", "Alsace", "Elsass", "Lorraine"],
        "auvergne-rhone-alpes": ["Rhône", "Rhône Nord", "Côtes du Rhône", "Beaujolais", "Savoie", "Savoyen"],
        "provence-alpes-cote-d-azur": ["Provence", "Côtes de Provence", "Bandol", "Châteauneuf-du-Pape", "Vallée du Rhône Sud"],
        "occitanie": ["Languedoc", "Roussillon", "Languedoc-Roussillon", "Cahors", "Armagnac"],
        "pays-de-la-loire": ["Loire", "Muscadet", "Anjou", "Saumur"],
        "centre-val-de-loire": ["Sancerre", "Touraine", "Vouvray", "Pouilly-Fumé"],
        "corse": ["Korsika", "Corsica"],
    },
    "ES": {
        "la-rioja": ["Rioja", "Rioja Alta", "Rioja Alavesa", "Rioja Oriental"],
        "castilla-y-leon": ["Ribera del Duero", "Rueda", "Toro", "Bierzo", "Kastilien und León", "Castile and León"],
        "cataluna": ["Priorat", "Penedès", "Cava", "Montsant", "Katalonien", "Catalonia", "Catalunya"],
        "galicia": ["Rías Baixas", "Ribeiro", "Galicien"],
        "andalucia": ["Jerez", "Sherry", "Montilla-Moriles", "Andalusien", "Andalusia"],
        "foral-de-navarra": ["Navarra", "Navarre"],
        "pais-vasco": ["Txakoli", "Baskenland", "Basque Country", "Euskadi"],
        "castilla-la-mancha": ["La Mancha", "Valdepeñas", "Kastilien-La Mancha"],
        "valenciana": ["Valencia", "Utiel-Requena", "Alicante", "Comunidad Valenciana"],
        "murcia": ["Jumilla", "Yecla", "Bullas"],
        "islas-baleares": ["Mallorca", "Balearen", "Balearic Islands"],
    },
    "PT": {"norte": ["Douro", "Porto", "Vinho Verde", "Trás-os-Montes"], "centro": ["Dão", "Bairrada"], "lisbon": ["Lisboa", "Lissabon", "Setúbal", "Tejo"], "alentejo": ["Alentejano"]},
    "DE": {"rheinland-pfalz": ["Mosel", "Pfalz", "Rheinhessen", "Nahe", "Ahr", "Mittelrhein"], "hessen": ["Rheingau", "Hessische Bergstrasse"], "bayern": ["Franken"], "baden-wurttemberg": ["Baden", "Württemberg"], "sachsen": ["Meissen"], "sachsen-anhalt": ["Saale-Unstrut"]},
    "AT": {"niederosterreich": ["Wachau", "Kamptal", "Kremstal", "Weinviertel", "Thermenregion", "Carnuntum", "Wagram", "Traisental"], "burgenland": ["Neusiedlersee", "Mittelburgenland", "Leithaberg"], "steiermark": ["Südsteiermark", "Vulkanland", "Weststeiermark"]},
    "US": {"california": ["Napa", "Napa Valley", "Sonoma", "Paso Robles", "Central Coast", "Santa Barbara", "Kalifornien"], "oregon": ["Willamette Valley"], "washington": ["Columbia Valley", "Walla Walla"], "new-york": ["Finger Lakes"]},
    "AR": {"mendoza": ["Uco Valley", "Valle de Uco", "Luján de Cuyo"], "salta": ["Cafayate"]},
    "CL": {"libertador-general-bernardo-o-higgins": ["Colchagua", "Cachapoal", "Rapel"], "valparaiso": ["Casablanca", "Aconcagua", "San Antonio"], "maule": ["Curicó"]},
    "ZA": {"western-cape": ["Stellenbosch", "Franschhoek", "Paarl", "Constantia", "Swartland", "Walker Bay", "Westkap"]},
    "AU": {"south-australia": ["Barossa", "Barossa Valley", "McLaren Vale", "Clare Valley", "Coonawarra", "Adelaide Hills", "Südaustralien"], "victoria": ["Yarra Valley"], "western-australia": ["Margaret River"], "new-south-wales": ["Hunter Valley"], "tasmania": ["Tasmanien"]},
    "NZ": {"south-island": ["Marlborough", "Central Otago", "Nelson", "Canterbury", "Südinsel"], "north-island": ["Hawke's Bay", "Martinborough", "Gisborne", "Nordinsel"]},
}
NAMES_DE = {
    "ES": {"andalucia": "Andalusien", "cataluna": "Katalonien", "galicia": "Galicien", "castilla-y-leon": "Kastilien und León", "castilla-la-mancha": "Kastilien-La Mancha", "islas-baleares": "Balearen", "pais-vasco": "Baskenland", "valenciana": "Valencia", "foral-de-navarra": "Navarra", "aragon": "Aragonien", "madrid": "Madrid"},
    "FR": {"corse": "Korsika", "bourgogne-franche-comte": "Burgund-Franche-Comté", "provence-alpes-cote-d-azur": "Provence-Alpes-Côte d'Azur"},
    "PT": {"lisbon": "Lissabon"},
    "NZ": {"north-island": "Nordinsel", "south-island": "Südinsel"},
}

PREFIX = re.compile(r"^(Kanton|Canton|Cantone|Canton de|Canton du|Land|Bundesland|Région|Region|Regione|Provincia|Province|Comunidad|Comunidad Autónoma de|Comunidad de|Estado|State of|Département|Departamento)\s+(de |du |di |of |del |de la )?", re.I)

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def clean(s):
    return PREFIX.sub("", s).strip() if s else s

def project(lon, lat, lat0):
    return lon * math.cos(math.radians(lat0)), -lat

def to_path(geom, tx):
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    out = []
    for p in polys:
        for ring in [p.exterior]:  # holes are irrelevant at this scale
            pts = [tx(x, y) for x, y in ring.coords]
            if len(pts) < 4:
                continue
            out.append("M" + "L".join(f"{x:.0f},{y:.0f}" for x, y in pts[:-1]) + "Z")
    return "".join(out)

def build(features, iso, cfg):
    fs = [f for f in features if f["properties"]["iso_a2"] == iso and f["properties"]["name"] not in cfg.get("exclude", []) and (f["properties"].get("region") or "") not in cfg.get("exclude", [])]
    groups = {}
    for f in fs:
        p = f["properties"]
        key = (p.get("region") or p["name"]) if cfg["group"] == "region" else p["name"]
        g = groups.setdefault(key, {"geoms": [], "props": []})
        geom = shape(f["geometry"])
        if "minlon" in cfg:  # drop far-off islands
            parts = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
            geom = MultiPolygon([q for q in parts if q.centroid.x > cfg["minlon"]]) if any(q.centroid.x > cfg["minlon"] for q in parts) else geom
        g["geoms"].append(geom.buffer(0))
        g["props"].append(p)

    merged = {k: unary_union(v["geoms"]) for k, v in groups.items()}
    allg = unary_union(list(merged.values()))
    minx, miny, maxx, maxy = allg.bounds
    lat0 = (miny + maxy) / 2
    (x0, y0), (x1, y1) = project(minx, maxy, lat0), project(maxx, miny, lat0)
    scale = 1000 / (x1 - x0)
    height = round((y1 - y0) * scale)
    tx = lambda lon, lat: ((project(lon, lat, lat0)[0] - x0) * scale, (project(lon, lat, lat0)[1] - y0) * scale)
    # drop specks (tiny islands) relative to the country size
    min_area = allg.area * 0.00004

    regions = []
    for key, geom in merged.items():
        parts = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
        parts = [p for p in parts if p.area >= min_area] or [max(parts, key=lambda p: p.area)]
        geom = MultiPolygon(parts).simplify(0.012 * (maxx - minx) / 10, preserve_topology=True)
        props = groups[key]["props"]
        single = cfg["group"] == "name"
        p0 = props[0]
        names = {l: clean(p0.get(f"name_{l}")) for l in ("de", "it", "fr", "en")} if single else {}
        aliases = set()
        for p in props if single else []:
            aliases.update(clean(a) for a in (p.get("name_alt") or "").split("|") if a)
            aliases.update(v for v in names.values() if v)
            if p.get("postal"):
                aliases.add(p["postal"])
        name = key
        aliases.add(name)
        main = max(geom.geoms if isinstance(geom, MultiPolygon) else [geom], key=lambda q: q.area)
        cx, cy = tx(*polylabel(main, tolerance=(maxx - minx) / 500).coords[0])
        regions.append({
            "id": slug(name),
            "cx": round(cx), "cy": round(cy),
            "name": name,
            "names": {k: v for k, v in names.items() if v and v != name},
            "aliases": sorted({slug(a) for a in aliases if a} - {slug(name)}),
            "d": to_path(geom, tx),
        })
    for r in regions:
        r["aliases"] = sorted(set(r["aliases"]) | {slug(a) for a in EXTRA.get(iso, {}).get(r["id"], [])})
        if NAMES_DE.get(iso, {}).get(r["id"]):
            r["names"]["de"] = NAMES_DE[iso][r["id"]]
    unknown = [k for k in EXTRA.get(iso, {}) if k not in {r["id"] for r in regions}]
    if unknown:
        print(f"  ! {iso}: EXTRA ids not found: {unknown}")
    regions.sort(key=lambda r: r["id"])
    return {"iso": iso, "viewBox": f"0 0 1000 {height}", "regions": regions}

def main():
    src = sys.argv[1]
    only = [a.upper() for a in sys.argv[2:]] or list(COUNTRIES)
    features = json.load(open(src))["features"]
    OUT.mkdir(parents=True, exist_ok=True)
    for iso in only:
        data = build(features, iso, COUNTRIES[iso])
        path = OUT / f"{iso.lower()}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        print(f"{iso}: {len(data['regions'])} regions, {path.stat().st_size // 1024} KB")

if __name__ == "__main__":
    main()
