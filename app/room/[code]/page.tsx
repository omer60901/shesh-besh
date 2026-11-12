"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import Board from "@/components/Board";
import * as E from "@/lib/engine";
import type { Color, GameState, Move } from "@/lib/engine";
import { isCoach, isHotseat, playerId, savedName, saveName, transport } from "@/lib/sync";
import { botLevelOf, botShouldDouble, botShouldTake, chooseTurn, coachHint, reviewTurn, winProb, type Review } from "@/lib/bot";
import { GRADE_COLOR, GRADE_TEXT, isGoodGrade, moveText } from "@/lib/train";
import { isMuted, setMuted, sfxChecker, sfxDice, sfxHit, sfxWin } from "@/lib/sound";

const heColor = (c: Color) => (c === "white" ? "לבן" : "שחור");

export default function Room() {
  const { code: raw } = useParams<{ code: string }>();
  const code = String(raw).toUpperCase();
  const router = useRouter();

  const [state, setState] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pid, setPid] = useState("");
  const [name, setName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [selected, setSelected] = useState<number | "bar" | "off" | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setPid(playerId());
    const n = savedName();
    setName(n);
    if (!n) setNeedName(true);
    setMutedState(isMuted());
    setUrl((window as any).__SB_HASH ? `${location.origin}${location.pathname}#${code}` : `${window.location.origin}/room/${code}`);
  }, [code]);

  useEffect(() => {
    return transport().subscribe(code, (s) => { setState(s); setLoaded(true); });
  }, [code]);

  // join a free seat once we know our name
  useEffect(() => {
    if (!state || !pid || !name || needName || isHotseat(code)) return;
    const mine = E.colorOf(state, pid);
    const free = !state.players.white || !state.players.black;
    if (!mine && free) transport().update(code, (s) => (s ? E.joinGame(s, { id: pid, name }) : s));
  }, [state, pid, name, needName, code]);

  const act = useCallback((fn: (s: GameState) => GameState) => {
    setState((s) => (s ? fn(s) : s)); // optimistic
    transport().update(code, (s) => (s ? fn(s) : s));
  }, [code]);

  const hot = isHotseat(code);
  const seat = state && pid ? E.colorOf(state, pid) : null;
  const my: Color | null = hot && state ? actorFor(state) : seat;
  const viewer: Color = hot ? "white" : my ?? "white";
  const opp: Color = E.other(viewer);

  // ---------- bot opponent: driven by the human player's browser ----------
  const botColor: Color | null = !state ? null : botLevelOf(state.players.white?.id) ? "white" : botLevelOf(state.players.black?.id) ? "black" : null;
  const botLevel = botColor && state ? botLevelOf(state.players[botColor]?.id) : null;
  const drivesBot = !!botColor && seat === E.other(botColor);
  const plan = useRef<{ rollId: number; base: number; moves: Move[] } | null>(null);
  useEffect(() => {
    if (!state || !botColor || !botLevel || !drivesBot) return;
    const s = state, c = botColor, level = botLevel;
    let delay = 0;
    let step: (() => void) | null = null;
    if (s.phase === "opening" && s.opening[c] == null) {
      delay = 800;
      step = () => { const d = E.rollDie(); act((x) => E.openingRoll(x, c, d)); };
    } else if (s.phase === "doubleOffered" && s.turn !== c) {
      delay = 1500;
      step = () => { const take = botShouldTake(s, c, level); act((x) => E.answerDouble(x, c, take)); };
    } else if (s.phase === "rolling" && s.turn === c) {
      delay = 1000;
      step = () => {
        if (botShouldDouble(s, c, level)) return act((x) => E.offerDouble(x, c));
        const d: [number, number] = [E.rollDie(), E.rollDie()];
        act((x) => E.roll(x, c, d));
      };
    } else if (s.phase === "moving" && s.turn === c) {
      delay = s.turnMoves.length === 0 ? 1400 : 800;
      step = () => {
        let p = plan.current;
        if (!p || p.rollId !== s.rollId || s.turnMoves.length < p.base) {
          p = { rollId: s.rollId, base: s.turnMoves.length, moves: chooseTurn(s.board, c, s.remaining, s.dice, level) };
          plan.current = p;
        }
        const m = p.moves[s.turnMoves.length - p.base];
        if (m) act((x) => E.playMove(x, c, m));
        else act((x) => E.endTurn(x, c));
      };
    }
    if (!step) return;
    const t = setTimeout(step, delay);
    return () => clearTimeout(t);
  }, [state, botColor, botLevel, drivesBot, act]);

  const legal: Move[] = useMemo(() => {
    if (!state || !my || state.phase !== "moving" || state.turn !== my) return [];
    return E.legalMoves(state.board, my, state.remaining, state.dice);
  }, [state, my]);

  // ---------- coach (practice games against the bot only) ----------
  const coach = drivesBot && isCoach(code);
  const [hintOn, setHintOn] = useState(false);
  const [pending, setPending] = useState<Review | null>(null);
  const [note, setNote] = useState<Review | null>(null);
  const freshStats = () => ({ graded: new Set<number>(), n: 0, good: 0, slips: 0, errors: 0 });
  const stats = useRef(freshStats());
  useEffect(() => { setHintOn(false); setPending(null); }, [state?.rollId]);
  useEffect(() => { if (state?.phase === "opening") { stats.current = freshStats(); setNote(null); } }, [state?.phase]);
  const hint = useMemo(() => {
    if (!coach || !hintOn || !state || !my || state.phase !== "moving" || state.turn !== my) return null;
    return coachHint(state.board, my, state.remaining, state.dice);
  }, [coach, hintOn, state, my]);
  const winP = useMemo(() => {
    if (!coach || !state) return null;
    if (state.phase === "moving") return winProb(state.turnStart ?? state.board, viewer, state.turn === viewer);
    if (state.phase === "rolling" || state.phase === "doubleOffered") return winProb(state.board, viewer, state.turn === viewer);
    if (state.lastResult) return state.lastResult.winner === viewer ? 1 : 0;
    return 0.5;
  }, [coach, state, viewer]);

  function finishTurn() {
    if (!state || !my) return;
    if (coach && state.turnStart && state.turnMoves.length) {
      const r = reviewTurn(state.turnStart, my, state.dice, state.board);
      if (r) {
        const st = stats.current;
        if (!st.graded.has(state.rollId)) {
          st.graded.add(state.rollId); st.n++;
          if (isGoodGrade(r.grade)) st.good++; else if (r.grade === "inaccuracy") st.slips++; else st.errors++;
        }
        if (!isGoodGrade(r.grade)) return setPending(r);
        setNote(r);
      }
    }
    act((s) => E.endTurn(s, my));
  }
  function retryTurn() {
    if (!my) return;
    act((s) => { let x = s; while (x.phase === "moving" && x.turnMoves.length) x = E.undo(x, my); return x; });
    setPending(null); setHintOn(true);
  }

  useEffect(() => setSelected(null), [state?.turn, state?.phase]);
  // debug hook for automated tests
  useEffect(() => { (window as any).__sb = { state, legal, my }; }, [state, legal, my]);
  // auto-select the bar when you must enter
  useEffect(() => {
    if (legal.length && legal.every((m) => m.from === "bar")) setSelected("bar");
  }, [legal]);

  // ---------- sounds ----------
  const prev = useRef<GameState | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p && state) {
      if (state.rollId !== p.rollId) sfxDice();
      else if (JSON.stringify(state.board) !== JSON.stringify(p.board)) {
        const hit = state.board.bar.white > p.board.bar.white || state.board.bar.black > p.board.bar.black;
        setTimeout(hit ? sfxHit : sfxChecker, 260);
      }
      if (state.lastResult && !p.lastResult) setTimeout(sfxWin, 400);
    }
    prev.current = state;
  }, [state]);

  function pick(loc: number | "bar" | "off") {
    if (!state || !my || !legal.length) return;
    const isSource = legal.some((m) => String(m.from) === String(loc));
    if (selected !== null) {
      if (String(selected) === String(loc)) {
        if (loc !== "bar") setSelected(null); // the bar stays selected while you must enter
        return;
      }
      const mv = legal.find((m) => String(m.from) === String(selected) && String(m.to) === String(loc));
      if (mv) { act((s) => E.playMove(s, my, mv)); setSelected(null); return; }
    }
    if (isSource) return setSelected(loc);
    // tap a destination directly when only one checker can go there
    const to = legal.filter((m) => String(m.to) === String(loc));
    const froms = new Set(to.map((m) => String(m.from)));
    if (to.length && froms.size === 1) { act((s) => E.playMove(s, my, to[0])); setSelected(null); return; }
    setSelected(null);
  }

  // ---------- render ----------
  if (needName) {
    return (
      <div className="overlay">
        <motion.div className="card modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <h2 className="title" style={{ fontSize: 34 }}>מצטרפים לחדר</h2>
          <p className="code" style={{ fontSize: 22, color: "var(--gold-soft)" }}>{code}</p>
          <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; saveName(name.trim()); setName(name.trim()); setNeedName(false); }}>
            <input autoFocus className="input" value={name} maxLength={16} placeholder="איך קוראים לך?" onChange={(e) => setName(e.target.value)} />
            <button className="btn" style={{ width: "100%", marginTop: 12 }}>יאללה</button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (loaded && !state) {
    return (
      <div className="overlay">
        <div className="card modal">
          <h2 className="title" style={{ fontSize: 30 }}>החדר לא נמצא</h2>
          <p className="muted">בדוק את הקוד <span className="code">{code}</span> או פתח חדר חדש.</p>
          <button className="btn" onClick={() => router.push("/")}>למסך הראשי</button>
        </div>
      </div>
    );
  }

  if (!state) return <div className="center" style={{ height: "100dvh" }}><span className="muted">טוען…</span></div>;

  const pl = state.players;
  const myTurn = my !== null && state.turn === my;
  const status = statusText(state, my, legal.length);

  return (
    <div className="game">
      <div className="topbar">
        <button className="btn ghost small" onClick={() => router.push("/")}>→ יציאה</button>
        <div className="row" style={{ gap: 8 }}>
          <span className="pill">עד {state.match.length}</span>
          {state.match.crawford && <span className="pill" title="במשחק הזה אין דאבל">קרופורד</span>}
          <button className="btn ghost small" onClick={() => { setMuted(!muted); setMutedState(!muted); }}>{muted ? "🔇" : "🔊"}</button>
          <button className="btn ghost small" onClick={() => setShowShare(true)}>הזמן 📱</button>
        </div>
      </div>

      <div className="players">
        <PlayerCard c={opp} name={pl[opp]?.name} active={state.turn === opp && isPlaying(state)} pips={E.pips(state.board, opp)} you={false} />
        <div className="score">
          {state.match.score[opp]} : {state.match.score[viewer]}
        </div>
        <PlayerCard c={viewer} name={pl[viewer]?.name} active={state.turn === viewer && isPlaying(state)} pips={E.pips(state.board, viewer)} you={!!my} />
      </div>

      {winP !== null && (
        <div className="winbar"><span>הסיכוי שלך</span><div className="track"><div className="fill" style={{ width: `${Math.round(winP * 100)}%` }} /></div><b style={{ color: "var(--gold-soft)", minWidth: 38 }}>{Math.round(winP * 100)}%</b></div>
      )}

      <Board state={state} viewer={viewer} legal={pending ? [] : legal} selected={selected} onPick={pick} hint={hint} />

      <AnimatePresence mode="wait">
        <motion.div key={status} className="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {status}
        </motion.div>
      </AnimatePresence>

      {coach && my && (pending || note || isPlaying(state)) && (
        <CoachBox state={state} my={my} pending={pending} note={note} />
      )}

      <div className="controls">
        {my && state.phase === "opening" && state.opening[my] == null && (
          <Btn onClick={() => { const d = E.rollDie(); act((s) => E.openingRoll(s, my, d)); }}>🎲 הטל לפתיחה</Btn>
        )}
        {my && state.phase === "rolling" && myTurn && (
          <>
            <Btn onClick={() => { const d: [number, number] = [E.rollDie(), E.rollDie()]; act((s) => E.roll(s, my, d)); }}>🎲 הטל קוביות</Btn>
            {E.canDouble(state, my) && <Btn ghost onClick={() => act((s) => E.offerDouble(s, my))}>דאבל ל-{state.cube.value * 2}</Btn>}
          </>
        )}
        {my && state.phase === "doubleOffered" && !myTurn && (
          <>
            <Btn onClick={() => act((s) => E.answerDouble(s, my, true))}>קבל ({state.cube.value * 2})</Btn>
            <Btn danger onClick={() => act((s) => E.answerDouble(s, my, false))}>סרב (מפסיד {state.cube.value})</Btn>
          </>
        )}
        {my && state.phase === "moving" && myTurn && pending && (
          <>
            <Btn onClick={retryTurn}>↶ נסה שוב עם חיצים</Btn>
            <Btn ghost onClick={() => { setNote(pending); setPending(null); act((s) => E.endTurn(s, my)); }}>המשך בכל זאת</Btn>
          </>
        )}
        {my && state.phase === "moving" && myTurn && !pending && (
          <>
            {coach && legal.length > 0 && <Btn ghost onClick={() => setHintOn(!hintOn)}>{hintOn ? "הסתר רמז" : "💡 רמז"}</Btn>}
            {state.turnMoves.length > 0 && <Btn ghost onClick={() => act((s) => E.undo(s, my))}>↶ בטל מהלך</Btn>}
            {E.canEndTurn(state, my) && (
              <Btn pulse onClick={finishTurn}>
                {state.turnMoves.length ? "✓ סיים תור" : "אין מהלכים — העבר תור"}
              </Btn>
            )}
          </>
        )}
        {my && isPlaying(state) && (
          confirmResign
            ? <>
                <Btn danger onClick={() => { act((s) => E.resign(s, my)); setConfirmResign(false); }}>בטוח? לוותר ({state.cube.value})</Btn>
                <Btn ghost onClick={() => setConfirmResign(false)}>לא</Btn>
              </>
            : <button className="btn ghost small" style={{ opacity: 0.6 }} onClick={() => setConfirmResign(true)}>🏳 ויתור</button>
        )}
      </div>

      {/* waiting for opponent */}
      {state.phase === "waiting" && <ShareModal url={url} code={code} waiting onClose={() => {}} />}
      {showShare && state.phase !== "waiting" && <ShareModal url={url} code={code} onClose={() => setShowShare(false)} />}

      {/* end of game */}
      <AnimatePresence>
        {(state.phase === "gameOver" || state.phase === "matchOver") && state.lastResult && (
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.6 }}>
            <motion.div className="card modal" initial={{ scale: 0.7, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 160, damping: 12, delay: 0.6 }}>
              <div style={{ fontSize: 56 }}>{state.lastResult.winner === my ? "🏆" : my ? "🎲" : "👏"}</div>
              <h2 className="title" style={{ fontSize: 34 }}>
                {state.phase === "matchOver" ? `${pl[state.lastResult.winner]?.name} ניצח במשחק!` : `${pl[state.lastResult.winner]?.name} לוקח את הסיבוב`}
              </h2>
              {coach && stats.current.n > 0 && (
                <p className="muted" style={{ fontSize: 15, margin: "4px 0" }}>
                  🎓 המאמן: {stats.current.good} מתוך {stats.current.n} מהלכים טובים · {stats.current.slips} אי-דיוקים · {stats.current.errors} טעויות
                </p>
              )}
              <p style={{ fontSize: 18 }}>
                {resultText(state.lastResult.kind)} · +{state.lastResult.points} {state.lastResult.points === 1 ? "נקודה" : "נקודות"}
              </p>
              <p className="score" style={{ margin: "8px 0 18px" }}>
                {pl.white?.name} {state.match.score.white} : {state.match.score.black} {pl.black?.name}
              </p>
              {state.phase === "gameOver"
                ? <button className="btn" onClick={() => act(E.nextGame)}>לסיבוב הבא ←</button>
                : <button className="btn" onClick={() => act(E.newMatch)}>עוד משחק 🔁</button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** In hot-seat mode, whoever has to act now is "you". */
function actorFor(s: GameState): Color {
  if (s.phase === "opening") return s.opening.white == null ? "white" : "black";
  if (s.phase === "doubleOffered") return E.other(s.turn);
  return s.turn;
}

function CoachBox({ state, my, pending, note }: { state: GameState; my: Color; pending: Review | null; note: Review | null }) {
  const myTurn = state.turn === my;
  let body: React.ReactNode = null, color = "rgba(90,209,255,0.5)";
  if (pending) {
    color = GRADE_COLOR[pending.grade];
    body = (
      <>
        <b style={{ color, fontSize: 19 }}>{GRADE_TEXT[pending.grade]}</b>
        <div>ויתרת על כ-{Math.max(1, Math.round(pending.loss * 100))}% מסיכויי הניצחון. המהלך של המאמן: <span className="mv">{moveText(pending.best, my)}</span></div>
      </>
    );
  } else if (state.phase === "doubleOffered" && !myTurn) {
    const p = Math.round(winProb(state.board, my, false) * 100);
    body = botShouldTake(state, my, "impossible") ? <>🎓 המאמן: כדאי לקבל. יש לך בערך {p}% לנצח, וזה מספיק.</> : <>🎓 המאמן: כדאי לסרב. יש לך רק בערך {p}% לנצח.</>;
  } else if (state.phase === "rolling" && myTurn && E.canDouble(state, my) && botShouldDouble(state, my, "impossible")) {
    body = <>🎓 המאמן: זה רגע טוב להציע דאבל. יש לך בערך {Math.round(winProb(state.board, my, true) * 100)}% לנצח.</>;
  } else if (note) {
    color = GRADE_COLOR[note.grade];
    body = <>🎓 המהלך האחרון שלך: <b style={{ color }}>{GRADE_TEXT[note.grade]}</b>{note.loss >= 0.005 && note.grade !== "best" ? <> · עדיף היה <span className="mv">{moveText(note.best, my)}</span></> : null}</>;
  }
  if (!body) return null;
  return <motion.div className="note" style={{ borderColor: color }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{body}</motion.div>;
}

function isPlaying(s: GameState) {
  return s.phase === "rolling" || s.phase === "moving" || s.phase === "doubleOffered";
}

function resultText(k: NonNullable<GameState["lastResult"]>["kind"]) {
  return { single: "ניצחון רגיל", gammon: "מרס! (גמון)", backgammon: "טורקי! (בקגמון)", declined: "הדאבל נדחה", resigned: "ויתור" }[k];
}

function statusText(s: GameState, my: Color | null, nLegal: number): string {
  const name = (c: Color) => s.players[c]?.name ?? heColor(c);
  switch (s.phase) {
    case "waiting": return "מחכים לשחקן נוסף…";
    case "opening":
      if (my && s.opening[my] == null) return "כל שחקן מטיל קובייה אחת — הגבוה מתחיל";
      return "מחכים להטלת הפתיחה של היריב…";
    case "rolling":
      return s.turn === my ? "התור שלך" : `התור של ${name(s.turn)}`;
    case "doubleOffered":
      return s.turn === my ? "מחכים לתשובה על הדאבל…" : `${name(s.turn)} מציע דאבל ל-${s.cube.value * 2}!`;
    case "moving":
      if (s.turn !== my) return `${name(s.turn)} משחק…`;
      if (nLegal === 0) return s.turnMoves.length ? "סיימת — אשר את התור" : "אין מהלכים חוקיים";
      return "בחר אבן ואז לאן להזיז";
    default: return "";
  }
}

function PlayerCard({ c, name, active, pips, you }: { c: Color; name?: string; active: boolean; pips: number; you: boolean }) {
  return (
    <motion.div className={`pcard ${active ? "active" : ""}`} layout>
      <span className={`dot ${c}`} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name ?? "…"} {you && <span className="muted" style={{ fontWeight: 400 }}>(אתה)</span>}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{pips} פיפס</div>
      </div>
    </motion.div>
  );
}

function Btn({ children, onClick, ghost, danger, pulse }: { children: React.ReactNode; onClick: () => void; ghost?: boolean; danger?: boolean; pulse?: boolean }) {
  return (
    <motion.button className={`btn ${ghost ? "ghost" : ""} ${danger ? "danger" : ""}`} onClick={onClick}
      initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={pulse ? { opacity: 1, y: 0, scale: [1, 1.05, 1] } : { opacity: 1, y: 0, scale: 1 }}
      transition={pulse ? { scale: { repeat: Infinity, duration: 1.4 } } : { type: "spring", stiffness: 300, damping: 20 }}>
      {children}
    </motion.button>
  );
}

function ShareModal({ url, code, waiting, onClose }: { url: string; code: string; waiting?: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overlay" onClick={waiting ? undefined : onClose}>
      <motion.div className="card modal" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <h2 className="title" style={{ fontSize: 30, marginBottom: 6 }}>{waiting ? "מחכים לחבר…" : "הזמן לחדר"}</h2>
        <p className="muted" style={{ marginTop: 0 }}>סרוק עם המצלמה כדי להצטרף</p>
        <motion.div className="qr-box" animate={waiting ? { boxShadow: ["0 0 0 0 rgba(217,164,65,0.5)", "0 0 0 16px rgba(217,164,65,0)"] } : {}} transition={{ repeat: Infinity, duration: 1.6 }}>
          {url && <QRCodeSVG value={url} size={210} fgColor="#1a0f07" level="M" />}
        </motion.div>
        <p className="code" style={{ fontSize: 34, color: "var(--gold-soft)", margin: "14px 0" }}>{code}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn ghost small" onClick={async () => { await navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? "הועתק ✓" : "העתק קישור"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button className="btn ghost small" onClick={() => navigator.share({ title: "שש בש", text: "בוא לשחק איתי שש בש!", url })}>שתף…</button>
          )}
          {!waiting && <button className="btn small" onClick={onClose}>סגור</button>}
        </div>
      </motion.div>
    </div>
  );
}
