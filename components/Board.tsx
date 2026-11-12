"use client";
import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Board as B, Color, GameState, Move } from "@/lib/engine";
import { applyMove, countAt } from "@/lib/engine";
import { pipLayout } from "@/lib/pips";

// ---------- geometry (board units) ----------
const W = 15.4, H = 11;
const PAD = 0.4, COLS_L = PAD, BAR_X = 6.4, COLS_R = 7.4, TRAY_X = 13.8, TRAY_W = 1.2;
const POINT_LEN = 4.6, D = 0.92;
const px = (u: number) => `${(u / W) * 100}%`;
const py = (u: number) => `${(u / H) * 100}%`;

type VLoc = number | "bar" | "off";

/** display index (0..23, viewer perspective — 0 = viewer's bottom-right) */
const disp = (idx: number, viewer: Color) => (viewer === "white" ? idx : 23 - idx);

function pointCenterX(d: number) {
  if (d <= 5) return COLS_R + (5 - d) + 0.5;
  if (d <= 11) return COLS_L + (11 - d) + 0.5;
  if (d <= 17) return COLS_L + (d - 12) + 0.5;
  return COLS_R + (d - 18) + 0.5;
}
const isTop = (d: number) => d >= 12;

function slotPos(loc: VLoc, color: Color, k: number, n: number, viewer: Color) {
  const mine = color === viewer;
  if (loc === "bar") {
    const x = BAR_X + 0.5;
    return mine ? { x, y: H / 2 + 0.95 + k * 0.62, slab: false } : { x, y: H / 2 - 0.95 - k * 0.62, slab: false };
  }
  if (loc === "off") {
    const x = TRAY_X + TRAY_W / 2;
    return mine ? { x, y: H - PAD - 0.14 - k * 0.27, slab: true } : { x, y: PAD + 0.14 + k * 0.27, slab: true };
  }
  const d = disp(loc, viewer);
  const step = n <= 5 ? D : (POINT_LEN - D) / (n - 1);
  const x = pointCenterX(d);
  const y = isTop(d) ? PAD + D / 2 + k * step : H - PAD - D / 2 - k * step;
  return { x, y, slab: false };
}

interface VChecker { id: string; color: Color; loc: VLoc; k: number; }

function locsOf(b: B, c: Color): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < 24; i++) { const n = countAt(b, i, c); if (n) m.set(String(i), n); }
  if (b.bar[c]) m.set("bar", b.bar[c]);
  if (b.off[c]) m.set("off", b.off[c]);
  return m;
}
const parseLoc = (s: string): VLoc => (s === "bar" || s === "off" ? s : Number(s));
const locNum = (l: VLoc, c: Color) => (l === "bar" ? (c === "white" ? 24 : -1) : l === "off" ? (c === "white" ? -1 : 24) : l);

/** Keep checker identities stable between boards so moves animate. */
function reconcile(prev: VChecker[] | null, b: B): VChecker[] {
  let seq = 0;
  const out: VChecker[] = [];
  for (const c of ["white", "black"] as Color[]) {
    const want = locsOf(b, c);
    if (!prev) {
      for (const [l, n] of want) for (let k = 0; k < n; k++) out.push({ id: `${c}-${seq++}`, color: c, loc: parseLoc(l), k });
      continue;
    }
    const mine = prev.filter((v) => v.color === c).sort((a, z) => a.k - z.k);
    const cap = new Map(want);
    const kept: VChecker[] = [], movers: VChecker[] = [];
    for (const v of mine) {
      const key = String(v.loc), left = cap.get(key) ?? 0;
      if (left > 0) { cap.set(key, left - 1); kept.push({ ...v }); } else movers.push(v);
    }
    const dests: VLoc[] = [];
    for (const [l, n] of cap) for (let k = 0; k < n; k++) dests.push(parseLoc(l));
    // pair movers with destinations by closeness along the track
    for (const d of dests) {
      let bi = 0, bd = Infinity;
      movers.forEach((m, i) => { const dist = Math.abs(locNum(m.loc, c) - locNum(d, c)); if (dist < bd) { bd = dist; bi = i; } });
      const m = movers.splice(bi, 1)[0];
      kept.push({ id: m?.id ?? `${c}-n${Math.random()}`, color: c, loc: d, k: 999 });
    }
    // re-number stack indices
    const byLoc = new Map<string, VChecker[]>();
    for (const v of kept) { const key = String(v.loc); if (!byLoc.has(key)) byLoc.set(key, []); byLoc.get(key)!.push(v); }
    for (const arr of byLoc.values()) { arr.sort((a, z) => a.k - z.k); arr.forEach((v, i) => (v.k = i)); out.push(...arr); }
  }
  return out;
}

