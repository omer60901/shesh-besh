// Small value network (TD-Gammon style): estimates P(side on roll wins) from a position.
import type { Board, Color } from "./engine";

export const N_IN = 196;
export interface Net { h: number; w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: number; }

/** Encode from the point of view of `c`, the side about to roll. Returns indices/values of non-zero inputs. */
export function encode(b: Board, c: Color, idx: Int32Array, val: Float32Array): number {
  let n = 0;
  const s = c === "white" ? 1 : -1;
  for (let i = 0; i < 24; i++) {
    const v = b.points[i] * s;
    if (v === 0) continue;
    const p = c === "white" ? i : 23 - i;
    const base = p * 8 + (v > 0 ? 0 : 4);
    const k = v > 0 ? v : -v;
    idx[n] = base; val[n++] = 1;
    if (k >= 2) { idx[n] = base + 1; val[n++] = 1; }
    if (k >= 3) { idx[n] = base + 2; val[n++] = 1; }
    if (k > 3) { idx[n] = base + 3; val[n++] = (k - 3) / 2; }
  }
  const o: Color = c === "white" ? "black" : "white";
  if (b.bar[c]) { idx[n] = 192; val[n++] = b.bar[c] / 2; }
  if (b.bar[o]) { idx[n] = 193; val[n++] = b.bar[o] / 2; }
  if (b.off[c]) { idx[n] = 194; val[n++] = b.off[c] / 15; }
  if (b.off[o]) { idx[n] = 195; val[n++] = b.off[o] / 15; }
  return n;
}

const _idx = new Int32Array(120), _val = new Float32Array(120);
let _hid = new Float32Array(0);

/** P(c wins) when c is about to roll. */
export function netValue(net: Net, b: Board, c: Color): number {
  const n = encode(b, c, _idx, _val);
  const H = net.h;
  if (_hid.length !== H) _hid = new Float32Array(H);
  const hid = _hid, w1 = net.w1;
  for (let j = 0; j < H; j++) hid[j] = net.b1[j];
  for (let k = 0; k < n; k++) {
    const off = _idx[k] * H, x = _val[k];
    for (let j = 0; j < H; j++) hid[j] += w1[off + j] * x;
  }
  let out = net.b2;
  for (let j = 0; j < H; j++) out += net.w2[j] / (1 + Math.exp(-hid[j]));
  return 1 / (1 + Math.exp(-out));
}

// ---- bundled weights ----
import { NET_B64, NET_H, NET_SCALE } from "./net-weights";
let _net: Net | null = null;
export function bundledNet(): Net {
  if (_net) return _net;
  const bin = atob(NET_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const q = new Int16Array(bytes.buffer);
  const f = Float32Array.from(q, (x) => x * NET_SCALE);
  const H = NET_H, a = N_IN * H;
  _net = { h: H, w1: f.subarray(0, a), b1: f.subarray(a, a + H), w2: f.subarray(a + H, a + 2 * H), b2: f[a + 2 * H] };
  return _net;
}
