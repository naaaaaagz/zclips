# ZedTheCyclist Pilgrimage Map

An interactive map of memorable clips from ZedTheCyclist's journeys. Places are loaded from the public pilgrimage spreadsheet and shown on a dark, zoomable map with Twitch clip playback.

## Open the standalone map

Double-click `open-map.cmd`. It opens the standalone map through a small local web address, which Twitch requires for embedded clip playback. Keep the command window open while using it.

Opening `index.html` directly still displays the map and pins, but Twitch rejects clip embeds on `file://` pages.

## Local development

The public site is `index.html`, a static page containing a snapshot of the Sheet, not a live Sheet connection.
The vinext app only serves `/api/live`, which the static page calls for the Twitch LIVE badge.

- `node scripts/generate-standalone.mjs` reads the Sheet and refreshes the static page and `data/places-snapshot.json`.
- `.github/workflows/refresh-map-data.yml` runs the generator every day at 03:17 UTC (and on demand from the Actions tab) and publishes the page only when the clip data changed. A broken Sheet fails the run instead of publishing.
- `node scripts/generate-standalone.mjs --offline` updates the static page's code using its existing data, without contacting the Sheet.
- Edit titles, description and keywords in `data/site-meta.json`. The generator builds the page's title and meta tags from it.
- Shared parsing, clip IDs, prefetch scheduling and modal keyboard behavior live in `public/map-utils.mjs`; the generator copies it to the static page's root.
- Run `node scripts/test-regressions.mjs` and `node scripts/validate-standalone.mjs` after generation, then `pnpm build` for the `/api/live` server.

Twitch availability failures return an uncached error, not a confirmed offline status.

```bash
pnpm install
pnpm dev
```
