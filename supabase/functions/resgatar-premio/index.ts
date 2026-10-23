import { clienteAdmin } from '../_shared/supabase.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

const PREMIOS: Record<string, { nome: string; custo: number; escolha?: boolean }> = {
  fila: { nome: 'Fila rápida no Bar Spaten (1 uso)', custo: 100 },
  pretzel: { nome: 'Pretzel', custo: 250 },
  chaveiro: { nome: 'Chaveiro do clube', custo: 400 },
  chope: { nome: 'Chope Pilsen 400 ml', custo: 500 },
  ingresso: { nome: 'Ingresso de brinquedo', custo: 700 },
  bratwurst: { nome: 'Bratwurst com pão', custo: 800 },
  caneca: { nome: 'Caneca Oktoberfest', custo: 1200 },
  camiseta: { nome: 'Camiseta Oktoberfest', custo: 2000 },
  mesa: { nome: 'Mesa reservada no Festzelt (2 h)', custo: 4000 },
  camarim: { nome: 'Camarim à escolha do artista', custo: 10000, escolha: true },
}

function pontos(tipo: string, valor: number): number {
  if (tipo === 'compra') return Math.floor(valor / 5)
  if (tipo === 'recarga') return valor >= 50 ? 20 : 0
  if (tipo === 'estorno') return -Math.floor(valor / 5)
  return 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)
  const db = clienteAdmin()
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ erro: 'Entre na sua conta.' }, 401)
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth?.user) return json({ erro: 'Sessão inválida ou expirada.' }, 401)
  const userId = auth.user.id

  if (req.method === 'GET') {
    const { data, error } = await db.from('ok_rascunhos')
      .select('id, payload, status').eq('usuario_id', userId).eq('tipo', 'premio')
      .order('criado_em', { ascending: false }).limit(100)
    if (error) return json({ erro: error.message }, 500)
    const { data: ledger, error: ledgerError } = await db.from('ok_resgates_pontos')
      .select('pontos').eq('usuario_id', userId).in('status', ['reservado', 'consumido'])
    if (ledgerError) return json({ erro: ledgerError.message }, 500)
    const pontos_resgatados = (ledger ?? []).reduce((s: number, r: { pontos: number }) => s + Number(r.pontos), 0)
    return json({ pedidos: data ?? [], pontos_resgatados })
  }

  const body = await req.json().catch(() => ({}))
  const id = typeof body?.premio_id === 'string' ? body.premio_id : ''
  const premio = PREMIOS[id]
  const artista = typeof body?.artista === 'string' ? body.artista.trim().slice(0, 160) : ''
  if (!premio) return json({ erro: 'Prêmio inválido.' }, 400)
  if (premio.escolha && !artista) return json({ erro: 'Informe o artista ou banda desejado.' }, 400)

  const { data: txs, error: txError } = await db.from('ok_transacoes')
    .select('tipo, valor, status').eq('usuario_id', userId)
    .in('status', ['confirmada', 'estornada'])
  if (txError) return json({ erro: txError.message }, 500)
  const pontosBrutos = (txs ?? []).reduce((total: number, tx: { tipo: string; valor: number; status: string }) =>
    total + (tx.status === 'estornada' ? 0 : pontos(tx.tipo, Number(tx.valor))), 0)
  const { data: ledgerAtual, error: ledgerError } = await db.from('ok_resgates_pontos')
    .select('pontos').eq('usuario_id', userId).in('status', ['reservado', 'consumido'])
  if (ledgerError) return json({ erro: ledgerError.message }, 500)
  const pontosUsados = (ledgerAtual ?? []).reduce((s: number, r: { pontos: number }) => s + Number(r.pontos), 0)
  const saldoPontos = pontosBrutos - pontosUsados
  if (saldoPontos < premio.custo) return json({ erro: `Pontos insuficientes. Saldo disponível: ${saldoPontos} pts.` }, 400)

  const { data: existentes, error: exError } = await db.from('ok_rascunhos')
    .select('id, payload').eq('usuario_id', userId).eq('tipo', 'premio')
    .eq('status', 'aguardando_aprovacao')
  if (exError) return json({ erro: exError.message }, 500)
  if ((existentes ?? []).some((r: { payload: { premio_id?: string } }) => r.payload?.premio_id === id))
    return json({ erro: 'Você já tem um pedido deste prêmio aguardando aprovação.' }, 409)

  const payload = { premio_id: id, premio_nome: premio.nome, custo_pontos: premio.custo, ...(artista ? { artista } : {}) }
  const { data, error } = await db.from('ok_rascunhos').insert({
    usuario_id: userId, tipo: 'premio', valor: null, payload,
    justificativa: `Resgate de prêmio: ${premio.nome} (${premio.custo} pontos)`,
    evidencias: [{ origem: 'pagina de premios', pontos_disponiveis: saldoPontos, ...(artista ? { artista } : {}) }],
    status: 'aguardando_aprovacao',
  }).select('id, status').single()
  if (error) return json({ erro: error.message }, 500)
  const { error: ledgerInsertError } = await db.from('ok_resgates_pontos').insert({
    pedido_id: data.id, usuario_id: userId, pontos: premio.custo, status: 'reservado',
  })
  if (ledgerInsertError) {
    await db.from('ok_rascunhos').delete().eq('id', data.id).eq('usuario_id', userId)
    return json({ erro: ledgerInsertError.message }, 500)
  }
  return json({ ok: true, pedido: data, saldo_pontos: saldoPontos - premio.custo })
})
