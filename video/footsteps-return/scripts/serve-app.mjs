import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".woff2", "font/woff2"]
]);

function send(response, status, body) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(body);
}

function resolveRequest(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  } catch {
    return { status: 400 };
  }
  const requested = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  const relative = path.relative(root, requested);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { status: 403 };
  }
  return { path: requested };
}

export async function startStaticServer({ root, host = "127.0.0.1", port = 0 }) {
  const absoluteRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const resolved = resolveRequest(absoluteRoot, request.url || "/");
    if (resolved.status) {
      send(response, resolved.status, http.STATUS_CODES[resolved.status]);
      return;
    }
    let stats;
    try {
      stats = statSync(resolved.path);
    } catch {
      send(response, 404, "Not Found");
      return;
    }
    if (!stats.isFile()) {
      send(response, 404, "Not Found");
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes.get(path.extname(resolved.path).toLowerCase()) || "application/octet-stream",
      "content-length": stats.size,
      "cache-control": "no-store"
    });
    createReadStream(resolved.path).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
