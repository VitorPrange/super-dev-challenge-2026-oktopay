/// <reference lib="deno.ns" />
// Edge Function "qr": recarga por QR code.
//  POST { acao:'criar', valor }   -> precisa de login (token do Supabase); devolve { token, expira_em }
//  GET  ?t=TOKEN                  -> público; devolve quem recebe e o valor
//  POST { acao:'confirmar', token } -> público; cria um RASCUNHO de recarga (não move dinheiro)
// Quem escaneia não paga nada e não precisa de conta.
import { clienteAdmin } from '../_shared/supabase.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const db = clienteAdmin()

  // ---- GET: dados do QR (para a página que abre ao escanear) ----
  if (req.method === 'GET') {
    const t = new URL(req.url).searchParams.get('t') ?? ''
    if (!TOKEN.test(t)) return json({ erro: 'QR inválido.' }, 400)
    const { data: q } = await db.from('ok_qr_recargas').select('valor, expira_em, usos, max_usos, usuario_id').eq('token', t).maybeSingle()
    if (!q) return json({ erro: 'QR não encontrado.' }, 404)
    if (new Date(q.expira_em) < new Date()) return json({ erro: 'Este QR expirou. Peça um novo.' }, 410)
    if (q.usos >= q.max_usos) return json({ erro: 'Este QR já foi usado o máximo de vezes.' }, 410)
    const { data: p } = await db.from('ok_perfis').select('nome').eq('id', q.usuario_id).maybeSingle()
    return json({ valor: Number(q.valor), nome: (p?.nome ?? 'o titular').split(' ')[0], expira_em: q.expira_em })
  }

  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)
  const corpo = await req.json().catch(() => ({}))

  // ---- criar QR (logado) ----
  if (corpo?.acao === 'criar') {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ erro: 'Entre na sua conta.' }, 401)
    const { data: s, error: e0 } = await db.auth.getUser(jwt)
    if (e0 || !s?.user) return json({ erro: 'Sessão inválida. Entre de novo.' }, 401)
    const valor = Math.round(Number(corpo.valor) * 100) / 100
    if (!Number.isFinite(valor) || valor <= 0) return json({ erro: 'Informe um valor maior que zero.' }, 400)
    if (valor > 1000) return json({ erro: 'O valor máximo é R$ 1.000,00.' }, 400)
    const { data: perfil } = await db.from('ok_perfis').select('id').eq('id', s.user.id).maybeSingle()
    if (!perfil) return json({ erro: 'Abra a Carteira uma vez antes de gerar um QR.' }, 400)
    const token = novoToken()
    const { data, error } = await db.from('ok_qr_recargas').insert({ token, usuario_id: s.user.id, valor }).select('token, expira_em').single()
    if (error) return json({ erro: error.message }, 500)
    return json({ token: data.token, expira_em: data.expira_em, valor })
  }

  // ---- confirmar (público): cria rascunho de recarga ----
  if (corpo?.acao === 'confirmar') {
    const t = String(corpo.token ?? '')
    if (!TOKEN.test(t)) return json({ erro: 'QR inválido.' }, 400)
    // reserva um uso de forma atômica (evita passar do limite com cliques simultâneos)
    const { data: q } = await db.from('ok_qr_recargas').select('id, valor, usos, max_usos, expira_em, usuario_id').eq('token', t).maybeSingle()
    if (!q) return json({ erro: 'QR não encontrado.' }, 404)
    if (new Date(q.expira_em) < new Date()) return json({ erro: 'Este QR expirou. Peça um novo.' }, 410)
    const { data: reserva } = await db.from('ok_qr_recargas').update({ usos: q.usos + 1 })
      .eq('id', q.id).eq('usos', q.usos).lt('usos', q.max_usos).select('id').maybeSingle()
    if (!reserva) return json({ erro: 'Este QR já foi usado o máximo de vezes.' }, 410)

    const { data, error } = await db.rpc('ok_fn_preparar_recarga', {
      p_usuario_id: q.usuario_id, p_valor: q.valor, p_metodo: 'app',
      p_justificativa: 'Recarga por QR code (valor definido pelo titular)',
      p_evidencias: [{ origem: 'qr_code', qr_id: q.id }],
    })
    if (error) {
      await db.from('ok_qr_recargas').update({ usos: q.usos }).eq('id', q.id) // devolve o uso
      return json({ erro: error.message }, 400)
    }
    return json({ ok: true, valor: Number(q.valor), aviso: 'Pedido enviado. Ele será conferido e aprovado pela operação.', rascunho: data })
  }

  return json({ erro: 'Ação inválida.' }, 400)
})
