import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    const { messages, lang } = await req.json()

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'pauseCampaign',
          description: lang === 'he' 
            ? 'עוצר קמפיין לפי ID שלו'
            : 'Pauses a campaign by its ID',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: lang === 'he' ? 'ID של הקמפיין' : 'Campaign ID'
              }
            },
            required: ['id']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'updateBudget',
          description: lang === 'he'
            ? 'מעדכן תקציב של קמפיין'
            : 'Updates a campaign budget',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: lang === 'he' ? 'ID של הקמפיין' : 'Campaign ID'
              },
              amount: {
                type: 'number',
                description: lang === 'he' ? 'התקציב החדש' : 'New budget amount'
              }
            },
            required: ['id', 'amount']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'sendWhatsAppToLead',
          description: lang === 'he'
            ? 'פותח וואטסאפ לליד לפי מספר טלפון'
            : 'Opens WhatsApp for a lead by phone number',
          parameters: {
            type: 'object',
            properties: {
              phone: {
                type: 'string',
                description: lang === 'he' ? 'מספר טלפון' : 'Phone number'
              }
            },
            required: ['phone']
          }
        }
      }
    ]

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error?.message || 'OpenAI API error')
    }

    const data = await response.json()
    const assistantMessage = data.choices[0].message
    let finalMessage = assistantMessage.content || ''
    
    const actions: any[] = []

    if (assistantMessage.tool_calls) {
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== 'function') continue
        const functionName = toolCall.function.name
        const functionArgs = JSON.parse(toolCall.function.arguments)

        actions.push({
          type: functionName,
          params: functionArgs
        })

        if (lang === 'he') {
          if (functionName === 'pauseCampaign') {
            finalMessage += `\n\n✅ ביצעתי עצירה של קמפיין ${functionArgs.id}`
          } else if (functionName === 'updateBudget') {
            finalMessage += `\n\n✅ עדכנתי תקציב של קמפיין ${functionArgs.id} ל-${functionArgs.amount}`
          } else if (functionName === 'sendWhatsAppToLead') {
            finalMessage += `\n\n✅ פתחתי וואטסאפ ל-${functionArgs.phone}`
          }
        } else {
          if (functionName === 'pauseCampaign') {
            finalMessage += `\n\n✅ I paused campaign ${functionArgs.id}`
          } else if (functionName === 'updateBudget') {
            finalMessage += `\n\n✅ I updated campaign ${functionArgs.id} budget to ${functionArgs.amount}`
          } else if (functionName === 'sendWhatsAppToLead') {
            finalMessage += `\n\n✅ I opened WhatsApp for ${functionArgs.phone}`
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: finalMessage,
        actions: actions
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('AI Chat Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to process chat message' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
