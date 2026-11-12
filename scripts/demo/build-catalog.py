#!/usr/bin/env python3
"""
Build the De Simoni demo catalogue from the reference test site's article list.

  python3 scripts/demo/build-catalog.py <datasets.json> [--check-images | --images <file with one SKU per line>]

Input: the article list of the test site (sku, name, producer, category, group, vintage, format, region).
Output: app/.server/seed/desimoni-catalog.json — products grouped by (producer, name) with vintages/formats as
variants, mapped to the demo category tree, with demo prices (the source has none) and image URLs.
Prices are deterministic per SKU and clearly demo values ("Inhalte und Preise sind Beispiele").
"""
import hashlib, json, re, sys, concurrent.futures, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_BASE = "https://desimoni-test.baettig-ch.workers.dev"
CURATED = {p["variants"][0]["sku"]: p for p in json.load(open(ROOT / "app/.server/seed/desimoni-products.json"))}
CURATED_SKUS = {v["sku"] for p in CURATED.values() for v in p["variants"]}

# source category → (demo category slug, kind, wine colour)
CAT = {
    "Rotwein": ("rotwein", "wine", "red"), "Weisswein": ("weisswein", "wine", "white"), "Schaumwein": ("schaumwein", "wine", "sparkling"),
    "Rosewein": ("rosewein", "wine", "rose"), "Süsswein/Vermuth": ("suesswein", "wine", "sweet"),
    "Pasta": ("pasta-mehl", "food", None), "Mehl": ("pasta-mehl", "food", None), "Risotto": ("reis-polenta", "food", None), "Polenta": ("reis-polenta", "food", None),
    "Olio di Oliva": ("olivenoel", "food", None), "Essig": ("olivenoel", "food", None), "Gewürze": ("olivenoel", "food", None),
    "Diverse Wurstwaren": ("wurstwaren", "food", None), "Salami": ("wurstwaren", "food", None), "Prosciutto crudo": ("wurstwaren", "food", None),
    "Prosciutto cotto": ("wurstwaren", "food", None), "Mortadella": ("wurstwaren", "food", None), "Coppa": ("wurstwaren", "food", None),
    "Käse": ("kaese", "food", None), "Frischkäse/Butter": ("kaese", "food", None),
    "Antipasti / Sughi": ("antipasti", "food", None), "Tomaten": ("antipasti", "food", None), "Fisch": ("antipasti", "food", None),
    "Legumi": ("antipasti", "food", None), "Funghi": ("antipasti", "food", None), "Frutta": ("antipasti", "food", None),
    "Snacks": ("dolci", "food", None), "Dolci": ("dolci", "food", None), "Confetture/Miele": ("dolci", "food", None), "Mandeln/Haselnüsse": ("dolci", "food", None),
    "Marc/Grappa/Weindrusen ausländisch": ("grappa", "spirit", None), "Marc/Grappa/Weindrusen inländische": ("grappa", "spirit", None),
    "Andere ausländische gebrannte Wasser": ("spirituosen", "spirit", None), "Liköre": ("spirituosen", "spirit", None),
    "Aperitivo": ("aperitif", "spirit", None), "Aperitif / Bitter": ("aperitif", "spirit", None),
    "Bibite": ("getraenke", "beverage", None), "Bier": ("getraenke", "beverage", None),
}
COUNTRY = {"Schweiz": "Schweiz", "Österreich": "Österreich", "Frankreich": "Frankreich", "Spanien": "Spanien"}
# demo price bands (CHF incl. VAT for 75 cl / standard unit) per category slug
BAND = {
    "rotwein": (14, 58), "weisswein": (13, 42), "schaumwein": (15, 55), "rosewein": (13, 26), "suesswein": (16, 45),
    "pasta-mehl": (2.4, 9.8), "reis-polenta": (3.5, 14), "olivenoel": (6, 28), "wurstwaren": (6, 39), "kaese": (3.2, 24),
    "antipasti": (3.5, 16), "dolci": (3.2, 19), "grappa": (29, 72), "spirituosen": (24, 62), "aperitif": (18, 39), "getraenke": (1.6, 4.8),
}

LEGAL = re.compile(r"(,?\s*(-|–)\s.*$)|(\s+(s\.?\s?r\.?\s?l\.?|s\.?p\.?a\.?|spa|s\.?a\.?s\.?|s\.?n\.?c\.?|sa|ag|gmbh|egen mbh|mbh|soc\. agr\. coop|societa' agricola|s\.\s?agr\.|d\.i\.|s\.l\.)(\s.*)?$)", re.I)
KEEP_UPPER = {"TPLF", "P31", "DOC", "DOCG", "IGT"}

