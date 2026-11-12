"use client";
// A local, single-player board: the learner plays one turn for white from a given position.
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Board from "@/components/Board";
import * as E from "@/lib/engine";
import type { Board as B, GameState, Move } from "@/lib/engine";
import { sfxChecker, sfxDice, sfxHit } from "@/lib/sound";

function mk(board: B, dice?: [number, number]): GameState {
  const s = E.newGameState(1);
  s.players = { white: { id: "me", name: "אתה" }, black: { id: "opp", name: "" } };
  s.board = E.cloneBoard(board);
  s.turn = "white";
  if (dice) {
    s.phase = "moving";
    s.dice = [dice[0], dice[1]];
    s.remaining = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
    s.turnStart = E.cloneBoard(board);
    s.rollId = 1;
  } else s.phase = "rolling";
  return s;
}

export default function Practice({ board, dice, hint, locked, doneLabel = "בדוק", onDone }: {
  board: B; dice?: [number, number]; hint?: Move[] | null; locked?: boolean; doneLabel?: string;
  onDone?: (after: B, start: B) => void;
}) {
  const [s, setS] = useState<GameState>(() => mk(board, dice));
  const [selected, setSelected] = useState<number | "bar" | "off" | null>(null);
  useEffect(() => { if (dice) sfxDice(); }, [dice]);

  const active = !!dice && !locked && s.phase === "moving";
  const legal = useMemo(() => (active ? E.legalMoves(s.board, "white", s.remaining, s.dice) : []), [s, active]);
  useEffect(() => { if (legal.length && legal.every((m) => m.from === "bar")) setSelected("bar"); }, [legal]);

  const play = (m: Move) => { setS((x) => E.playMove(x, "white", m)); setSelected(null); setTimeout(m.hit ? sfxHit : sfxChecker, 240); };
  function pick(loc: number | "bar" | "off") {
    if (!legal.length) return;
    if (selected !== null) {
      if (String(selected) === String(loc)) { if (loc !== "bar") setSelected(null); return; }
      const mv = legal.find((m) => String(m.from) === String(selected) && String(m.to) === String(loc));
      if (mv) return play(mv);
    }
    if (legal.some((m) => String(m.from) === String(loc))) return setSelected(loc);
    const to = legal.filter((m) => String(m.to) === String(loc));
    if (to.length && new Set(to.map((m) => String(m.from))).size === 1) return play(to[0]);
    setSelected(null);
  }

  useEffect(() => { (window as any).__pr = { legal, state: s }; }, [legal, s]); // debug hook for automated tests
  const finished = active && legal.length === 0;
  const hintNow = hint && s.turnMoves.length === 0 ? hint : null;
  return (
    <div>
      <Board state={s} viewer="white" legal={legal} selected={selected} onPick={pick} hint={hintNow} />
      {active && (
        <div className="controls">
          {s.turnMoves.length > 0 && <button className="btn ghost" onClick={() => { setS((x) => E.undo(x, "white")); setSelected(null); }}>↶ בטל מהלך</button>}
          {finished && (
            <motion.button className="btn" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={() => onDone?.(s.board, board)}>✓ {doneLabel}</motion.button>
          )}
        </div>
      )}
    </div>
  );
}
