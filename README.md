<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1dmZ6SqqcWVeqfsMCPGY8x0rwScpI3ZAB

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```bash
   # OpenAI API Key
   OPENAI_API_KEY=sk-your-api-key-here
   
   # Facebook App Credentials
   FACEBOOK_APP_ID=1460378838789706
   FACEBOOK_APP_SECRET=YOUR_APP_SECRET_HERE
   FACEBOOK_REDIRECT_URI=http://localhost:5001/auth/facebook/callback
   
   # Session Secret (change this to a random string)
   SESSION_SECRET=your-super-secret-session-key-change-this
   
   # Backend Server Port
   PORT=5001
   ```
   
   **Important:**
   - Get your OpenAI API key from: https://platform.openai.com/api-keys
   - Get your Facebook App Secret from: https://developers.facebook.com/apps/1460378838789706/settings/basic/
   - Replace `YOUR_APP_SECRET_HERE` with your actual App Secret from Facebook Developer Console

3. Run the app:
   
   **Option 1: Run both frontend and backend together:**
   ```bash
   npm run dev:full
   ```
   
   **Option 2: Run separately (in two terminals):**
   ```bash
   # Terminal 1 - Frontend
   npm run dev
   
   # Terminal 2 - Backend
   npm run server
   ```

4. Access the app:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5001

## Facebook OAuth Setup

1. Go to [Facebook Developer Console](https://developers.facebook.com/apps/1460378838789706/settings/basic/)
2. Add `localhost` to **App Domains**
3. Add `http://localhost:5001/auth/facebook/callback` to **Valid OAuth Redirect URIs**
4. Make sure your App is in **Development Mode** for testing
5. Add test users in the **Roles** section if needed

## Production Deployment

Before deploying to production:
1. Update `FACEBOOK_REDIRECT_URI` in `.env` to your production domain
2. Update CORS origin in `server/index.ts` to your production domain
3. Change `SESSION_SECRET` to a strong random string
4. Submit your app for Facebook App Review to allow non-testers to connect
