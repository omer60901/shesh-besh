# Shesh-Besh (שש בש)

Online backgammon you play with friends by scanning a QR code, plus a bot that learned the game by playing against itself, and a training mode.

**Play it:** https://aesthetic-biscotti-378abe.netlify.app

- **Full rules**: bar, bearing off, the "use both dice / use the higher die" rule, doubling cube, gammon and backgammon, match play with the Crawford rule
- **Private rooms**: create a room, share the QR code, play from two phones (Firebase Realtime Database)
- **Bot, three levels**: easy (makes mistakes), hard (hand-written evaluation), impossible (a small neural network trained with TD-learning on about 195,000 self-play games, with a 2-ply search)
- **Training mode**: 7 beginner lessons, "find the best move" puzzles, practice by topic, and coached games with hints and a grade for every move
- **Tech**: TypeScript, React, Next.js, Framer Motion. The rules engine and the bot are pure functions with their own tests

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # rules engine, coach, lessons, bot move generation
npm run build:site   # single-file build in dist/ (what Netlify deploys)
```

Measured bot strength (single games, bots against each other): hard beats easy 90%, impossible beats hard 75%. Re-run with `npx tsx tests/bot-tournament.ts ladder 1000`.

Known limitation: dice are rolled in the player's browser and rooms are open to anyone with the code. Fine between friends; a public version would need server-side dice and move validation.

---

## בעברית

שש בש אונליין עם חדרים פרטיים. פותחים חדר, החבר סורק QR, ומשחקים, כל אחד מהטלפון שלו.

**מה יש בפנים**
- כל החוקים: אכילה ובר, חובת כניסה מהבר, הוצאה הביתה (כולל הוצאה מהנקודה הגבוהה ביותר), חובה לנצל כמה שיותר קוביות, וחובה לשחק את הקובייה הגבוהה כשאפשר רק אחת
- קוביית הכפלה (דאבל) עם בעלות, מרס (גמון) ×2, טורקי (בקגמון) ×3
- משחק עד 1/3/5/7/11 נקודות עם חוק קרופורד
- אנימציות: אבנים שזזות בקפיץ, קוביות תלת־ממד, קוביית דאבל שמסתובבת, הדגשה של המהלכים החוקיים
- ביטול מהלך בתוך התור, ויתור, ספירת פיפס, צלילים (בלי קבצי אודיו)
- הלוח מסתובב, כך שכל שחקן רואה את הבית שלו למטה מימין
- משחק מול בוט בשלוש רמות: קל (עושה טעויות), קשה (הערכת עמדה כתובה ביד), בלתי אפשרי (רשת נוירונים שאומנה במשחק עצמי, עם מבט צעד קדימה על כל ההטלות של היריב). הקוביות של הבוט הוגנות, והוא גם מציע ומקבל דאבל
- מצב אימון: 7 שיעורים למתחילים, חידות "מצא את המהלך", תרגול לפי נושא (אכילה, בר, מרוץ, סוף משחק) ומשחק מול הבוט עם מאמן (רמזים, ציון לכל מהלך, עצות דאבל)
- צופים: שחקן שלישי שנכנס לחדר רואה את המשחק בזמן אמת

## הרצה מקומית

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # כל הבדיקות
npx tsx tests/bot-tournament.ts ladder 1000   # טורניר בין רמות הבוט
npx tsx tests/bot-match.ts impossible hard 60 # משחקים מלאים עם דאבל
```

בלי Firebase האפליקציה עובדת **במצב מקומי**: החדר מסונכרן רק בין לשוניות באותו דפדפן. זה טוב לבדיקות, לא למשחק עם חברים.

## לשחק בין טלפונים: Firebase (חינם, בערך 5 דקות)

1. נכנסים ל-https://console.firebase.google.com ויוצרים פרויקט (אפשר לכבות את Analytics).
2. **Build → Realtime Database → Create database**, בוחרים מיקום (europe-west1) ומתחילים ב-*locked mode*.
3. בלשונית **Rules** מדביקים את זה ולוחצים Publish:
   ```json
   {
     "rules": {
       "rooms": {
         "$code": { ".read": true, ".write": true }
       }
     }
   }
   ```
4. **Project settings (⚙️) → Your apps → Web (</>)**, רושמים אפליקציה ומעתיקים את ה-config.
5. מעתיקים את `.env.example` ל-`.env.local` וממלאים את הערכים (את `databaseURL` לוקחים מעמוד ה-Realtime Database).

## העלאה לאוויר: Vercel

1. מעלים את התיקייה ל-GitHub.
2. ב-https://vercel.com עושים **Add New → Project** ובוחרים את ה-repo.
3. תחת **Environment Variables** מוסיפים את 5 המשתנים מ-`.env.local`.
4. לוחצים Deploy. הקישור שמתקבל הוא מה שה-QR יפתח.

## כמה דברים שכדאי לדעת

- **אבטחה:** כל מי שיש לו את קוד החדר יכול לכתוב אליו, והקוביות מוטלות בצד הלקוח. בין חברים זה בסדר גמור. אם תרצה לפתוח את זה לזרים, צריך להעביר את הטלת הקוביות ואת אימות המהלכים לשרת (Cloud Functions).
- **זהות:** כל דפדפן מקבל מזהה שנשמר ב-localStorage. אם מישהו מנקה נתונים באמצע משחק, הוא יחזור כצופה.
- חדרים ישנים לא נמחקים אוטומטית. ב-Firebase החינמי יש מקום להמון חדרים, אבל אפשר למחוק את `rooms` מהקונסולה מדי פעם.

## מבנה הקוד

```
lib/engine.ts        מנוע החוקים (פונקציות טהורות, אפשר לבדוק בלי UI)
lib/bot.ts           הבוט: מחולל מהלכים, הערכת עמדה, חיפוש, החלטות דאבל
lib/net.ts           רשת הערך (המשקלים ב-net-weights.ts, נוצרים ע"י tests/export-net.ts)
lib/train.ts         תוכן השיעורים ומחולל עמדות התרגול
components/Practice.tsx  לוח תרגול מקומי (תור אחד)
app/train/           מסך מצב האימון
lib/sync.ts          סנכרון: Firebase או מצב מקומי
lib/sound.ts         אפקטים קוליים מסונתזים
components/Board.tsx הלוח, האבנים המונפשות, הקוביות והקובייה
app/page.tsx         מסך הבית: פתיחת חדר והצטרפות
app/room/[code]/     מסך המשחק
tests/               בדיקות למנוע
```
