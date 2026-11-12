"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { pipLayout } from "@/lib/pips";
import { joinGame, newGameState } from "@/lib/engine";
import { BOT_NAMES, BOT_PREFIX, type BotLevel } from "@/lib/bot";
import { firebaseConfigured, markHotseat, newRoomCode, playerId, savedName, saveName, transport } from "@/lib/sync";

const LENGTHS = [1, 3, 5, 7, 11];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [len, setLen] = useState(5);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setName(savedName()), []);

  async function create() {
    if (!name.trim()) return setErr("איך קוראים לך?");
    setBusy(true);
    saveName(name.trim());
    const c = newRoomCode();
    await transport().update(c, (prev) => {
      if (prev) return prev; // collision — extremely unlikely
      return joinGame(newGameState(len), { id: playerId(), name: name.trim() });
    });
    router.push(`/room/${c}`);
  }

  async function solo() {
    setBusy(true);
    const me = name.trim() || "שחקן 1";
    saveName(me);
    const c = newRoomCode();
    markHotseat(c);
    await transport().update(c, () => {
      let s = joinGame(newGameState(len), { id: playerId(), name: me });
      s = joinGame(s, { id: playerId() + "-p2", name: "שחקן 2" });
      return s;
    });
    router.push(`/room/${c}`);
  }

  async function vsBot(level: BotLevel) {
    setBusy(true);
    const me = name.trim() || "אתה";
    saveName(me);
    const c = newRoomCode();
    await transport().update(c, () => {
      const s = joinGame(newGameState(len), { id: playerId(), name: me });
      return joinGame(s, { id: BOT_PREFIX + level, name: BOT_NAMES[level] });
    });
    router.push(`/room/${c}`);
  }

  function join() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setErr("הקוד קצר מדי");
    if (name.trim()) saveName(name.trim());
    router.push(`/room/${c}`);
  }

  return (
    <main style={{ maxWidth: 460, margin: "0 auto", padding: "40px 18px" }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ textAlign: "center", marginBottom: 26 }}>
        <HeroDice />
        <h1 className="title" style={{ fontSize: 58, lineHeight: 1 }}>שש בש</h1>
        <p className="muted" style={{ marginTop: 8 }}>פותחים חדר, החברים סורקים QR, ומשחקים.</p>
      </motion.div>

      <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
        <label className="label">השם שלך</label>
        <input className="input" value={name} maxLength={16} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="למשל: דודו" />

        <div style={{ height: 18 }} />
        <label className="label">משחק עד (נקודות)</label>
        <div className="seg">
          {LENGTHS.map((l) => (
            <button key={l} className={l === len ? "on" : ""} onClick={() => setLen(l)}>{l}</button>
          ))}
        </div>

        <div style={{ height: 18 }} />
        <button className="btn" style={{ width: "100%", fontSize: 18 }} disabled={busy} onClick={create}>
          🎲 פתח חדר חדש
        </button>

        <div className="row" style={{ margin: "20px 0 10px" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(217,164,65,0.2)" }} />
          <span className="muted" style={{ fontSize: 13 }}>🤖 או שחק מול בוט</span>
          <div style={{ flex: 1, height: 1, background: "rgba(217,164,65,0.2)" }} />
        </div>
        <div className="bots">
          <button className="bot easy" disabled={busy} onClick={() => vsBot("easy")}><b>קל</b><span>עושה טעויות</span></button>
          <button className="bot hard" disabled={busy} onClick={() => vsBot("hard")}><b>קשה</b><span>משחק חכם</span></button>
          <button className="bot imp" disabled={busy} onClick={() => vsBot("impossible")}><b>בלתי אפשרי</b><span>בהצלחה…</span></button>
        </div>

        <button className="btn ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => router.push("/train")}>
          🎓 מצב אימון: שיעורים, חידות ומאמן
        </button>
        <button className="btn ghost" style={{ width: "100%", marginTop: 10 }} disabled={busy} onClick={solo}>
          🪑 נסה לבד: שני הצדדים על מסך אחד
        </button>

        <div className="row" style={{ margin: "22px 0 14px" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(217,164,65,0.2)" }} />
          <span className="muted" style={{ fontSize: 13 }}>או הצטרף לחדר</span>
          <div style={{ flex: 1, height: 1, background: "rgba(217,164,65,0.2)" }} />
        </div>

        <div className="row">
          <input className="input code" style={{ textAlign: "center" }} value={code} maxLength={5} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }} placeholder="ABCDE" onKeyDown={(e) => e.key === "Enter" && join()} />
          <button className="btn ghost" onClick={join}>הצטרף</button>
        </div>
        {err && <p style={{ color: "#ff8a7a", margin: "12px 0 0", textAlign: "center" }}>{err}</p>}
      </motion.div>

      {!firebaseConfigured && (
        <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
          מצב מקומי: אין חיבור לשרת, אז החדר עובד רק בין לשוניות באותו דפדפן.<br />
          כדי לשחק בין טלפונים צריך להגדיר Firebase (ראה README).
        </p>
      )}
    </main>
  );
}

function HeroDice() {
  return (
    <div className="center" style={{ gap: 14, marginBottom: 14, height: 64 }}>
      {[6, 5].map((v, i) => (
        <motion.div key={i}
          initial={{ rotate: i ? 200 : -200, y: -60, opacity: 0 }}
          animate={{ rotate: i ? 12 : -10, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 11, delay: 0.2 + i * 0.12 }}
          style={{ width: 54, height: 54 }}>
          <div className="face" style={{ position: "relative", width: "100%", height: "100%", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
            {pipLayout(v).map((on, k) => <span key={k} className={on ? "pip" : ""} />)}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
