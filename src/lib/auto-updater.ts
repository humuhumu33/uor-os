/**
 * Auto-Updater — Checks for updates via Tauri's updater plugin.
 * Only runs in Tauri (native) context. No-ops gracefully in browser.
 *
 * @layer 0
 */

import { isLocal } from "./runtime";

export interface UpdateInfo {
  version: string;
  body: string;
  date: string;
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; info: UpdateInfo }
  | { state: "downloading"; progress: number }
  | { state: "ready" }
  | { state: "up-to-date" }
  | { state: "error"; message: string };

type Listener = (status: UpdateStatus) => void;

let _status: UpdateStatus = { state: "idle" };
const _listeners = new Set<Listener>();

function emit(s: UpdateStatus) {
  _status = s;
  _listeners.forEach((fn) => fn(s));
}

export function onUpdateStatus(fn: Listener): () => void {
  _listeners.add(fn);
  fn(_status);
  return () => _listeners.delete(fn);
}

export function getUpdateStatus(): UpdateStatus {
  return _status;
}

/**
 * Check for updates. If one is available, download & install it.
 * Safe to call from browser — will no-op.
 */
export async function checkForUpdates(): Promise<void> {
  if (!isLocal()) return;

  try {
    emit({ state: "checking" });

    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      emit({ state: "up-to-date" });
      return;
    }

    emit({
      state: "available",
      info: {
        version: update.version,
        body: update.body ?? "",
        date: update.date ?? "",
      },
    });

    // Start download + install
    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started" && event.data.contentLength) {
        contentLength = event.data.contentLength;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        const progress = contentLength > 0 ? downloaded / contentLength : 0;
        emit({ state: "downloading", progress: Math.min(progress, 1) });
      } else if (event.event === "Finished") {
        emit({ state: "ready" });
      }
    });

    emit({ state: "ready" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // "UpToDate" is not really an error
    if (message.includes("UpToDate") || message.includes("up to date")) {
      emit({ state: "up-to-date" });
    } else {
      emit({ state: "error", message });
    }
  }
}

/**
 * Schedule periodic update checks (every 4 hours).
 * Call once at app startup.
 */
export function startUpdateSchedule(): void {
  if (!isLocal()) return;

  // Initial check after 30 seconds
  setTimeout(() => checkForUpdates(), 30_000);

  // Then every 4 hours
  setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1000);
}
