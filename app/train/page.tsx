"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Practice from "@/components/Practice";
import type { Board, Move } from "@/lib/engine";
import { joinGame, newGameState } from "@/lib/engine";
import { BOT_NAMES, BOT_PREFIX, reviewTurn, coachHint, type BotLevel, type Review } from "@/lib/bot";
import { GRADE_COLOR, GRADE_TEXT, LESSONS, TOPICS, genPuzzle, isGoodGrade, moveText, type Lesson, type Puzzle, type Topic } from "@/lib/train";
import { markCoach, newRoomCode, playerId, savedName, saveName, transport } from "@/lib/sync";

type View = { v: "menu" } | { v: "lessons" } | { v: "lesson"; id: string } | { v: "topics" } | { v: "puzzle"; topic: Topic } | { v: "coach" };

interface Progress { lessons: string[]; tried: number; solved: number; streak: number; bestStreak: number; }
const P0: Progress = { lessons: [], tried: 0, solved: 0, streak: 0, bestStreak: 0 };
function loadProgress(): Progress { try { return { ...P0, ...JSON.parse(localStorage.getItem("sheshbesh-train") || "{}") }; } catch { return P0; } }
function saveProgress(p: Progress) { try { localStorage.setItem("sheshbesh-train", JSON.stringify(p)); } catch {} }

export default function Train() {
  const router = useRouter();
  const [view, setView] = useState<View>({ v: "menu" });
  const [prog, setProg] = useState<Progress>(P0);
  useEffect(() => setProg(loadProgress()), []);
  const update = (f: (p: Progress) => Progress) => setProg((p) => { const n = f(p); saveProgress(n); return n; });

  const back = () => {
    if (view.v === "menu") return router.push("/");
    if (view.v === "lesson") return setView({ v: "lessons" });
    if (view.v === "puzzle" && view.topic !== "all") return setView({ v: "topics" });
    setView({ v: "menu" });
  };
  const titles: Record<View["v"], string> = { menu: "מצב אימון", lessons: "שיעורים", lesson: "שיעור", topics: "תרגול לפי נושא", puzzle: "חידות", coach: "משחק עם מאמן" };

  return (
    <div className="game">
      <div className="topbar">
        <button className="btn ghost small" onClick={back}>→ חזרה</button>
        <h2 className="title" style={{ fontSize: 30 }}>{view.v === "lesson" ? LESSONS.find((l) => l.id === view.id)?.title : view.v === "puzzle" && view.topic !== "all" ? TOPICS.find((t) => t.id === view.topic)?.title : titles[view.v]}</h2>
        <span style={{ width: 70 }} />
      </div>

      {view.v === "menu" && (
        <div className="tgrid">
          <Tile icon="📖" title="שיעורים" sub={`${prog.lessons.length} מתוך ${LESSONS.length} הושלמו`} onClick={() => setView({ v: "lessons" })} />
          <Tile icon="🧩" title="חידות: מצא את המהלך" sub={prog.tried ? `פתרת ${prog.solved} מתוך ${prog.tried} · רצף שיא ${prog.bestStreak}` : "עמדה, קוביות, ומה היית משחק?"} onClick={() => setView({ v: "puzzle", topic: "all" })} />
          <Tile icon="🎯" title="תרגול לפי נושא" sub="אכילה, בר, מרוץ, סוף משחק" onClick={() => setView({ v: "topics" })} />
          <Tile icon="🎓" title="משחק עם מאמן" sub="רמזים וציון על כל מהלך" onClick={() => setView({ v: "coach" })} />
        </div>
      )}

      {view.v === "lessons" && (
        <div className="tlist">
          {LESSONS.map((l, i) => (
            <button key={l.id} className="trow" onClick={() => setView({ v: "lesson", id: l.id })}>
              <span className="tnum">{prog.lessons.includes(l.id) ? "✓" : i + 1}</span>
              <span style={{ flex: 1, textAlign: "start" }}><b>{l.title}</b><br /><span className="muted" style={{ fontSize: 13 }}>{l.blurb}</span></span>
              <span className="muted">←</span>
            </button>
          ))}
        </div>
      )}

      {view.v === "lesson" && (
        <LessonRunner key={view.id} lesson={LESSONS.find((l) => l.id === view.id)!}
          onFinish={() => { update((p) => (p.lessons.includes(view.id) ? p : { ...p, lessons: [...p.lessons, view.id] })); const i = LESSONS.findIndex((l) => l.id === view.id); setView(i + 1 < LESSONS.length ? { v: "lesson", id: LESSONS[i + 1].id } : { v: "menu" }); }} />
      )}

      {view.v === "topics" && (
        <div className="tlist">
          {TOPICS.map((t) => (
            <button key={t.id} className="trow" onClick={() => setView({ v: "puzzle", topic: t.id })}>
              <span style={{ flex: 1, textAlign: "start" }}><b>{t.title}</b><br /><span className="muted" style={{ fontSize: 13 }}>{t.blurb}</span></span>
              <span className="muted">←</span>
            </button>
          ))}
        </div>
      )}

      {view.v === "puzzle" && <PuzzleRunner key={view.topic} topic={view.topic} prog={prog}
        onResult={(ok) => update((p) => { const streak = ok ? p.streak + 1 : 0; return { ...p, tried: p.tried + 1, solved: p.solved + (ok ? 1 : 0), streak, bestStreak: Math.max(p.bestStreak, streak) }; })} />}

      {view.v === "coach" && <CoachStart onGo={(code) => router.push(`/room/${code}`)} />}
    </div>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <motion.button className="tile" onClick={onClick} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <span style={{ fontSize: 38 }}>{icon}</span>
      <b style={{ fontSize: 19 }}>{title}</b>
      <span className="muted" style={{ fontSize: 13 }}>{sub}</span>
    </motion.button>
  );
}

