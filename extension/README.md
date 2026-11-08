# AskWheel PAA (extension)

Brings Google's People Also Ask into AskWheel automatically: on each search on the site, the extension opens the search on Google in a background tab, expands the questions, returns the map to the site and closes the tab. It stores nothing and sends no data to any server other than Google.

Permissions: `www.google.com` (read PAA), the AskWheel pages (talk to the site) and `storage` (only `storage.session`, in memory: keeps the request id and the Google tab id while it is open, so the collection survives the background script going to sleep).

## Install (until it is on the stores)

Download `askwheel-paa.zip` from the **Extensão PAA** tab on the site (or use this folder) and unzip it.

- **Chrome, Edge, Brave, Opera, Vivaldi**: open `chrome://extensions` (in Opera `opera://extensions`), turn on **Developer mode**, click **Load unpacked** and choose the `extension/` folder.
- **Firefox**: open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → choose `extension/manifest.json`. It goes away when Firefox closes; permanent install comes with the AMO release.

Then reload AskWheel and search: the question map shows up in about 20 seconds.

## How it works

- `site.js`: runs on the AskWheel pages, sets `<html data-askwheel-ext>` and relays requests and responses (`window.postMessage` ↔ background).
- `background.js`: opens the Google tab (one at a time: a new request closes the previous one) and injects `readPaa` (same logic as the `public/paa.js` bookmarklet; changes in Google's DOM affect both).
- Captcha or cookie screen: the Google tab stays open and visible for the user to solve; once back on the search, collection continues by itself (the script is injected on every load of the tab).
- Site domains are in `manifest.json` (`content_scripts.matches`): adjust them if the site moves to another address.

## Local development

The distributed `manifest.json` only matches `askwheel.pages.dev` (and the `*.askwheel.pages.dev` previews): with `localhost` in `matches`, any app running on the machine could request Google tabs with your session. To test with `python3 -m http.server 5173 --directory public`, add by hand, only in your local copy, to `content_scripts.matches`:

```json
"http://localhost/*", "http://127.0.0.1/*"
```

Reload the extension at `chrome://extensions` (or `about:debugging`). Don't commit this change and don't regenerate `public/askwheel-paa.zip` with it.
