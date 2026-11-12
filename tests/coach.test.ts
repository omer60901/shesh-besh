import { strict as assert } from "node:assert";
import * as E from "../lib/engine";
import * as B from "../lib/bot";
const die = () => 1 + Math.floor(Math.random() * 6);
// 1) the coach always grades its own move as best; 2) random moves lose more on average than "hard" moves
let n = 0; const loss = { random: 0, hard: 0, impossible: 0 }; const cnt = { random: 0, hard: 0, impossible: 0 };
const grades: Record<string, Record<string, number>> = { random: {}, hard: {} };
for (let g = 0; g < 25; g++) {
  let b = E.initialBoard(); let turn: E.Color = "white";
  for (let ply = 0; ply < 300; ply++) {
    const d: [number, number] = [die(), die()]; const rem = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]];
    const ts = B.allTurns(b, turn, rem, d);
    if (ts.length > 1) {
      const hint = B.coachHint(b, turn, rem, d); let hb: E.Board = b; for (const m of hint) hb = E.applyMove(hb, turn, m);
      const r0: B.Review = B.reviewTurn(b, turn, d, hb)!; assert.equal(r0.grade, "best"); assert.ok(r0.loss < 1e-9);
      const rb = ts[Math.floor(Math.random() * ts.length)].board; const r1 = B.reviewTurn(b, turn, d, rb)!; loss.random += r1.loss; cnt.random++; grades.random[r1.grade] = (grades.random[r1.grade] || 0) + 1;
      let h = b; for (const m of B.chooseTurn(b, turn, rem, d, "hard")) h = E.applyMove(h, turn, m); const r2 = B.reviewTurn(b, turn, d, h)!; loss.hard += r2.loss; cnt.hard++; grades.hard[r2.grade] = (grades.hard[r2.grade] || 0) + 1;
      n++;
    }
    for (const m of B.chooseTurn(b, turn, rem, d, "hard")) b = E.applyMove(b, turn, m);
    if (b.off[turn] === 15) break; turn = E.other(turn);
  }
}
console.log("positions", n, "avg loss random", (loss.random / cnt.random).toFixed(3), "hard", (loss.hard / cnt.hard).toFixed(3));
console.log("grades of random moves", grades.random); console.log("grades of hard-bot moves", grades.hard);
assert.ok(loss.random / cnt.random > 2 * loss.hard / cnt.hard);
console.log("coach tests passed");
