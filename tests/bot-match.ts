// Full matches with the doubling cube, driven through the same engine calls the UI uses.
// usage: tsx tests/bot-match.ts <levelA> <levelB> <matches> [length]
import * as E from "../lib/engine";
import * as B from "../lib/bot";
import { strict as assert } from "node:assert";

const [la, lb] = [process.argv[2] as B.BotLevel, process.argv[3] as B.BotLevel];
const N = Number(process.argv[4] || 50), L = Number(process.argv[5] || 5);
let winsA = 0, doubles = 0, drops = 0, takes = 0, games = 0;
for (let m = 0; m < N; m++) {
  const aWhite = m % 2 === 0;
  const lvl = (c: E.Color) => ((c === "white") === aWhite ? la : lb);
  let s = E.joinGame(E.joinGame(E.newGameState(L), { id: "bot:a", name: "A" }), { id: "bot:b", name: "B" });
  for (let guard = 0; s.phase !== "matchOver"; guard++) {
    assert.ok(guard < 100000, "stuck in phase " + s.phase);
    const before = s;
    if (s.phase === "opening") { s = E.openingRoll(s, "white"); s = E.openingRoll(s, "black"); }
    else if (s.phase === "rolling") {
      const c = s.turn;
      if (B.botShouldDouble(s, c, lvl(c))) { s = E.offerDouble(s, c); doubles++; }
      else s = E.roll(s, c);
    } else if (s.phase === "doubleOffered") {
      const c = E.other(s.turn); const take = B.botShouldTake(s, c, lvl(c));
      take ? takes++ : drops++;
      s = E.answerDouble(s, c, take);
    } else if (s.phase === "moving") {
      const c = s.turn;
      for (const mv of B.chooseTurn(s.board, c, s.remaining, s.dice, lvl(c))) { const n = E.playMove(s, c, mv); assert.notEqual(n, s, "bot move rejected"); s = n; if (s.phase !== "moving") break; }
      if (s.phase === "moving") { assert.ok(E.canEndTurn(s, c), "bot left dice unplayed"); s = E.endTurn(s, c); }
    } else if (s.phase === "gameOver") { games++; s = E.nextGame(s); }
    assert.notEqual(s, before, "no progress in phase " + before.phase);
  }
  games++;
  const w = s.match.score.white >= L ? "white" : "black";
  if ((w === "white") === aWhite) winsA++;
}
console.log(`${la} vs ${lb}, matches to ${L}: ${la} won ${winsA}/${N} (${(100 * winsA / N).toFixed(0)}%) | games ${games}, doubles offered ${doubles}, taken ${takes}, dropped ${drops}`);
