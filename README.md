# INDTV לאנדרואיד TV — איך מקבלים קובץ APK

הפרויקט הזה הופך את INDTV לאפליקציה אמיתית לאנדרואיד TV / Google TV:
אייקון ובאנר במסך הבית של הטלוויזיה, מסך מלא, שלט מלא (כולל חזרה, ערוץ +/−, Play/Pause).

GitHub בונה את קובץ ה-APK בשבילך בחינם, בענן. לא צריך להתקין שום דבר במחשב.

## חלק א׳ — בניית ה-APK (במחשב, פעם אחת, כ-10 דקות)

1. **חשבון:** היכנס ל-https://github.com ולחץ **Sign up** (חינם). אם יש לך חשבון — **Sign in**.
2. **ריפו חדש:** למעלה מימין לחץ על **+** ← **New repository**.
   - Repository name: `indtv`
   - בחר **Public** (כדי שהטלוויזיה תוכל להוריד את הקובץ בלי סיסמה)
   - לחץ **Create repository**.
3. **העלאת הקבצים:** בדף שנפתח לחץ על הקישור **uploading an existing file**.
   חלץ את INDTV-AndroidTV.zip במחשב, היכנס לתיקייה `indtv-tv`, סמן את **כל** מה שבתוכה
   (`.github`, `android`, `web`, `README.md`, `.gitignore`) וגרור לחלון של GitHub.
   חכה שכל הקבצים יעלו ולחץ **Commit changes**.
4. **הבנייה מתחילה לבד.** לחץ על הלשונית **Actions** למעלה. תראה ריצה בשם *Build INDTV APK*.
   אחרי 3–5 דקות יופיע וי ירוק.
   - אם GitHub מבקש לאשר: לחץ **I understand my workflows, go ahead and enable them**, ואז **Run workflow**.
5. **הקובץ:** חזור לדף הראשי של הריפו. בצד ימין, תחת **Releases**, לחץ על **INDTV 1.0.1** — שם נמצא `INDTV.apk`.

הקישור הקבוע להורדה (תמיד הגרסה האחרונה):
```
https://github.com/<שם-המשתמש-שלך>/indtv/releases/latest/download/INDTV.apk
```

> לא רואה את התיקייה `.github` במק? ב-Finder לחץ Cmd+Shift+. (נקודה) כדי להציג תיקיות מוסתרות.
> אם בכל זאת אין ריצה בלשונית Actions: לחץ **Add file ← Create new file**, כתוב בשם הקובץ
> `.github/workflows/build-apk.yml`, הדבק את התוכן של אותו קובץ מהתיקייה, ולחץ **Commit changes**.

## חלק ב׳ — התקנה בטלוויזיה

1. בטלוויזיה פתח את **Google Play** וחפש **Downloader** (של AFTVnews). התקן.
2. פתח את Downloader, הקלד את הקישור הקבוע מלמעלה ולחץ **Go**.
3. כשהטלוויזיה מבקשת אישור להתקנה ממקור לא ידוע: לחץ **Settings**, הפעל את **Downloader**, חזור ולחץ **Install**.
   - ב-Google TV, אם האפשרות לא מופיעה: הגדרות ← מערכת ← מידע ← לחץ 7 פעמים על **Android TV OS build**,
     ואז הגדרות ← אפליקציות ← אבטחה והגבלות ← מקורות לא ידועים ← Downloader.
4. לחץ **Open**. INDTV יופיע גם בשורת האפליקציות במסך הבית.

## עדכון האפליקציה

כל שינוי שמעלים לריפו בונה גרסה חדשה עם מספר גבוה יותר. בטלוויזיה פשוט מורידים שוב את אותו קישור ומתקינים — ההתקנה מתעדכנת מעל הקיימת, המועדפים נשמרים.

## מה שונה באפליקציה לעומת האתר

- **יותר ערוצים עובדים:** האפליקציה מורידה את השידורים בעצמה, כך שחסימות של הדפדפן (CORS, שידורי http) לא מפריעות,
  והיא שולחת את ה-User-Agent / Referer שהרשימה מבקשת לכל ערוץ.
- **שלט מלא:** חזרה, ערוץ +/−, Play/Pause, Stop, קדימה/אחורה. לחיצה כפולה על חזרה בדף הבית סוגרת את האפליקציה.
- כשיוצאים לבית של הטלוויזיה השידור נעצר.
- ערוצים חסומים גאוגרפית או שירדו מהאוויר עדיין לא יעבדו — האפליקציה לא עוקפת חסימות, DRM או התחברות.

