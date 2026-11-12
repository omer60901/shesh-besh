import { strict as assert } from "node:assert";
import * as E from "../lib/engine";

const empty = (): E.Board => ({ points: new Array(24).fill(0), bar: { white: 0, black: 0 }, off: { white: 0, black: 0 } });
let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log("✓", name); };

t("initial board has 15 each", () => {
  const b = E.initialBoard();
  assert.equal(b.points.filter((x) => x > 0).reduce((a, x) => a + x, 0), 15);
  assert.equal(-b.points.filter((x) => x < 0).reduce((a, x) => a + x, 0), 15);
  assert.equal(E.pips(b, "white"), 167);
  assert.equal(E.pips(b, "black"), 167);
});

t("blocked points not allowed", () => {
  const b = E.initialBoard();
  // white from 24pt (idx23) with 5 -> idx18 has 5 black: blocked
  const ms = E.singleMoves(b, "white", 5);
  assert.ok(!ms.some((m) => m.from === 23 && m.to === 18));
});

t("must enter from bar first; hit sends to bar", () => {
  const b = empty();
  b.bar.white = 1; b.points[10] = 3; b.points[20] = -1;
  const ms = E.singleMoves(b, "white", 4); // enter at pos 21 -> idx20
  assert.equal(ms.length, 1);
  assert.equal(ms[0].to, 20);
  assert.ok(ms[0].hit);
  const nb = E.applyMove(b, "white", ms[0]);
  assert.equal(nb.bar.black, 1);
  assert.equal(nb.points[20], 1);
});

t("bear off exact and overshoot only from highest", () => {
  const b = empty();
  b.points[3] = 1; b.points[1] = 1; b.off.white = 13; // white on pos 4 and 2
  const ms6 = E.singleMoves(b, "white", 6);
  assert.deepEqual(ms6.map((m) => m.from), [3]); // only highest may overshoot
  const ms2 = E.singleMoves(b, "white", 2);
  assert.ok(ms2.some((m) => m.from === 1 && m.to === "off"));
  assert.ok(ms2.some((m) => m.from === 3 && m.to === 1));
});

t("cannot bear off with checker outside home", () => {
  const b = empty();
  b.points[0] = 14; b.points[10] = 1;
  assert.ok(!E.singleMoves(b, "white", 1).some((m) => m.to === "off"));
});

t("must use both dice when possible", () => {
  // White checker at idx 10 (pos 11). Dice 6,1. Playing 6 first -> pos5, then 1 -> pos4 ok.
  // Block pos 10 (idx9) so playing 1 first is impossible; and make 6-then-1 required.
  const b = empty();
  b.points[10] = 1; b.points[9] = -2; b.points[0] = 14;
  const lm = E.legalMoves(b, "white", [6, 1], [6, 1]);
  // Moving idx0 checker with 1 would bear off? not all home (idx10 outside) so no.
  assert.ok(lm.every((m) => !(m.from === 10 && m.die === 1)));
  assert.ok(lm.some((m) => m.from === 10 && m.die === 6));
});

t("higher die rule when only one can be played", () => {
  // White single checker at pos 8 (idx7), rest borne off-ish. Dice 5 and 2.
  // pos8-5=3 ok, then 2 -> pos1 blocked. pos8-2=6 then 5 -> pos1 blocked.
  const b = empty();
  b.points[7] = 1; b.off.white = 14;
  b.points[0] = -2; // pos1 blocked
  b.points[3] = -2; // pos4? not needed
  // after 5: pos3 (idx2); then 2 -> pos1 blocked; bear off? not all home? pos3 is home and no others -> 2 from pos3 = pos1 blocked, overshoot no.
  // after 2: pos6 (idx5) then 5 -> pos1 blocked.
  const lm = E.legalMoves(b, "white", [5, 2], [5, 2]);
  assert.ok(lm.length > 0);
  assert.ok(lm.every((m) => m.die === 5), JSON.stringify(lm));
});

t("doubles give four moves", () => {
  let s = E.newGameState(3);
  s = E.joinGame(s, { id: "a", name: "A" });
  s = E.joinGame(s, { id: "b", name: "B" });
  assert.equal(s.phase, "opening");
  s = { ...s, phase: "rolling", turn: "white" };
  s = E.roll(s, "white", [3, 3]);
  assert.equal(s.remaining.length, 4);
});

t("full game flow: move, undo, end turn", () => {
  let s = E.newGameState(1);
  s = E.joinGame(s, { id: "a", name: "A" });
  s = E.joinGame(s, { id: "b", name: "B" });
  s = { ...s, phase: "rolling", turn: "white" };
  s = E.roll(s, "white", [3, 1]);
  s = E.playMove(s, "white", { from: 7, to: 4, die: 3 });
  assert.equal(s.board.points[4], 1);
  s = E.undo(s, "white");
  assert.equal(s.board.points[4], 0);
  assert.equal(s.remaining.length, 2);
  s = E.playMove(s, "white", { from: 7, to: 4, die: 3 });
  s = E.playMove(s, "white", { from: 5, to: 4, die: 1 });
  assert.equal(s.board.points[4], 2);
  assert.ok(E.canEndTurn(s, "white"));
  s = E.endTurn(s, "white");
  assert.equal(s.turn, "black");
  assert.equal(s.phase, "rolling");
});