def display_producer(name: str) -> str:
    """'Azienda Agricola di Meo S.a.S.' → 'Di Meo', 'SALUMIFICIO BAZZA' → 'Salumificio Bazza' (the original stays the ERP key)."""
    n = clean(name)
    n = re.sub(r"^(Azienda Agricola|Az\. Agr\.)\s+", "", n, flags=re.I)
    prev = None
    while prev != n:
        prev, n = n, LEGAL.sub("", n).strip(" ,.-")
    n = re.sub(r"\s+di\s+.*&.*$", "", n)  # 'Ellebi s.a.s. di Bifulco Michele & C.'
    words = n.split()
    if sum(w.isupper() and len(w) > 2 for w in words) >= max(1, len(words) // 2):
        n = " ".join(w if w in KEEP_UPPER else w.capitalize() for w in words)
    return n[:1].upper() + n[1:] if n else clean(name)

def h(s: str) -> float:
    return int(hashlib.sha1(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF

def price(sku: str, cat: str, size: dict | None) -> float:
    lo, hi = BAND.get(cat, (5, 30))
    p = lo + (hi - lo) * h(sku) ** 1.6
    ml = (size or {}).get("amount") if (size or {}).get("unit") == "ml" else None
    if ml and cat in ("rotwein", "weisswein", "schaumwein", "rosewein", "suesswein", "grappa", "spirituosen", "aperitif"):
        p *= {150: 2.15, 300: 4.6, 37: 0.58, 50: 0.72, 20: 0.4}.get(round(ml / 10), max(0.35, ml / 750))
    return round(p * 20) / 20  # 5-Rappen rounding

def clean(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "").replace('\\"', '"')).strip()
    return re.sub(r'"([^"]+)"', r"«\1»", s)

def variant_label(item: dict, kind: str) -> str | None:
    """Wine: the format (75 cl). Food etc.: the distinguishing part of the label (flavour, pack), else the format."""
    fmt = (item.get("size") or {}).get("display") or item.get("format") or None
    if kind == "wine":
        return fmt
    seg = clean(item.get("label", "").split("|")[0])
    for word in clean(item.get("producer", "")).split():
        if len(word) > 2:
            seg = re.sub(rf"\b{re.escape(word)}\b", "", seg, flags=re.I)
    seg = re.sub(r"\b[A-Z0-9]{8,}\b", "", seg)
    seg = re.sub(r"\s+", " ", seg).strip(" -–|,")
    return seg[:40] or fmt

def image_ok(sku: str) -> bool:
    try:
        req = urllib.request.Request(f"{SRC_BASE}/products/{sku}.jpg", method="HEAD")
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200 and r.headers.get("content-type", "").startswith("image/")
    except Exception:
        return False

def main():
    src = json.load(open(sys.argv[1]))["Mk"]
    check = "--check-images" in sys.argv
    with_img = set()
    if "--images" in sys.argv:
        with_img = {l.strip() for l in open(sys.argv[sys.argv.index("--images") + 1]) if l.strip()}
    elif check:
        with concurrent.futures.ThreadPoolExecutor(16) as ex:
            for sku, ok in zip([a["sku"] for a in src], ex.map(image_ok, [a["sku"] for a in src])):
                if ok: with_img.add(sku)
        print(f"images: {len(with_img)}/{len(src)}", file=sys.stderr)

    groups: dict[tuple, list] = defaultdict(list)
    for a in src:
        if a["category"] not in CAT:
            continue
        groups[(clean(a["producer"]), clean(a["name"]))].append(a)
    # curated texts were written for these display names
    alias = {"ARPEPE S.r.l Societa' Agricola": "ARPEPE", "Buscema Gastronomia": "Buscema", "SALUMIFICIO BAZZA": "Salumificio Bazza"}

    products = []
    for (producer, name), items in groups.items():
        cat, kind, color = CAT[items[0]["category"]]
        regions = Counter(i.get("region") for i in items if i.get("region"))
        region = regions.most_common(1)[0][0] if regions else None
        country = COUNTRY.get(region, "Italia") if region else "Italia"
        if region in COUNTRY: region = None
        items.sort(key=lambda i: (i.get("vintage") or "", (i.get("size") or {}).get("amount") or 0), reverse=True)
        variants = []
        for i in items:
            sku = i["sku"]
            variants.append({
                "sku": sku, "vintage": i["vintage"] if re.fullmatch(r"(19|20)\d\d", i.get("vintage") or "") else None, "size": variant_label(i, kind),
                "price": price(sku, cat, i.get("size")), "stock": int(h(sku + "s") * 160) if h(sku + "o") > 0.06 else 0,
            })
        first = items[0]["sku"]
        curated = CURATED.get(first)
        image = curated["image"] if curated and curated.get("image") else (f"{SRC_BASE}/products/{first}.jpg" if first in with_img else None)
        products.append({"name": name, "producer": alias.get(producer) or display_producer(producer), "producerErp": producer, "category": cat, "kind": kind, "color": color, "region": region, "country": country,
                         "alcohol": None, "image": image, "variants": variants, "curated": any(v["sku"] in CURATED_SKUS for v in variants)})
    products.sort(key=lambda p: (not p["curated"], p["category"], p["producer"], p["name"]))
    out = ROOT / "app/.server/seed/desimoni-catalog.json"
    out.write_text(json.dumps(products, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(products)} products, {sum(len(p['variants']) for p in products)} variants, {len({p['producer'] for p in products})} producers, "
          f"{sum(1 for p in products if p['image'])} with image → {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)", file=sys.stderr)

if __name__ == "__main__":
    main()
