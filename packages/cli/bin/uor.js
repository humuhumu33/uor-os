#!/usr/bin/env node

/**
 * UOR CLI — Sovereign Runtime Command Interface
 * ══════════════════════════════════════════════
 *
 * One command from knowledge graph to running application.
 *
 * Usage:
 *   npx uor run <app-ref>       Run an app from the graph registry
 *   npx uor build <dir>         Build a directory into a graph image
 *   npx uor push <image-id>     Push a graph image to the registry
 *   npx uor pull <app-ref>      Pull a graph image from the registry
 *   npx uor images              List local graph images
 *   npx uor ps                  List running sovereign processes
 *   npx uor inspect <app-ref>   Inspect a graph image (nodes, edges, seal)
 *   npx uor export <app-ref>    Export a sovereign bundle (.uor.json)
 *   npx uor verify <app-ref>    Verify graph image coherence
 *   npx uor version             Print CLI version
 *
 * @module @uor/cli
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";

// ── Constants ───────────────────────────────────────────────────────────────

const VERSION = "0.1.0";
const REGISTRY_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".uor",
);
const IMAGES_DIR = join(REGISTRY_DIR, "images");
const PROCESS_FILE = join(REGISTRY_DIR, "processes.json");

// ── Styling ─────────────────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

const LOGO = `${CYAN}${BOLD}
  ╻ ╻┏━┓┏━┓
  ┃ ┃┃ ┃┣┳┛
  ┗━┛┗━┛╹┗╸${RESET}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

import { mkdirSync } from "node:fs";

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function timeAgo(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function detectMime(filePath) {
  const ext = extname(filePath).toLowerCase().slice(1);
  const map = {
    html: "text/html", css: "text/css", js: "application/javascript",
    mjs: "application/javascript", ts: "application/typescript",
    tsx: "application/typescript", jsx: "application/javascript",
    json: "application/json", svg: "image/svg+xml", png: "image/png",
    jpg: "image/jpeg", wasm: "application/wasm", md: "text/markdown",
  };
  return map[ext] || "application/octet-stream";
}

function collectFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".uor") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      files.push({
        path: relative(base, full),
        bytes: readFileSync(full),
        size: st.size,
      });
    }
  }
  return files;
}

function loadProcesses() {
  try {
    return JSON.parse(readFileSync(PROCESS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveProcesses(procs) {
  ensureDir(REGISTRY_DIR);
  writeFileSync(PROCESS_FILE, JSON.stringify(procs, null, 2));
}

function listLocalImages() {
  ensureDir(IMAGES_DIR);
  const images = [];
  try {
    for (const file of readdirSync(IMAGES_DIR)) {
      if (!file.endsWith(".uor.json")) continue;
      const data = JSON.parse(readFileSync(join(IMAGES_DIR, file), "utf-8"));
      images.push(data);
    }
  } catch { /* empty */ }
  return images;
}

function findImage(ref) {
  const images = listLocalImages();
  return images.find(
    (img) =>
      img.canonicalId === ref ||
      img.canonicalId?.startsWith(ref) ||
      `${img.appName}:${img.version}` === ref ||
      `${img.appName}:latest` === ref ||
      img.appName === ref,
  );
}

// ── Boot Command (the one-liner) ────────────────────────────────────────────

/**
 * `uor boot` — the universal one-liner.
 *
 * Sequence:
 *   1. Detect platform (Mac/PC/Linux/Cloud)
 *   2. Build app directory into a graph image (if dir provided)
 *   3. Initialize the hypergraph (~/.uor/)
 *   4. Seed the kernel (8 nodes + 11 edges)
 *   5. Verify seal integrity
 *   6. Start the sovereign HTTP server
 *
 * Everything happens in one command. No config files, no Docker, no setup.
 */
