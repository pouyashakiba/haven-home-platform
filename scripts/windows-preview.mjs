import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const clientRoot = resolve("dist/client");
const upstreamPort = Number(process.env.UPSTREAM_PORT || 3000);
const port = Number(process.env.PREVIEW_PORT || 3001);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function localAsset(pathname) {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const candidate = resolve(join(clientRoot, safePath));
  if (!candidate.startsWith(clientRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }
  return candidate;
}

const server = createServer((incoming, outgoing) => {
  const url = new URL(incoming.url || "/", `http://${incoming.headers.host || "localhost"}`);
  const asset = localAsset(url.pathname);

  if (asset) {
    outgoing.writeHead(200, {
      "Content-Type": contentTypes[extname(asset)] || "application/octet-stream",
      "Cache-Control": url.pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    });
    createReadStream(asset).pipe(outgoing);
    return;
  }

  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: incoming.url,
      method: incoming.method,
      headers: { ...incoming.headers, host: `127.0.0.1:${upstreamPort}` },
    },
    (response) => {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
    },
  );

  upstream.on("error", (error) => {
    outgoing.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    outgoing.end(`Preview upstream unavailable: ${error.message}`);
  });
  incoming.pipe(upstream);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Haven preview bridge: http://127.0.0.1:${port}`);
});
