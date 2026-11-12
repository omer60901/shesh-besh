"use client";
// Tiny synthesized sound effects (no audio files needed).
let ctx: AudioContext | null = null;
let muted = false;
export const setMuted = (m: boolean) => { muted = m; try { localStorage.setItem("sheshbesh-muted", m ? "1" : ""); } catch {} };
export const isMuted = () => { try { muted = !!localStorage.getItem("sheshbesh-muted"); } catch {} return muted; };

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function knock(t: number, freq: number, vol: number, len = 0.06) {
  const c = ac(); if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 2.5;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + t);
}

export function sfxChecker() {
  if (muted) return;
  knock(0, 900, 0.9, 0.05);
  knock(0.012, 2200, 0.25, 0.03);
}
export function sfxHit() {
  if (muted) return;
  knock(0, 700, 1, 0.07); knock(0.05, 1200, 0.6, 0.05);
}
export function sfxDice() {
  if (muted) return;
  for (let i = 0; i < 9; i++) knock(i * 0.055 + Math.random() * 0.03, 1400 + Math.random() * 1600, 0.35 + Math.random() * 0.3, 0.03);
}
export function sfxWin() {
  if (muted) return;
  const c = ac(); if (!c) return;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, c.currentTime + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + i * 0.12 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + i * 0.12 + 0.5);
    o.connect(g).connect(c.destination); o.start(c.currentTime + i * 0.12); o.stop(c.currentTime + i * 0.12 + 0.55);
  });
}
