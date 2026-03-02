#!/bin/bash

# ============================================
# סקריפט פריסה ל-Supabase
# ============================================

set -e  # עצור אם יש שגיאה

echo "🚀 מתחיל פריסה ל-Supabase..."

# 1. בדיקה אם Supabase CLI מותקן
echo ""
echo "📦 בודק אם Supabase CLI מותקן..."
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI לא מותקן. מתקין..."
    npm install -g supabase
else
    echo "✅ Supabase CLI כבר מותקן"
fi

# 2. התחברות ל-Supabase
echo ""
echo "🔐 מתחבר ל-Supabase..."
supabase login

# 3. קישור לפרויקט
echo ""
echo "🔗 מקשר לפרויקט Supabase..."
supabase link --project-ref ayetlgxkgwnecksepjum

# 4. פריסת Edge Functions
echo ""
echo "📤 מפריס Edge Functions..."

echo "  → מפריס facebook-auth..."
supabase functions deploy facebook-auth

echo "  → מפריס facebook-api..."
supabase functions deploy facebook-api

echo "  → מפריס ai-chat..."
supabase functions deploy ai-chat

# 5. בניית Frontend
echo ""
echo "🔨 בונה Frontend..."
npm run build

# 6. פריסת Frontend
echo ""
echo "🌐 מפריס Frontend..."
supabase hosting deploy dist

echo ""
echo "✅ פריסה הושלמה בהצלחה!"
echo ""
echo "🌍 האפליקציה זמינה ב: https://ayetlgxkgwnecksepjum.supabase.co"
echo ""
echo "⚠️  חשוב: ודא שהוספת את כל ה-Secrets ב-Supabase Dashboard!"
echo "   Settings → Edge Functions → Secrets"
