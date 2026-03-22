# StackPR Chrome extension

- **Active on**: `https://github.com/*` (content scripts and primary host permission).
- **Production `manifest.json`**: only `https://github.com/*`. Fetching a **self-hosted API** requires adding that API origin to `host_permissions`, or using the dev manifest below.
- **`manifest.development.json`**: includes `http://localhost:3001/*` for local backend development. Copy it over `manifest.json` before loading unpacked, or merge the extra host permission manually.

## Popup

- **API base** — stored in `chrome.storage.local` (`stackprApiBase`); must match a permitted host.
- **PAT** — validated via `POST /api/auth/pat`, then stored locally (`stackprUserToken`).

## Background

The service worker loads stack data for the current PR page via `GET /api/repos/{owner}/{repo}/pr/{n}/stack`.

## Tests

```bash
npm install && npx playwright test
```
