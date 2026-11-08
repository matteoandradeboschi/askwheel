# AskWheel

Free *search listening* alternative: type a keyword and, in a single search, see questions, prepositions, comparisons, a–z, 0–9 and related searches from Google and Google Shopping autocomplete (wheel + table), plus the Google People Also Ask map. Static site, no backend: queries go from the visitor's browser straight to the source (JSONP). People Also Ask is collected by the [AskWheel PAA](extension/) extension (automatic) or by a bookmarklet, on the Google results page itself.

**Live site:** https://askwheel.pages.dev

## Features

- One search box: keyword + modifiers (questions, prepositions, comparisons, a–z, 0–9) → about 140 autocomplete queries to Google and Google Shopping, run from the visitor's browser.
- One sunburst wheel + table per source, plus a People Also Ask mind map.
- Search languages: Portuguese, Italian, English, Spanish. Site UI: Portuguese, English, Italian.
- No backend, no sign-up, no analytics, no build step. Hosted for free on Cloudflare Pages.

## Structure

```
extension/              # browser extension that fetches PAA automatically (served by the site as public/askwheel-paa.zip)
public/                 # the site (static, deployed as-is)
  index.html style.css i18n.js app.js
  paa.js                # People Also Ask bookmarklet
  modifiers.json        # modifiers per language
```

## Run locally

```bash
python3 -m http.server 5173 --directory public
```

Open http://localhost:5173. (Opening `index.html` directly via `file://` doesn't work for searching: `fetch('modifiers.json')` is blocked.)

## Limitations

- **No search volume or CPC.** There is no free source for that data; the site only shows what people type.
- **Unofficial endpoints.** Autocomplete is not a public API: Google may rate-limit, block or change it without notice. Results also vary by language, country and time.
- **Only Google and Google Shopping.** Amazon, TikTok and Google Trends block browser requests (CORS) and would need a proxy. Instagram requires login. YouTube and Bing are not shown on the site.
- **People Also Ask needs help.** It only exists on a real, JS-rendered Google results page, so it is collected by the [extension](extension/) or a bookmarklet. Desktop only, and only when Google shows the box. It depends on Google's DOM, so a layout change can break it. A captcha or cookie screen leaves the Google tab open for the visitor to solve.
- **Extension install is manual.** It is not on the Chrome/Firefox stores yet. In Firefox, a temporary add-on disappears when the browser closes.
- **Modifiers exist for pt, it, en, es only.** French and German searches fall back to the English modifiers.
- **Ad blockers** can block the JSONP queries.
- **Public-IP rate limits.** Queries come from each visitor's IP; heavy use may trigger Google's temporary throttling or captcha.
- **No automated tests or CI.** Checks are manual (see Contributing).

## Contributing

Small solo project, GitHub Flow: branch (`type/short-desc`) → PR → squash merge, Conventional Commits. Enable the local hook once per clone: `git config core.hooksPath .githooks`. Before a PR: `node --check public/app.js` and a manual search on the local server. Rules to keep in mind:

- No build step, no npm dependencies. D3 is loaded from cdnjs, pinned with SRI.
- UI strings live in `public/i18n.js`: add each one in `pt`, `en` and `it`.
- A new external script host must be added to `script-src` in `public/_headers` (CSP).
- After changing `extension/`, regenerate the zip: `cd extension && zip -qr ../public/askwheel-paa.zip manifest.json background.js site.js`.

## Privacy

Static site: no server, cookies or analytics. Queries go from the visitor's browser straight to Google. The extension stores nothing and talks only to google.com and the site.

## License

[MIT](LICENSE)
