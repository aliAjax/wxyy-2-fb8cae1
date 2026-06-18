#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "localhost";
const ROOT = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8"
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function sanitizePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))/g, "");
  return path.join(ROOT, resolved);
}

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  let filePath = sanitizePath(req.url);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    const duration = Date.now() - startTime;
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`404 Not Found: ${req.url}`);
        log(req, 404, duration);
      } else {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`500 Internal Server Error`);
        log(req, 500, duration);
      }
      return;
    }
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(data);
    log(req, 200, duration);
  });
});

function log(req, status, duration) {
  const method = req.method.padEnd(6);
  const statusStr = String(status).padStart(3);
  const durStr = `${duration}ms`.padStart(6);
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const colors = {
    2: "\x1b[32m",
    3: "\x1b[33m",
    4: "\x1b[31m",
    5: "\x1b[31m"
  };
  const reset = "\x1b[0m";
  const color = colors[String(status)[0]] || reset;
  console.log(`[${time}] ${method} ${color}${statusStr}${reset} ${durStr} ${req.url}`);
}

server.listen(PORT, HOST, () => {
  const banner = `
\x1b[36m╔══════════════════════════════════════════════╗
║  🚀 岩芯薄片显微照片索引台 - 开发服务器  ║
╠══════════════════════════════════════════════╣
║  本地访问: \x1b[1m\x1b[32mhttp://${HOST}:${PORT}\x1b[0m\x1b[36m              ║
║  主应用:   /index.html                    ║
║  测试页面:   /test.html                     ║
║  全量测试:   /tests/test-all.html          ║
║  按 Ctrl+C 停止服务                          ║
╚══════════════════════════════════════════════╝\x1b[0m
`;
  console.log(banner);
});

process.on("SIGINT", () => {
  console.log("\n\x1b[33m👋 服务已停止\x1b[0m");
  process.exit(0);
});
