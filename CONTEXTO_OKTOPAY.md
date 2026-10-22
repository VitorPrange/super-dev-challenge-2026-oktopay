# OKTOPAY — contexto atual do projeto

Super Dev Challenge 2026 (Proway) · front-end do "assistente de carteira do Oktober Karte" no OktoberVerse (festival fictício).
Pasta de trabalho do usuário: `C:\Users\12965\Downloads\teste frony` (editar os arquivos existentes; criar novos só se necessário).

## 1. Origem e objetivo

- O usuário enviou `agrupado.zip`: scripts SQL do Supabase + `SPEC_DO_AGENTE.md` (agente que ajuda o visitante a entender gastos, saldo, show, filas; pedidos de dinheiro viram **rascunho para aprovação humana**, nunca executam sozinhos).
- Pedido inicial: "um front com HTML e CSS". Entrega: site estático (HTML + CSS + JS pequeno, sem build), **híbrido** (PC e celular, uso com uma mão).
- Os dados de saldo, categorias e extrato são o **usuário de teste** da spec (seção 7): saldo R$ 118,00, créditos R$ 725,00, gasto R$ 532,00 em 16 compras, média R$ 33,25, cartão final 4242.
- Tudo é fictício/simulado (pontos e prêmios também).

## 2. Arquivos (na pasta do usuário)

| Arquivo | Função |
|---|---|
| `index.html` | Carteira: saldo (ocultar/mostrar, recolher no celular), atalhos; no PC também pontos, últimos lançamentos e gastos por categoria |
| `gastos.html` | Gastos por categoria (card único) com seletor de período |
| `extrato.html` | Extrato com filtros (chips) e paginação |
| `assistente.html` | Chat do agente: chama a Edge Function e mostra lista de passos (✔/✖) |
| `premios.html` | Programa de pontos: abas Prêmios / Histórico / Como ganhar, resgate (demo) |
| `painel.html` | Painel de aprovação: login por senha, rascunhos (Aprovar/Recusar), últimas execuções |
| `style.css` | Todo o estilo (~56 KB), tema claro/escuro, responsivo |
| `logo.svg` | Logo OKTOPAY (anel azul-marinho + ponteiro dourado), usada na navbar e como favicon |

Observação: o sistema de entrega embute uma etiqueta C2PA no `logo.svg` (≈8 KB). É inofensiva; o desenho está íntegro.

## 3. Como o site é gerado (ambiente de trabalho da IA)

- Diretório: `/tmp/claude-0/-home-claude/90483223-ddc6-5672-bd80-3551b1fd31ee/scratchpad/work/`
- Build: `cd work && python3 -I site.py` (gera os 6 `.html` a partir de `tpl/`). `style.css` e `logo.svg` são editados direto.
- `tpl/`: `head.html` (script de tema/texto/movimento), `sprite.html` (ícones SVG `<symbol id="i-...">`), `shared.js.txt` (dados, regras de pontos, helpers, menu lateral, paginador, cards recolhíveis), `gaveta.html` (menu lateral), `index_body.html`, `pager.html`, `painel.tpl`, `premios_old.tpl`, `index_old.tpl`.
- Testes: Playwright (`NODE_PATH=$(npm root -g)`, chromium em `/opt/pw-browsers/chromium`) para screenshots, overflow horizontal e erros de JS.
- **Entrega ao computador do usuário**: não há `device_bash`; usar `device_stage_files`/`device_commit_files`. A ferramenta de commit **faz cache por `stagedPath`** → sempre copiar para um diretório novo (`/mnt/user-data/outputs/_commit_vN/`), usar `expectedMtimeMs` de um `device_list_dir` recente e conferir tamanhos depois. Último commit: `_commit_v15` (só `style.css`).

## 4. Integração com o agente (placeholders a preencher pelo aluno)

- `assistente.html`: `FUNCTION_URL` (`https://CODIGO.supabase.co/functions/v1/NOME-DA-FUNCAO`) e `TOKEN_DO_VISITANTE` (JWT do Supabase Auth; a função usa o usuário DO TOKEN, nunca o do texto).
- `painel.html`: `PAINEL_URL`; senha digitada vai no cabeçalho `x-painel-senha`, só em memória.
- Resposta esperada: `{ resposta, passos:[{ferramenta, ok, entrada|erro}], duracao_ms, aviso }`.
- Atalhos do assistente (casos de teste da spec): caminho principal, conflito entre fontes, pergunta sem fonte, registro duplicado, fonte fora do ar, instrução escondida, ação sem aprovação. A carteira abre o assistente com `?q=` pré-preenchido (Recarregar / Sacar).
- Perguntas respondidas na conversa: a classificação de categoria vem do banco (cadastro dos itens/estabelecimentos); item não cadastrado cai em "outros" (o modelo não calcula números).

## 5. Funcionalidades atuais

**Navegação**: navbar superior (Carteira, Gastos, Extrato, Assistente, Prêmios, Painel) no PC; barra inferior de 5 itens no celular (sem Painel). Topo: logo, nome, botão de **menu hambúrguer** no canto direito (clicar no nome também abre). Sem traços/listras na navbar.

**Menu lateral** (painel/folha): tema Claro/Escuro/Automático; Texto maior (zoom 1,12 no conteúdo); Reduzir animações; itens "em breve" (Meu perfil, Limite diário, Bloquear cartão, Notificações, Ajuda, Sair); link para o Painel. Preferências em localStorage: `oktopay-tema`, `oktopay-texto`, `oktopay-mov`.

