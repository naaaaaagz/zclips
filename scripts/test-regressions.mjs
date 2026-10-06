import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parseCoordinates, parseSheetPlaces, getClipId, normalizeClipDate, createTilePrefetcher, activateModalFocus } from "../public/map-utils.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.slice(html.indexOf('<script type="module">') + 22, html.lastIndexOf("</script>"));
const ast = ts.createSourceFile("static.js", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function staticFunction(name) {
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Missing static function ${name}`);
  return declaration.getText(ast);
}
function routeModule(path, fetcher, env = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const context = vm.createContext({ exports: {}, fetch: fetcher, process: { env },
    URL, URLSearchParams, Response, Request, AbortSignal, atob,
    require: (name) => name.includes("map-utils") ? { parseSheetPlaces } : {},
  });
  vm.runInContext(outputText, context);
  return context.exports;
}

test("coordinates reject blanks, partial coordinates, nonnumbers and out-of-range values", () => {
  for (const input of ["", ", ", "47,", ",19", "47,19,2", "91,19", "47,181", "?,19"]) {
    assert.equal(parseCoordinates(input), null);
  }
  assert.deepEqual(parseCoordinates(" 47.5, 19.1 "), { latitude: 47.5, longitude: 19.1 });
  assert.deepEqual(parseCoordinates("0,0"), { latitude: 0, longitude: 0 });
  const row = (name, coordinates) => ({ c: [name, "", "", "", "", coordinates].map((v) => ({ v })) });
  const places = parseSheetPlaces([row("Blank", ", "), row("Valid", "47,19"), row("Clip name", "47,19")]);
  assert.equal(places.length, 1);
  assert.equal(places[0].name, "Valid");
  assert.equal(getClipId("https://clips.twitch.tv/TestClip?x=1"), "TestClip");
  assert.equal(getClipId(" https://www.twitch.tv/zedthecyclist/clip/Name-Ab_1 "), "Name-Ab_1");
  for (const input of ["", "not a url", "https://example.com/x/clip/Fake", "https://clips.twitch.tv/embed", "javascript:alert(1)//clip/x"]) {
    assert.equal(getClipId(input), "");
  }
  assert.equal(normalizeClipDate("Date(2025,11,2)"), "2025-12-02");
  assert.equal(normalizeClipDate(" 2024-05-03 "), "2024-05-03");
  const [trimmed] = parseSheetPlaces([{ c: ["Name", " https://clips.twitch.tv/One ", "Budapest ", "", "", "47,19", "", " Hungary", "Date(2024,0,5)"].map((v) => ({ v })) }]);
  assert.equal(trimmed.clipUrl, "https://clips.twitch.tv/One");
  assert.equal(trimmed.category, "Budapest");
  assert.equal(trimmed.country, "Hungary");
  assert.equal(trimmed.clipDate, "2024-01-05");
});

test("empty search results stop pending camera movement without moving the camera", () => {
  let moves = 0, stopped = 0;
  const context = vm.createContext({ clearTimeout, setTimeout, fitTimer: 0,
    searchOrigin: { center: [0, 0], zoom: 4 },
    map: { stop: () => stopped++, easeTo: () => moves++, fitBounds: () => moves++ },
  });
  vm.runInContext(staticFunction("fitVisible") + ';fitVisible([], ["missing"]);', context);
  assert.equal(moves, 0);
  assert.equal(stopped, 1);
});

test("static modal keeps exactly one player and repeated layer clicks do not restart it", () => {
  const frames = [];
  let creations = 0;
  const context = vm.createContext({ clipId: getClipId, openedClipId: null, restoreModalFocus: null,
    location: { hostname: "localhost" }, clipName: {}, topBadge: {}, clipSourceKeywords: {},
    document: { createElement: () => { creations++; return {}; }, body: { classList: { add() {}, remove() {} } } },
    backdrop: { classList: { add() {}, remove() {} }, setAttribute() {}, querySelector() { return {}; } },
    player: { replaceChildren: (...items) => frames.splice(0, frames.length, ...items) },
    activateModalFocus: () => () => {},
  });
  vm.runInContext(staticFunction("openClip") + "\n" + staticFunction("closeModal"), context);
  context.place = { clipUrl: "https://clips.twitch.tv/One", name: "One" };
  vm.runInContext("openClip(place);openClip(place)", context);
  assert.equal(frames.length, 1);
  assert.equal(creations, 1);
  context.place = { clipUrl: "https://clips.twitch.tv/Two", name: "Two" };
  vm.runInContext("openClip(place)", context);
  assert.equal(frames.length, 1);
  vm.runInContext("closeModal()", context);
  assert.equal(frames.length, 0);
});

test("tile prefetch abandons stale queues and limits concurrent requests", async () => {
  const requests = [];
  const prefetcher = createTilePrefetcher((url, { signal }) => new Promise((resolve, reject) => {
    requests.push({ url, signal, resolve });
    signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
  }));
  prefetcher.update(Array.from({ length: 500 }, (_, i) => `old-${i}`));
  await new Promise(setImmediate);
  assert.equal(requests.length, 4);
  prefetcher.update(["current"]);
  await new Promise(setImmediate);
  assert.ok(requests.slice(0, 4).every(({ signal }) => signal.aborted));
  assert.equal(requests.at(-1).url, "current");
  assert.equal(requests.length, 5);
  requests.at(-1).resolve(new Response("ok"));
  await new Promise(setImmediate);
  prefetcher.dispose();
});

test("HTTP tile failures can be retried instead of being cached as successes", async () => {
  let calls = 0;
  const prefetcher = createTilePrefetcher(async () => { calls++; return new Response("bad", { status: 503 }); });
  prefetcher.update(["tile"]);
  await new Promise(setImmediate);
  prefetcher.update(["tile"]);
  await new Promise(setImmediate);
  assert.equal(calls, 2);
  prefetcher.dispose();
});

test("missing Twitch credentials and service failures are uncached errors, not offline", async () => {
  const missing = routeModule("../app/api/live/route.ts", () => { throw new Error("Unexpected fetch"); });
  const request = new Request("https://example.test/api/live", { headers: { Origin: "https://zedclips.nagz.space" } });
  const response = await missing.GET(request);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://zedclips.nagz.space");
  assert.equal((await response.json()).online, undefined);
  const failed = routeModule("../app/api/live/route.ts", async () => { throw new Error("Network"); },
    { TWITCH_CLIENT_ID: "test", TWITCH_CLIENT_SECRET: "test" });
  assert.equal((await failed.GET(request)).status, 503);
});

test("Twitch 401 refreshes the token once, then correctly reports LIVE or offline", async () => {
  const results = [
    { access_token: "test-token-one", expires_in: 3600 },
    null,
    { access_token: "test-token-two", expires_in: 3600 },
    { data: [{}] },
    { data: [] },
  ];
  let calls = 0;
  const route = routeModule("../app/api/live/route.ts", async () => {
    const index = calls++;
    return new Response(JSON.stringify(results[index]), { status: index === 1 ? 401 : 200 });
  }, { TWITCH_CLIENT_ID: "test", TWITCH_CLIENT_SECRET: "test" });
  const request = new Request("https://example.test/api/live");
  assert.equal((await (await route.GET(request)).json()).online, true);
  assert.equal(calls, 4);
  assert.equal((await (await route.GET(request)).json()).online, false);
  assert.equal(calls, 5);
});

test("modal focus enters, wraps, closes only the modal, then restores the trigger", () => {
  const listeners = new Map();
  const previousDocument = globalThis.document;
  const trigger = { isConnected: true, focus() { document.activeElement = this; } };
  const first = { focus() { document.activeElement = this; }, getClientRects: () => [1] };
  const last = { focus() { document.activeElement = this; }, getClientRects: () => [1] };
  const dialog = { querySelectorAll: () => [first, last], contains: (node) => node === first || node === last };
  globalThis.document = { activeElement: trigger, addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name) };
  try {
    let closed = 0, stopped = 0;
    const restore = activateModalFocus(dialog, () => closed++);
    assert.equal(document.activeElement, first);
    document.activeElement = last;
    listeners.get("keydown")({ key: "Tab", shiftKey: false, preventDefault() {} });
    assert.equal(document.activeElement, first);
    listeners.get("keydown")({ key: "Tab", shiftKey: true, preventDefault() {} });
    assert.equal(document.activeElement, last);
    listeners.get("keydown")({ key: "Escape", preventDefault() {}, stopImmediatePropagation() { stopped++; } });
    assert.equal(closed, 1);
    assert.equal(stopped, 1);
    restore();
    assert.equal(document.activeElement, trigger);
    assert.equal(listeners.size, 0);
  } finally { globalThis.document = previousDocument; }
});

test("static page uses the shared copies and the list no longer rebuilds every row", () => {
  for (const filename of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    assert.equal(readFileSync(new URL(`../public/${filename}`, import.meta.url), "utf8"),
      readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"));
  }
  assert.ok(!staticFunction("renderClipList").includes("replaceChildren"));
  assert.ok(staticFunction("renderClipList").includes("listRows.get(place.id)"));
  assert.equal(readFileSync(new URL("../public/map-utils.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../map-utils.mjs", import.meta.url), "utf8"));
});
