/* OKTOPAY · app.js
   Compartilhado por todas as telas: cliente do Supabase, login obrigatório, dados do usuário
   (via Edge Function "carteira"), menu lateral (perfil, notificações, sair). */
(function () {
  const SUPABASE_URL = "https://hlwanayvphieizohlltp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lhOJBOCStuNW5v1UT2XbDw__4uHlO6W";
  const FN = SUPABASE_URL + "/functions/v1/";
  const CHAVE_PAINEL = "oktopay-painel-senha"; // sessionStorage: vale só nesta aba

  const modo = (document.querySelector('meta[name="okto-guard"]') || {}).content || "on"; // on | soft | off
  if (modo === "on") document.documentElement.style.visibility = "hidden"; // evita "piscar" antes de checar o login

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const irLogin = () => location.replace("login.html");
  const ler = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  let sessaoP = null, carteiraP = null;
  function sessao() {
    if (!sessaoP) sessaoP = sb.auth.getSession().then((r) => r.data.session || null);
    return sessaoP;
  }

  async function chamarFn(nome) {
    const s = await sessao();
    if (!s) { if (modo !== "off") irLogin(); throw new Error("Entre na sua conta."); }
    const r = await fetch(FN + nome, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + s.access_token } });
    const dados = await r.json().catch(() => ({}));
    if (r.status === 401) { await sb.auth.signOut(); irLogin(); throw new Error(dados.erro || "Sessão expirada."); }
    if (!r.ok) throw new Error(dados.erro || "Erro " + r.status);
    return dados;
  }
  function carteira(forcar) {
    if (!carteiraP || forcar) carteiraP = chamarFn("carteira");
    return carteiraP;
  }

  async function sair() {
    try { sessionStorage.removeItem(CHAVE_PAINEL); } catch (e) {}
    await sb.auth.signOut();
    irLogin();
  }

  /* ---------- guarda de login ---------- */
  const guarda = sessao().then((s) => {
    if (modo === "on" && !s) { irLogin(); return null; }
    document.documentElement.style.visibility = "";
    return s;
  });

  /* ---------- notificações: só mostram algo se a pessoa entrou no painel da operação ---------- */
  async function notificacoes() {
    const senha = ler(CHAVE_PAINEL);
    if (!senha) return [];
    try {
      const r = await fetch(FN + "painel", { headers: { "x-painel-senha": senha, apikey: SUPABASE_PUBLISHABLE_KEY } });
      if (r.status === 401) { try { sessionStorage.removeItem(CHAVE_PAINEL); } catch (e) {} return []; }
      const d = await r.json();
      return (d.rascunhos || []).filter((x) => x.status === "aguardando_aprovacao");
    } catch (e) { return []; }
  }

  /* ---------- menu lateral: perfil, notificações, sair ---------- */
  function icone(id) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "i");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", "#i-" + id);
    svg.appendChild(use); return svg;
  }
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function folha(id, titulo) {
    const d = el("dialog", "sheet"); d.id = id; d.setAttribute("aria-labelledby", id + "-t");
    const f = el("form", "sheet-in"); f.method = "dialog";
    f.append(el("div", "sheet-alca"), Object.assign(el("h3", "", titulo), { id: id + "-t" }));
    const corpo = el("div", "folha-corpo"); const ac = el("div", "acoes-folha");
    const fechar = el("button", "btn fantasma", "Fechar"); fechar.type = "button"; fechar.addEventListener("click", () => d.close());
    ac.append(fechar); f.append(corpo, ac); d.append(f);
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    document.body.appendChild(d);
    return { d, corpo };
  }
  function abrirFolha(f) {
    const gav = document.getElementById("gaveta");
    if (gav && !gav.hidden) document.querySelector(".gv-fechar")?.click();
    f.d.showModal();
  }

  async function montarMenu() {
    const bPerfil = document.getElementById("gv-perfil");
    const bNotif = document.getElementById("gv-notif");
    const bSair = document.getElementById("gv-sair");
    if (!bPerfil) return;

    const fPerfil = folha("folha-perfil", "Meu perfil");
    const fNotif = folha("folha-notif", "Notificações");
    const s = await guarda;

    if (bSair) bSair.addEventListener("click", sair);

    // perfil
    let dados = null;
    if (s) { try { dados = await carteira(); } catch (e) { /* mostra o erro dentro da folha */ } }
    const iniciais = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
    if (dados) {
      const fim = (dados.cartao.numero_mascarado.match(/\d{4}$/) || ["----"])[0];
      document.querySelectorAll(".avatar").forEach((a) => (a.textContent = iniciais(dados.perfil.nome)));
      document.querySelectorAll(".perfil-txt").forEach((p) => { p.firstChild.textContent = dados.perfil.nome; p.querySelector("small").textContent = "•••• " + fim; });
      const gb = document.querySelector(".gv-topo b"); if (gb) gb.textContent = dados.perfil.nome;
      const gs = document.querySelector(".gv-topo small"); if (gs) gs.textContent = "Cartão •••• " + fim;
    } else if (!s) {
      document.querySelectorAll(".avatar").forEach((a) => (a.textContent = "OP"));
      document.querySelectorAll(".perfil-txt").forEach((p) => { p.firstChild.textContent = "Operação"; p.querySelector("small").textContent = "sem login de visitante"; });
      const gb = document.querySelector(".gv-topo b"); if (gb) gb.textContent = "Operação";
      const gs = document.querySelector(".gv-topo small"); if (gs) gs.textContent = "Sem login de visitante";
    }
    bPerfil.addEventListener("click", () => {
      fPerfil.corpo.replaceChildren();
      if (!dados) { fPerfil.corpo.append(el("p", "sub", s ? "Não foi possível carregar o perfil agora." : "Entre na sua conta para ver o perfil.")); abrirFolha(fPerfil); return; }
      const linhas = el("div", "linhas");
      const add = (k, v) => { const d = el("div"); d.append(el("span", "", k), el("b", "", v)); linhas.append(d); };
      add("Nome", dados.perfil.nome);
      add("E-mail", dados.perfil.email || "—");
      add("Cartão", dados.cartao.numero_mascarado);
      add("Status do cartão", dados.cartao.status);
      add("Status da conta", dados.conta.status);
      add("Cliente desde", new Date(dados.perfil.criado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }));
      fPerfil.corpo.append(linhas);
      abrirFolha(fPerfil);
    });

    // notificações
    const pintarSelo = (n) => {
      bNotif.querySelector(".etq-n")?.remove();
      if (n > 0) { const e = el("span", "etq etq-n", String(n)); e.setAttribute("aria-label", n + " pendentes"); bNotif.append(e); }
    };
    notificacoes().then((l) => pintarSelo(l.length));
    bNotif.addEventListener("click", async () => {
      fNotif.corpo.replaceChildren(el("p", "sub", "Carregando…"));
      abrirFolha(fNotif);
      const lista = await notificacoes();
      pintarSelo(lista.length);
      fNotif.corpo.replaceChildren();
      if (!lista.length) { fNotif.corpo.append(el("p", "vazio", "Nenhuma notificação por enquanto.")); return; }
      fNotif.corpo.append(el("p", "sub", lista.length + (lista.length === 1 ? " item aguarda" : " itens aguardam") + " aprovação no painel da operação."));
      const ul = el("ul", "extrato notif");
      lista.forEach((r) => {
        const li = el("li"); li.tabIndex = 0; li.style.cursor = "pointer"; li.setAttribute("role", "link");
        const ir = () => (location.href = "painel.html");
        li.addEventListener("click", ir); li.addEventListener("keydown", (e) => { if (e.key === "Enter") ir(); });
        const ico = el("span", "ico recarga"); ico.append(icone("bell"));
        const meio = el("div"); meio.append(el("div", "nome", "Aprovar " + r.tipo), el("div", "meta", (r.justificativa || "Sem justificativa") + " · " + quando(r.criado_em)));
        li.append(ico, meio, el("div", "quanto neg", r.valor != null ? brl(r.valor) : ""));
        ul.append(li);
      });
      fNotif.corpo.append(ul);
    });
  }
  document.addEventListener("DOMContentLoaded", montarMenu);

  /* ---------- dados prontos para as telas (nunca lança erro: em falha, devolve listas vazias e avisa) ---------- */
  const SP = "America/Sao_Paulo";
  const fmtHora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: SP });
  const fmtDia = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: SP });
  const chaveDia = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: SP }); // AAAA-MM-DD
  async function dados() {
    let CART = null, erro = "";
    try { CART = await carteira(); } catch (e) { erro = e.message || "Falha ao carregar os dados."; }
    if (erro) {
      const a = document.querySelector(".aviso-fixo");
      if (a) { a.textContent = "Não consegui carregar seus dados: " + erro; a.style.color = "var(--err)"; }
    }
    const vazio = { saldo: { saldo: 0, creditos: 0, debitos: 0, saldo_pendente: 0 }, resumo: { total_gasto: 0, quantidade_compras: 0, gasto_medio_por_compra: 0 }, pontos_resgatados: 0,
                    cartao: { numero_mascarado: "**** **** **** ----" }, perfil: { nome: "" }, transacoes: [], compras: [], categorias: [] };
    CART = Object.assign(vazio, CART || {});
    const TRANSACOES = CART.transacoes.map((t) => ({ h: fmtHora(t.criado_em), d: fmtDia(t.criado_em), iso: t.criado_em, tipo: t.tipo, nome: t.nome, v: t.valor, estornada: t.estornada }));
    return { CART, TRANSACOES, erro };
  }

  /* ---------- categorias de gasto (usadas na Carteira e em Gastos) ---------- */
  const CAT_ICO = { "Bebidas alcoólicas": "beer", "Acessórios": "bag", "Comida": "food", "Bebidas não alcoólicas": "bottle", "Brinquedos": "ticket" };
  const CAT_COR = { "Bebidas alcoólicas": 1, "Acessórios": 2, "Comida": 3, "Bebidas não alcoólicas": 4, "Brinquedos": 5 };
  const pct = (x) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  function somarCategorias(compras) {
    const m = new Map();
    compras.forEach((c) => c.categorias.forEach((k) => m.set(k.nome, (m.get(k.nome) || 0) + k.subtotal)));
    const itens = [...m].map(([nome, v]) => ({ nome, v }));
    return { itens, total: itens.reduce((a, b) => a + b.v, 0), q: compras.length };
  }
  function desenharCats(ul, itens) {
    const total = itens.reduce((a, b) => a + b.v, 0);
    ul.replaceChildren();
    if (!itens.length) { ul.append(el("li", "vazio", "Nenhuma compra neste período.")); return; }
    itens.slice().sort((a, b) => b.v - a.v).forEach((x) => {
      const n = CAT_COR[x.nome] || 3;
      const li = el("li", "gc");
      li.style.cssText = "--cor:var(--cat" + n + "); --fg:var(--fg" + n + "); --p:" + (x.v / total * 100).toFixed(2) + "%";
      const ic = el("span", "gc-ico"); const svg = icone(CAT_ICO[x.nome] || "gift"); svg.setAttribute("class", "i g"); ic.append(svg);
      const linha = el("div", "gc-linha"); linha.append(el("span", "gc-nome", x.nome), el("b", "gc-val", brl(x.v)), el("span", "gc-pct", pct(x.v / total * 100)));
      const barra = el("div", "barra"); barra.append(document.createElement("i"));
      const meio = el("div", "gc-meio"); meio.append(linha, barra);
      li.append(ic, meio); ul.append(li);
    });
  }

  window.OKTO = { somarCategorias, desenharCats, sb, sessao, carteira, dados, sair, notificacoes, guarda, chaveDia, CHAVE_PAINEL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, FN };
})();
