#!/usr/bin/env node
/**
 * Opens the built site on this machine, with nothing to install.
 *
 * The pages ask for their stylesheet and script by absolute path (`/_astro/…`), which a browser cannot resolve
 * from a `file://` folder, so a folder of HTML is not openable by double-clicking. This is the smallest thing
 * that makes it openable: Node is already on the machine that built it, and this needs no package, no network
 * and no configuration.
 *
 *   node serve.mjs            serves this folder on http://localhost:4321
 *   node serve.mjs 8080       ... on another port
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 4321);

const TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
  }),
);

/** Resolves a URL inside this folder, refusing anything that climbs out of it. */
function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const target = path.join(ROOT, path.normalize(clean).replace(/^(\.\.[/\\])+/, ""));
  if (!target.startsWith(ROOT)) return null;
  for (const candidate of [target, `${target}.html`, path.join(target, "index.html")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

http
  .createServer((request, response) => {
    const file = resolve(request.url || "/") ?? resolve("/404.html");
    if (!file) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(file.endsWith("404.html") ? 404 : 200, {
      "Content-Type": TYPES.get(path.extname(file)) ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(PORT, () => {
    console.log(`SmartSpend documentation: http://localhost:${PORT}`);
    console.log("اقفل النافذة دي لما تخلص.");
  });