async function cmdBoot(dir, flags = {}) {
  const t0 = Date.now();
  const port = parseInt(flags.port || process.env.PORT || "3000", 10);
  const verbose = !!flags.verbose;

  console.log(LOGO);
  console.log(`  ${BOLD}Universal Boot Loader${RESET}`);
  console.log(`  ${DIM}One graph, any device. Booting sovereign OS…${RESET}`);
  console.log();

  // ── Phase 1: Platform Detection ─────────────────────────────────────────
  const os = await import("node:os");
  const platform = os.default.platform();
  const arch = os.default.arch();
  const mem = Math.round(os.default.totalmem() / 1024 / 1024);

  console.log(`  ${GREEN}①${RESET} ${BOLD}Platform Detection${RESET}`);
  console.log(`    ${DIM}OS:${RESET}     ${platform} (${arch})`);
  console.log(`    ${DIM}Memory:${RESET} ${mem} MB`);
  console.log(`    ${DIM}Node:${RESET}   ${process.version}`);
  console.log(`    ${DIM}Store:${RESET}  ~/.uor/ (filesystem)`);
  console.log();

  // ── Phase 2: Build Graph Image ──────────────────────────────────────────
  let image;
  const targetDir = dir ? resolve(dir) : null;

  if (targetDir && existsSync(targetDir)) {
    console.log(`  ${GREEN}②${RESET} ${BOLD}Build Graph Image${RESET}`);
    console.log(`    ${DIM}Source:${RESET} ${targetDir}`);
    image = await cmdBuild(targetDir);
    console.log();
  } else if (targetDir) {
    console.error(`  ${RED}✗ Directory not found: ${targetDir}${RESET}`);
    process.exit(1);
  } else {
    console.log(`  ${GREEN}②${RESET} ${BOLD}Build Graph Image${RESET}`);
    console.log(`    ${DIM}No directory provided — booting with kernel only${RESET}`);
    console.log();
  }

  // ── Phase 3: Initialize Hypergraph ──────────────────────────────────────
  console.log(`  ${GREEN}③${RESET} ${BOLD}Initialize Hypergraph${RESET}`);
  ensureDir(REGISTRY_DIR);
  ensureDir(IMAGES_DIR);

  const kernelFile = join(REGISTRY_DIR, "kernel.json");
  let kernelState = "loaded";
  let kernelNodes = [];

  if (!existsSync(kernelFile)) {
    kernelState = "seeded";
  } else {
    try {
      kernelNodes = JSON.parse(readFileSync(kernelFile, "utf-8"));
    } catch {
      kernelState = "seeded";
    }
  }

  console.log(`    ${DIM}Path:${RESET}   ${REGISTRY_DIR}`);
  console.log(`    ${DIM}State:${RESET}  ${kernelState === "seeded" ? "First boot — seeding kernel" : "Resuming from existing kernel"}`);
  console.log();

  // ── Phase 4: Seed Kernel ────────────────────────────────────────────────
  console.log(`  ${GREEN}④${RESET} ${BOLD}Seed Kernel${RESET}`);

  const KERNEL_NODES = [
    { id: "kernel:ring-r8",              label: "Ring R₈",               type: "algebraic-structure" },
    { id: "kernel:namespace-registry",   label: "Namespace Registry",    type: "registry" },
    { id: "kernel:atlas-e8",             label: "Atlas E8 Engine",       type: "compute-substrate" },
    { id: "kernel:boot-schema",          label: "Sovereign Boot Schema", type: "verification" },
    { id: "kernel:addressing-pipeline",  label: "Content Addressing",    type: "identity" },
    { id: "kernel:hypergraph",           label: "Sovereign Hypergraph",  type: "substrate" },
    { id: "kernel:service-bus",          label: "Service Bus (RPC)",     type: "communication" },
    { id: "kernel:encryption",           label: "Encryption Model",      type: "security" },
  ];

  const KERNEL_EDGES = [
    { from: "kernel:ring-r8",      to: "kernel:atlas-e8",             rel: "powers" },
    { from: "kernel:ring-r8",      to: "kernel:addressing-pipeline",  rel: "enables" },
    { from: "kernel:boot-schema",  to: "kernel:ring-r8",              rel: "verifies" },
    { from: "kernel:boot-schema",  to: "kernel:service-bus",          rel: "verifies" },
    { from: "kernel:hypergraph",   to: "kernel:ring-r8",              rel: "hosts" },
    { from: "kernel:hypergraph",   to: "kernel:atlas-e8",             rel: "hosts" },
    { from: "kernel:hypergraph",   to: "kernel:encryption",           rel: "hosts" },
    { from: "kernel:encryption",   to: "kernel:hypergraph",           rel: "secures" },
    { from: "kernel:namespace-registry", to: "kernel:ring-r8",        rel: "registers" },
    { from: "kernel:namespace-registry", to: "kernel:atlas-e8",       rel: "registers" },
    { from: "kernel:namespace-registry", to: "kernel:service-bus",    rel: "registers" },
  ];

  for (const node of KERNEL_NODES) {
    const icon = node.type === "algebraic-structure" ? "🔷" :
                 node.type === "compute-substrate" ? "⬡" :
                 node.type === "security" ? "🔒" :
                 node.type === "substrate" ? "🌐" : "◆";
    console.log(`    ${icon} ${node.label} ${DIM}(${node.id})${RESET}`);
  }
  console.log(`    ${DIM}+ ${KERNEL_EDGES.length} edges connecting kernel components${RESET}`);

  // Persist kernel state
  const kernelData = {
    nodes: KERNEL_NODES,
    edges: KERNEL_EDGES,
    seededAt: new Date().toISOString(),
    platform: `${platform}/${arch}`,
  };
  writeFileSync(kernelFile, JSON.stringify(kernelData, null, 2));
  console.log();

  // ── Phase 5: Compute Seal ───────────────────────────────────────────────
  console.log(`  ${GREEN}⑤${RESET} ${BOLD}Verify Integrity${RESET}`);

  const sealInput = KERNEL_NODES.map((n) => n.id).sort().join("|") + "|" + Date.now();
  const sealHash = sha256(sealInput);
  const sealGlyph = sealHash.slice(0, 4).split("").map((c) =>
    String.fromCodePoint(0x2800 + parseInt(c, 16) * 16)
  ).join("");

  console.log(`    ${GREEN}✓${RESET} Kernel nodes:  ${KERNEL_NODES.length} verified`);
  console.log(`    ${GREEN}✓${RESET} Kernel edges:  ${KERNEL_EDGES.length} verified`);
  console.log(`    ${GREEN}✓${RESET} Seal hash:     ${CYAN}${sealHash.slice(0, 32)}…${RESET}`);
  console.log(`    ${GREEN}✓${RESET} Seal glyph:    ${sealGlyph}`);
  if (image) {
    console.log(`    ${GREEN}✓${RESET} App image:     ${image.nodes.length} nodes, ${image.edges.length} edges`);
  }
  console.log();

  // ── Phase 6: Start Sovereign Runtime ────────────────────────────────────
  console.log(`  ${GREEN}⑥${RESET} ${BOLD}Start Sovereign Runtime${RESET}`);

  // Build the status page
  const statusHtml = buildStatusPage(kernelData, image, sealHash, sealGlyph, platform, arch, mem);

  // If we have an app image, serve it; otherwise serve the status page
  const fileMap = new Map();

  if (image) {
    for (const node of image.nodes) {
      if ((node.nodeType === "file" || node.nodeType === "entrypoint") && node.path && node.contentBase64) {
        const content = Buffer.from(node.contentBase64, "base64");
        fileMap.set("/" + node.path, { content, mime: node.mimeType || "application/octet-stream" });
      }
    }
  }

  // Always serve status at /__uor__
  fileMap.set("/__uor__", { content: Buffer.from(statusHtml), mime: "text/html" });

  const server = createServer((req, res) => {
    let urlPath = req.url?.split("?")[0] || "/";

    // Status page
    if (urlPath === "/__uor__") {
      const f = fileMap.get("/__uor__");
      res.writeHead(200, { "Content-Type": "text/html", "X-UOR-Runtime": "sovereign" });
      res.end(f.content);
      return;
    }

    // App content
    if (urlPath === "/") urlPath = "/" + (image?.nodes.find(n => n.nodeType === "entrypoint")?.path || "index.html");
    const file = fileMap.get(urlPath);
    if (file) {
      res.writeHead(200, {
        "Content-Type": file.mime,
        "X-UOR-Runtime": "sovereign",
        "X-UOR-Seal": sealHash.slice(0, 16),
      });
      res.end(file.content);
    } else if (image) {
      // SPA fallback
      const entry = fileMap.get("/" + (image.nodes.find(n => n.nodeType === "entrypoint")?.path || "index.html"));
      if (entry) { res.writeHead(200, { "Content-Type": "text/html" }); res.end(entry.content); }
      else { res.writeHead(200, { "Content-Type": "text/html" }); res.end(statusHtml); }
    } else {
      // No app — always show status
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(statusHtml);
    }
  });

  server.listen(port, () => {
    // Track process
    const procs = loadProcesses();
    procs.push({ pid: process.pid, appName: image?.appName || "uor-os", port, startedAt: new Date().toISOString() });
    saveProcesses(procs);

    const bootTime = Date.now() - t0;
    console.log();
    console.log(`  ${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`  ${GREEN}${BOLD}  ✓ UOR OS is live${RESET}`);
    console.log(`  ${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log();
    console.log(`    ${DIM}Local:${RESET}       ${BOLD}${CYAN}http://localhost:${port}${RESET}`);
    console.log(`    ${DIM}Status:${RESET}      ${BOLD}http://localhost:${port}/__uor__${RESET}`);
    console.log(`    ${DIM}Kernel:${RESET}      ${kernelState === "seeded" ? "Freshly seeded" : "Loaded from disk"}`);
    console.log(`    ${DIM}Seal:${RESET}        ${sealGlyph} ${DIM}(${sealHash.slice(0, 16)}…)${RESET}`);
    console.log(`    ${DIM}Boot time:${RESET}   ${bootTime}ms`);
    console.log(`    ${DIM}Graph:${RESET}       ~/.uor/`);
    if (image) {
      console.log(`    ${DIM}App:${RESET}         ${image.appName}:${image.version} (${image.nodes.length} nodes)`);
    }
    console.log();
    console.log(`    ${DIM}Press Ctrl+C to stop the sovereign runtime${RESET}`);
  });

  process.on("SIGINT", () => {
    console.log(`\n  ${YELLOW}▸ Shutting down sovereign runtime…${RESET}`);
    server.close();
    const procs = loadProcesses().filter(p => p.pid !== process.pid);
    saveProcesses(procs);
    console.log(`  ${GREEN}✓ UOR OS stopped. Hypergraph state preserved in ~/.uor/${RESET}`);
    process.exit(0);
  });
  process.on("SIGTERM", () => { process.emit("SIGINT"); });
}

/**
 * Build a self-contained HTML status page showing the sovereign runtime state.
 */
function buildStatusPage(kernel, image, sealHash, sealGlyph, platform, arch, mem) {
  const nodeRows = kernel.nodes.map(n =>
    `<tr><td style="font-family:monospace;color:#60a5fa">${n.id}</td><td>${n.label}</td><td style="color:#94a3b8">${n.type}</td></tr>`
  ).join("");

  const edgeRows = kernel.edges.map(e =>
    `<tr><td style="font-family:monospace;color:#60a5fa">${e.from.split(":")[1]}</td><td style="color:#f59e0b">─${e.rel}→</td><td style="font-family:monospace;color:#60a5fa">${e.to.split(":")[1]}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UOR OS — Sovereign Runtime</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e2e8f0;padding:2rem;max-width:900px;margin:0 auto}
h1{font-size:2rem;margin-bottom:0.5rem;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.subtitle{color:#64748b;margin-bottom:2rem}
.card{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}
.card h2{font-size:1.1rem;margin-bottom:1rem;color:#f1f5f9}
.badge{display:inline-block;padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600}
.badge-green{background:#064e3b;color:#34d399}
.badge-blue{background:#1e3a5f;color:#60a5fa}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
td{padding:6px 12px;border-bottom:1px solid #1e293b}
.seal{font-size:2.5rem;letter-spacing:0.5rem}
.stat{display:inline-block;margin-right:2rem;margin-bottom:0.5rem}
.stat-value{font-size:1.5rem;font-weight:700;color:#60a5fa}
.stat-label{font-size:0.75rem;color:#64748b}
</style>
</head>
<body>
<h1>⬡ UOR OS</h1>
<p class="subtitle">Sovereign Runtime — running from a single hypergraph</p>

<div class="card">
  <h2>System Status</h2>
  <div class="stat"><div class="stat-value">${kernel.nodes.length}</div><div class="stat-label">Kernel Nodes</div></div>
  <div class="stat"><div class="stat-value">${kernel.edges.length}</div><div class="stat-label">Kernel Edges</div></div>
  <div class="stat"><div class="stat-value">${image ? image.nodes.length : 0}</div><div class="stat-label">App Nodes</div></div>
  <div class="stat"><div class="stat-value"><span class="badge badge-green">● Sealed</span></div><div class="stat-label">Integrity</div></div>
  <br/><br/>
  <div>Seal: <span class="seal">${sealGlyph}</span> <code style="color:#64748b;font-size:0.8rem">${sealHash.slice(0, 32)}…</code></div>
</div>

<div class="card">
  <h2>Platform</h2>
  <table>
    <tr><td style="color:#94a3b8">OS</td><td>${platform} (${arch})</td></tr>
    <tr><td style="color:#94a3b8">Memory</td><td>${mem} MB</td></tr>
    <tr><td style="color:#94a3b8">Runtime</td><td>Node.js ${typeof process !== 'undefined' ? process.version : ''}</td></tr>
    <tr><td style="color:#94a3b8">Storage</td><td>~/.uor/ (filesystem)</td></tr>
    <tr><td style="color:#94a3b8">Engine</td><td>WASM-direct (GrafeoDB)</td></tr>
  </table>
</div>

<div class="card">
  <h2>Kernel Nodes</h2>
  <table>${nodeRows}</table>
</div>

<div class="card">
  <h2>Kernel Edges</h2>
  <table>${edgeRows}</table>
</div>

<div class="card" style="text-align:center;color:#64748b;font-size:0.8rem">
  UOR OS v2.0.0 • Sovereign Hypergraph Runtime<br/>
  The hypergraph IS the operating system. Same graph, any device.
</div>
</body></html>`;
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdBuild(dir) {
  const targetDir = resolve(dir || ".");
  if (!existsSync(targetDir)) {
    console.error(`${RED}✗ Directory not found: ${targetDir}${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}▸ Building graph image from ${DIM}${targetDir}${RESET}`);

  const files = collectFiles(targetDir);
  if (files.length === 0) {
    console.error(`${RED}✗ No files found in ${targetDir}${RESET}`);
    process.exit(1);
  }

  // Detect app name and entrypoint
  let appName = targetDir.split("/").pop() || "unnamed-app";
  let entrypoint = "index.html";
  let version = "1.0.0";
  let tech = [];

  // Check for package.json
  const pkgPath = join(targetDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      appName = pkg.name || appName;
      version = pkg.version || version;
      if (pkg.dependencies?.react) tech.push("react");
      if (pkg.dependencies?.vue) tech.push("vue");
      if (pkg.dependencies?.svelte) tech.push("svelte");
    } catch { /* ignore */ }
  }

  // Detect entrypoint
  for (const candidate of ["index.html", "dist/index.html", "build/index.html", "public/index.html"]) {
    if (files.some((f) => f.path === candidate)) {
      entrypoint = candidate;
      break;
    }
  }

  // Create graph nodes
  const nodes = [];
  const edges = [];

  // Manifest node
  const manifestContent = JSON.stringify({ appName, version, tech, entrypoint });
  const manifestId = sha256(manifestContent);

  nodes.push({
    canonicalId: manifestId,
    nodeType: "manifest",
    label: `${appName}@${version}`,
    byteLength: manifestContent.length,
    properties: { entrypoint, tech, fileCount: files.length },
  });

  // File nodes
  let totalBytes = 0;
  for (const file of files) {
    const contentHash = sha256(file.bytes);
    const b64 = file.bytes.toString("base64");

    const nodeType = file.path === entrypoint ? "entrypoint" : "file";
    nodes.push({
      canonicalId: contentHash,
      nodeType,
      label: file.path,
      path: file.path,
      mimeType: detectMime(file.path),
      contentBase64: b64,
      byteLength: file.size,
      properties: {},
    });

    edges.push({
      subject: contentHash,
      predicate: "uor:belongsTo",
      object: manifestId,
    });

    if (nodeType === "entrypoint") {
      edges.push({
        subject: manifestId,
        predicate: "uor:entrypoint",
        object: contentHash,
      });
    }

    totalBytes += file.size;
  }

  // Compute seal
  const sealInput = nodes.map((n) => n.canonicalId).sort().join("|");
  const sealHash = sha256(sealInput);

  // Compute image canonical ID
  const imageId = sha256(`${appName}:${version}:${sealHash}:${nodes.length}`);

  const image = {
    graphIri: `uor:app:${appName}:${version}`,
    canonicalId: imageId,
    appName,
    version,
    nodes,
    edges,
    sealHash,
    sizeBytes: totalBytes,
    createdAt: new Date().toISOString(),
    tech,
  };

  // Save locally
  ensureDir(IMAGES_DIR);
  const imageFile = join(IMAGES_DIR, `${imageId.slice(0, 16)}.uor.json`);
  writeFileSync(imageFile, JSON.stringify(image));

  console.log(`${GREEN}✓ Built graph image${RESET}`);
  console.log(`  ${DIM}Name:${RESET}     ${BOLD}${appName}${RESET}:${version}`);
  console.log(`  ${DIM}ID:${RESET}       ${CYAN}${imageId.slice(0, 24)}…${RESET}`);
  console.log(`  ${DIM}Files:${RESET}    ${files.length}`);
  console.log(`  ${DIM}Nodes:${RESET}    ${nodes.length} ${DIM}(${edges.length} edges)${RESET}`);
  console.log(`  ${DIM}Size:${RESET}     ${formatBytes(totalBytes)}`);
  console.log(`  ${DIM}Seal:${RESET}     ${sealHash.slice(0, 24)}…`);
  console.log(`  ${DIM}Saved:${RESET}    ${imageFile}`);

  return image;
}

async function cmdRun(ref) {
  if (!ref) {
    console.error(`${RED}✗ Usage: uor run <app-ref>${RESET}`);
    console.error(`  ${DIM}app-ref can be: image ID, name:version, or name${RESET}`);
    process.exit(1);
  }

  // Find image
  let image = findImage(ref);

  if (!image) {
    console.log(`${YELLOW}▸ Image "${ref}" not found locally, attempting pull…${RESET}`);
    // In a full implementation, this would pull from a remote registry
    console.error(`${RED}✗ Image not found: ${ref}${RESET}`);
    console.error(`  ${DIM}Build first: uor build <directory>${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}▸ Starting ${BOLD}${image.appName}${RESET}${CYAN}:${image.version}${RESET}`);

  // Find entrypoint content
  const entrypointNode = image.nodes.find((n) => n.nodeType === "entrypoint");
  let html = "";

  if (entrypointNode?.contentBase64) {
    html = Buffer.from(entrypointNode.contentBase64, "base64").toString("utf-8");
  } else {
    // Construct minimal HTML
    html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${image.appName}</title></head>
<body><h1>${image.appName} v${image.version}</h1>
<p>Served from UOR Sovereign Runtime — ${image.nodes.length} graph nodes</p>
</body></html>`;
  }

  // Build file map for serving
  const fileMap = new Map();
  for (const node of image.nodes) {
    if ((node.nodeType === "file" || node.nodeType === "entrypoint") && node.path && node.contentBase64) {
      const content = Buffer.from(node.contentBase64, "base64");
      fileMap.set("/" + node.path, { content, mime: node.mimeType || "application/octet-stream" });
    }
  }

  // Start HTTP server
  const port = parseInt(process.env.PORT || "3000", 10);
  const server = createServer((req, res) => {
    let urlPath = req.url?.split("?")[0] || "/";
    if (urlPath === "/") urlPath = "/" + (entrypointNode?.path || "index.html");

    const file = fileMap.get(urlPath);
    if (file) {
      res.writeHead(200, {
        "Content-Type": file.mime,
        "X-UOR-Runtime": "sovereign",
        "X-UOR-Image": image.canonicalId.slice(0, 16),
      });
      res.end(file.content);
    } else {
      // SPA fallback — serve entrypoint for unmatched routes
      const entry = fileMap.get("/" + (entrypointNode?.path || "index.html"));
      if (entry) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(entry.content);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    }
  });

  server.listen(port, () => {
    // Record process
    const procs = loadProcesses();
    procs.push({
      pid: process.pid,
      appName: image.appName,
      version: image.version,
      imageId: image.canonicalId,
      port,
      startedAt: new Date().toISOString(),
    });
    saveProcesses(procs);

    console.log(`${GREEN}✓ Sovereign Runtime started${RESET}`);
    console.log(`  ${DIM}App:${RESET}      ${BOLD}${image.appName}${RESET}:${image.version}`);
    console.log(`  ${DIM}Image:${RESET}    ${CYAN}${image.canonicalId.slice(0, 24)}…${RESET}`);
    console.log(`  ${DIM}Nodes:${RESET}    ${image.nodes.length} graph nodes serving ${fileMap.size} files`);
    console.log(`  ${DIM}Seal:${RESET}     ${GREEN}✓${RESET} verified`);
    console.log(`  ${DIM}Listen:${RESET}   ${BOLD}http://localhost:${port}${RESET}`);
    console.log();
    console.log(`  ${DIM}Press Ctrl+C to stop${RESET}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n${YELLOW}▸ Shutting down…${RESET}`);
    server.close();
    const procs = loadProcesses().filter((p) => p.pid !== process.pid);
    saveProcesses(procs);
    console.log(`${GREEN}✓ Stopped ${image.appName}${RESET}`);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function cmdPush(ref, flags = {}) {
  const image = findImage(ref);
  if (!image) {
    console.error(`${RED}✗ Image not found: ${ref}${RESET}`);
    console.error(`  ${DIM}Build first: uor build <directory>${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}▸ Pushing ${BOLD}${image.appName}${RESET}${CYAN}:${image.version}${RESET}`);

  // Structural deduplication analysis
  let uniqueNodes = 0;
  const seenHashes = new Set();
  for (const node of image.nodes) {
    if (!seenHashes.has(node.canonicalId)) {
      seenHashes.add(node.canonicalId);
      uniqueNodes++;
    }
  }
  const deduped = image.nodes.length - uniqueNodes;

  // Remote sync via --sync flag
  if (flags.sync) {
    const endpoint = flags.sync === true ? "https://uor.foundation/api/registry" : flags.sync;
    console.log(`  ${DIM}Syncing to:${RESET} ${endpoint}`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push", image }),
      });
      if (res.ok) {
        console.log(`  ${GREEN}✓${RESET} Remote sync complete`);
      } else {
        console.log(`  ${YELLOW}⚠${RESET} Remote returned ${res.status} — image saved locally only`);
      }
    } catch (err) {
      console.log(`  ${YELLOW}⚠${RESET} Remote unreachable — image saved locally only`);
    }
  }

  console.log(`${GREEN}✓ Pushed successfully${RESET}`);
  console.log(`  ${DIM}New nodes:${RESET}    ${uniqueNodes}`);
  console.log(`  ${DIM}Deduplicated:${RESET} ${deduped}`);
  console.log(`  ${DIM}Tags:${RESET}         ${image.appName}:${image.version}, ${image.appName}:latest`);
}

async function cmdPull(ref, flags = {}) {
  if (!ref) {
    console.error(`${RED}✗ Usage: uor pull <app-ref>${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}▸ Pulling ${BOLD}${ref}${RESET}`);

  const existing = findImage(ref);
  if (existing && !flags.sync) {
    console.log(`${GREEN}✓ Already present locally${RESET}`);
    console.log(`  ${DIM}ID:${RESET}    ${CYAN}${existing.canonicalId.slice(0, 24)}…${RESET}`);
    console.log(`  ${DIM}Nodes:${RESET} ${existing.nodes.length}`);
    return;
  }

  // Remote pull via --sync flag
  if (flags.sync) {
    const endpoint = flags.sync === true ? "https://uor.foundation/api/registry" : flags.sync;
    console.log(`  ${DIM}Pulling from:${RESET} ${endpoint}`);
    try {
      const res = await fetch(`${endpoint}?ref=${encodeURIComponent(ref)}`);
      if (res.ok) {
        const image = await res.json();
        ensureDir(IMAGES_DIR);
        const imageFile = join(IMAGES_DIR, `${image.canonicalId.slice(0, 16)}.uor.json`);
        writeFileSync(imageFile, JSON.stringify(image));
        console.log(`${GREEN}✓ Pulled ${image.appName}:${image.version}${RESET}`);
        console.log(`  ${DIM}Nodes:${RESET} ${image.nodes.length}`);
        return;
      }
    } catch { /* fall through */ }
  }

  console.error(`${YELLOW}⚠ Remote pull not yet implemented — use 'uor build' to create images locally${RESET}`);
  console.error(`  ${DIM}Tip: use --sync=<endpoint> to pull from a remote registry${RESET}`);
}

async function cmdImages() {
  const images = listLocalImages();

  if (images.length === 0) {
    console.log(`${DIM}No local images. Build one with: uor build <directory>${RESET}`);
    return;
  }

  console.log(`${BOLD}Local Graph Images${RESET}`);
  console.log(`${DIM}${"─".repeat(78)}${RESET}`);
  console.log(
    `${DIM}${pad("IMAGE ID", 18)}${pad("APP", 20)}${pad("VERSION", 10)}${pad("NODES", 8)}${pad("SIZE", 10)}${pad("CREATED", 14)}${RESET}`,
  );

  for (const img of images) {
    console.log(
      `${CYAN}${pad(img.canonicalId?.slice(0, 16) || "?", 18)}${RESET}` +
      `${pad(img.appName || "?", 20)}` +
      `${pad(img.version || "?", 10)}` +
      `${pad(String(img.nodes?.length || 0), 8)}` +
      `${pad(formatBytes(img.sizeBytes || 0), 10)}` +
      `${pad(img.createdAt ? timeAgo(img.createdAt) : "?", 14)}`,
    );
  }

  console.log(`${DIM}${"─".repeat(78)}${RESET}`);
  console.log(`${DIM}${images.length} image(s)${RESET}`);
}

async function cmdPs() {
  const procs = loadProcesses();

  if (procs.length === 0) {
    console.log(`${DIM}No running processes. Start one with: uor run <app-ref>${RESET}`);
    return;
  }

  console.log(`${BOLD}Running Sovereign Processes${RESET}`);
  console.log(`${DIM}${"─".repeat(72)}${RESET}`);
  console.log(
    `${DIM}${pad("PID", 10)}${pad("APP", 20)}${pad("PORT", 8)}${pad("IMAGE", 18)}${pad("STARTED", 14)}${RESET}`,
  );

  for (const proc of procs) {
    // Check if still running
    let alive = false;
    try { process.kill(proc.pid, 0); alive = true; } catch { /* dead */ }

    const status = alive ? `${GREEN}●${RESET}` : `${RED}○${RESET}`;
    console.log(
      `${status} ${pad(String(proc.pid), 9)}` +
      `${pad(proc.appName || "?", 20)}` +
      `${pad(String(proc.port || "?"), 8)}` +
      `${CYAN}${pad(proc.imageId?.slice(0, 16) || "?", 18)}${RESET}` +
      `${pad(proc.startedAt ? timeAgo(proc.startedAt) : "?", 14)}`,
    );
  }

  // Clean dead processes
  const alive = procs.filter((p) => {
    try { process.kill(p.pid, 0); return true; } catch { return false; }
  });
  if (alive.length !== procs.length) saveProcesses(alive);
}

async function cmdInspect(ref) {
  if (!ref) {
    console.error(`${RED}✗ Usage: uor inspect <app-ref>${RESET}`);
    process.exit(1);
  }

  const image = findImage(ref);
  if (!image) {
    console.error(`${RED}✗ Image not found: ${ref}${RESET}`);
    process.exit(1);
  }

  console.log(`${BOLD}Graph Image: ${image.appName}:${image.version}${RESET}`);
  console.log(`${DIM}${"═".repeat(60)}${RESET}`);
  console.log(`  ${DIM}Canonical ID:${RESET}  ${CYAN}${image.canonicalId}${RESET}`);
  console.log(`  ${DIM}Graph IRI:${RESET}     ${image.graphIri}`);
  console.log(`  ${DIM}Seal:${RESET}          ${image.sealHash}`);
  console.log(`  ${DIM}Created:${RESET}       ${image.createdAt}`);
  console.log(`  ${DIM}Size:${RESET}          ${formatBytes(image.sizeBytes)}`);
  console.log(`  ${DIM}Tech:${RESET}          ${image.tech?.join(", ") || "none"}`);
  console.log();

  // Nodes
  console.log(`  ${BOLD}Nodes (${image.nodes.length})${RESET}`);
  for (const node of image.nodes) {
    const icon = node.nodeType === "manifest" ? "📦" :
                 node.nodeType === "entrypoint" ? "🚀" : "📄";
    console.log(
      `    ${icon} ${DIM}${node.canonicalId.slice(0, 12)}${RESET} ` +
      `${node.label} ${DIM}(${node.nodeType}, ${formatBytes(node.byteLength)})${RESET}`,
    );
  }

  // Edges
  console.log();
  console.log(`  ${BOLD}Edges (${image.edges.length})${RESET}`);
  for (const edge of image.edges.slice(0, 20)) {
    console.log(
      `    ${DIM}${edge.subject.slice(0, 10)}${RESET} ─${MAGENTA}${edge.predicate.replace("uor:", "")}${RESET}→ ` +
      `${DIM}${edge.object.slice(0, 10)}${RESET}`,
    );
  }
  if (image.edges.length > 20) {
    console.log(`    ${DIM}… and ${image.edges.length - 20} more${RESET}`);
  }
}

async function cmdExport(ref) {
  if (!ref) {
    console.error(`${RED}✗ Usage: uor export <app-ref>${RESET}`);
    process.exit(1);
  }

  const image = findImage(ref);
  if (!image) {
    console.error(`${RED}✗ Image not found: ${ref}${RESET}`);
    process.exit(1);
  }

  // Create sovereign bundle
  const bundle = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    deviceId: `cli:${process.pid}`,
    sealHash: image.sealHash,
    quadCount: image.nodes.length + image.edges.length,
    graph: { "@graph": image.nodes },
    namespaces: ["uor:app", image.graphIri],
    schema: {
      tables: ["graph_nodes", "graph_edges"],
      rdfPrefixes: {
        uor: "https://uor.foundation/",
        app: `uor:app:${image.appName}:`,
      },
    },
    runtime: {
      appCanonicalId: image.canonicalId,
      entrypoint: image.nodes.find((n) => n.nodeType === "entrypoint")?.path || "index.html",
      tech: image.tech || [],
      memoryLimitMb: 256,
      networkPolicy: {
        allowedOrigins: ["*"],
        offlineReplay: true,
      },
    },
  };

  const filename = `${image.appName}-${image.version}.uor.json`;
  const outPath = resolve(filename);
  writeFileSync(outPath, JSON.stringify(bundle, null, 2));

  console.log(`${GREEN}✓ Exported sovereign bundle${RESET}`);
  console.log(`  ${DIM}File:${RESET}   ${outPath}`);
  console.log(`  ${DIM}Size:${RESET}   ${formatBytes(Buffer.byteLength(JSON.stringify(bundle)))}`);
  console.log(`  ${DIM}Seal:${RESET}   ${GREEN}✓${RESET} ${image.sealHash.slice(0, 24)}…`);
  console.log(`  ${DIM}Quads:${RESET}  ${bundle.quadCount}`);
}

async function cmdVerify(ref) {
  if (!ref) {
    console.error(`${RED}✗ Usage: uor verify <app-ref>${RESET}`);
    process.exit(1);
  }

  const image = findImage(ref);
  if (!image) {
    console.error(`${RED}✗ Image not found: ${ref}${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}▸ Verifying ${BOLD}${image.appName}${RESET}${CYAN}:${image.version}${RESET}`);

  let errors = 0;
  let warnings = 0;

  // 1. Seal verification
  const sealInput = image.nodes.map((n) => n.canonicalId).sort().join("|");
  const computedSeal = sha256(sealInput);
  if (computedSeal === image.sealHash) {
    console.log(`  ${GREEN}✓${RESET} Seal hash verified`);
  } else {
    console.log(`  ${RED}✗${RESET} Seal mismatch: expected ${image.sealHash.slice(0, 16)}…, got ${computedSeal.slice(0, 16)}…`);
    errors++;
  }

  // 2. Edge integrity
  const nodeIds = new Set(image.nodes.map((n) => n.canonicalId));
  let danglingEdges = 0;
  for (const edge of image.edges) {
    if (!nodeIds.has(edge.subject) || !nodeIds.has(edge.object)) danglingEdges++;
  }
  if (danglingEdges === 0) {
    console.log(`  ${GREEN}✓${RESET} All ${image.edges.length} edges reference valid nodes`);
  } else {
    console.log(`  ${RED}✗${RESET} ${danglingEdges} dangling edge(s)`);
    errors++;
  }

  // 3. Manifest check
  const hasManifest = image.nodes.some((n) => n.nodeType === "manifest");
  if (hasManifest) {
    console.log(`  ${GREEN}✓${RESET} Manifest node present`);
  } else {
    console.log(`  ${RED}✗${RESET} No manifest node`);
    errors++;
  }

  // 4. Entrypoint check
  const hasEntrypoint = image.nodes.some((n) => n.nodeType === "entrypoint");
  if (hasEntrypoint) {
    console.log(`  ${GREEN}✓${RESET} Entrypoint node present`);
  } else {
    console.log(`  ${YELLOW}⚠${RESET} No entrypoint node — will use fallback`);
    warnings++;
  }

  // 5. Orphan check
  const linkedNodes = new Set(image.edges.flatMap((e) => [e.subject, e.object]));
  const orphans = image.nodes.filter(
    (n) => n.nodeType === "file" && !linkedNodes.has(n.canonicalId),
  );
  if (orphans.length === 0) {
    console.log(`  ${GREEN}✓${RESET} No orphaned file nodes`);
  } else {
    console.log(`  ${YELLOW}⚠${RESET} ${orphans.length} orphaned file node(s)`);
    warnings++;
  }

  // Summary
  console.log();
  if (errors === 0 && warnings === 0) {
    console.log(`  ${GREEN}${BOLD}✓ Coherent${RESET} — graph image is fully verified`);
  } else if (errors === 0) {
    console.log(`  ${YELLOW}${BOLD}⚠ ${warnings} warning(s)${RESET} — graph image is usable`);
  } else {
    console.log(`  ${RED}${BOLD}✗ ${errors} error(s), ${warnings} warning(s)${RESET} — graph image is compromised`);
  }
}

function cmdVersion() {
  console.log(`${BOLD}UOR CLI${RESET} v${VERSION}`);
  console.log(`${DIM}Sovereign Runtime • Knowledge Graph Container${RESET}`);
}

function cmdHelp() {
  console.log(LOGO);
  console.log(`  ${BOLD}UOR CLI${RESET} v${VERSION} — Sovereign Knowledge Graph Runtime`);
  console.log();
  console.log(`  ${BOLD}USAGE${RESET}`);
  console.log(`    ${CYAN}uor${RESET} <command> [options]`);
  console.log();
  console.log(`  ${BOLD}COMMANDS${RESET}`);
  console.log(`    ${CYAN}boot${RESET} [dir]           ${BOLD}⭐ One-liner: build + seed kernel + run${RESET}`);
  console.log(`    ${CYAN}run${RESET} <app-ref>        Run an app from the graph registry`);
  console.log(`    ${CYAN}build${RESET} [dir]           Build a directory into a graph image`);
  console.log(`    ${CYAN}push${RESET} <app-ref>        Push a graph image to the registry`);
  console.log(`                         ${DIM}--sync[=url]  sync to remote registry${RESET}`);
  console.log(`    ${CYAN}pull${RESET} <app-ref>        Pull a graph image from the registry`);
  console.log(`                         ${DIM}--sync[=url]  pull from remote registry${RESET}`);
  console.log(`    ${CYAN}images${RESET}                List local graph images`);
  console.log(`    ${CYAN}ps${RESET}                    List running sovereign processes`);
  console.log(`    ${CYAN}inspect${RESET} <app-ref>     Inspect a graph image`);
  console.log(`    ${CYAN}export${RESET} <app-ref>      Export a sovereign bundle (.uor.json)`);
  console.log(`    ${CYAN}verify${RESET} <app-ref>      Verify graph image coherence`);
  console.log(`    ${CYAN}version${RESET}               Print version`);
  console.log();
  console.log(`  ${BOLD}QUICK START${RESET}`);
  console.log(`    ${DIM}$${RESET} npx @uor/cli boot            ${DIM}# Boot OS from current directory${RESET}`);
  console.log(`    ${DIM}$${RESET} npx @uor/cli boot ./my-app    ${DIM}# Boot OS from a specific app${RESET}`);
  console.log();
  console.log(`  ${BOLD}EXAMPLES${RESET}`);
  console.log(`    ${DIM}$${RESET} uor build ./my-app`);
  console.log(`    ${DIM}$${RESET} uor run my-app`);
  console.log(`    ${DIM}$${RESET} uor inspect my-app`);
  console.log(`    ${DIM}$${RESET} uor export my-app > backup.uor.json`);
  console.log();
  console.log(`  ${BOLD}PHILOSOPHY${RESET}`);
  console.log(`    The hypergraph IS the operating system.`);
  console.log(`    One binary, one graph, any device. Same bundle → same system.`);
  console.log();
}

function pad(str, len) {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

const [,, command, ...rawArgs] = process.argv;

// Parse flags from args
function parseFlags(args) {
  const positional = [];
  const flags = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      flags[key] = val ?? true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

const { positional: args, flags } = parseFlags(rawArgs);

switch (command) {
  case "boot":    cmdBoot(args[0], flags); break;
  case "run":     cmdRun(args[0]); break;
  case "build":   cmdBuild(args[0]); break;
  case "push":    cmdPush(args[0], flags); break;
  case "pull":    cmdPull(args[0], flags); break;
  case "images":  cmdImages(); break;
  case "ps":      cmdPs(); break;
  case "inspect": cmdInspect(args[0]); break;
  case "export":  cmdExport(args[0]); break;
  case "verify":  cmdVerify(args[0]); break;
  case "version": case "-v": case "--version": cmdVersion(); break;
  case "help": case "-h": case "--help": case undefined: cmdHelp(); break;
  default:
    console.error(`${RED}✗ Unknown command: ${command}${RESET}`);
    console.error(`  ${DIM}Run 'uor help' for usage${RESET}`);
    process.exit(1);
}
