#!/usr/bin/env python3
"""Coleta sugestões de autocomplete (google, youtube, shopping, bing) para uma keyword (mesma lógica do app.js do site).

Uso: python3 collect.py "caffè" --hl it --gl it [--source google|youtube|shopping|bing] -o dados.json
Só biblioteca padrão.
"""
import argparse
import json
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ENDPOINT = "https://suggestqueries.google.com/complete/search"
BING_ENDPOINT = "https://api.bing.com/qsonhs.aspx"
HERE = Path(__file__).resolve().parent


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


def has_token(text, tok):
    return f" {norm(tok)} " in f" {norm(text)} "


def has_keyword(text, kw):
    t = norm(text)
    return all(part in t for part in norm(kw).split())


def build_plan(kw, m):
    plan = []
    for mod in m["questions"]:
        plan += [("questions", mod, f"{mod} {kw}"), ("questions", mod, f"{kw} {mod}")]
    plan += [("prepositions", mod, f"{kw} {mod}") for mod in m["prepositions"]]
    plan += [("comparisons", mod, f"{kw} {mod}") for mod in m["comparisons"]]
    plan += [("alphabeticals", c, f"{kw} {c}") for c in "abcdefghijklmnopqrstuvwxyz"]
    plan += [("numbers", n, f"{kw} {n}") for n in "0123456789"]
    plan += [("related", None, kw), ("related", None, f"{kw} ")]
    return plan


def gparams(hl, gl, ds=None):
    p = {"client": "chrome", "ie": "utf-8", "oe": "utf-8", "hl": hl, "gl": gl}
    return {**p, "ds": ds} if ds else p


def parse_google(data):
    return data[1] if isinstance(data, list) and len(data) > 1 else []


def parse_bing(data):
    out = []
    for r in (data.get("AS") or {}).get("Results") or []:
        for s in r.get("Suggests") or []:
            if s.get("Type") != "SC":
                out.append(s["Txt"])
    return out


# fonte: (endpoint, params(hl, gl), parser)
SOURCES = {
    "google": (ENDPOINT, lambda hl, gl: gparams(hl, gl), parse_google),
    "youtube": (ENDPOINT, lambda hl, gl: gparams(hl, gl, "yt"), parse_google),
    "shopping": (ENDPOINT, lambda hl, gl: gparams(hl, gl, "sh"), parse_google),
    "bing": (BING_ENDPOINT, lambda hl, gl: {"mkt": f"{hl}-{gl.upper()}"}, parse_bing),
}


def fetch(q, hl, gl, src):
    endpoint, params, parse = SOURCES[src]
    url = endpoint + "?" + urllib.parse.urlencode({**params(hl, gl), "q": q})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode("utf-8"))
        time.sleep(0.12)
        return parse(data)
    except Exception:
        return None


def assemble(kw, plan, results, hl, gl, src):
    groups, assigned, leftovers = {}, set(), []
    for (group, mod, q), res in zip(plan, results):
        g = groups.setdefault(group, {"modifiers": []})
        m = next((x for x in g["modifiers"] if x["name"] == mod), None)
        if m is None:
            m = {"name": mod, "items": []}
            g["modifiers"].append(m)
        for s in res or []:
            key = norm(s)
            if key == norm(q):
                continue
            by_word = group in ("alphabeticals", "numbers") or has_token(s, mod or "")
            if group != "related" and has_keyword(s, kw) and by_word:
                if all(norm(x) != key for x in m["items"]):
                    m["items"].append(s)
                assigned.add(key)
            else:
                leftovers.append(s)
    rel = groups["related"]["modifiers"][0]
    seen = {norm(kw)}
    for s in leftovers:
        k = norm(s)
        if k not in assigned and k not in seen:
            seen.add(k)
            rel["items"].append(s)
    for g in groups.values():
        g["count"] = sum(len(m["items"]) for m in g["modifiers"])
    return {
        "keyword": kw, "hl": hl, "gl": gl, "src": src,
        "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": f"{src}-autocomplete", "groups": groups,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("keyword")
    ap.add_argument("--hl", default="it", help="idioma: pt, it, en, es")
    ap.add_argument("--gl", default="it", help="país: it, br, pt, us, gb, es, fr, de")
    ap.add_argument("-o", "--out", default="-")
    ap.add_argument("--source", default="google", choices=list(SOURCES))
    args = ap.parse_args()

    mods_all = json.loads((HERE / "site" / "modifiers.json").read_text(encoding="utf-8"))
    kw = " ".join(args.keyword.split())
    plan = build_plan(kw, mods_all.get(args.hl, mods_all["en"]))
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda step: fetch(step[2], args.hl, args.gl, args.source), plan))

    failed = sum(r is None for r in results)
    data = assemble(kw, plan, results, args.hl, args.gl, args.source)
    out = json.dumps(data, ensure_ascii=False, indent=1)
    if args.out == "-":
        print(out)
    else:
        Path(args.out).write_text(out, encoding="utf-8")
    counts = ", ".join(f"{k}={g['count']}" for k, g in data["groups"].items())
    print(f"{args.source}: {len(plan)} consultas, {failed} falharam. {counts}", file=sys.stderr)
    sys.exit(1 if failed == len(plan) else 0)


if __name__ == "__main__":
    main()