## מבנה

```
web/                       האתר של INDTV (נארז בתוך ה-APK)
android/                   מעטפת אנדרואיד TV (Java, WebView)
  app/src/main/java/...    MainActivity: מסך מלא, שלט, הורדת שידורים
  app/indtv-release.jks    מפתח החתימה של האפליקציה
.github/workflows/         הוראות הבנייה ל-GitHub
```

מפתח החתימה שמור בפרויקט כדי שכל בנייה תוכל לעדכן את האפליקציה המותקנת. בריפו ציבורי כל אחד יכול לראות אותו;
זה בסדר לאפליקציה לשימוש אישי. אם תפיץ את האפליקציה לאחרים — העבר את המפתח ל-GitHub Secrets.


## התקנה בטלוויזיית Samsung (Tizen)

כל בנייה מפרסמת גם את `INDTV.wgt` לטלוויזיות סמסונג (דגמי 2017 ומעלה, Tizen 3.0+).
ההתקנה נעשית פעם אחת עם התוכנה החינמית **TizenBrew Installer**, שמחברת את המחשב לטלוויזיה, חותמת את האפליקציה בשבילך ומתקינה אותה ישירות מהריפו הזה.

1. **מצב מפתח בטלוויזיה:** Apps ← הקלידו בשלט `12345` ← Developer mode = On ← בשדה Host PC IP הכניסו את כתובת ה-IP של המחשב ← OK ← כבו והדליקו את הטלוויזיה.
2. **במחשב:** הורידו את TizenBrew Installer מ-https://github.com/reisxd/TizenBrewInstaller/releases (Windows / Mac / Linux) והפעילו.
3. התחברו לטלוויזיה לפי כתובת ה-IP שלה (הגדרות ← כללי ← רשת ← מצב רשת).
4. בטלוויזיות 2023 ומעלה (Tizen 7+) תתבקשו להתחבר לחשבון Samsung — זה יוצר את תעודת החתימה של הטלוויזיה שלכם.
5. בחרו התקנה מ-GitHub והקלידו: `liors24/indtv`
6. INDTV יופיע ברשימת האפליקציות של הטלוויזיה.

עדכון: חוזרים על שלב 5 — הגרסה החדשה מותקנת מעל הקיימת.

## עדכון אוטומטי (אנדרואיד TV וסמסונג)

מהגרסה הזו והלאה, האפליקציה בודקת בכל הפעלה אם יצאה גרסה חדשה של התוכן (`ota/bundle.json` בענף `ota`),
מורידה אותה לבד ומחליפה בלי התקנה מחדש. אם אין חיבור לאינטרנט או שהגרסה החדשה לא עולה — ממשיכים עם הגרסה המותקנת.
התקנה ידנית נחוצה רק כשמשתנה המעטפת עצמה (נדיר).

## Recording and rewinding live TV

Inside the player (no extra app):

- **Rewind / forward** (remote ⏪ ⏩ or the on-screen buttons): the app keeps the last N minutes (Settings → Recording, default 30) of the channel you watch in the device's IndexedDB. Rewinding plays that buffer; repeated presses jump further (10 s, 10 s, 30 s, 1 min, 2 min, 5 min).
- **Programme start** (green key / ⏮↺ button): jumps to the beginning of the current programme from the guide, if it is still in the buffer (otherwise to the earliest saved point).
- **Back to live** (yellow key / LIVE button, or forward past the end of the buffer).
- **Record** (red key / ● button): saves the current programme — from its start when buffered, until its end (+ padding) — into **Recordings**, where it can be played, seeked and deleted. A recording continues if you change channel.
- Works by copying the stream's own HLS segments (no re-encoding). Encrypted/DRM streams are never captured; only HLS channels are supported.
- **Android TV:** a recording keeps running after you press Home or exit the app (a foreground service with a notification and wake lock keeps the process alive; timers run from a Web Worker so they are not throttled). Samsung/Tizen cannot record in the background.
- See `web/js/player/dvr.js` for the design notes.

## Live subtitles

Deepgram streaming + free Google translation: words appear as they are spoken, finished sentences are translated one by one and roll upwards — at most five sentences on screen, the newest at the bottom.
