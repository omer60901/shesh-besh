// Training mode: lesson content and practice-position generator.
import type { Board, Color, Move } from "./engine";
import type { Grade } from "./bot";
import { allHome, applyMove, countAt, initialBoard } from "./engine";
import { allTurns, chooseTurn, isRace, winProb } from "./bot";

type Spec = { w: Record<number, number>; b: Record<number, number>; wBar?: number; bBar?: number };
/** Build a board from point numbers as the white player sees them (1 = white's home corner). */
export function makeBoard(s: Spec): Board {
  const points = new Array(24).fill(0);
  let w = s.wBar ?? 0, b = s.bBar ?? 0;
  for (const [p, n] of Object.entries(s.w)) { points[Number(p) - 1] = n; w += n; }
  for (const [p, n] of Object.entries(s.b)) { points[Number(p) - 1] = -n; b += n; }
  return { points, bar: { white: s.wBar ?? 0, black: s.bBar ?? 0 }, off: { white: 15 - w, black: 15 - b } };
}

// ---------------- lessons ----------------
export interface Step {
  text: string;
  board?: Board;
  dice?: [number, number];
  /** Checked when the learner finishes the turn. */
  goal?: (after: Board, start: Board) => boolean;
  ok?: string;
  retry?: string;
}
export interface Lesson { id: string; title: string; blurb: string; steps: Step[]; }

const START = () => initialBoard();
const whiteBlots = (b: Board) => b.points.filter((v) => v === 1).length;

