// Shared by the React site and the generated static page.
export function parseCoordinates(value) {
  const parts = String(value ?? "").split(",");
  if (parts.length !== 2 || parts.some((part) => !part.trim())) return null;
  const [latitude, longitude] = parts.map(Number);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null;
}

export function getClipId(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.hostname === "clips.twitch.tv") {
      const id = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? "";
      return id === "embed" ? "" : id;
    }
    if (url.hostname === "www.twitch.tv" || url.hostname === "twitch.tv") {
      return url.pathname.match(/^\/[^/]+\/clip\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? "";
    }
  } catch { /* Invalid or missing URL. */ }
  return "";
}

// Date-typed Sheet cells arrive as "Date(2025,11,22)" with a zero-based month.
// Return YYYY-MM-DD so sorting by text stays chronological.
export function normalizeClipDate(value) {
  const text = String(value ?? "").trim();
  const sheetDate = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/);
  if (sheetDate) {
    const [, year, month, day] = sheetDate;
    return `${year}-${String(Number(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return text;
}

export function parseSheetPlaces(rows, metadata = {}) {
  if (!Array.isArray(rows)) throw new Error("Invalid Sheet response");
  const cell = (row, index) => String(row.c?.[index]?.v ?? "");
  return rows.flatMap((row, index) => {
    const coordinates = parseCoordinates(cell(row, 5));
    const name = cell(row, 0).trim();
    if (!coordinates || !name || name === "Clip name") return [];
    const clipUrl = cell(row, 1).trim();
    const twitch = metadata[getClipId(clipUrl)] ?? {};
    return [{ id: index + 1, name, clipUrl, category: cell(row, 2).trim(),
      sourceKeywords: cell(row, 3), keywords: cell(row, 4), ...coordinates,
      twitchTitle: cell(row, 6), country: cell(row, 7).trim(), clipDate: normalizeClipDate(cell(row, 8)),
      top: cell(row, 9).trim().toUpperCase() === "TOP",
      twitchCategory: twitch.category ?? "" }];
  });
}

export function createTilePrefetcher(fetcher = globalThis.fetch) {
  const completed = new Set();
  const running = new Map();
  let queue = [];
  let desired = new Set();
  let disposed = false;
  function drain() {
    while (!disposed && running.size < 4 && queue.length) {
      const url = queue.shift();
      if (completed.has(url) || running.has(url)) continue;
      const controller = new AbortController();
      running.set(url, controller);
      const timeout = setTimeout(() => controller.abort(), 5000);
      Promise.resolve().then(() => fetcher(url, {
        cache: "force-cache", mode: "cors", signal: controller.signal,
      })).then((response) => {
        if (!response.ok) throw new Error("Tile request failed");
        return response.arrayBuffer();
      }).then(() => {
        if (controller.signal.aborted) return;
        completed.add(url);
        if (completed.size > 1600) completed.delete(completed.values().next().value);
      }).catch(() => {}).finally(() => {
        clearTimeout(timeout);
        running.delete(url);
        drain();
      });
    }
  }
  return {
    update(urls) {
      if (disposed) return;
      desired = new Set(urls.slice(0, 128));
      queue = [...desired].filter((url) => !completed.has(url) && !running.has(url));
      for (const [url, controller] of running) if (!desired.has(url)) controller.abort();
      drain();
    },
    dispose() {
      disposed = true;
      queue = [];
      for (const controller of running.values()) controller.abort();
    },
  };
}

export function activateModalFocus(dialog, onClose) {
  const previous = document.activeElement;
  const focusable = () => [...dialog.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex="0"]',
  )].filter((element) => element.getClientRects().length);
  const focusFirst = () => (focusable()[0] ?? dialog).focus();
  const keydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    } else if (event.key === "Tab") {
      const items = focusable();
      const first = items[0] ?? dialog;
      const last = items.at(-1) ?? dialog;
      if (!items.length || !dialog.contains(document.activeElement)
        || (event.shiftKey && document.activeElement === first)
        || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  };
  const focusin = (event) => { if (!dialog.contains(event.target)) focusFirst(); };
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("focusin", focusin);
  focusFirst();
  return () => {
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("focusin", focusin);
    if (previous?.isConnected && typeof previous.focus === "function") previous.focus();
  };
}
