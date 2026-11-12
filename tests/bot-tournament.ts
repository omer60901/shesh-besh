// usage: tsx tests/bot-tournament.ts <mode> [games]
import * as E from "../lib/engine";
import * as B from "../lib/bot";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import { netValue, type Net } from "../lib/net";
const loadNet = (f: string): Net => { const j = JSON.parse(fs.readFileSync(f, "utf8")); return { h: j.h, w1: Float32Array.from(j.w1), b1: Float32Array.from(j.b1), w2: Float32Array.from(j.w2), b2: j.b2 }; };
const netP = (net: Net): Picker => (b, c, d) => {
  const ts = B.allTurns(b, c, d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]], d);
  if (!ts.length) return [];
  const o = E.other(c); let best = ts[0], bv = Infinity;
  for (const t of ts) { const v = t.board.off[c] === 15 ? -1 : netValue(net, t.board, o); if (v < bv) { bv = v; best = t; } }
  return best.moves;
};

const die = () => 1 + Math.floor(Math.random() * 6);
type Picker = (b: E.Board, c: E.Color, dice: [number, number]) => E.Move[];
const lvl = (l: B.BotLevel): Picker => (b, c, d) => B.chooseTurn(b, c, d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]], d, l);
const randomP: Picker = (b, c, d) => { const t = B.allTurns(b, c, d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]], d); return t.length ? t[Math.floor(Math.random() * t.length)].moves : []; };

function play(pw: Picker, pb: Picker, log?: (b: E.Board, turn: E.Color) => void): { winner: E.Color; pts: number } {
  let b = E.initialBoard();
  let a = die(), z = die(); while (a === z) { a = die(); z = die(); }
  let turn: E.Color = a > z ? "white" : "black";
  let dice: [number, number] = [a, z];
  for (let n = 0; n < 4000; n++) {
    if (n > 0 && log) log(b, turn);
    const ms = (turn === "white" ? pw : pb)(b, turn, dice);
    for (const m of ms) b = E.applyMove(b, turn, m);
    if (b.off[turn] === 15) {
      const o = E.other(turn);
      return { winner: turn, pts: b.off[o] === 0 ? 2 : 1 };
    }
    turn = E.other(turn); dice = [die(), die()];
  }
  throw new Error("game too long");
}

function match(name: string, A: Picker, Bp: Picker, n: number) {
  let wa = 0, pa = 0, pb = 0; const t0 = Date.now();
  for (let g = 0; g < n; g++) {
    const aWhite = g % 2 === 0;
    const r = play(aWhite ? A : Bp, aWhite ? Bp : A);
    const aWon = (r.winner === "white") === aWhite;
    if (aWon) { wa++; pa += r.pts; } else pb += r.pts;
  }
  const p = wa / n, se = Math.sqrt(p * (1 - p) / n);
  console.log(`${name}: ${(100 * p).toFixed(1)}% ±${(196 * se).toFixed(1)}  points ${pa}:${pb}  (${n} games, ${((Date.now() - t0) / n).toFixed(0)}ms/game)`);
}

const mode = process.argv[2], N = Number(process.argv[3] || 200);
if (mode === "check") {
  // allTurns must agree with the rules engine on the set of reachable end positions
  const key = (b: E.Board) => JSON.stringify(b);
  const viaEngine = (b: E.Board, c: E.Color, rem: number[], dice: number[], out: Set<string>) => {
    const lm = E.legalMoves(b, c, rem, dice);
    if (!lm.length) { out.add(key(b)); return; }
    for (const m of lm) { const r = rem.slice(); r.splice(r.indexOf(m.die), 1); viaEngine(E.applyMove(b, c, m), c, r, dice, out); }
  };
  let checked = 0;
  for (let g = 0; g < N; g++) play(randomP, lvl("hard"), (b, turn) => {
    if (Math.random() > 0.25) return;
    const d: [number, number] = [die(), die()];
    const rem = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]];
    const a = new Set<string>(); viaEngine(b, turn, rem, d, a);
    const ts = B.allTurns(b, turn, rem, d);
    const z = new Set(ts.length ? ts.map((t) => key(t.board)) : [key(b)]);
    assert.deepEqual([...z].sort(), [...a].sort(), JSON.stringify({ b, turn, d }));
    // and every bot sequence must be playable move by move
    for (const t of ts.slice(0, 3)) { let bb = b; const r = rem.slice(); for (const m of t.moves) { assert.ok(E.legalMoves(bb, turn, r, d).some((x) => x.from === m.from && x.to === m.to && x.die === m.die)); bb = E.applyMove(bb, turn, m); r.splice(r.indexOf(m.die), 1); } }
    checked++;
  });
  console.log("positions checked:", checked, "OK");
} else if (mode === "ladder") {
  match("easy vs random", lvl("easy"), randomP, N);
  match("hard vs easy", lvl("hard"), lvl("easy"), N);
  match("hard vs random", lvl("hard"), randomP, N);
} else if (mode === "deepnet") {
  match("impossible vs 1-ply net", lvl("impossible"), netP(loadNet(process.argv[4])), N);
} else if (mode === "deep") {
  match("impossible vs hard", lvl("impossible"), lvl("hard"), N);
} else if (mode === "net") {
  const net = loadNet(process.argv[4]);
  match(`net(${process.argv[4]}) vs hard`, netP(net), lvl("hard"), N);
} else if (mode === "netnet") {
  match(`net A vs net B`, netP(loadNet(process.argv[4])), netP(loadNet(process.argv[5])), N);
} else if (mode === "netcal") {
  // is the network's win probability calibrated? bucket predictions vs. actual results in self-play
  const net = loadNet(process.argv[4]); const P = netP(net);
  const bins = Array.from({ length: 10 }, () => ({ n: 0, w: 0, s: 0 }));
  for (let g = 0; g < N; g++) {
    const cur: { p: number; turn: E.Color }[] = [];
    const r = play(P, P, (b, turn) => cur.push({ p: netValue(net, b, turn), turn }));
    for (const x of cur) { const k = Math.min(9, Math.floor(x.p * 10)); bins[k].n++; bins[k].s += x.p; if (x.turn === r.winner) bins[k].w++; }
  }
  bins.forEach((b, i) => console.log(`pred ${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}: n=${b.n} mean pred=${(b.s / Math.max(1, b.n)).toFixed(3)} actual=${(b.w / Math.max(1, b.n)).toFixed(3)}`));
} else if (mode === "nethybrid") {
  // network everywhere vs. network + hand-written race play once contact is broken
  const net = loadNet(process.argv[4]); const P = netP(net); const Hd = lvl("hard");
  const hybrid: Picker = (b, c, d) => (B.isRace(b, c) ? Hd(b, c, d) : P(b, c, d));
  match("net+race-heuristic vs pure net", hybrid, P, N);
} else if (mode === "deepeasy") {
  match("impossible vs easy", lvl("impossible"), lvl("easy"), N);
}