t("illegal move rejected", () => {
  let s = E.newGameState(1);
  s = { ...E.joinGame(E.joinGame(s, { id: "a", name: "A" }), { id: "b", name: "B" }), phase: "rolling", turn: "white" };
  s = E.roll(s, "white", [6, 5]);
  const before = s;
  s = E.playMove(s, "white", { from: 23, to: 18, die: 5 });
  assert.equal(s, before);
});

t("doubling cube + decline awards points", () => {
  let s = E.newGameState(5);
  s = { ...E.joinGame(E.joinGame(s, { id: "a", name: "A" }), { id: "b", name: "B" }), phase: "rolling", turn: "white" };
  assert.ok(E.canDouble(s, "white"));
  s = E.offerDouble(s, "white");
  s = E.answerDouble(s, "black", true);
  assert.equal(s.cube.value, 2);
  assert.equal(s.cube.owner, "black");
  assert.ok(!E.canDouble(s, "white")); // white no longer owns cube
  s = { ...s, turn: "black" };
  assert.ok(E.canDouble(s, "black"));
  s = E.offerDouble(s, "black");
  s = E.answerDouble(s, "white", false);
  assert.equal(s.match.score.black, 2);
  assert.equal(s.phase, "gameOver");
});

t("gammon and backgammon scoring", () => {
  let s = E.newGameState(7);
  s = { ...E.joinGame(E.joinGame(s, { id: "a", name: "A" }), { id: "b", name: "B" }), phase: "rolling", turn: "white" };
  const b = empty();
  b.points[0] = 1; b.off.white = 14;
  b.points[3] = -15; // black all in white's home -> backgammon
  s = { ...s, board: b };
  s = E.roll(s, "white", [1, 2]);
  s = E.playMove(s, "white", { from: 0, to: "off", die: 2 });
  assert.equal(s.lastResult?.kind, "backgammon");
  assert.equal(s.match.score.white, 3);

  let g = E.newGameState(7);
  g = { ...E.joinGame(E.joinGame(g, { id: "a", name: "A" }), { id: "b", name: "B" }), phase: "rolling", turn: "white" };
  const b2 = empty();
  b2.points[0] = 1; b2.off.white = 14; b2.points[12] = -15;
  g = { ...g, board: b2, cube: { value: 2, owner: "white" } };
  g = E.roll(g, "white", [1, 2]);
  g = E.playMove(g, "white", { from: 0, to: "off", die: 2 });
  assert.equal(g.lastResult?.kind, "gammon");
  assert.equal(g.match.score.white, 4);
});

t("crawford game disables cube", () => {
  let s = E.newGameState(3);
  s = { ...E.joinGame(E.joinGame(s, { id: "a", name: "A" }), { id: "b", name: "B" }), phase: "rolling", turn: "white" };
  s = E.resign(s, "black"); // white +1
  s = E.nextGame(s); // score 1, not crawford yet
  assert.ok(!s.match.crawford);
  s = { ...s, phase: "rolling", turn: "white" };
  s = E.resign(s, "black"); // white 2 = L-1
  s = E.nextGame(s);
  assert.ok(s.match.crawford);
  s = { ...s, phase: "rolling", turn: "black" };
  assert.ok(!E.canDouble(s, "black"));
  s = E.resign(s, "white"); // black +1
  s = E.nextGame(s);
  assert.ok(!s.match.crawford && s.match.crawfordDone);
  s = { ...s, phase: "rolling", turn: "black" };
  assert.ok(E.canDouble(s, "black"));
});

t("random playthrough never breaks invariants", () => {
  for (let g = 0; g < 200; g++) {
    let s = E.newGameState(1);
    s = { ...E.joinGame(E.joinGame(s, { id: "a", name: "A" }), { id: "b", name: "B" }), phase: "rolling", turn: g % 2 ? "white" : "black" };
    let guard = 0;
    while (s.phase !== "matchOver" && guard++ < 2000) {
      const c = s.turn;
      s = E.roll(s, c);
      let lm = E.legalMoves(s.board, c, s.remaining, s.dice);
      while (lm.length && s.phase === "moving") {
        s = E.playMove(s, c, lm[Math.floor(Math.random() * lm.length)]);
        lm = s.phase === "moving" ? E.legalMoves(s.board, c, s.remaining, s.dice) : [];
      }
      for (const col of ["white", "black"] as const) {
        let tot = s.board.bar[col] + s.board.off[col];
        for (let i = 0; i < 24; i++) tot += E.countAt(s.board, i, col);
        assert.equal(tot, 15);
      }
      if (s.phase === "moving") {
        // all dice used or none left playable
        assert.ok(E.canEndTurn(s, c));
        s = E.endTurn(s, c);
      }
    }
    assert.equal(s.phase, "matchOver");
  }
});

console.log(`\n${passed} tests passed`);
