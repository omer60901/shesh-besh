"use client";
// Realtime room sync. Uses Firebase Realtime Database when configured,
// otherwise a local fallback (BroadcastChannel) that works between tabs of the same browser — for testing.

import type { GameState } from "./engine";

export interface Transport {
  mode: "firebase" | "local";
  subscribe(code: string, cb: (s: GameState | null) => void): () => void;
  /** Atomic read-modify-write. Return the same object to abort. */
  update(code: string, fn: (s: GameState | null) => GameState | null): Promise<GameState | null>;
}

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = !!(cfg.apiKey && cfg.databaseURL);

// The state is stored as a JSON string so Firebase doesn't mangle empty arrays / nulls.
function firebaseTransport(): Transport {
  let dbPromise: Promise<any> | null = null;
  const getDb = () => {
    if (!dbPromise) {
      dbPromise = (async () => {
        const { initializeApp, getApps } = await import("firebase/app");
        const { getDatabase } = await import("firebase/database");
        const app = getApps()[0] ?? initializeApp(cfg);
        return getDatabase(app);
      })();
    }
    return dbPromise;
  };
  return {
    mode: "firebase",
    subscribe(code, cb) {
      let off = () => {};
      let cancelled = false;
      (async () => {
        const db = await getDb();
        const { ref, onValue } = await import("firebase/database");
        if (cancelled) return;
        off = onValue(ref(db, `rooms/${code}/s`), (snap) => {
          const v = snap.val();
          cb(v ? JSON.parse(v) : null);
        });
      })();
      return () => { cancelled = true; off(); };
    },
    async update(code, fn) {
      const db = await getDb();
      const { ref, runTransaction } = await import("firebase/database");
      let result: GameState | null = null;
      await runTransaction(ref(db, `rooms/${code}/s`), (cur: string | null) => {
        const prev = cur ? (JSON.parse(cur) as GameState) : null;
        const next = fn(prev);
        if (next === prev || next === null) return; // abort
        result = { ...next, version: (prev?.version ?? 0) + 1 };
        return JSON.stringify(result);
      });
      return result;
    },
  };
}

function localTransport(): Transport {
  const key = (c: string) => `sheshbesh-room-${c}`;
  const chan = typeof window !== "undefined" ? new BroadcastChannel("sheshbesh") : null;
  const read = (c: string): GameState | null => {
    const v = localStorage.getItem(key(c));
    return v ? JSON.parse(v) : null;
  };
  return {
    mode: "local",
    subscribe(code, cb) {
      cb(read(code));
      const h = (e: MessageEvent) => { if (e.data === code) cb(read(code)); };
      const h2 = (e: Event) => { if ((e as CustomEvent).detail === code) cb(read(code)); };
      const h3 = (e: StorageEvent) => { if (e.key === key(code)) cb(read(code)); };
      chan?.addEventListener("message", h);
      window.addEventListener("sheshbesh-local", h2);
      window.addEventListener("storage", h3);
      return () => {
        chan?.removeEventListener("message", h);
        window.removeEventListener("sheshbesh-local", h2);
        window.removeEventListener("storage", h3);
      };
    },
    async update(code, fn) {
      const prev = read(code);
      const next = fn(prev);
      if (next === prev || next === null) return prev;
      const saved = { ...next, version: (prev?.version ?? 0) + 1 };
      localStorage.setItem(key(code), JSON.stringify(saved));
      chan?.postMessage(code);
      // notify this tab too
      window.dispatchEvent(new CustomEvent("sheshbesh-local", { detail: code }));
      return saved;
    },
  };
}

let _t: Transport | null = null;
export function transport(): Transport {
  if (!_t) _t = firebaseConfigured ? firebaseTransport() : localTransport();
  return _t;
}

// ---------- identity ----------
export function playerId(): string {
  // sessionStorage so two tabs in the same browser can be two players in local mode
  const store = firebaseConfigured ? localStorage : sessionStorage;
  let id = store.getItem("sheshbesh-pid");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.setItem("sheshbesh-pid", id);
  }
  return id;
}

export function savedName(): string {
  return localStorage.getItem("sheshbesh-name") || "";
}
export function saveName(n: string) {
  localStorage.setItem("sheshbesh-name", n);
}

export function newRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------- hot-seat (both players on one screen) ----------
export function markHotseat(code: string) { try { localStorage.setItem("sheshbesh-hot-" + code, "1"); } catch {} }
export function isHotseat(code: string) { try { return !!localStorage.getItem("sheshbesh-hot-" + code); } catch { return false; } }

// ---------- coached practice game ----------
export function markCoach(code: string) { try { localStorage.setItem("sheshbesh-coach-" + code, "1"); } catch {} }
export function isCoach(code: string) { try { return !!localStorage.getItem("sheshbesh-coach-" + code); } catch { return false; } }
