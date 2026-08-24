-- Configurações do sistema que precisam valer em qualquer aparelho.
--
-- Primeiro uso: o mapa de linhas da tabela da Payot. A colagem da coluna QTD é
-- por posição, então o mapa precisa ser o mesmo no notebook e no celular. Antes
-- ele ficava só no navegador de quem importou a tabela.
--
-- Uma linha por chave, valor em JSON, para servir também às próximas
-- configurações (mapa da Belliz, padrões de pedido) sem nova migration.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Mesma regra das outras tabelas do painel: só o servidor toca, usando a
-- service_role. RLS ligada e sem policy nenhuma bloqueia anon e authenticated.
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
