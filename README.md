# ZedTheCyclist Pilgrimage Map

An interactive map of memorable clips from ZedTheCyclist's journeys. Places are loaded from the public pilgrimage spreadsheet and shown on a dark, zoomable map with Twitch clip playback.

## Open the standalone map

Double-click `open-map.cmd`. It opens the standalone map through a small local web address, which Twitch requires for embedded clip playback. Keep the command window open while using it.

Opening `index.html` directly still displays the map and pins, but Twitch rejects clip embeds on `file://` pages.

## Local development

There are two outputs: the React site loads live Sheet data through `/api/places`;
`index.html` is a static page containing a snapshot, not a live Sheet connection.

- `node scripts/generate-standalone.mjs` reads the Sheet and refreshes the static page and `data/places-snapshot.json`.
- `node scripts/generate-standalone.mjs --offline` updates the static page's code using its existing data, without contacting the Sheet.
- Edit titles, description and keywords in `data/site-meta.json`. Both outputs use this source; the existing description has been preserved.
- Shared parsing, clip IDs, prefetch scheduling and modal keyboard behavior live in `public/map-utils.mjs`; the generator copies it to the static page's root.
- Run `node scripts/test-regressions.mjs` and `node scripts/validate-standalone.mjs` after generation, then `pnpm build` for the React output.

If live data cannot load, the React site shows the last generated snapshot with
a retry message. This fallback can be older than the Sheet until the next refresh.
Twitch availability failures return an uncached error, not a confirmed offline status.

```bash
pnpm install
pnpm dev
```