export const LESSONS: Lesson[] = [
  {
    id: "move", title: "איך זזים", blurb: "כיוון התנועה ושימוש בקוביות",
    steps: [
      { text: "אתה משחק בלבן. האבנים שלך נעות מנקודה 24 לכיוון נקודה 1. הבית שלך הוא נקודות 1 עד 6, למטה מימין. המטרה: להביא את כל האבנים הביתה ואז להוציא אותן מהלוח.", board: START() },
      { text: "הטלת 4 ו-2. כל קובייה מזיזה אבן אחת במספר הצעדים שעליה. לחץ על אבן, ואז על היעד שנדלק. שחק את שתי הקוביות.", board: START(), dice: [4, 2], goal: () => true, ok: "יפה. אפשר גם להזיז את אותה אבן פעמיים, פעם לכל קובייה." },
    ],
  },
  {
    id: "point", title: "לסגור בית", blurb: "שתי אבנים יחד הן מוגנות",
    steps: [
      { text: "שתי אבנים או יותר על אותה נקודה נקראות בית. היריב לא יכול לנחות שם, ואי אפשר לאכול אותן. בתים הם הבסיס של משחק טוב.", board: START() },
      { text: "הטלת 3 ו-1. סגור בית על נקודה 5: אבן אחת מנקודה 8 ואבן אחת מנקודה 6.", board: START(), dice: [3, 1], goal: (a) => a.points[4] >= 2, ok: "בדיוק. נקודה 5 היא אחת החשובות בלוח, וזה המהלך הכי טוב עם 3-1.", retry: "עדיין אין בית על נקודה 5. נסה: מ-8 ל-5 עם ה-3, ומ-6 ל-5 עם ה-1." },
    ],
  },
  {
    id: "hit", title: "אכילה", blurb: "לשלוח אבן של היריב לבר",
    steps: [
      { text: "אבן בודדת על נקודה היא חשופה. אם תנחת עליה, היא נאכלת: עולה לבר וצריכה להתחיל את כל הדרך מחדש.", board: makeBoard({ w: { 24: 2, 13: 5, 8: 3, 6: 5 }, b: { 1: 2, 9: 1, 12: 4, 17: 3, 19: 5 } }) },
      { text: "הטלת 4 ו-3. לשחור יש אבן בודדת על נקודה 9. אכול אותה.", board: makeBoard({ w: { 24: 2, 13: 5, 8: 3, 6: 5 }, b: { 1: 2, 9: 1, 12: 4, 17: 3, 19: 5 } }), dice: [4, 3], goal: (a) => a.bar.black > 0, ok: "אכלת. האבן השחורה על הבר, והיא חייבת להיכנס מחדש לפני שהשחור יזיז משהו אחר.", retry: "האבן על נקודה 9 עדיין שם. מנקודה 13, ארבעה צעדים מביאים אותך בדיוק אליה." },
    ],
  },
  {
    id: "bar", title: "כניסה מהבר", blurb: "מה עושים אחרי שאכלו אותך",
    steps: [
      { text: "אבן שלך שנאכלה מחכה על הבר, באמצע הלוח. חייבים להכניס אותה לפני כל מהלך אחר. היא נכנסת לבית של היריב: קובייה 1 מכניסה לנקודה 24, קובייה 6 לנקודה 19. לנקודה שיש עליה בית של היריב אי אפשר להיכנס.", board: makeBoard({ w: { 24: 2, 13: 4, 8: 3, 6: 5 }, b: { 1: 2, 12: 3, 17: 3, 19: 5, 21: 2 }, wBar: 1 }) },
      { text: "הטלת 6 ו-3. נקודה 19 חסומה, אז ה-6 לא יכול להכניס. הכנס את האבן עם ה-3 (לנקודה 22), ואז שחק את ה-6 עם אבן אחרת.", board: makeBoard({ w: { 24: 2, 13: 4, 8: 3, 6: 5 }, b: { 1: 2, 12: 3, 17: 3, 19: 5, 21: 2 }, wBar: 1 }), dice: [6, 3], goal: (a) => a.bar.white === 0, ok: "נכנסת. אם שתי הקוביות היו חסומות, היית מפסיד את התור." },
    ],
  },
  {
    id: "safe", title: "לא להשאיר אבן לבד", blurb: "משחק בטוח",
    steps: [
      { text: "לפני כל מהלך שאל את עצמך: האם אני משאיר אבן בודדת במקום שהיריב יכול להגיע אליו? אבן שנאכלת מאבדת את כל הדרך שעשתה.", board: START() },
      { text: "הטלת 6 ו-1. מצא מהלך שלא משאיר אף אבן לבנה בודדת על הלוח.", board: START(), dice: [6, 1], goal: (a) => whiteBlots(a) === 0, ok: "מצוין, אין אבן חשופה. המהלך החזק כאן הוא לסגור בית על נקודה 7: אבן מ-13 ואבן מ-8.", retry: "נשארה אבן בודדת. רמז: שתי האבנים יכולות להיפגש על נקודה 7." },
    ],
  },
  {
    id: "off", title: "הוצאת אבנים", blurb: "סוף המשחק",
    steps: [
      { text: "כשכל 15 האבנים שלך בבית (נקודות 1 עד 6), מתחילים להוציא. קובייה 4 מוציאה אבן מנקודה 4. אם אין אבן על נקודה 4 וגם לא על נקודות גבוהות ממנה, מוציאים מהנקודה הגבוהה ביותר שיש עליה אבן.", board: makeBoard({ w: { 6: 2, 5: 2, 4: 3, 3: 2, 2: 2, 1: 1 }, b: { 19: 5, 20: 5, 22: 5 } }) },
      { text: "הטלת 6 ו-4. הוצא שתי אבנים: לחץ על אבן בנקודה 6 ואז על המגש מימין, ואותו דבר מנקודה 4.", board: makeBoard({ w: { 6: 2, 5: 2, 4: 3, 3: 2, 2: 2, 1: 1 }, b: { 19: 5, 20: 5, 22: 5 } }), dice: [6, 4], goal: (a, s) => a.off.white - s.off.white === 2, ok: "שתיים בחוץ. הראשון שמוציא את כל 15 האבנים מנצח.", retry: "אפשר להוציא שתי אבנים בתור הזה, אחת עם כל קובייה. נסה שוב." },
    ],
  },
  {
    id: "score", title: "ניקוד ודאבל", blurb: "מרס, טורקי וקוביית ההכפלה",
    steps: [
      { text: "ניצחון רגיל שווה נקודה אחת. מרס: ניצחת לפני שהיריב הוציא אפילו אבן אחת, וזה שווה כפול. טורקי: ליריב נשארה גם אבן בבית שלך או על הבר, וזה שווה פי שלוש." },
      { text: "קוביית ההכפלה: לפני שאתה מטיל, אתה יכול להציע דאבל. אם היריב מקבל, המשחק שווה כפול והקובייה עוברת אליו, ורק הוא יכול להכפיל שוב. אם הוא מסרב, הוא מפסיד מיד את הערך הנוכחי." },
      { text: "כלל אצבע: הצע דאבל כשיש לך יתרון ברור, בערך 70% לנצח. קבל דאבל אם יש לך לפחות סיכוי של אחד לארבעה. במשחק אימון עם מאמן תקבל עצה בכל פעם שהשאלה עולה." },
    ],
  },
];

