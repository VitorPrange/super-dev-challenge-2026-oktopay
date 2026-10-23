// Edge Function "painel": é aqui que uma PESSOA aprova ou recusa os rascunhos
// criados pelo agente. É a única porta que move dinheiro (via ok_fn_aprovar_rascunho).
//
// Esta função roda com verify_jwt = false (ver supabase/config.toml), porque o painel
// não faz login no Supabase: ele manda uma senha no cabeçalho x-painel-senha.
// Por isso a senha É a única barreira: ela fica no Secret PAINEL_SENHA e é conferida aqui.
import { clienteAdmin } from '../_shared/supabase.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Compara as senhas pelo hash SHA-256 e sem parar no primeiro byte diferente
// (evita vazar, pelo tempo de resposta, quantas letras a pessoa acertou).
async function senhaConfere(informada: string, esperada: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(informada)),
    crypto.subtle.digest('SHA-256', enc.encode(esperada)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diferenca = 0
  for (let i = 0; i < x.length; i++) diferenca |= x[i] ^ y[i]
  return diferenca === 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const esperada = Deno.env.get('PAINEL_SENHA')
  if (!esperada) return json({ erro: 'Painel sem senha configurada (secret PAINEL_SENHA).' }, 500)
  const informada = req.headers.get('x-painel-senha') ?? ''
  if (!informada || !(await senhaConfere(informada, esperada))) {
    return json({ erro: 'Senha incorreta.' }, 401)
  }

  const db = clienteAdmin()

  // GET: devolve os rascunhos (mais recentes primeiro) e as últimas execuções do agente.
  if (req.method === 'GET') {
    const { data: rascunhos, error: e1 } = await db
      .from('ok_rascunhos')
      .select('id, tipo, valor, status, justificativa, evidencias, criado_em')
      .order('criado_em', { ascending: false }).limit(50)
    if (e1) return json({ erro: e1.message }, 500)
    const { data: execucoes, error: e2 } = await db
      .from('ok_execucoes')
      .select('criado_em, pergunta, passos, duracao_ms')
      .order('criado_em', { ascending: false }).limit(20)
    if (e2) return json({ erro: e2.message }, 500)
    return json({ rascunhos, execucoes })
  }

  // POST { id, status }: aprova ou recusa um rascunho.
  if (req.method === 'POST') {
    const corpo = await req.json().catch(() => ({}))
    const { id, status } = corpo ?? {}
    if (typeof id !== 'string' || !UUID.test(id)) return json({ erro: 'id inválido.' }, 400)
    if (status !== 'aprovado' && status !== 'recusado') return json({ erro: 'status deve ser aprovado ou recusado.' }, 400)

    const { data, error } = await db.rpc('ok_fn_aprovar_rascunho', {
      p_rascunho_id: id, p_decisao: status, p_decisor: 'painel',
    })
    // Ex.: "saldo insuficiente no momento da aprovacao..." volta como erro 400 legível.
    if (error) return json({ erro: error.message }, 400)
    return json({ ok: true, resultado: data })
  }

  return json({ erro: 'Método não permitido.' }, 405)
})
