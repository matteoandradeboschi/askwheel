# AskWheel

Free, static search-listening site (AnswerThePublic-style): one search box: keyword + modifiers → autocomplete from Google and Google Shopping at once (`SITE_SOURCES`, JSONP from the visitor's browser) → one sunburst (D3) + table panel per source, plus a People Also Ask mind map (horizontal tree, same look as the `paa-mapa` skill). YouTube and Bing stay in `SOURCES` only for skill data. Hosted on Cloudflare Pages (free). No backend, no analytics. Amazon, TikTok, Google Trends block browser requests (CORS): the site can't offer them (would need a proxy), but the skill supports them (Python, no CORS); Instagram isn't reachable without login. People Also Ask needs a real Google results page (JS-rendered), so the site collects it with a bookmarklet (`public/paa.js`) the visitor runs on google.com, which sends data back via `#paa=` in the URL; the site then re-runs the search so everything shows together.

## Layout

- `public/` is the deploy root (upload as-is to Cloudflare Pages).
- `public/app.js`: collection (`buildPlan`, `jsonp`, `assemble`), panels (wheel, table, extras), PAA map (`drawMap`), UI. Also renders preloaded data from `window.__WHEEL_DATA__` (used by the skill's standalone HTML).
- `public/paa.js`: PAA bookmarklet source. `app.js` fetches it, replaces `'__SITE__'` with the site URL and sets it as the `javascript:` link. No `//` comments (it becomes a URL). Keep the `void` before the IIFE: Firefox replaces the page with a bookmarklet's return value. Depends on Google's DOM (`.related-question-pair[data-q]`, `[role=button][aria-expanded]`): breaks if Google changes it.
- `extension/`: optional browser extension (MV3, one code for Chrome/Firefox, no build) that fetches PAA automatically: `site.js` (content script on the site, `postMessage` bridge, sets `data-askwheel-ext`), `background.js` (opens Google in a background tab, injects `readPaa`, a copy of the `paa.js` logic: change both together). Site domains are hardcoded in `manifest.json` `matches`. Served to visitors as `public/askwheel-paa.zip` (install steps in the **Extensão PAA** tab): after changing the extension, regenerate it with `cd extension && zip -qr ../public/askwheel-paa.zip manifest.json background.js site.js`.
- `public/modifiers.json`: modifiers per language. Single source for site and skill.
- `public/skill/`: optional Claude Code skill, served by the site and installed with the command in the **Skill p/ Claude Code** tab.
  - `collect.py`: same collection logic as `app.js` in Python (stdlib only). Also has skill-only sources `amazon`, `tiktok`, `trends` (`LOCAL_SOURCES`); `app.js` knows them only in `SKILL_SOURCES` (label/link for preloaded data).
  - `render.py`: inlines `site/index.html`, `style.css`, `app.js`, `modifiers.json` + data (+ Claude extras) into one HTML.

## Rules

- Grouping logic exists twice (`app.js` `assemble` and `collect.py` `assemble`): change both together.
- Keep both on the same endpoint params (`SOURCES` in each file: `client=chrome`, `ie/oe=utf-8`, `ds=yt|sh`; Bing `qsonhs.aspx`, skipping `Type: "SC"`). Python omits only the JSONP wiring: `callback=` for Google/YouTube/Shopping, `type=cb&cb=` for Bing (with `type=cb` Bing returns JS, not JSON).
- No build step, no npm deps. D3 from cdnjs pinned to `7.9.0` with SRI (`integrity` in `index.html`: update the hash if the version changes).
- `public/_headers` (Cloudflare Pages) sets the CSP: a new external script host (CDN, JSONP endpoint) must be added to `script-src`, or it is blocked.
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
