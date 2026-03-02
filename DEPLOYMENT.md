# הוראות פריסה ל-Supabase

## 1. הגדרת משתני סביבה ב-Supabase

היכנס ל-Supabase Dashboard → Settings → Edge Functions → Secrets והוסף:

```
OPENAI_API_KEY=sk-your-openai-api-key-here
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_REDIRECT_URI=https://ayetlgxkgwnecksepjum.supabase.co/functions/v1/facebook-auth/callback
FRONTEND_URL=https://ayetlgxkgwnecksepjum.supabase.co
SESSION_SECRET=your-random-secret-key-here
```

## 2. עדכון Facebook OAuth

1. היכנס ל-[Facebook Developer Console](https://developers.facebook.com/apps/1460378838789706/settings/basic/)
2. עדכן את **Valid OAuth Redirect URIs**:
   ```
   https://ayetlgxkgwnecksepjum.supabase.co/functions/v1/facebook-auth/callback
   ```
3. עדכן את **App Domains**:
   ```
   ayetlgxkgwnecksepjum.supabase.co
   ```

## 3. התקנת Supabase CLI

```bash
npm install -g supabase
supabase login
```

## 4. קישור לפרויקט

```bash
cd /Users/ronavidor/Desktop/project_develop/ppc-ai-master
supabase link --project-ref ayetlgxkgwnecksepjum
```

## 5. פריסת Edge Functions

```bash
# פריסת Facebook Auth
supabase functions deploy facebook-auth

# פריסת Facebook API
supabase functions deploy facebook-api

# פריסת AI Chat
supabase functions deploy ai-chat
```

## 6. בניית Frontend

```bash
npm run build
```

## 7. פריסת Frontend

### אופציה 1: באמצעות Supabase Hosting
```bash
supabase hosting deploy dist
```

### אופציה 2: העלאה ידנית
1. היכנס ל-Supabase Dashboard → Hosting
2. העלה את תיקיית `dist`

## 8. עדכון URLs ב-Frontend

הקוד כבר מעודכן להשתמש ב-`config.ts` שמשתמש ב-m environment variables.

## 9. בדיקות

1. בדוק שהאפליקציה נטענת: `https://ayetlgxkgwnecksepjum.supabase.co`
2. בדוק התחברות Facebook
3. בדוק משיכת נתונים מפייסבוק
4. בדוק AI Chat

## הערות חשובות

1. **Sessions**: Edge Functions לא תומכות ב-express-session. הקוד הנוכחי משתמש ב-token ב-URL (לא מאובטח). בפרודקשן, השתמש ב-Supabase Auth או שמור tokens ב-database.

2. **CORS**: ה-CORS headers מוגדרים ב-`_shared/cors.ts`. אם יש בעיות, עדכן שם.

3. **Rate Limiting**: הקוד כולל rate limiting ל-Facebook API. אם יש בעיות, בדוק את ה-logs ב-Supabase Dashboard.

4. **Environment Variables**: ודא שכל ה-Secrets מוגדרים ב-Supabase Dashboard לפני הפריסה.

## פתרון בעיות

### שגיאת CORS
- ודא שה-CORS headers מוגדרים נכון
- בדוק שה-Frontend URL נכון ב-`FRONTEND_URL`

### שגיאת Authentication
- בדוק שה-Facebook OAuth URLs עודכנו
- בדוק שה-`FACEBOOK_REDIRECT_URI` נכון

### שגיאת API
- בדוק את ה-logs ב-Supabase Dashboard → Edge Functions → Logs
- ודא שכל ה-Secrets מוגדרים