export interface BoardProps {
  state: GameState;
  viewer: Color;
  legal: Move[];
  selected: VLoc | null;
  onPick: (loc: VLoc) => void;
  /** Coach suggestion for the side to move: drawn as numbered arrows. */
  hint?: Move[] | null;
}

export default function Board({ state, viewer, legal, selected, onPick, hint }: BoardProps) {
  const prevRef = useRef<VChecker[] | null>(null);
  const checkers = useMemo(() => {
    const r = reconcile(prevRef.current, state.board);
    prevRef.current = r;
    return r;
  }, [state.board]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of checkers) { const key = v.color + String(v.loc); m.set(key, (m.get(key) ?? 0) + 1); }
    return m;
  }, [checkers]);

  const sources = useMemo(() => new Set(legal.map((m) => String(m.from))), [legal]);
  const dests = useMemo(() => legal.filter((m) => selected !== null && String(m.from) === String(selected)), [legal, selected]);

  const me = state.turn;
  return (
    <div className="board-wrap">
      <div className="board">
        <BoardSvg viewer={viewer} dests={dests.map((m) => m.to)} sources={sources} turnColor={me} />

        {/* destination hints */}
        <AnimatePresence>
          {dests.map((m) => {
            const loc = m.to;
            const n = loc === "off" ? 0 : countAt(state.board, loc, me) ;
            const p = slotPos(loc, me, loc === "off" ? state.board.off[me] : Math.min(n, 4), Math.max(n + 1, 1), viewer);
            return (
              <motion.div key={"d" + String(loc)} className="dest-glow"
                initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4 }}
                style={{ x: "-50%", y: "-50%", left: px(p.x), top: py(p.y), width: px(p.slab ? 1.0 : D), height: py(p.slab ? 0.3 : D), borderRadius: p.slab ? 4 : "50%" }} />
            );
          })}
        </AnimatePresence>

        {/* checkers */}
        {checkers.map((v) => {
          const n = counts.get(v.color + String(v.loc)) ?? 1;
          const p = slotPos(v.loc, v.color, v.k, n, viewer);
          const isSel = selected !== null && String(v.loc) === String(selected) && v.color === me && v.k === n - 1;
          const showCount = v.loc !== "off" && n > 5 && v.k === n - 1 && v.loc !== "bar";
          return (
            <motion.div key={v.id}
              className={`checker ${v.color} ${p.slab ? "slab" : ""} ${isSel ? "sel" : ""}`}
              initial={false}
              style={{ x: "-50%", y: "-50%" }}
              animate={{
                left: px(p.x), top: py(p.y),
                width: px(p.slab ? 1.0 : D), height: py(p.slab ? 0.22 : D),
                scale: isSel ? 1.12 : 1,
                zIndex: isSel ? 30 : 2 + v.k,
              }}
              transition={{ type: "spring", stiffness: 170, damping: 20, mass: 0.9 }}
            >
              {showCount && <span className="count">{n}</span>}
            </motion.div>
          );
        })}

        {/* dice */}
        <Dice state={state} viewer={viewer} />

        {/* doubling cube */}
        <motion.div className="cube"
          animate={{
            left: px(TRAY_X + TRAY_W / 2),
            top: py(state.cube.owner === null ? H / 2 : state.cube.owner === viewer ? H / 2 + 0.75 : H / 2 - 0.75),
            rotate: state.cube.value === 1 ? 0 : 360 * Math.log2(state.cube.value),
          }}
          transition={{ type: "spring", stiffness: 90, damping: 14 }}
          style={{ x: "-50%", y: "-50%", width: px(0.95), height: py(0.95) }}>
          {state.cube.value === 1 ? 64 : state.cube.value}
        </motion.div>

        {hint && hint.length > 0 && <HintArrows board={state.board} moves={hint} color={me} viewer={viewer} />}

        {/* click targets */}
        {Array.from({ length: 24 }, (_, idx) => {
          const d = disp(idx, viewer);
          const x = pointCenterX(d) - 0.5;
          const top = isTop(d);
          return (
            <div key={idx} className="hit" onClick={() => onPick(idx)}
              style={{ left: px(x), width: px(1), top: py(top ? PAD : H / 2), height: py(H / 2 - PAD) }} />
          );
        })}
        <div className="hit" onClick={() => onPick("bar")} style={{ left: px(BAR_X), width: px(1), top: 0, height: "100%" }} />
        <div className="hit" onClick={() => onPick("off")} style={{ left: px(TRAY_X), width: px(TRAY_W), top: 0, height: "100%" }} />
      </div>
    </div>
  );
}

