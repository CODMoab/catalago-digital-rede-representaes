# Preços corretos + base de dados viva

## De onde vêm os valores hoje

Nada é puxado de site: os preços estão congelados em dois arquivos gerados das planilhas de abril/26.

- Belliz: hoje uso a coluna **Preço Un.** (pente 115 = R$ 9,52 / coletivo R$ 57,12). O correto é **Preço Líquido Un.** (R$ 8,09 / coletivo R$ 48,55) — é daí que vem a sensação de "mais caro".
- Payot: já uso a coluna **PREÇO** (com desconto de representante) — confirmado como correto.

## O que vou fazer

### 1. Correção imediata dos preços Belliz

Regerar a base Belliz a partir da planilha usando Preço Líquido Un. como preço unitário e coletivo = líquido × quantidade do coletivo. Isso corrige catálogo, carrinho, plano Curva A e PDF de orçamento de uma vez.

### 2. Base de dados viva (Lovable Cloud)

Migrar catálogo de arquivo estático para banco de dados, com painel administrativo protegido por login.

- Tabelas de marcas e produtos (código, nome, linha, EAN, preço unitário, coletivo, preço do coletivo, imagem, ativo/inativo).
- Carga inicial com todos os itens atuais já com os preços corrigidos, incluindo as imagens que já casamos.
- Leitura pública: o catálogo do cliente lê do banco; ninguém precisa de login para comprar.
- Escrita restrita: só você (conta admin) edita.

### 3. Painel admin em `/admin`

- Login por e-mail e senha; só contas marcadas como admin entram.
- **Importar planilha**: você sobe o Excel novo da Belliz ou da Payot, o sistema mostra uma prévia ("120 preços mudam, 8 itens novos, 3 saíram") e você confirma antes de aplicar.
- **Edição item a item**: buscar produto, alterar preço/coletivo/linha, ativar ou desativar, trocar imagem.
- Cada atualização registra data, para o catálogo poder exibir "preços atualizados em ...".

## Detalhes técnicos

- Lovable Cloud (banco + auth). Tabelas `brands` e `products`, RLS: `SELECT` público em produtos ativos; `INSERT/UPDATE/DELETE` apenas para o papel admin.
- Papéis em tabela `user_roles` separada + função `has_role`, nunca no perfil.
- Leitura do catálogo via server function pública com chave publicável; escrita e importação via server functions autenticadas que validam o papel admin.
- Parse do `.xlsx` no servidor com SheetJS, mapeando as colunas conhecidas das duas planilhas (Belliz: Código / Descrição / Marca / Código de barras / Coletivo / Preço Líquido Un.; Payot: CÓDIGO / DESCRIÇÃO / EAN-13 / PRÇ CHEIO / PREÇO, com a linha vindo dos cabeçalhos "LINHA ...").
- `src/data/*.json` deixam de ser a fonte de verdade e viram apenas o seed da migração inicial.
- Ferramentas MCP e a lógica de Curva A passam a consultar o banco, mantendo a regra de mix por marca única.

## Fora do escopo

Sem alteração visual do catálogo, do carrinho ou do PDF além dos valores corrigidos.
