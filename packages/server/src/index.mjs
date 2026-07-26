/**
 * Agentic Platform — Server Entry
 *
 * 獨立的 Agentic Workflow Platform。
 * 不依賴 PAAW。自帶 MCP Hub + Agent Runner + HTTP API + 靜態 UI。
 *
 * Port: 4200 (configurable via PORT env)
 */

import http from "http";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve, extname, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");  // packages/server/src/ → root
const PORT = process.env.PORT || 4200;
const UI_DIST = resolve(ROOT, "packages", "ui", "dist");
const DATA_ROOT = resolve(ROOT, "data");

// ── State ──
const PATHS = {
  ROOT,
  DATA_ROOT,
  WORKFLOWS_ROOT: join(DATA_ROOT, "workflows"),
  CHAT_DIR: join(DATA_ROOT, "chats"),
  CONFIG_DIR: join(DATA_ROOT, "config"),
  MCP_CONFIG: join(DATA_ROOT, "config", "mcp-servers.json"),
  PROVIDERS_CONFIG: join(DATA_ROOT, "config", "providers.json"),
  PROVIDERS_LOCAL: join(DATA_ROOT, "config", "providers.local.json"),
};

// ── Route handler ──
import { handleWorkflowRoutes } from "./routes/workflow.mjs";

async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // ── API routes ──
  if (path.startsWith("/api/")) {
    const handled = await handleWorkflowRoutes(req, res, path, PATHS);
    if (handled) return;
  }

  // ── Static UI ──
  if (req.method === "GET") {
    let filePath = path === "/" ? "/index.html" : path;
    const fullPath = join(UI_DIST, filePath);

    if (existsSync(fullPath)) {
      const ext = extname(fullPath);
      const types = {
        ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
        ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
        ".ico": "image/x-icon", ".woff2": "font/woff2",
      };
      try {
        const data = await readFile(fullPath);
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        res.end(data);
        return;
      } catch {}
    }

    // SPA fallback
    const indexFile = join(UI_DIST, "index.html");
    if (existsSync(indexFile)) {
      const data = await readFile(indexFile);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found", path }));
}

// ── Body reader ──
export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

// ── JSON response helper ──
export function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ── Start ──

// Use providers.local.json (gitignored) if exists
if (existsSync(PATHS.PROVIDERS_LOCAL)) {
  PATHS.PROVIDERS_CONFIG = PATHS.PROVIDERS_LOCAL;
  console.log(`[agentic] Using providers.local.json (override)`);
}

// Load MCP Hub on startup
try {
  const { loadMCPServers } = await import("./lib/mcp-hub.mjs");
  await loadMCPServers(PATHS.MCP_CONFIG, PATHS.ROOT);
} catch (err) {
  console.error(`[agentic] MCP Hub failed to load:`, err.message);
}

const server = http.createServer(handler);

server.listen(PORT, () => {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  🤖 Agentic Platform v1.0.0              ║`);
  console.log(`║  Listening on http://localhost:${PORT}       ║`);
  console.log(`║  Data: ${DATA_ROOT.slice(-30).padStart(30)} ║`);
  console.log(`╚══════════════════════════════════════════╝`);
});