// ---------- static board art ----------
function BoardSvg({ viewer, dests, sources, turnColor }: { viewer: Color; dests: (number | "off")[]; sources: Set<string>; turnColor: Color }) {
  const S = 10; // svg scale
  const destSet = new Set(dests.map(String));
  const tris = [];
  for (let d = 0; d < 24; d++) {
    const idx = viewer === "white" ? d : 23 - d;
    const cx = pointCenterX(d) * S, top = isTop(d);
    const y0 = (top ? PAD : H - PAD) * S, y1 = (top ? PAD + POINT_LEN : H - PAD - POINT_LEN) * S;
    const dark = d % 2 === 0;
    const hl = destSet.has(String(idx));
    tris.push(
      <g key={d}>
        <polygon points={`${cx - 4.6},${y0} ${cx + 4.6},${y0} ${cx},${y1}`} fill={dark ? "url(#ptDark)" : "url(#ptLight)"} stroke="rgba(0,0,0,0.25)" strokeWidth={0.4} />
        {hl && <polygon points={`${cx - 4.6},${y0} ${cx + 4.6},${y0} ${cx},${y1}`} fill="rgba(255,214,120,0.55)" stroke="#f0cf86" strokeWidth={0.8} className="pulse" />}
        <text x={cx} y={top ? 2.9 : H * S - 1.3} fontSize={2.6} textAnchor="middle" fill="rgba(240,207,134,0.55)" fontFamily="Rubik" fontWeight={700}>
          {viewerPointNumber(d)}
        </text>
      </g>
    );
  }
  void sources; void turnColor;
  return (
    <svg className="bg" viewBox={`0 0 ${W * S} ${H * S}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b3f1f" /><stop offset="0.5" stopColor="#4a2a13" /><stop offset="1" stopColor="#2e1909" />
        </linearGradient>
        <pattern id="grain" width="40" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 3 Q10 1 20 3 T40 3" stroke="rgba(0,0,0,0.12)" strokeWidth="0.6" fill="none" />
        </pattern>
        <radialGradient id="felt" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#14513b" /><stop offset="1" stopColor="#0a2c20" />
        </radialGradient>
        <linearGradient id="ptDark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8352c" /><stop offset="1" stopColor="#6d1d18" />
        </linearGradient>
        <linearGradient id="ptLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efdfbd" /><stop offset="1" stopColor="#c9b089" />
        </linearGradient>
        <filter id="inner" x="-5%" y="-5%" width="110%" height="110%">
          <feOffset dx="0" dy="0" /><feGaussianBlur stdDeviation="2" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
      </defs>
      {/* frame */}
      <rect x="0" y="0" width={W * S} height={H * S} rx="6" fill="url(#wood)" />
      <rect x="0" y="0" width={W * S} height={H * S} rx="6" fill="url(#grain)" />
      <rect x="1" y="1" width={W * S - 2} height={H * S - 2} rx="5" fill="none" stroke="rgba(240,207,134,0.35)" strokeWidth="0.6" />
      {/* playing fields */}
      <rect x={COLS_L * S} y={PAD * S} width={6 * S} height={(H - 2 * PAD) * S} fill="url(#felt)" />
      <rect x={COLS_R * S} y={PAD * S} width={6 * S} height={(H - 2 * PAD) * S} fill="url(#felt)" />
      {tris}
      {/* bar */}
      <rect x={BAR_X * S} y={0} width={S} height={H * S} fill="url(#wood)" />
      <rect x={BAR_X * S} y={0} width={S} height={H * S} fill="url(#grain)" />
      <line x1={(BAR_X + 0.5) * S} y1={PAD * S} x2={(BAR_X + 0.5) * S} y2={(H - PAD) * S} stroke="rgba(0,0,0,0.25)" strokeWidth={0.5} />
      {/* bear-off tray */}
      <rect x={TRAY_X * S} y={PAD * S} width={TRAY_W * S} height={(H - 2 * PAD) * S} rx="2" fill="#1d0f06" stroke="rgba(240,207,134,0.25)" strokeWidth="0.5" />
      {destSet.has("off") && <rect x={TRAY_X * S} y={(H / 2) * S} width={TRAY_W * S} height={(H / 2 - PAD) * S} rx="2" fill="rgba(240,207,134,0.22)" className="pulse" />}
      {/* inner shadows */}
      <rect x={COLS_L * S} y={PAD * S} width={6 * S} height={(H - 2 * PAD) * S} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" />
      <rect x={COLS_R * S} y={PAD * S} width={6 * S} height={(H - 2 * PAD) * S} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" />
      <style>{`.pulse{animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
    </svg>
  );
}

/** Point numbers from the viewer's perspective: 1 = viewer's bottom-right. */
const viewerPointNumber = (d: number) => d + 1;

// ---------- 3D dice ----------
const FACE_ROT: Record<number, string> = {
  1: "rotateY(0deg)", 6: "rotateY(180deg)", 3: "rotateY(90deg)", 4: "rotateY(-90deg)", 2: "rotateX(90deg)", 5: "rotateX(-90deg)",
};
const SHOW: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };

function Die3D({ value, rollId, dark, x, y, size, used, seed }: { value: number; rollId: number; dark: boolean; x: number; y: number; size: number; used: boolean; seed: number }) {
  const [tx, ty] = SHOW[value];
  return (
    <div className={`die-scene ${used ? "die-used" : ""}`} style={{ left: px(x), top: py(y), width: px(size), height: py(size) }}>
      <motion.div key={rollId} className={`die ${dark ? "dark" : ""}`}
        initial={{ rotateX: tx - 720 - seed * 90, rotateY: ty - 540 - seed * 90, x: seed % 2 ? 60 : -60, y: -40, scale: 0.6 }}
        animate={{ rotateX: tx, rotateY: ty, x: 0, y: 0, scale: 1 }}
        transition={{ duration: 0.95, ease: [0.2, 0.9, 0.25, 1.05] }}>
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <div key={f} className="face" style={{ transform: `${FACE_ROT[f]} translateZ(var(--half))` }}>
            {pipLayout(f).map((on, k) => <span key={k} className={on ? "pip" : ""} />)}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function Dice({ state, viewer }: { state: GameState; viewer: Color }) {
  const size = 0.95;
  const right = COLS_R + 3, left = COLS_L + 3, y = H / 2;
  const items: { v: number; x: number; dark: boolean; used: boolean; key: string }[] = [];

  if (state.phase === "opening") {
    for (const c of ["white", "black"] as Color[]) {
      const v = state.opening[c];
      if (v) items.push({ v, x: c === viewer ? right : left, dark: c === "black", used: false, key: "o" + c });
    }
  } else if ((state.phase === "moving" || state.phase === "gameOver" || state.phase === "matchOver") && state.dice.length) {
    const cx = state.turn === viewer ? right : left;
    const dbl = state.dice[0] === state.dice[1];
    const vals = dbl ? [state.dice[0], state.dice[0], state.dice[0], state.dice[0]] : state.dice;
    const usedCount = dbl ? 4 - state.remaining.length : 0;
    const rem = state.remaining.slice();
    vals.forEach((v, i) => {
      let used: boolean;
      if (dbl) used = i < usedCount;
      else { const j = rem.indexOf(v); used = j < 0; if (j >= 0) rem.splice(j, 1); }
      const spacing = dbl ? 1.05 : 1.25;
      const x = cx + (i - (vals.length - 1) / 2) * spacing;
      items.push({ v, x, dark: state.turn === "black", used: state.phase === "moving" ? used : true, key: "d" + i });
    });
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ["--half" as any]: "calc(var(--die) / 2)" }}>
      <DieSizer />
      {items.map((it, i) => (
        <Die3D key={it.key} value={it.v} rollId={state.rollId} dark={it.dark} x={it.x} y={y} size={size} used={it.used} seed={i + 1} />
      ))}
    </div>
  );
}

/** Measures die pixel size into a CSS var so 3D faces are offset by half the cube size. */
function DieSizer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const apply = () => parent.style.setProperty("--die", `${(parent.clientWidth / W) * 0.95}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} />;
}

// ---------- coach arrows ----------
function HintArrows({ board, moves, color, viewer }: { board: B; moves: Move[]; color: Color; viewer: Color }) {
  const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let sim = board;
  for (const m of moves) {
    const nFrom = m.from === "bar" ? sim.bar[color] : countAt(sim, m.from, color);
    if (nFrom <= 0) break;
    const a = slotPos(m.from, color, Math.min(nFrom - 1, 4), Math.max(nFrom, 1), viewer);
    const nTo = m.to === "off" ? sim.off[color] : countAt(sim, m.to, color);
    const b = slotPos(m.to, color, m.to === "off" ? nTo : Math.min(nTo, 4), nTo + 1, viewer);
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    sim = applyMove(sim, color, m);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 45 }}>
      <defs>
        <marker id="hintHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#5ad1ff" />
        </marker>
      </defs>
      {segs.map((s, i) => (
        <g key={i}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#0b2530" strokeWidth={0.2} strokeLinecap="round" opacity={0.55} />
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#5ad1ff" strokeWidth={0.11} strokeLinecap="round" markerEnd="url(#hintHead)" />
          <circle cx={s.x1} cy={s.y1} r={0.27} fill="#5ad1ff" stroke="#0b2530" strokeWidth={0.04} />
          <text x={s.x1} y={s.y1 + 0.12} fontSize={0.36} textAnchor="middle" fill="#0b2530" fontFamily="Rubik" fontWeight={700}>{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}