function Note({ color, children }: { color?: string; children: React.ReactNode }) {
  return <motion.div className="note" style={color ? { borderColor: color } : undefined} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{children}</motion.div>;
}

// ---------------- lessons ----------------
function LessonRunner({ lesson, onFinish }: { lesson: Lesson; onFinish: () => void }) {
  const [i, setI] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<null | "ok" | "retry">(null);
  const step = lesson.steps[i];
  const last = i === lesson.steps.length - 1;
  const next = () => { if (last) return onFinish(); setI(i + 1); setAttempt(0); setResult(null); };
  const isTask = !!step.dice;
  return (
    <div>
      <div className="muted" style={{ textAlign: "center", fontSize: 13, marginBottom: 6 }}>שלב {i + 1} מתוך {lesson.steps.length}</div>
      <Note>{step.text}</Note>
      {step.board && (
        <Practice key={`${i}-${attempt}`} board={step.board} dice={step.dice} locked={result === "ok"}
          onDone={(after, start) => setResult(step.goal!(after, start) ? "ok" : "retry")} />
      )}
      <AnimatePresence>
        {result === "ok" && <Note color="#6fcf97">{step.ok ?? "נכון!"}</Note>}
        {result === "retry" && <Note color="#ff9d6b">{step.retry ?? "לא בדיוק. נסה שוב."}</Note>}
      </AnimatePresence>
      <div className="controls">
        {result === "retry" && <button className="btn" onClick={() => { setAttempt(attempt + 1); setResult(null); }}>נסה שוב</button>}
        {(!isTask || result === "ok") && <button className="btn" onClick={next}>{last ? "סיים שיעור ✓" : "המשך ←"}</button>}
      </div>
    </div>
  );
}

