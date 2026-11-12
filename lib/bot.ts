// Backgammon bot: full-turn generation, positional evaluation, 2-ply search and cube decisions.
// Pure functions on top of the rules engine. Dice are never peeked at or influenced.
import type { Board, Color, GameState, Move } from "./engine";
import { applyMove, canDouble, other, singleMoves } from "./engine";
import { bundledNet, netValue } from "./net";

export type BotLevel = "easy" | "hard" | "impossible";
export const BOT_PREFIX = "bot:";
export const BOT_NAMES: Record<BotLevel, string> = { easy: "בוט קל", hard: "בוט קשה", impossible: "בוט בלתי אפשרי" };

export function botLevelOf(id: string | undefined | null): BotLevel | null {
  if (!id || !id.startsWith(BOT_PREFIX)) return null;
  const l = id.slice(BOT_PREFIX.length);
  return l === "easy" || l === "hard" || l === "impossible" ? l : null;
}

export interface Turn { moves: Move[]; board: Board; }

const sgn = (c: Color) => (c === "white" ? 1 : -1);
const posOf = (i: number, c: Color) => (c === "white" ? i + 1 : 24 - i);
const srcPos = (m: Move, c: Color) => (m.from === "bar" ? 25 : posOf(m.from, c));
const keyOf = (b: Board) => b.points.join(",") + "|" + b.bar.white + "," + b.bar.black + "|" + b.off.white + "," + b.off.black;