**Carteira**: saldo com ícone de olho ao lado do valor (mascara `.sens` como "R$ ••••", `oktopay-oculto`); setinha recolhe/expande (só no celular; no PC fica sempre aberto); chip de pontos; Recarregar/Sacar levam ao assistente. PC: grade com saldo + "Seus pontos", 4 atalhos, "Últimos lançamentos" e "Gastos por categoria".

**Gastos**: cada categoria é um card com ícone colorido, valor, % e barra; rodapé com Média por compra e Quantidade de compras. Seletor de período **próprio** (não `<select>`): Hoje, Últimos 7 dias, Sábado, Sexta, Domingo, Quinta; no celular abre como folha fixa na parte de baixo (movida para o `<body>` para escapar da animação do card). Só Sábado/Hoje existem na spec; os outros dias são dados inventados para demonstrar. O "Resumo do dia" foi removido.

**Extrato**: 21 lançamentos, filtros Todos/Compras/Recargas/Saques/Estornos, paginação com botões grandes e deslizar.

**Prêmios (pontos fictícios)**
- Regras: 1 ponto a cada R$ 5 gastos (por compra, arredondado p/ baixo); recarga PIX ≥ R$ 50 = +20 pts; estorno desconta; saque não pontua. Usuário de teste = **139 pts**.
- Níveis: Bronze 0 · Prata 500 · Ouro 2.500 · Diamante 10.000.
- Catálogo (pts): Fila rápida 100 · Pretzel 250 · Chaveiro 400 · Chope 500 · Ingresso de brinquedo 700 · Bratwurst 800 · Caneca 1.200 · Camiseta 2.000 · Mesa reservada 4.000 · **Camarim à escolha do artista 10.000** (prêmio máximo; usuário informa o artista). Diferença grande entre o 2º e o máximo, de propósito, para ninguém economizar.
- Resgate é só demonstração (folha de confirmação, toast; não persiste; num sistema real viraria rascunho aprovado por humano).

## 6. Design

- **Paleta única: Oceano** (azul `#1d4ed8` + âmbar `#ffb703`, navy `#0b1b3b`). Variáveis em `:root[data-paleta="oceano"]` (claro e escuro). As outras paletas e o seletor foram **removidos** a pedido (a vermelha/alemã foi descartada: o usuário foi informado de que vermelho pode causar rejeição).
- Histórico de paletas testadas: Floresta, Violeta & ouro, Turquesa, Âmbar & café (apagadas do CSS).
- Tokens: `--brand`, `--brand-2`, `--grad-brand`, `--a1-rgb/--a2-rgb`, `--cat1..5` (cores de categoria), `--well`, `--navy`.
- Ícones: SVG inline (sprite), sem emojis.
- Logo: selo branco arredondado na navbar (o azul-marinho some no fundo escuro).
- Tema escuro com forte separação entre cards (bordas visíveis, superfícies elevadas).
- Sem destaque azul/contorno ao clicar ou tocar em elementos interativos; anel de foco só para teclado; campos de texto continuam selecionáveis.

## 7. Histórico resumido das decisões do usuário

1. Front em HTML/CSS → depois "dar uma revivida" no CSS.
2. Paleta da Alemanha (preto/vermelho/ouro) → substituída por paleta sem vermelho → **Oceano fixa**.
3. Ocultar/mostrar saldo, ícones no lugar de emojis, navbar elaborada, modo escuro, layout sem espaços em branco, responsivo.
4. Painel quebrado/sem estilo corrigido (problema era arquivo antigo no commit; ver cache da ferramenta).
5. Programa de pontos e aba Prêmios; paginação pensando em mão única; **uma página por assunto** em vez de rolar tudo.
6. Cards recolhíveis (saldo e pontos) com setinha; olho ao lado do valor; Prêmios responsivo.
7. "Gastos por categoria" no estilo da referência (cards com ícone colorido, % colorida, barra, rodapé).
8. Seletor de período melhor + mais dias; menu próprio; folha inferior no celular.
9. Hambúrguer no lugar do botão de tema; sugestões de configurações; preços dos prêmios maiores (camarim 10.000); navbar sem traços; layout específico para PC (saldo não fica "quadrado vazio").
10. Menu hambúrguer ao canto direito no celular; nova logo (PDF do Canva) aplicada; resumo do dia removido; só paleta Oceano; remoção de outlines/seleção azul.

## 8. Pendências e ideias

- Preencher `FUNCTION_URL`, `PAINEL_URL`, `TOKEN_DO_VISITANTE`.
- Implementar de verdade os itens "em breve" do menu (perfil, limite diário, bloquear cartão, notificações, ajuda, sair).
- Sugestões feitas e não implementadas: ocultar saldo por padrão, PIN/biometria para resgate, confirmar antes de resgatar, modo mão esquerda, idioma (alemão), escolha de notificações.
- A última mudança (regra global de remover destaque/contorno) foi salva sem novo teste automatizado; se algum lugar ainda mostrar destaque azul, anotar tela e elemento.
- Spec do agente só prevê `hoje | sabado` como período; os demais dias do seletor são visuais.

## 9. Comunicação

- Usuário fala português (BR), prefere respostas curtas e diretas, quer resultado salvo direto na pasta e lembrar de dar Ctrl+F5 depois de cada entrega.
