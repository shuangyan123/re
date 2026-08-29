import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const outputDirectory = resolve(process.cwd(), "website", "dist");
const port = Number(process.env.PORT ?? "4173");

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function resolveAsset(requestPath: string): Promise<string | null> {
  const decodedPath = decodeURIComponent(requestPath.split("?")[0] ?? "/");
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = resolve(outputDirectory, normalize(relativePath));
  const outputPrefix = `${outputDirectory}${process.platform === "win32" ? "\\" : "/"}`;
  if (candidate !== outputDirectory && !candidate.startsWith(outputPrefix)) {
    return null;
  }
  const candidates = decodedPath.endsWith("/")
    ? [join(candidate, "index.html")]
    : [candidate, join(candidate, "index.html")];
  for (const item of candidates) {
    try {
      const itemStat = await stat(item);
      if (itemStat.isFile()) {
        return item;
      }
    } catch {
      // Continue to the next safe candidate and return a normal 404 if absent.
    }
  }
  return null;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }
  try {
    const assetPath = await resolveAsset(request.url ?? "/");
    if (assetPath === null) {
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Not found</title><p>Not found</p>");
      return;
    }
    const content = await readFile(assetPath);
    response.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": contentTypes[extname(assetPath)] ?? "application/octet-stream",
    });
    if (request.method === "HEAD") {
      response.end();
    } else {
      response.end(content);
    }
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Website preview failed to read the requested asset.");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Tutor Benchmark website preview: http://127.0.0.1:${port}/`);
});
