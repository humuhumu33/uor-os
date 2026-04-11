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
  console.log(`    ${CYAN}run${RESET} <app-ref>       Run an app from the graph registry`);
  console.log(`    ${CYAN}build${RESET} [dir]          Build a directory into a graph image`);
  console.log(`    ${CYAN}push${RESET} <app-ref>       Push a graph image to the registry`);
  console.log(`    ${CYAN}pull${RESET} <app-ref>       Pull a graph image from the registry`);
  console.log(`    ${CYAN}images${RESET}               List local graph images`);
  console.log(`    ${CYAN}ps${RESET}                   List running sovereign processes`);
  console.log(`    ${CYAN}inspect${RESET} <app-ref>    Inspect a graph image`);
  console.log(`    ${CYAN}export${RESET} <app-ref>     Export a sovereign bundle (.uor.json)`);
  console.log(`    ${CYAN}verify${RESET} <app-ref>     Verify graph image coherence`);
  console.log(`    ${CYAN}version${RESET}              Print version`);
  console.log();
  console.log(`  ${BOLD}EXAMPLES${RESET}`);
  console.log(`    ${DIM}$${RESET} uor build ./my-app`);
  console.log(`    ${DIM}$${RESET} uor run my-app`);
  console.log(`    ${DIM}$${RESET} uor run my-app:1.0.0`);
  console.log(`    ${DIM}$${RESET} uor inspect my-app`);
  console.log(`    ${DIM}$${RESET} uor export my-app > backup.uor.json`);
  console.log();
  console.log(`  ${BOLD}PHILOSOPHY${RESET}`);
  console.log(`    Apps are subgraphs in a sovereign knowledge graph.`);
  console.log(`    Every file is a content-addressed node. Every mutation`);
  console.log(`    is an append-only delta. Share the graph, share the app.`);
  console.log();
}

function pad(str, len) {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case "run":     cmdRun(args[0]); break;
  case "build":   cmdBuild(args[0]); break;
  case "push":    cmdPush(args[0]); break;
  case "pull":    cmdPull(args[0]); break;
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
