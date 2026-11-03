#!/usr/bin/env python3
"""Gera um HTML único (offline, exceto o D3 via CDN) reaproveitando o site do AskWheel.

Uso: python3 render.py dados.json [extras.json] -o relatorio.html
Embute style.css, app.js, modifiers.json e os dados no index.html copiado do site.
"""
import argparse
import json
from html import escape
from pathlib import Path

SITE = Path(__file__).resolve().parent / "site"


def safe_json(obj):
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data")
    ap.add_argument("extras", nargs="?")
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()

    data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    if args.extras:
        data["extras"] = json.loads(Path(args.extras).read_text(encoding="utf-8"))

    html = (SITE / "index.html").read_text(encoding="utf-8")
    css = (SITE / "style.css").read_text(encoding="utf-8")
    js = (SITE / "app.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    mods = json.loads((SITE / "modifiers.json").read_text(encoding="utf-8"))

    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}</style>")
    html = html.replace(
        '<script src="app.js"></script>',
        f"<script>window.__WHEEL_MODIFIERS__={safe_json(mods)};\n"
        f"window.__WHEEL_DATA__={safe_json(data)};</script>\n<script>\n{js}</script>",
    )
    html = html.replace("<title>AskWheel</title>", f"<title>AskWheel: {escape(data['keyword'])}</title>")
    Path(args.out).write_text(html, encoding="utf-8")
    print(args.out)


if __name__ == "__main__":
    main()
