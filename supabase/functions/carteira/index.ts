// Edge Function "carteira": devolve TUDO que as telas do visitante mostram
// (perfil, cartão, saldo, extrato, gastos), lido do banco para o usuário do token.
// - O usuário vem do token (login do Supabase Auth), nunca de parâmetro.
// - Se for o primeiro acesso depois do cadastro, cria perfil + cartão + conta.
import { clienteAdmin } from '../_shared/supabase.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

// deno-lint-ignore no-explicit-any
type Cliente = any

async function garantirConta(db: Cliente, user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const nomeMeta = typeof user.user_metadata?.nome === 'string' ? user.user_metadata.nome.trim() : ''
  const nome = (nomeMeta || (user.email ?? 'Visitante').split('@')[0]).slice(0, 80)

  let { data: perfil } = await db.from('ok_perfis').select('id, nome, criado_em').eq('id', user.id).maybeSingle()
  if (!perfil) {
    const { data, error } = await db.from('ok_perfis')
      .upsert({ id: user.id, nome }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id, nome, criado_em').maybeSingle()
    if (error) throw new Error(error.message)
    perfil = data ?? (await db.from('ok_perfis').select('id, nome, criado_em').eq('id', user.id).single()).data
  }

  let { data: cartao } = await db.from('ok_cartoes').select('id, numero_mascarado, status')
    .eq('usuario_id', user.id).order('criado_em').limit(1).maybeSingle()
  if (!cartao) {
    const final = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    const { data, error } = await db.from('ok_cartoes')
      .insert({ usuario_id: user.id, numero_mascarado: '**** **** **** ' + final })
      .select('id, numero_mascarado, status').single()
    if (error) throw new Error(error.message)
    cartao = data
  }

  let { data: conta } = await db.from('ok_contas').select('id, status').eq('cartao_id', cartao.id).maybeSingle()
  if (!conta) {
    const { data, error } = await db.from('ok_contas').insert({ cartao_id: cartao.id }).select('id, status').single()
    if (error) throw new Error(error.message)
    conta = data
  }
  return { perfil, cartao, conta }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)

  const db = clienteAdmin()
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ erro: 'Entre na sua conta.' }, 401)
  const { data: sessao, error: erroSessao } = await db.auth.getUser(token)
  if (erroSessao || !sessao?.user) return json({ erro: 'Sessão inválida ou expirada. Entre de novo.' }, 401)
  const user = sessao.user
  const uid = user.id

  try {
    const { perfil, cartao, conta } = await garantirConta(db, user)

    const [saldoR, resumoR, txR, comprasR, catsR, resgatesR] = await Promise.all([
      db.rpc('ok_fn_consultar_saldo', { p_usuario_id: uid }),
      db.rpc('ok_fn_resumo_financeiro', { p_usuario_id: uid }),
      db.from('ok_transacoes')
        .select('id, tipo, valor, criado_em, ok_compras(status, ok_estabelecimentos(nome))')
        .eq('usuario_id', uid).eq('status', 'confirmada')
        .order('criado_em', { ascending: false }).limit(500),
      db.from('ok_compras')
        .select('id, valor_total, criado_em, ok_itens_compra(subtotal, ok_produtos(ok_categorias(nome, ordem)))')
        .eq('usuario_id', uid).eq('status', 'confirmada')
        .order('criado_em', { ascending: false }).limit(500),
      db.from('ok_categorias').select('nome, ordem').order('ordem'),
      db.from('ok_rascunhos').select('payload, status, criado_em').eq('usuario_id', uid).eq('tipo', 'premio').eq('status', 'aprovado').order('criado_em', { ascending: false }).limit(500),
    ])
    for (const r of [saldoR, resumoR, txR, comprasR, catsR, resgatesR]) if (r.error) throw new Error(r.error.message)

    const saldo = saldoR.data?.[0] ?? { saldo: 0, creditos: 0, debitos: 0, saldo_pendente: 0 }
    const resumo = resumoR.data?.[0] ?? { total_gasto: 0, saldo_atual: saldo.saldo, quantidade_compras: 0, gasto_medio_por_compra: 0 }
    // Somente prêmios aprovados consomem pontos. Pedidos pendentes ou recusados não alteram o saldo.
    const resgates = resgatesR.data ?? []
    const pontos_resgatados = resgates.reduce((total: number, r: any) => total + Math.max(0, Number(r.payload?.custo_pontos) || 0), 0)

    // deno-lint-ignore no-explicit-any
    const transacoes = (txR.data ?? []).map((t: any) => {
      const estab = t.ok_compras?.ok_estabelecimentos?.nome ?? null
      return {
        id: t.id,
        tipo: t.tipo,
        valor: Number(t.valor),
        criado_em: t.criado_em,
        nome: t.tipo === 'compra' ? (estab ?? 'Compra')
          : t.tipo === 'estorno' ? 'Estorno' + (estab ? ' · ' + estab : '')
          : t.tipo === 'recarga' ? 'Recarga no cartão'
          : 'Saque',
        estornada: t.tipo === 'compra' && t.ok_compras?.status === 'estornada',
      }
    })

    // por compra: quanto foi para cada categoria (o front soma por período)
    // deno-lint-ignore no-explicit-any
    const compras = (comprasR.data ?? []).map((c: any) => {
      const porCat = new Map<string, { nome: string; ordem: number; subtotal: number }>()
      // deno-lint-ignore no-explicit-any
      for (const it of c.ok_itens_compra ?? [] as any[]) {
        const cat = it.ok_produtos?.ok_categorias
        if (!cat) continue
        const atual = porCat.get(cat.nome) ?? { nome: cat.nome, ordem: cat.ordem, subtotal: 0 }
        atual.subtotal += Number(it.subtotal)
        porCat.set(cat.nome, atual)
      }
      return { id: c.id, criado_em: c.criado_em, valor_total: Number(c.valor_total), categorias: [...porCat.values()] }
    })

    return json({
      perfil: { id: uid, nome: perfil.nome, email: user.email ?? null, criado_em: perfil.criado_em },
      cartao: { numero_mascarado: cartao.numero_mascarado, status: cartao.status },
      conta: { status: conta.status },
      saldo, resumo, transacoes, compras, categorias: catsR.data ?? [], pontos_resgatados,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('carteira falhou:', msg)
    return json({ erro: 'Não foi possível carregar seus dados agora. ' + msg }, 500)
  }
})
