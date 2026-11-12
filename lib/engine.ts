// Backgammon rules engine — pure functions, no UI.
// Board: points[0..23]. Positive = white checkers, negative = black.
// White moves from index 23 -> 0 (home = 0..5). Black moves 0 -> 23 (home = 18..23).

export type Color = "white" | "black";
export type Loc = number | "bar" | "off";

export interface Move {
  from: number | "bar";
  to: number | "off";
  die: number;
  hit?: boolean;
}

export interface Board {
  points: number[];
  bar: { white: number; black: number };
  off: { white: number; black: number };
}

export type Phase =
  | "waiting" // waiting for second player
  | "opening" // each player rolls one die to decide who starts
  | "rolling" // current player may double or roll
  | "doubleOffered"
  | "moving"
  | "gameOver"
  | "matchOver";

export interface Player {
  id: string;
  name: string;
}

export interface GameState {
  version: number;
  phase: Phase;
  players: { white: Player | null; black: Player | null };
  board: Board;
  turn: Color;
  dice: number[]; // the dice rolled this turn (2 values)
  remaining: number[]; // dice still to be used
  rollId: number; // increments on every roll (drives dice animation)
  turnStart: Board | null; // board at the start of this turn (for undo)
  turnMoves: Move[];
  opening: { white: number | null; black: number | null };
  cube: { value: number; owner: Color | null };
  match: {
    length: number;
    score: { white: number; black: number };
    crawford: boolean; // is the current game the Crawford game
    crawfordDone: boolean;
    gameNumber: number;
  };
  lastResult: null | {
    winner: Color;
    points: number;
    kind: "single" | "gammon" | "backgammon" | "declined" | "resigned";
  };
  log: string[];
}

export const other = (c: Color): Color => (c === "white" ? "black" : "white");
const sign = (c: Color) => (c === "white" ? 1 : -1);

export function initialBoard(): Board {
  const p = new Array(24).fill(0);
  p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5; // white
  p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5; // black
  return { points: p, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 } };
}

export function cloneBoard(b: Board): Board {
  return { points: b.points.slice(), bar: { ...b.bar }, off: { ...b.off } };
}

/** count of `c` checkers at index i */
export const countAt = (b: Board, i: number, c: Color) => {
  const v = b.points[i] * sign(c);
  return v > 0 ? v : 0;
};
const oppAt = (b: Board, i: number, c: Color) => countAt(b, i, other(c));

/** distance-to-home position (1..24) for an index, from c's perspective */
const posOf = (i: number, c: Color) => (c === "white" ? i + 1 : 24 - i);
const idxOf = (pos: number, c: Color) => (c === "white" ? pos - 1 : 24 - pos);

export function allHome(b: Board, c: Color): boolean {
  if (b.bar[c] > 0) return false;
  for (let i = 0; i < 24; i++) {
    if (countAt(b, i, c) > 0 && posOf(i, c) > 6) return false;
  }
  return true;
}

/** All single-checker moves for one die value. */
export function singleMoves(b: Board, c: Color, die: number): Move[] {
  const res: Move[] = [];
  if (b.bar[c] > 0) {
    const to = idxOf(25 - die, c);
    if (oppAt(b, to, c) < 2) res.push({ from: "bar", to, die, hit: oppAt(b, to, c) === 1 });
    return res; // must enter from the bar first
  }
  const home = allHome(b, c);
  for (let i = 0; i < 24; i++) {
    if (countAt(b, i, c) === 0) continue;
    const pos = posOf(i, c);
    const np = pos - die;
    if (np >= 1) {
      const to = idxOf(np, c);
      if (oppAt(b, to, c) < 2) res.push({ from: i, to, die, hit: oppAt(b, to, c) === 1 });
    } else if (home) {
      if (np === 0) {
        res.push({ from: i, to: "off", die });
      } else {
        // overshoot: allowed only from the highest occupied point
        let higher = false;
        for (let p = pos + 1; p <= 6; p++) if (countAt(b, idxOf(p, c), c) > 0) { higher = true; break; }
        if (!higher) res.push({ from: i, to: "off", die });
      }
    }
  }
  return res;
}

export function applyMove(b: Board, c: Color, m: Move): Board {
  const n = cloneBoard(b);
  const s = sign(c);
  if (m.from === "bar") n.bar[c]--;
  else n.points[m.from] -= s;
  if (m.to === "off") n.off[c]++;
  else {
    if (oppAt(n, m.to, c) === 1) {
      n.points[m.to] = 0;
      n.bar[other(c)]++;
    }
    n.points[m.to] += s;
  }
  return n;
}

const boardKey = (b: Board) => b.points.join(",") + "|" + b.bar.white + b.bar.black + "|" + b.off.white + b.off.black;

