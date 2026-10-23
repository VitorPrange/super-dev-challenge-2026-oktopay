// CORS: antes de chamar a função, o navegador faz uma "pré-checagem" (OPTIONS).
// Sem estes cabeçalhos ele bloqueia a chamada. É o padrão da doc oficial do
// Supabase, mais o cabeçalho x-painel-senha (usado só pelo painel).
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // em produção, troque pelo domínio da sua Vercel
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-painel-senha',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// Resposta JSON já com os cabeçalhos de CORS (inclusive nos erros).
export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
