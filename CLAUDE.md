# AskWheel

Free, static search-listening site (AnswerThePublic-style): keyword + modifiers → autocomplete suggestions from one chosen source (Google, YouTube, Google Shopping, Bing) via JSONP from the visitor's browser → sunburst (D3) + table. Hosted on Cloudflare Pages (free). No backend, no analytics. Amazon, TikTok, Google Trends block browser requests (CORS) and would need a proxy; People Also Ask/Instagram aren't reachable without a headless browser or login.

## Layout

- `public/` is the deploy root (upload as-is to Cloudflare Pages).
- `public/app.js`: collection (`buildPlan`, `jsonp`, `assemble`), wheel, table, extras, UI. Also renders preloaded data from `window.__WHEEL_DATA__` (used by the skill's standalone HTML).
- `public/modifiers.json`: modifiers per language. Single source for site and skill.
- `public/skill/`: optional Claude Code skill, served by the site and installed with the command in the **Skill p/ Claude Code** tab.
  - `collect.py`: same collection logic as `app.js` in Python (stdlib only).
  - `render.py`: inlines `site/index.html`, `style.css`, `app.js`, `modifiers.json` + data (+ Claude extras) into one HTML.

## Rules

- Grouping logic exists twice (`app.js` `assemble` and `collect.py` `assemble`): change both together.
- Keep both on the same endpoint params (`SOURCES` in each file: `client=chrome`, `ie/oe=utf-8`, `ds=yt|sh`; Bing `qsonhs.aspx`, skipping `Type: "SC"`). Python omits only the JSONP wiring: `callback=` for Google/YouTube/Shopping, `type=cb&cb=` for Bing (with `type=cb` Bing returns JS, not JSON).
- No build step, no npm deps. D3 from cdnjs pinned to `7.9.0`.
- UI copy in Portuguese, sentence case.

## Test locally

```bash
python3 -m http.server 8000 --directory public
```

`file://` can't fetch `modifiers.json`, so use the server. Skill test: copy `public/skill/*` to a dir, copy site files into `<dir>/site/`, run `collect.py` then `render.py`.

## Git workflow

GitHub Flow (small solo project). Public repo; `main` protected by a GitHub ruleset (PR required, no force-push/deletion) and locally by `.githooks/pre-commit`, enable once per clone: `git config core.hooksPath .githooks`.

- Branches: `type/short-desc`. Types: feat, fix, docs, chore, refactor, test.
- PR body: what, why, how to test; `Closes #N`. Run `/code-review` before merging.
- Flow: `git switch main && git pull` → `git switch -c feat/x` → commits → `git push -u origin feat/x` → `gh pr create --fill` → `gh pr merge --squash --delete-branch`.
- Releases: none for now (the site deploys from `main`).
- CI: none yet (no automated tests). Local-only checks: `node --check public/app.js`, a real `collect.py` run (needs network to Google).
