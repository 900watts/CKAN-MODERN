import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SILICON_FLOW_BASE = 'https://api.siliconflow.cn/v1'
const FREE_MODEL = 'THUDM/GLM-Z1-9B-0414'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siliconFlowKey = Deno.env.get('SILICON_FLOW_KEY')

    if (!siliconFlowKey) {
      return new Response(JSON.stringify({ error: 'AI service not configured on server' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create admin client for DB operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    ).auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Get user profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .single()

    const tier = profile?.tier || 'free'
    const DAILY_LIMIT = 20

    // 3. Check daily usage
    const { data: usageCount } = await supabaseAdmin.rpc('get_daily_ai_usage', { p_user_id: user.id })
    const todayUsage = usageCount ?? 0

    if (todayUsage >= DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: `Daily limit reached (${DAILY_LIMIT} requests/day). Try again tomorrow.`,
        limit: DAILY_LIMIT,
        used: todayUsage,
        remaining: 0,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Parse request body
    const body = await req.json()
    const messages = body.messages || []
    const stream = body.stream ?? false

    // 5. Proxy to Silicon Flow
    const sfResponse = await fetch(`${SILICON_FLOW_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${siliconFlowKey}`,
      },
      body: JSON.stringify({
        model: FREE_MODEL,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
        stream,
      }),
    })

    if (!sfResponse.ok) {
      const errBody = await sfResponse.text()
      return new Response(JSON.stringify({ error: `AI provider error: ${sfResponse.status}`, details: errBody }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6. Log usage
    await supabaseAdmin.from('ai_usage').insert({
      user_id: user.id,
      model: FREE_MODEL,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    })

    // 7. Return response (streaming or non-streaming)
    if (stream && sfResponse.body) {
      return new Response(sfResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    const data = await sfResponse.json()
    return new Response(JSON.stringify({
      reply: data.choices?.[0]?.message?.content || 'No response from model.',
      model: FREE_MODEL,
      usage: data.usage,
      tier,
      remaining_today: DAILY_LIMIT - todayUsage - 1,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