/** Max number of dice that can be played from this position. */
export function maxPlayable(b: Board, c: Color, dice: number[], memo = new Map<string, number>()): number {
  if (dice.length === 0) return 0;
  const key = boardKey(b) + "#" + dice.slice().sort().join("");
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = 0;
  const tried = new Set<number>();
  for (let k = 0; k < dice.length && best < dice.length; k++) {
    const d = dice[k];
    if (tried.has(d)) continue;
    tried.add(d);
    const rest = dice.slice(0, k).concat(dice.slice(k + 1));
    for (const m of singleMoves(b, c, d)) {
      const v = 1 + maxPlayable(applyMove(b, c, m), c, rest, memo);
      if (v > best) best = v;
      if (best === dice.length) break;
    }
  }
  memo.set(key, best);
  return best;
}

/**
 * Legal next moves given the remaining dice, enforcing:
 *  - you must use as many dice as possible
 *  - if only one die of a non-double can be used, you must use the larger one if possible
 */
export function legalMoves(b: Board, c: Color, remaining: number[], originalDice: number[]): Move[] {
  if (remaining.length === 0) return [];
  const memo = new Map<string, number>();
  const target = maxPlayable(b, c, remaining, memo);
  if (target === 0) return [];
  const out: Move[] = [];
  const tried = new Set<number>();
  for (let k = 0; k < remaining.length; k++) {
    const d = remaining[k];
    if (tried.has(d)) continue;
    tried.add(d);
    const rest = remaining.slice(0, k).concat(remaining.slice(k + 1));
    for (const m of singleMoves(b, c, d)) {
      if (1 + maxPlayable(applyMove(b, c, m), c, rest, memo) === target) out.push(m);
    }
  }
  // Higher-die rule: start of a non-double turn where only one die can be played
  const isStart = remaining.length === 2 && originalDice.length === 2 && originalDice[0] !== originalDice[1];
  if (isStart && target === 1) {
    const hi = Math.max(...remaining);
    const withHi = out.filter((m) => m.die === hi);
    if (withHi.length) return withHi;
  }
  return out;
}

// ---------- Game flow ----------

export function newGameState(matchLength: number): GameState {
  return {
    version: 0,
    phase: "waiting",
    players: { white: null, black: null },
    board: initialBoard(),
    turn: "white",
    dice: [],
    remaining: [],
    rollId: 0,
    turnStart: null,
    turnMoves: [],
    opening: { white: null, black: null },
    cube: { value: 1, owner: null },
    match: {
      length: matchLength,
      score: { white: 0, black: 0 },
      crawford: false,
      crawfordDone: false,
      gameNumber: 1,
    },
    lastResult: null,
    log: [],
  };
}

export const rollDie = () => 1 + Math.floor(Math.random() * 6);

export function colorOf(s: GameState, playerId: string): Color | null {
  if (s.players.white?.id === playerId) return "white";
  if (s.players.black?.id === playerId) return "black";
  return null;
}

export function joinGame(s: GameState, p: Player): GameState {
  if (colorOf(s, p.id)) {
    // update name only
    const c = colorOf(s, p.id)!;
    return { ...s, players: { ...s.players, [c]: { ...p } } };
  }
  const n = structuredClone(s);
  if (!n.players.white) n.players.white = p;
  else if (!n.players.black) n.players.black = p;
  else return s; // spectator
  if (n.players.white && n.players.black && n.phase === "waiting") n.phase = "opening";
  return n;
}

export function openingRoll(s: GameState, c: Color, forced?: number): GameState {
  if (s.phase !== "opening" || s.opening[c] != null) return s;
  const n = structuredClone(s);
  n.opening[c] = forced ?? rollDie();
  n.rollId++;
  const w = n.opening.white, bl = n.opening.black;
  if (w != null && bl != null) {
    if (w === bl) {
      n.log.push(`תיקו בהטלת הפתיחה (${w}) — מטילים שוב`);
      n.opening = { white: null, black: null };
    } else {
      n.turn = w > bl ? "white" : "black";
      n.dice = [w, bl];
      startMoving(n);
    }
  }
  return n;
}

function startMoving(n: GameState) {
  n.remaining = n.dice[0] === n.dice[1] ? [n.dice[0], n.dice[0], n.dice[0], n.dice[0]] : n.dice.slice();
  n.turnStart = cloneBoard(n.board);
  n.turnMoves = [];
  n.phase = "moving";
}

export function canDouble(s: GameState, c: Color): boolean {
  return (
    s.phase === "rolling" &&
    s.turn === c &&
    !s.match.crawford &&
    s.cube.value < 64 &&
    (s.cube.owner === null || s.cube.owner === c) &&
    // no point doubling if you already have enough to win the match
    s.match.score[c] + s.cube.value < s.match.length
  );
}

export function roll(s: GameState, c: Color, forced?: [number, number]): GameState {
  if (s.phase !== "rolling" || s.turn !== c) return s;
  const n = structuredClone(s);
  n.dice = forced ? [...forced] : [rollDie(), rollDie()];
  n.rollId++;
  startMoving(n);
  return n;
}

export function offerDouble(s: GameState, c: Color): GameState {
  if (!canDouble(s, c)) return s;
  const n = structuredClone(s);
  n.phase = "doubleOffered";
  n.log.push(`${c === "white" ? "לבן" : "שחור"} מציע דאבל ל-${s.cube.value * 2}`);
  return n;
}

