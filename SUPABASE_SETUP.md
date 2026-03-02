# הוראות הגדרה ופריסה ל-Supabase

## ✅ מה כבר הוגדר

1. ✅ קובץ `config.ts` עם משתני Supabase
2. ✅ עדכון כל ה-services להשתמש ב-`config.apiBaseUrl`
3. ✅ יצירת מבנה Supabase Edge Functions:
   - `facebook-auth` - OAuth authentication
   - `facebook-api` - כל ה-API endpoints של Facebook
   - `ai-chat` - AI Chat עם OpenAI
4. ✅ קובץ `.env.production` עם משתני הסביבה

## 📋 מה צריך לעשות עכשיו

### 1. הגדרת Secrets ב-Supabase Dashboard

1. היכנס ל-[Supabase Dashboard](https://supabase.com/dashboard/project/ayetlgxkgwnecksepjum)
2. לך ל: **Settings** → **Edge Functions** → **Secrets**
3. הוסף את המשתנים הבאים:

```
OPENAI_API_KEY=sk-your-openai-api-key-here

FACEBOOK_APP_ID=your-facebook-app-id

FACEBOOK_APP_SECRET=your-facebook-app-secret

FACEBOOK_REDIRECT_URI=https://ayetlgxkgwnecksepjum.supabase.co/functions/v1/facebook-auth/callback

FRONTEND_URL=https://ayetlgxkgwnecksepjum.supabase.co

SESSION_SECRET=generate-a-random-secret-key-here-minimum-32-characters
```

### 2. עדכון Facebook OAuth Settings

1. היכנס ל-[Facebook Developer Console](https://developers.facebook.com/apps/1460378838789706/settings/basic/)
2. תחת **Settings** → **Basic**:
   - **App Domains**: הוסף `ayetlgxkgwnecksepjum.supabase.co`
3. תחת **Products** → **Facebook Login** → **Settings**:
   - **Valid OAuth Redirect URIs**: הוסף:
     ```
     https://ayetlgxkgwnecksepjum.supabase.co/functions/v1/facebook-auth/callback
     ```

### 3. התקנת Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 4. קישור לפרויקט

```bash
cd /Users/ronavidor/Desktop/project_develop/ppc-ai-master
supabase link --project-ref ayetlgxkgwnecksepjum
```

### 5. פריסת Edge Functions

```bash
# פריסת Facebook Auth
supabase functions deploy facebook-auth

# פריסת Facebook API
supabase functions deploy facebook-api

# פריסת AI Chat
supabase functions deploy ai-chat
```

### 6. בניית Frontend

```bash
npm run build
```

זה ייצור תיקיית `dist` עם הקבצים המוכנים לפריסה.

### 7. פריסת Frontend

#### אופציה 1: באמצעות Supabase Hosting (מומלץ)

```bash
supabase hosting deploy dist
```

#### אופציה 2: העלאה ידנית

1. היכנס ל-Supabase Dashboard → **Hosting**
2. לחץ על **New Site**
3. העלה את תיקיית `dist`

### 8. בדיקות

1. פתח את האפליקציה: `https://ayetlgxkgwnecksepjum.supabase.co`
2. בדוק התחברות Facebook
3. בדוק משיכת נתונים מפייסבוק
4. בדוק AI Chat

## 🔧 פתרון בעיות

### שגיאת CORS
- ודא שה-CORS headers מוגדרים ב-`supabase/functions/_shared/cors.ts`
- בדוק שה-`FRONTEND_URL` נכון ב-Secrets

### שגיאת Authentication
- בדוק שה-Facebook OAuth URLs עודכנו ב-Facebook Developer Console
- בדוק שה-`FACEBOOK_REDIRECT_URI` נכון ב-Secrets

### שגיאת API
- בדוק את ה-logs ב-Supabase Dashboard → **Edge Functions** → **Logs**
- ודא שכל ה-Secrets מוגדרים

### Frontend לא נטען
- ודא שהפריסת ה-Hosting הצליחה
- בדוק את ה-URL ב-Supabase Dashboard → **Hosting**

## 📝 הערות חשובות

1. **Sessions**: הקוד הנוכחי משתמש ב-token ב-URL (לא מאובטח). בפרודקשן, מומלץ להשתמש ב-Supabase Auth או לשמור tokens ב-database.

2. **Environment Variables**: ב-Production, כל המשתנים צריכים להיות ב-Supabase Secrets, לא ב-`.env`.

3. **Rate Limiting**: הקוד כולל rate limiting ל-Facebook API. אם יש בעיות, בדוק את ה-logs.

4. **Build**: ודא שאתה בונה עם `npm run build` לפני הפריסה.

## 🎉 סיום

לאחר שתסיים את כל השלבים, האפליקציה תהיה זמינה ב:
`https://ayetlgxkgwnecksepjum.supabase.co`
