# הוראות התקנה ופריסה

## ⚠️ לפני שנתחיל

**חשוב מאוד**: לפני הפריסה, ודא שהוספת את כל ה-Secrets ב-Supabase Dashboard:

1. היכנס ל-[Supabase Dashboard](https://supabase.com/dashboard/project/ayetlgxkgwnecksepjum)
2. לך ל: **Settings** → **Edge Functions** → **Secrets**
3. הוסף את כל המשתנים (ראה `SUPABASE_SETUP.md`)

## שלב 1: התקנת Supabase CLI

הרץ את הפקודה הבאה בטרמינל:

```bash
npm install -g supabase
```

אם יש בעיית הרשאות, נסה:

```bash
sudo npm install -g supabase
```

## שלב 2: התחברות ל-Supabase

```bash
supabase login
```

זה יפתח דפדפן להתחברות.

## שלב 3: קישור לפרויקט

```bash
cd /Users/ronavidor/Desktop/project_develop/ppc-ai-master
supabase link --project-ref ayetlgxkgwnecksepjum
```

## שלב 4: פריסת Edge Functions

```bash
# פריסת Facebook Auth
supabase functions deploy facebook-auth

# פריסת Facebook API
supabase functions deploy facebook-api

# פריסת AI Chat
supabase functions deploy ai-chat
```

## שלב 5: בניית Frontend

```bash
npm run build
```

## שלב 6: פריסת Frontend

```bash
supabase hosting deploy dist
```

## 🎯 אופציה מהירה - שימוש בסקריפט

אם יצרת את קובץ `.env` עם כל המשתנים, תוכל להריץ:

```bash
./deploy-to-supabase.sh
```

הסקריפט יבצע את כל השלבים אוטומטית.

## ✅ לאחר הפריסה

1. האפליקציה תהיה זמינה ב: `https://ayetlgxkgwnecksepjum.supabase.co`
2. בדוק שהכל עובד:
   - התחברות Facebook
   - משיכת נתונים
   - AI Chat

## 🔧 פתרון בעיות

### שגיאת "command not found: supabase"
- ודא שהתקנת את Supabase CLI: `npm install -g supabase`
- נסה לסגור ולפתוח מחדש את הטרמינל

### שגיאת "not authenticated"
- הרץ `supabase login` שוב

### שגיאת "project not found"
- ודא שה-project-ref נכון: `ayetlgxkgwnecksepjum`
- ודא שקישרת לפרויקט: `supabase link --project-ref ayetlgxkgwnecksepjum`

### שגיאת "secrets not found"
- ודא שהוספת את כל ה-Secrets ב-Supabase Dashboard
