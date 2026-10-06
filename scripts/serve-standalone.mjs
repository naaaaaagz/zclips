import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { extname, join, normalize, sep } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 4173;
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".geojson": "application/geo+json; charset=utf-8",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer(async (request, response) => {
  let target;
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    target = normalize(join(root, relative));
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  // Serve only files inside the project, and never dotfiles such as .git or .env.
  if (!target.startsWith(root) || target.slice(root.length).split(sep).some((part) => part.startsWith("."))) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const details = await stat(target);
    if (!details.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": types[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ZedTheCyclist map is running at http://localhost:${port}`);
  console.log("Keep this window open while using the map. Press Ctrl+C to stop.");
});
