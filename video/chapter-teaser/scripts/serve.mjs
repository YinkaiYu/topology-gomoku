import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const PV_ROOT = path.resolve(SCRIPT_DIR, "..");
const TOPOLOGY_SCRIPTS = new Set([
  path.join(REPOSITORY_ROOT, "app", "assets", "topology.js"),
  path.join(REPOSITORY_ROOT, "app", "assets", "topology-morph.js")
]);
const PREVIEW_PATH = "/video/chapter-teaser/preview.html";
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"]
]);

const parsed = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "4173" },
    open: { type: "boolean", default: false },
    profile: { type: "string", default: "review" },
    frame: { type: "string" },
    channel: { type: "string", default: "msedge" },
    help: { type: "boolean", short: "h", default: false }
  }
});

if (parsed.values.help) {
  process.stdout.write([
    "Usage: node video/chapter-teaser/scripts/serve.mjs [options]",
    "",
    "  --host ADDRESS              Bind address (default: 127.0.0.1)",
    "  --port NUMBER               Port (default: 4173)",
    "  --open                      Open the preview with Playwright",
    "  --profile review|master     Preview dimensions",
    "  --frame N                   Initial frame",
    "  --channel NAME              Browser channel (default: msedge)"
  ].join("\n") + "\n");
  process.exit(0);
}

const port = Number(parsed.values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("--port must be an integer from 0 to 65535");
}
if (!new Set(["review", "master"]).has(parsed.values.profile)) {
  throw new Error("--profile must be review or master");
}

function sendError(response, status, message) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(`${message}\n`);
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl || "/", "http://localhost");
  const pathname = url.pathname === "/" ? PREVIEW_PATH : decodeURIComponent(url.pathname);
  const relative = pathname.replace(/^\/+/, "");
  const resolved = path.resolve(REPOSITORY_ROOT, relative);
  const rootWithSeparator = `${REPOSITORY_ROOT}${path.sep}`;
  if (resolved !== REPOSITORY_ROOT && !resolved.startsWith(rootWithSeparator)) {
    return null;
  }
  const pvWithSeparator = `${PV_ROOT}${path.sep}`;
  if (!resolved.startsWith(pvWithSeparator) && !TOPOLOGY_SCRIPTS.has(resolved)) return null;
  return resolved;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method not allowed");
    return;
  }
  let filePath;
  try {
    filePath = resolveRequestPath(request.url);
  } catch {
    sendError(response, 400, "Invalid request path");
    return;
  }
  if (!filePath) {
    sendError(response, 403, "Forbidden");
    return;
  }
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const label = filePath.endsWith(`${path.sep}manifest.json`)
        ? "manifest.json is missing; run the PV audio build first"
        : "Not found";
      sendError(response, 404, label);
      return;
    }
    sendError(response, 500, "Unable to read file");
    return;
  }
  if (!stat.isFile()) {
    sendError(response, 404, "Not found");
    return;
  }
  const headers = {
    "content-type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!response.headersSent) sendError(response, 500, "Unable to stream file");
    else response.destroy();
  });
  stream.pipe(response);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, parsed.values.host, resolve);
});

const address = server.address();
const activePort = typeof address === "object" && address ? address.port : port;
const query = new URLSearchParams({ profile: parsed.values.profile });
if (parsed.values.frame != null) query.set("frame", parsed.values.frame);
const previewUrl = `http://${parsed.values.host}:${activePort}${PREVIEW_PATH}?${query}`;
process.stdout.write(`Chapter teaser preview: ${previewUrl}\n`);

let browser = null;
if (parsed.values.open) {
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({ channel: parsed.values.channel, headless: false });
    const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    await page.goto(previewUrl, { waitUntil: "networkidle" });
  } catch (error) {
    process.stderr.write(`Unable to open browser with Playwright: ${error.message}\n`);
  }
}

async function shutdown() {
  if (browser) await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}

process.once("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
