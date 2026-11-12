import { strict as assert } from "node:assert";
import * as T from "../lib/train";
import * as B from "../lib/bot";
import * as E from "../lib/engine";
const total = (b: E.Board, c: E.Color) => { let n = b.bar[c] + b.off[c]; for (let i = 0; i < 24; i++) n += E.countAt(b, i, c); return n; };
for (const L of T.LESSONS) for (const [i, s] of L.steps.entries()) {
  if (s.board) { assert.equal(total(s.board, "white"), 15, L.id); assert.equal(total(s.board, "black"), 15, L.id); assert.ok(s.board.off.white >= 0 && s.board.off.black >= 0); }
  if (!s.dice) continue;
  const ts = B.allTurns(s.board!, "white", [s.dice[0], s.dice[1]], s.dice);
  const good = ts.filter((t) => s.goal!(t.board, s.board!)).length;
  assert.ok(ts.length > 0 && good > 0, `${L.id} step ${i}: goal unreachable`);
  console.log(`lesson ${L.id}: ${good}/${ts.length} turns reach the goal`);
}
for (const topic of ["all", "hit", "bar", "race", "bearoff"] as T.Topic[]) {
  const t0 = Date.now(); let n = 0;
  for (let k = 0; k < 8; k++) {
    const p = T.genPuzzle(topic); assert.equal(total(p.board, "white"), 15);
    const ts = B.allTurns(p.board, "white", p.dice[0] === p.dice[1] ? [p.dice[0], p.dice[0], p.dice[0], p.dice[0]] : [p.dice[0], p.dice[1]], p.dice);
    assert.ok(ts.length >= 3);
    if (topic === "bar") assert.ok(p.board.bar.white > 0);
    if (topic === "bearoff") assert.ok(E.allHome(p.board, "white"));
    if (topic === "race") assert.ok(B.isRace(p.board, "white"));
    if (topic === "hit") assert.ok(ts.some((t) => t.moves.some((m) => m.hit)));
    n += ts.length;
  }
  console.log(`topic ${topic}: ${(Date.now() - t0) / 8 | 0}ms per puzzle, avg ${n / 8 | 0} options`);
}
console.log("train tests passed");
