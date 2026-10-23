// Funções puras da MEMÓRIA da conversa (sem Deno, sem rede) para poderem ser testadas à parte.
//
// Como a memória funciona: o servidor NÃO guarda conversa. O navegador reenvia, a cada pergunta,
// o histórico (só texto, alternando user/assistant) e a Edge Function o repassa ao modelo.

// Fontes (documentação oficial da Anthropic, conferidas em out/2026):
//  - Haiku 5.5: ID "claude-haiku-5-5", janela de 1M tokens
//    https://platform.claude.com/docs/en/models/haiku-5-5/overview
//  - 1M tokens ≈ 2,5M caracteres no tokenizador atual (mesma página) => 2,5 caracteres por token
//  - O contexto usado é system + messages + tools + saída (inclui thinking) e vem em `usage`;
//    com cache, input_tokens + cache_read_input_tokens + cache_creation_input_tokens, todos contam
//    https://platform.claude.com/docs/en/build-with-claude/context-windows
export const MODELO_PADRAO = 'claude-haiku-5-5'
export const JANELA_MODELO = 1_000_000
// Orçamento DESTE app por conversa. Não é o limite do modelo (1M): é o ponto em que o app reinicia a
// conversa. 100 mil é onde o preço do Haiku 5.5 sobe (prompts acima de 100 mil tokens custam mais).
export const CONTEXTO_PADRAO = 100_000
export const CHARS_POR_TOKEN = 2.5
export const MAX_MENSAGENS = 200
export const MAX_CHARS_MENSAGEM = 6000

export type Mensagem = { role: 'user' | 'assistant'; content: string }

// Limite efetivo em tokens: vem do Secret CONTEXTO_MAX_TOKENS (se válido), nunca acima da janela do modelo.
export function limiteDeContexto(bruto: string | undefined | null): number {
  const n = Number(bruto)
  if (!Number.isFinite(n) || n <= 0) return CONTEXTO_PADRAO
  return Math.min(Math.floor(n), JANELA_MODELO)
}

// Tokens que UMA chamada ao modelo ocupou na janela (entrada + saída), a partir do campo `usage`.
// deno-lint-ignore no-explicit-any
export function contextoUsado(usage: any): number {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  return n(usage?.input_tokens) + n(usage?.cache_read_input_tokens) +
    n(usage?.cache_creation_input_tokens) + n(usage?.output_tokens)
}

// Valida o histórico vindo do navegador (que é dado não confiável): só texto, começa em user,
// alterna papéis, termina em assistant (a pergunta nova é do user) e cabe no orçamento.
export function limparHistorico(bruto: unknown, limiteTokens: number): Mensagem[] {
  const hist: Mensagem[] = []
  if (!Array.isArray(bruto)) return hist
  for (const m of bruto.slice(-MAX_MENSAGENS)) {
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m?.content !== 'string' || !m.content.trim()) continue
    const ultimo = hist[hist.length - 1]
    if (hist.length === 0 && m.role !== 'user') continue
    if (ultimo && ultimo.role === m.role) continue
    // Respostas anteriores não são evidência. Mantém só um marcador para preservar a alternância
    // e o contexto conversacional sem reaproveitar como fato um valor que o modelo possa ter inventado.
    const content = m.role === 'assistant'
      ? '[Resposta anterior omitida. Consulte o banco nesta requisição; não reutilize fatos antigos.]'
      : m.content.slice(0, MAX_CHARS_MENSAGEM)
    hist.push({ role: m.role, content })
  }
  if (hist.length && hist[hist.length - 1].role === 'user') hist.pop()

  // Trava de custo: se vier mais texto do que cabe no orçamento, descarta as mais antigas de 2 em 2
  // (user + assistant) para manter a alternância.
  const maxChars = limiteTokens * CHARS_POR_TOKEN
  let total = hist.reduce((s, m) => s + m.content.length, 0)
  while (hist.length >= 2 && total > maxChars) {
    total -= hist[0].content.length + hist[1].content.length
    hist.splice(0, 2)
  }
  return hist
}
