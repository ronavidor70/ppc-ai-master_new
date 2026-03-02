import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID') || ''
const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET') || ''
const FACEBOOK_REDIRECT_URI = Deno.env.get('FACEBOOK_REDIRECT_URI') || ''
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') || 'http://localhost:3000'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname

  try {
    // OAuth initiation - redirect to Facebook
    if (path.endsWith('/auth/facebook') && req.method === 'GET') {
      if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
        return new Response(
          JSON.stringify({ error: 'Facebook OAuth not configured' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const state = crypto.randomUUID()
      const scope = [
        'public_profile',
        'email',
        'ads_management',
        'ads_read',
        'business_management',
        'pages_manage_ads',
        'pages_read_engagement',
        'pages_show_list'
      ].join(',')

      const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${FACEBOOK_APP_ID}&` +
        `redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&` +
        `scope=${scope}&` +
        `state=${state}`

      return Response.redirect(authUrl, 302)
    }

    // OAuth callback - handle Facebook response
    if (path.endsWith('/auth/facebook/callback') && req.method === 'GET') {
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        console.error('Facebook OAuth error:', error)
        return Response.redirect(`${FRONTEND_URL}/?error=oauth_failed`, 302)
      }

      if (!code) {
        return Response.redirect(`${FRONTEND_URL}/?error=no_code`, 302)
      }

      // Exchange code for access token
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `client_id=${FACEBOOK_APP_ID}&` +
        `client_secret=${FACEBOOK_APP_SECRET}&` +
        `redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&` +
        `code=${code}`

      const tokenResponse = await fetch(tokenUrl)
      const tokenData = await tokenResponse.json()

      if (tokenData.error) {
        console.error('Token exchange error:', tokenData.error)
        return Response.redirect(`${FRONTEND_URL}/?error=token_exchange_failed`, 302)
      }

      const accessToken = tokenData.access_token

      // Get user info
      const userUrl = `https://graph.facebook.com/v19.0/me?fields=id,name,email,picture&access_token=${accessToken}`
      const userResponse = await fetch(userUrl)
      const userData = await userResponse.json()

      // Store token in session (in production, use Supabase database)
      // For now, redirect with token in URL (not secure, but works for demo)
      // In production, use Supabase Auth or store in database
      const redirectUrl = new URL(`${FRONTEND_URL}/?auth_success=true`)
      redirectUrl.searchParams.set('token', accessToken)
      redirectUrl.searchParams.set('user', JSON.stringify(userData))

      return Response.redirect(redirectUrl.toString(), 302)
    }

    // Get user token
    if (path.endsWith('/api/facebook/token') && req.method === 'GET') {
      const token = url.searchParams.get('token')
      const userStr = url.searchParams.get('user')

      if (!token || !userStr) {
        return new Response(
          JSON.stringify({ error: 'Not authenticated' }),
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const user = JSON.parse(userStr)

      return new Response(
        JSON.stringify({
          accessToken: token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            picture: user.picture?.data?.url
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Logout
    if (path.endsWith('/auth/logout') && req.method === 'GET') {
      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error in facebook-auth:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