/** Every legal complete turn (max dice used, higher-die rule), de-duplicated by resulting position. */
export function allTurns(b: Board, c: Color, remaining: number[], originalDice: number[]): Turn[] {
  if (remaining.length === 0) return [];
  const isDouble = remaining.every((d) => d === remaining[0]);
  const leaves: Turn[] = [];
  let best = 0;

  const dfs = (board: Board, dice: number[], moves: Move[], lastSrc: number) => {
    let moved = false;
    if (dice.length) {
      const d = dice[0];
      const rest = dice.slice(1);
      for (const m of singleMoves(board, c, d)) {
        const sp = srcPos(m, c);
        if (isDouble && sp > lastSrc) continue; // canonical order for doubles: back checkers first
        moved = true;
        dfs(applyMove(board, c, m), rest, moves.concat(m), sp);
      }
    }
    if (!moved) {
      if (moves.length > best) best = moves.length;
      if (moves.length > 0) leaves.push({ moves, board });
    }
  };

  if (isDouble) dfs(b, remaining, [], 25);
  else {
    dfs(b, remaining, [], 25);
    if (remaining.length === 2) dfs(b, [remaining[1], remaining[0]], [], 25);
  }
  if (best === 0) return [];
  let out = leaves.filter((t) => t.moves.length === best);
  const isStart = remaining.length === 2 && originalDice.length === 2 && originalDice[0] !== originalDice[1];
  if (isStart && best === 1) {
    const hi = Math.max(remaining[0], remaining[1]);
    const withHi = out.filter((t) => t.moves[0].die === hi);
    if (withHi.length) out = withHi;
  }
  const seen = new Set<string>();
  return out.filter((t) => { const k = keyOf(t.board); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------------- evaluation ----------------
// All numbers are in "pip equivalents": +1 means roughly one pip better for the evaluated side.
export const W = {
  home: [0, 3, 4, 6, 9, 10, 9],
  bar7: 7, p8: 3,
  prime: [0, 0, 3, 9, 18, 30, 45],
  primeFree: 0.3,
  barHit: 4, barPerPt: 3, closeout: 20,
  blot: 0.9, entry: 5, onRollBlot: 0.25,
  anchor: [5, 8, 8, 6, 4, 3], // my positions 19..24
  stack: 1.5, dead: 0.5,
  myBarEntry: 2.5,
  tempo: 4,
  raceOutside: 2.5, raceGap: 0.4, raceOff: 2,
  pos: 1, // global scale of positional (non-pip) terms
};

interface View { my: number[]; opp: number[]; myBar: number; oppBar: number; myOff: number; oppOff: number; }

function viewOf(b: Board, c: Color): View {
  const my = new Array(26).fill(0), opp = new Array(26).fill(0);
  const s = sgn(c);
  for (let i = 0; i < 24; i++) {
    const v = b.points[i] * s;
    if (v === 0) continue;
    const p = posOf(i, c);
    if (v > 0) my[p] = v; else opp[p] = -v;
  }
  const o = other(c);
  return { my, opp, myBar: b.bar[c], oppBar: b.bar[o], myOff: b.off[c], oppOff: b.off[o] };
}
function flip(v: View): View {
  const my = new Array(26).fill(0), opp = new Array(26).fill(0);
  for (let p = 1; p <= 24; p++) { my[p] = v.opp[25 - p]; opp[p] = v.my[25 - p]; }
  return { my, opp, myBar: v.oppBar, oppBar: v.myBar, myOff: v.oppOff, oppOff: v.myOff };
}

function hasContact(v: View): boolean {
  let myMax = v.myBar > 0 ? 25 : 0;
  if (!myMax) for (let p = 24; p >= 1; p--) if (v.my[p]) { myMax = p; break; }
  let oppMin = v.oppBar > 0 ? 0 : 25;
  if (oppMin) for (let p = 1; p <= 24; p++) if (v.opp[p]) { oppMin = p; break; }
  return myMax > oppMin;
}

const pipsOf = (v: View) => { let t = v.myBar * 25; for (let p = 1; p <= 24; p++) t += p * v.my[p]; return t; };

/** Number of the 36 dice rolls with which the opponent can hit my blot on position p. */
function shots(v: View, p: number): number {
  const qs: number[] = [];
  if (v.oppBar > 0) qs.push(0);
  for (let q = 1; q < p; q++) if (v.opp[q]) qs.push(q);
  if (!qs.length) return 0;
  const blocked = (x: number) => x >= 1 && x <= 24 && v.my[x] >= 2;
  let n = 0;
  for (let d1 = 1; d1 <= 6; d1++) for (let d2 = 1; d2 <= 6; d2++) {
    let hit = false;
    for (const q of qs) {
      const D = p - q;
      if (d1 !== d2) {
        if (D === d1 || D === d2) hit = true;
        else if (D === d1 + d2 && (!blocked(q + d1) || !blocked(q + d2))) hit = true;
      } else {
        for (let k = 1; k <= 4 && !hit; k++) {
          if (D !== k * d1) continue;
          let open = true;
          for (let j = 1; j < k; j++) if (blocked(q + j * d1)) open = false;
          if (open) hit = true;
        }
      }
      if (hit) break;
    }
    if (hit) n++;
  }
  return n;
}

function contactSide(v: View, onRoll: boolean): number {
  let pos = 0;
  let homePts = 0;
  for (let p = 1; p <= 6; p++) if (v.my[p] >= 2) { pos += W.home[p]; homePts++; }
  if (v.my[7] >= 2) pos += W.bar7;
  if (v.my[8] >= 2) pos += W.p8;
  // longest prime within positions 1..12
  let bestLen = 0, bestTop = 0, run = 0;
  for (let p = 1; p <= 12; p++) {
    if (v.my[p] >= 2) { run++; if (run > bestLen) { bestLen = run; bestTop = p; } } else run = 0;
  }
  if (bestLen >= 2) {
    let trapped = v.oppBar;
    for (let q = 1; q < bestTop; q++) trapped += v.opp[q];
    pos += W.prime[Math.min(bestLen, 6)] * (trapped > 0 ? 1 : W.primeFree);
  }
  if (v.oppBar > 0) {
    pos += v.oppBar * (W.barHit + W.barPerPt * homePts);
    if (homePts === 6) pos += W.closeout;
  }
  let anchor = 0;
  for (let p = 19; p <= 24; p++) if (v.my[p] >= 2 && W.anchor[p - 19] > anchor) anchor = W.anchor[p - 19];
  pos += anchor;
  for (let p = 1; p <= 24; p++) if (v.my[p] > 3) pos -= W.stack * (v.my[p] - 3);
  for (let p = 1; p <= 3; p++) if (v.my[p] > 2) pos -= W.dead * (v.my[p] - 2) * (4 - p);
  let oppHomePts = 0;
  for (let p = 19; p <= 24; p++) if (v.opp[p] >= 2) oppHomePts++;
  const k = onRoll ? W.onRollBlot : 1;
  for (let p = 1; p <= 24; p++) {
    if (v.my[p] !== 1) continue;
    const s = shots(v, p);
    if (s) pos -= W.blot * k * (s / 36) * (25 - p + W.entry * oppHomePts);
  }
  pos -= v.myBar * W.myBarEntry * oppHomePts;
  return -pipsOf(v) + W.pos * pos;
}

function raceSide(v: View): number {
  let outside = 0, top = 0;
  for (let p = 24; p >= 1; p--) { if (v.my[p]) { if (!top) top = p; if (p > 6) outside += v.my[p]; } }
  let gaps = 0;
  if (top <= 6) for (let p = 1; p < top; p++) if (!v.my[p]) gaps++;
  return -pipsOf(v) - W.raceOutside * outside - W.raceGap * gaps + W.raceOff * v.myOff;
}

export function isRace(b: Board, c: Color): boolean { return !hasContact(viewOf(b, c)); }

/** Evaluation from c's point of view. cOnRoll: is c the side about to roll. */
export function evaluate(b: Board, c: Color, cOnRoll: boolean): number {
  const o = other(c);
  if (b.off[c] === 15) return 10000 * (b.off[o] === 0 ? 2 : 1);
  if (b.off[o] === 15) return -10000 * (b.off[c] === 0 ? 2 : 1);
  const v = viewOf(b, c), u = flip(v);
  const tempo = cOnRoll ? W.tempo : -W.tempo;
  if (!hasContact(v)) return raceSide(v) - raceSide(u) + tempo;
  return contactSide(v, cOnRoll) - contactSide(u, !cOnRoll) + tempo;
}

// ---------------- move choice ----------------
const ROLLS: { d: [number, number]; w: number }[] = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push({ d: [a, b], w: a === b ? 1 / 36 : 2 / 36 });
const expand = (d: [number, number]) => (d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]]);

export const EASY = { random: 0.2, noise: 14 };
export const DEEP = { width: 8 };

function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The bot's chosen turn (ordered moves). Empty array when there is nothing to play. */
export function chooseTurn(b: Board, c: Color, remaining: number[], originalDice: number[], level: BotLevel): Move[] {
  const turns = allTurns(b, c, remaining, originalDice);
  if (!turns.length) return [];
  if (turns.length === 1) return turns[0].moves;
  if (level === "easy") {
    if (Math.random() < EASY.random) return turns[Math.floor(Math.random() * turns.length)].moves;
    let best = turns[0], bv = -Infinity;
    for (const t of turns) { const e = evaluate(t.board, c, false) + gauss() * EASY.noise; if (e > bv) { bv = e; best = t; } }
    return best.moves;
  }
  const scored = turns.map((t) => ({ t, e: evaluate(t.board, c, false) })).sort((x, y) => y.e - x.e);
  if (level === "hard") return scored[0].t.moves;
  return deepTurn(turns, c).moves;
}

/** P(c wins) according to the value network. cOnRoll: c is the side about to roll. */
export function winProb(b: Board, c: Color, cOnRoll: boolean): number {
  const o = other(c);
  if (b.off[c] === 15) return 1;
  if (b.off[o] === 15) return 0;
  return cOnRoll ? netValue(bundledNet(), b, c) : 1 - netValue(bundledNet(), b, o);
}

/** c's winning chance after playing to `board`: average over the opponent's 21 rolls and best replies. */
function deepValue(board: Board, c: Color): number {
  const o = other(c);
  if (board.off[c] === 15) return 1;
  let v = 0;
  for (const r of ROLLS) {
    const replies = allTurns(board, o, expand(r.d), r.d);
    let worst: number;
    if (!replies.length) worst = winProb(board, c, true);
    else {
      worst = Infinity;
      for (const rp of replies) { const p = winProb(rp.board, c, true); if (p < worst) worst = p; }
    }
    v += r.w * worst;
  }
  return v;
}

/** "Impossible": the value network, looking ahead over all 21 opponent rolls and their best replies. */
function deepTurn(turns: Turn[], c: Color): Turn {
  const first = turns.map((t) => ({ t, p: winProb(t.board, c, false) })).sort((x, y) => y.p - x.p);
  if (first[0].p >= 1) return first[0].t;
  let best = first[0].t, bv = -Infinity;
  for (const cand of first.slice(0, DEEP.width)) {
    const v = deepValue(cand.t.board, c);
    if (v > bv) { bv = v; best = cand.t; }
  }
  return best;
}

// ---------------- coach ----------------
export type Grade = "only" | "best" | "good" | "inaccuracy" | "mistake" | "blunder";
export interface Review { grade: Grade; loss: number; best: Move[]; options: number; }

/** The move the coach would play from here (works mid-turn with the dice that are left). */
export function coachHint(b: Board, c: Color, remaining: number[], originalDice: number[]): Move[] {
  const turns = allTurns(b, c, remaining, originalDice);
  if (!turns.length) return [];
  return turns.length === 1 ? turns[0].moves : deepTurn(turns, c).moves;
}

export function gradeOf(loss: number): Grade {
  return loss < 0.005 ? "best" : loss < 0.025 ? "good" : loss < 0.06 ? "inaccuracy" : loss < 0.12 ? "mistake" : "blunder";
}

/** Compare the turn a player made (start -> after) with the coach's choice. loss = winning chance given up. */
export function reviewTurn(start: Board, c: Color, dice: number[], after: Board): Review | null {
  if (dice.length !== 2) return null;
  const d: [number, number] = [dice[0], dice[1]];
  const turns = allTurns(start, c, expand(d), d);
  if (!turns.length) return null;
  if (turns.length === 1) return { grade: "only", loss: 0, best: turns[0].moves, options: 1 };
  const ak = keyOf(after);
  const first = turns.map((t) => ({ t, p: winProb(t.board, c, false) })).sort((x, y) => y.p - x.p);
  const played = first.find((x) => keyOf(x.t.board) === ak);
  if (!played) return null;
  if (after.off[c] === 15) return { grade: "best", loss: 0, best: played.t.moves, options: turns.length };
  const pool = first.slice(0, DEEP.width);
  if (!pool.includes(played)) pool.push(played);
  let best = pool[0], bv = -Infinity, pv = 0;
  for (const cand of pool) {
    const v = deepValue(cand.t.board, c);
    if (cand === played) pv = v;
    if (v > bv) { bv = v; best = cand; }
  }
  const loss = Math.max(0, bv - pv);
  return { grade: best === played ? "best" : gradeOf(loss), loss, best: best.t.moves, options: turns.length };
}

// ---------------- doubling cube ----------------
/** Should the bot (about to roll) offer the cube? */
export function botShouldDouble(s: GameState, c: Color, level: BotLevel): boolean {
  if (level === "easy" || !canDouble(s, c)) return false;
  const o = other(c), L = s.match.length;
  // post-Crawford and trailing: nothing to lose by doubling at once
  if (s.match.crawfordDone && s.match.score[o] === L - 1 && s.match.score[c] < L - 1) return true;
  const p = winProb(s.board, c, true);
  const race = isRace(s.board, c);
  if (p < (race ? 0.7 : 0.72)) return false;
  // too good: play on for a gammon while the opponent has not borne off anything
  if (!race && p > 0.9 && s.board.off[o] === 0) return false;
  return true;
}

/** Should the bot accept a cube offered by its opponent (who is about to roll)? */
export function botShouldTake(s: GameState, c: Color, level: BotLevel): boolean {
  const o = other(c), L = s.match.length;
  if (s.match.score[o] + s.cube.value >= L) return true; // dropping loses the match anyway
  const p = winProb(s.board, c, false);
  if (level === "easy") return p >= 0.12;
  return p >= 0.23;
}
