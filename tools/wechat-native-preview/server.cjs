"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const port = Number(process.env.TOPOLOGY_PREVIEW_PORT) || 4174;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "tools/wechat-native-preview/index.html" : pathname.slice(1);
  let candidate = path.resolve(root, relative);
  if (process.env.TOPOLOGY_SHARED_ASSETS && pathname.startsWith("/app/assets/")) {
    const shared = path.resolve(process.env.TOPOLOGY_SHARED_ASSETS);
    const file = path.resolve(shared, pathname.slice("/app/assets/".length));
    return file.startsWith(shared + path.sep) && fs.existsSync(file) ? file : null;
  }
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) {
    return null;
  }
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, "index.html");
  }
  if (!fs.existsSync(candidate) && !path.extname(candidate) && fs.existsSync(`${candidate}.js`)) {
    candidate = `${candidate}.js`;
  }
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

http.createServer((request, response) => {
  const file = resolveRequest(request.url || "/");
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`WeChat native preview: http://127.0.0.1:${port}/tools/wechat-native-preview/\n`);
});
