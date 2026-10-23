import { createClient } from 'npm:@supabase/supabase-js@2'

// A chave secreta é injetada pelo próprio Supabase no ambiente da função.
// Projetos novos usam SUPABASE_SECRET_KEYS (um JSON com chaves nomeadas; a padrão
// se chama "default"). Projetos antigos usam SUPABASE_SERVICE_ROLE_KEY.
function chaveSecreta(): string {
  const bruto = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (bruto) {
    try {
      const chaves = JSON.parse(bruto)
      if (chaves.default) return chaves.default
    } catch (_) { /* cai para a chave antiga */ }
  }
  const antiga = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (antiga) return antiga
  throw new Error('Chave secreta do Supabase não encontrada no ambiente da função.')
}

// Cliente "administrador": ignora o RLS e é o ÚNICO que pode chamar as funções
// ok_fn_* (o SQL revoga o acesso de anon e authenticated). Nunca devolva esta
// chave ao navegador.
export function clienteAdmin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, chaveSecreta(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