// ---------------- puzzles ----------------
function PuzzleRunner({ topic, prog, onResult }: { topic: Topic; prog: Progress; onResult: (ok: boolean) => void }) {
  // puzzle and its id live in one state value so the board is always remounted together with its position
  const [cur, setCur] = useState<{ n: number; puzzle: Puzzle } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [review, setReview] = useState<Review | null>(null);
  const [hint, setHint] = useState<Move[] | null>(null);
  const [counted, setCounted] = useState(false);
  const next = () => { setCur((c) => ({ n: (c?.n ?? 0) + 1, puzzle: genPuzzle(topic) })); setReview(null); setHint(null); setAttempt(0); setCounted(false); };
  useEffect(next, [topic]); // eslint-disable-line react-hooks/exhaustive-deps
  const puzzle = cur?.puzzle, n = cur?.n ?? 0;
  if (!puzzle) return <div className="center" style={{ height: 300 }}><span className="muted">מכין עמדה…</span></div>;

  const count = (ok: boolean) => { if (!counted) { onResult(ok); setCounted(true); } };
  function done(after: Board, start: Board) {
    const r = reviewTurn(start, "white", puzzle!.dice, after);
    if (!r) return;
    setReview(r);
    count(isGoodGrade(r.grade) && !hint);
  }
  const good = review && isGoodGrade(review.grade);
  return (
    <div>
      <div className="row" style={{ justifyContent: "center", gap: 8, marginBottom: 8 }}>
        <span className="pill">רצף: {prog.streak}</span>
        <span className="pill">פתרת {prog.solved} מתוך {prog.tried}</span>
      </div>
      <Note>אתה הלבן, והטלת {puzzle.dice[0]} ו-{puzzle.dice[1]}. מה המהלך הכי טוב?</Note>
      <Practice key={`${n}-${attempt}`} board={puzzle.board} dice={puzzle.dice} hint={hint} locked={!!review} onDone={done} />
      {review && (
        <Note color={GRADE_COLOR[review.grade]}>
          <b style={{ color: GRADE_COLOR[review.grade], fontSize: 20 }}>{GRADE_TEXT[review.grade]}</b>
          {review.loss >= 0.005 && <div>ויתרת על כ-{Math.max(1, Math.round(review.loss * 100))}% מסיכויי הניצחון.</div>}
          {review.grade !== "best" && review.grade !== "only" && <div>המהלך של המאמן: <span className="mv">{moveText(review.best, "white")}</span></div>}
        </Note>
      )}
      <div className="controls">
        {!review && !hint && <button className="btn ghost" onClick={() => { setHint(coachHint(puzzle.board, "white", puzzle.dice[0] === puzzle.dice[1] ? Array(4).fill(puzzle.dice[0]) : [...puzzle.dice], puzzle.dice)); setAttempt(attempt + 1); count(false); }}>💡 הראה לי</button>}
        {review && !good && <button className="btn ghost" onClick={() => { setHint(review.best); setReview(null); setAttempt(attempt + 1); }}>נסה שוב עם חיצים</button>}
        {(review || hint) && <button className="btn" onClick={next}>חידה הבאה ←</button>}
      </div>
    </div>
  );
}

// ---------------- coached game ----------------
function CoachStart({ onGo }: { onGo: (code: string) => void }) {
  const [len, setLen] = useState(3);
  const [busy, setBusy] = useState(false);
  async function go(level: BotLevel) {
    setBusy(true);
    const me = savedName() || "אתה";
    saveName(me);
    const c = newRoomCode();
    markCoach(c);
    await transport().update(c, () => joinGame(joinGame(newGameState(len), { id: playerId(), name: me }), { id: BOT_PREFIX + level, name: BOT_NAMES[level] }));
    onGo(c);
  }
  return (
    <div className="card" style={{ maxWidth: 460, margin: "10px auto" }}>
      <p style={{ marginTop: 0, lineHeight: 1.7 }}>משחק מלא מול הבוט, כשהמאמן לצידך: אפשר לבקש רמז, ולפני שהתור נגמר תקבל ציון על המהלך. אם טעית, אפשר לנסות שוב.</p>
      <label className="label">משחק עד (נקודות)</label>
      <div className="seg">{[1, 3, 5].map((l) => <button key={l} className={l === len ? "on" : ""} onClick={() => setLen(l)}>{l}</button>)}</div>
      <label className="label" style={{ marginTop: 16 }}>רמת היריב</label>
      <div className="bots">
        <button className="bot easy" disabled={busy} onClick={() => go("easy")}><b>קל</b><span>מומלץ להתחלה</span></button>
        <button className="bot hard" disabled={busy} onClick={() => go("hard")}><b>קשה</b><span>משחק חכם</span></button>
        <button className="bot imp" disabled={busy} onClick={() => go("impossible")}><b>בלתי אפשרי</b><span>בהצלחה…</span></button>
      </div>
    </div>
  );
}
