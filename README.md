# AskWheel

Free *search listening* alternative: type a keyword and, in a single search, see questions, prepositions, comparisons, a–z, 0–9 and related searches from Google and Google Shopping autocomplete (wheel + table), plus the Google People Also Ask map. Static site, no backend: queries go from the visitor's browser straight to the source (JSONP). People Also Ask is collected by the [AskWheel PAA](extension/) extension (automatic) or by a bookmarklet, on the Google results page itself.

## Structure

```
extension/              # browser extension that fetches PAA automatically (served by the site as public/askwheel-paa.zip)
public/                 # everything that goes to Cloudflare Pages
  index.html style.css i18n.js app.js
  paa.js                # People Also Ask bookmarklet
  modifiers.json        # modifiers per language
```

## Run locally

```bash
python3 -m http.server 5173 --directory public
```

Open http://localhost:5173. (Opening `index.html` directly via `file://` doesn't work for searching: `fetch('modifiers.json')` is blocked.)

## Deploy to Cloudflare Pages (free)

No-install option (recommended):

1. Create an account at https://dash.cloudflare.com.
2. **Workers & Pages → Create → Pages → Upload assets**.
3. Name the project (it becomes `<name>.pages.dev`) and drag in the `public/` folder.
4. To update: **Create new deployment** in the same project and drag `public/` in again.

Command-line option (downloads wrangler via npx, no global install):

```bash
npx wrangler pages deploy public --project-name askwheel
```

## Limitations

- No search volume or CPC.
- Unofficial autocomplete endpoint: may rate-limit or change without notice.
