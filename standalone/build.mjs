// Builds the whole game into one self-contained HTML file.
// usage: node standalone/build.mjs <out.html> [firebase|local]
// "firebase" reads NEXT_PUBLIC_FIREBASE_* from the environment; "local" syncs between tabs only.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? "dist/index.html");
const mode = process.argv[3] ?? "local";
const keys = ["API_KEY", "AUTH_DOMAIN", "DATABASE_URL", "PROJECT_ID", "APP_ID"];
const define = { "process.env.NODE_ENV": '"production"' };
for (const k of keys) {
  const v = mode === "firebase" ? process.env[`NEXT_PUBLIC_FIREBASE_${k}`] : undefined;
  define[`process.env.NEXT_PUBLIC_FIREBASE_${k}`] = v ? JSON.stringify(v) : "undefined";
}
if (mode === "firebase" && define["process.env.NEXT_PUBLIC_FIREBASE_API_KEY"] === "undefined") {
  console.warn("warning: NEXT_PUBLIC_FIREBASE_* not set, building in local (same-browser) mode");
}
const alias = { "next/navigation": resolve(root, "standalone/next-nav-shim.ts"), "@": root };
if (mode !== "firebase") {
  alias["firebase/app"] = resolve(root, "standalone/empty.ts");
  alias["firebase/database"] = resolve(root, "standalone/empty.ts");
}
const res = await build({
  entryPoints: [resolve(root, "standalone/main.tsx")], bundle: true, minify: true, format: "iife", jsx: "automatic",
  target: "es2020", alias, define, write: false, logLevel: "error",
});
const js = res.outputFiles[0].text.replaceAll("</script", "<\\/script");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>שש בש עם חברים</title>
<meta name="description" content="שש בש אונליין: חדרים עם QR, בוט בשלוש רמות ומצב אימון">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;900&family=Frank+Ruhl+Libre:wght@700;900&display=swap">
<style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
console.log(`built ${out} (${mode})`);