export function answerDouble(s: GameState, c: Color, accept: boolean): GameState {
  if (s.phase !== "doubleOffered" || s.turn === c) return s;
  const n = structuredClone(s);
  if (accept) {
    n.cube = { value: s.cube.value * 2, owner: c };
    n.phase = "rolling";
    n.log.push(`הדאבל התקבל — הקובייה על ${n.cube.value}`);
    return n;
  }
  return finishGame(n, s.turn, s.cube.value, "declined");
}

export function playMove(s: GameState, c: Color, m: Move): GameState {
  if (s.phase !== "moving" || s.turn !== c) return s;
  const legal = legalMoves(s.board, c, s.remaining, s.dice);
  const ok = legal.find((x) => x.from === m.from && x.to === m.to && x.die === m.die);
  if (!ok) return s;
  const n = structuredClone(s);
  n.board = applyMove(n.board, c, ok);
  n.remaining.splice(n.remaining.indexOf(ok.die), 1);
  n.turnMoves.push(ok);
  if (n.board.off[c] === 15) return scoreWin(n, c);
  return n;
}

export function undo(s: GameState, c: Color): GameState {
  if (s.phase !== "moving" || s.turn !== c || !s.turnStart || s.turnMoves.length === 0) return s;
  const n = structuredClone(s);
  n.turnMoves.pop();
  // replay from turn start
  let b = cloneBoard(n.turnStart!);
  const rem = n.dice[0] === n.dice[1] ? [n.dice[0], n.dice[0], n.dice[0], n.dice[0]] : n.dice.slice();
  for (const m of n.turnMoves) {
    b = applyMove(b, c, m);
    rem.splice(rem.indexOf(m.die), 1);
  }
  n.board = b;
  n.remaining = rem;
  return n;
}

/** Turn can be ended when no further legal move exists. */
export function canEndTurn(s: GameState, c: Color): boolean {
  return s.phase === "moving" && s.turn === c && legalMoves(s.board, c, s.remaining, s.dice).length === 0;
}

export function endTurn(s: GameState, c: Color): GameState {
  if (!canEndTurn(s, c)) return s;
  const n = structuredClone(s);
  n.turn = other(c);
  n.phase = "rolling";
  n.remaining = [];
  n.turnStart = null;
  n.turnMoves = [];
  return n;
}

function scoreWin(n: GameState, winner: Color): GameState {
  const loser = other(winner);
  let mult = 1;
  let kind: "single" | "gammon" | "backgammon" = "single";
  if (n.board.off[loser] === 0) {
    mult = 2;
    kind = "gammon";
    let inWinnerHome = n.board.bar[loser] > 0;
    for (let i = 0; i < 24; i++) {
      if (countAt(n.board, i, loser) > 0 && posOf(i, winner) <= 6) inWinnerHome = true;
    }
    if (inWinnerHome) { mult = 3; kind = "backgammon"; }
  }
  return finishGame(n, winner, n.cube.value * mult, kind);
}

export function resign(s: GameState, c: Color): GameState {
  if (!["rolling", "moving", "doubleOffered"].includes(s.phase)) return s;
  return finishGame(structuredClone(s), other(c), s.cube.value, "resigned");
}

function finishGame(n: GameState, winner: Color, points: number, kind: NonNullable<GameState["lastResult"]>["kind"]): GameState {
  n.match.score[winner] += points;
  n.lastResult = { winner, points, kind };
  n.remaining = [];
  n.turnMoves = [];
  n.turnStart = null;
  const L = n.match.length;
  if (n.match.score[winner] >= L) {
    n.phase = "matchOver";
  } else {
    n.phase = "gameOver";
  }
  return n;
}

export function nextGame(s: GameState): GameState {
  if (s.phase !== "gameOver") return s;
  const n = structuredClone(s);
  const L = n.match.length;
  // Crawford rule: the first game after someone reaches L-1 is played without the cube
  if (n.match.crawford) {
    n.match.crawford = false;
    n.match.crawfordDone = true;
  } else if (!n.match.crawfordDone && L > 1 && (n.match.score.white === L - 1 || n.match.score.black === L - 1)) {
    n.match.crawford = true;
  }
  n.board = initialBoard();
  n.cube = { value: 1, owner: null };
  n.dice = [];
  n.remaining = [];
  n.opening = { white: null, black: null };
  n.phase = "opening";
  n.lastResult = null;
  n.match.gameNumber++;
  return n;
}

export function newMatch(s: GameState): GameState {
  const n = newGameState(s.match.length);
  n.players = structuredClone(s.players);
  n.phase = n.players.white && n.players.black ? "opening" : "waiting";
  n.version = s.version;
  return n;
}

/** Pip count — useful for the UI */
export function pips(b: Board, c: Color): number {
  let t = b.bar[c] * 25;
  for (let i = 0; i < 24; i++) t += countAt(b, i, c) * posOf(i, c);
  return t;
}