// ---------------- practice positions ----------------
export type Topic = "all" | "hit" | "bar" | "race" | "bearoff";
export const TOPICS: { id: Topic; title: string; blurb: string }[] = [
  { id: "hit", title: "אכילה", blurb: "מתי לאכול ואיך" },
  { id: "bar", title: "כניסה מהבר", blurb: "לחזור למשחק אחרי שנאכלת" },
  { id: "race", title: "מרוץ הביתה", blurb: "כשאין יותר מגע בין הצדדים" },
  { id: "bearoff", title: "סוף משחק", blurb: "להוציא אבנים בלי לבזבז" },
];
export interface Puzzle { board: Board; dice: [number, number]; topic: Topic; }

const SPREAD: Record<Topic, number> = { all: 0.04, hit: 0.03, bar: 0.02, race: 0.008, bearoff: 0.004 };
const die = () => 1 + Math.floor(Math.random() * 6);
const expand = (d: [number, number]) => (d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]]);

function fits(b: Board, d: [number, number], topic: Topic, minSpread: number): boolean {
  const c: Color = "white";
  if (topic === "bar" && b.bar.white === 0) return false;
  if (topic === "bearoff" && !allHome(b, c)) return false;
  const race = isRace(b, c);
  if (topic === "race" && (!race || allHome(b, c))) return false;
  if ((topic === "all" || topic === "hit") && race) return false;
  const ts = allTurns(b, c, expand(d), d);
  if (ts.length < 3) return false;
  if (topic === "hit" && !ts.some((t) => t.moves.some((m) => m.hit))) return false;
  const ps = ts.map((t) => winProb(t.board, c, false)).sort((x, y) => y - x);
  return ps[0] - ps[Math.floor(ps.length / 2)] >= minSpread;
}

/** A position (white to play the given dice) taken from bot self-play, where the choice of move matters. */
export function genPuzzle(topic: Topic): Puzzle {
  let fallback: Puzzle | null = null;
  for (let g = 0; g < 400; g++) {
    const minSpread = g < 250 ? SPREAD[topic] : 0;
    let b = initialBoard();
    let turn: Color = Math.random() < 0.5 ? "white" : "black";
    const found: Puzzle[] = [];
    for (let ply = 0; ply < 400; ply++) {
      const d: [number, number] = [die(), die()];
      if (turn === "white" && ply >= 4 && fits(b, d, topic, minSpread)) found.push({ board: b, dice: d, topic });
      for (const m of chooseTurn(b, turn, expand(d), d, "hard")) b = applyMove(b, turn, m);
      if (b.off[turn] === 15) break;
      turn = turn === "white" ? "black" : "white";
    }
    if (found.length) return found[Math.floor(Math.random() * found.length)];
    if (!fallback && g > 300) fallback = { board: initialBoard(), dice: [3, 1], topic };
  }
  return fallback ?? { board: initialBoard(), dice: [3, 1], topic };
}

export const countWhite = (b: Board) => { let n = b.bar.white + b.off.white; for (let i = 0; i < 24; i++) n += countAt(b, i, "white"); return n; };

// ---------------- wording ----------------
export const GRADE_TEXT: Record<Grade, string> = { only: "מהלך יחיד אפשרי", best: "המהלך הכי טוב!", good: "מהלך טוב", inaccuracy: "אי-דיוק", mistake: "טעות", blunder: "טעות גסה" };
export const GRADE_COLOR: Record<Grade, string> = { only: "#b39d82", best: "#6fcf97", good: "#9be3b8", inaccuracy: "#f0cf86", mistake: "#ff9d6b", blunder: "#ff7a6b" };
export const isGoodGrade = (g: Grade) => g === "only" || g === "best" || g === "good";

/** "13→7, 8→7" in the point numbers the given player sees on the board. */
export function moveText(moves: Move[], viewer: Color): string {
  const num = (i: number) => (viewer === "white" ? i + 1 : 24 - i);
  return moves.map((m) => `${m.from === "bar" ? "בר" : num(m.from)}→${m.to === "off" ? "חוץ" : num(m.to)}${m.hit ? "*" : ""}`).join("  ");
}
