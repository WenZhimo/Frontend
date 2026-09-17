const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");

const root = __dirname;
const startPort = Number(process.env.PORT || 5179);
const host = "127.0.0.1";

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

function safeResolve(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath || "/", `http://${host}/`).pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(root, requested);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function sendText(res, code, text) {
  const body = Buffer.from(text);
  res.writeHead(code, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": body.length
  });
  res.end(body);
}

function makeServer() {
  return http.createServer((req, res) => {
    const filePath = safeResolve(req.url);
    if (!filePath) {
      sendText(res, 403, "Forbidden");
      return;
    }

    fs.readFile(filePath, (error, body) => {
      if (error) {
        sendText(res, 404, "Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": types.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
        "content-length": body.length,
        "cache-control": "no-store"
      });
      res.end(body);
    });
  });
}

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  execFile("cmd.exe", ["/c", "start", "", url], { windowsHide: true }, () => {});
}

function listen(port) {
  const server = makeServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < startPort + 20) {
      listen(port + 1);
      return;
    }
    console.error(error.message || error);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const url = `http://${host}:${port}/`;
    console.log(`TTS waveform image generator: ${url}`);
    console.log("Press Ctrl+C to stop.");
    openBrowser(url);
  });
}

listen(startPort);
