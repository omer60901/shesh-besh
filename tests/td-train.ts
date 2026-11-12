// TD(0) self-play training. usage: tsx tests/td-train.ts <hidden> <minutes> <out.json> [resume.json]
import * as fs from "node:fs";
import * as E from "../lib/engine";
import * as B from "../lib/bot";
import { encode, N_IN, type Net } from "../lib/net";

const H = Number(process.argv[2] || 40), MIN = Number(process.argv[3] || 5), OUT = process.argv[4] || "/tmp/net.json";
let net: Net;
if (process.argv[5]) { const j = JSON.parse(fs.readFileSync(process.argv[5], "utf8")); net = { h: j.h, w1: Float32Array.from(j.w1), b1: Float32Array.from(j.b1), w2: Float32Array.from(j.w2), b2: j.b2 }; }
else { const r = () => (Math.random() - 0.5) * 0.2; net = { h: H, w1: Float32Array.from({ length: N_IN * H }, r), b1: Float32Array.from({ length: H }, r), w2: Float32Array.from({ length: H }, r), b2: 0 }; }
const idx = new Int32Array(120), val = new Float32Array(120), hid = new Float32Array(net.h);
const cidx = new Int32Array(120), cval = new Float32Array(120), chid = new Float32Array(net.h);

function fwd(b: E.Board, c: E.Color, ix: Int32Array, vl: Float32Array, hd: Float32Array): [number, number] {
  const n = encode(b, c, ix, vl), Hh = net.h;
  for (let j = 0; j < Hh; j++) hd[j] = net.b1[j];
  for (let k = 0; k < n; k++) { const off = ix[k] * Hh, x = vl[k]; for (let j = 0; j < Hh; j++) hd[j] += net.w1[off + j] * x; }
  let out = net.b2;
  for (let j = 0; j < Hh; j++) { hd[j] = 1 / (1 + Math.exp(-hd[j])); out += net.w2[j] * hd[j]; }
  return [1 / (1 + Math.exp(-out)), n];
}
const die = () => 1 + Math.floor(Math.random() * 6);
const t0 = Date.now(); let games = 0, lastSave = 0;
while (Date.now() - t0 < MIN * 60000) {
  const alpha = process.env.ALPHA ? Number(process.env.ALPHA) : games < 20000 ? 0.1 : games < 150000 ? 0.05 : 0.02;
  let b = E.initialBoard();
  let a = die(), z = die(); while (a === z) { a = die(); z = die(); }
  let turn: E.Color = a > z ? "white" : "black", dice: [number, number] = [a, z];
  for (;;) {
    const [v, n] = fwd(b, turn, idx, val, hid);
    const rem = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
    const ts = B.allTurns(b, turn, rem, dice);
    const o = E.other(turn);
    let target: number, next = b, won = false;
    if (!ts.length) target = 1 - fwd(b, o, cidx, cval, chid)[0];
    else {
      let bestV = Infinity;
      for (const t of ts) {
        if (t.board.off[turn] === 15) { bestV = 0; next = t.board; won = true; break; }
        const vo = fwd(t.board, o, cidx, cval, chid)[0];
        if (vo < bestV) { bestV = vo; next = t.board; }
      }
      target = 1 - bestV;
    }
    // backprop one step toward target
    const d = (target - v) * v * (1 - v) * alpha, Hh = net.h;
    for (let j = 0; j < Hh; j++) {
      const g = d * net.w2[j] * hid[j] * (1 - hid[j]);
      net.w2[j] += d * hid[j];
      net.b1[j] += g;
      for (let k = 0; k < n; k++) net.w1[idx[k] * Hh + j] += g * val[k];
    }
    net.b2 += d;
    if (won) break;
    b = next; turn = o; dice = [die(), die()];
  }
  games++;
  if (Date.now() - lastSave > 60000) { save(); lastSave = Date.now(); }
}
save();
function save() {
  const r = (a: Float32Array) => Array.from(a, (x) => Math.round(x * 10000) / 10000);
  fs.writeFileSync(OUT, JSON.stringify({ h: net.h, games, w1: r(net.w1), b1: r(net.b1), w2: r(net.w2), b2: net.b2 }));
  console.log(`saved after ${games} games, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
