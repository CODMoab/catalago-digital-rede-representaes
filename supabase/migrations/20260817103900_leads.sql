CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  cnpj text NOT NULL UNIQUE,
  discount_percent numeric NOT NULL DEFAULT 15,
  source text NOT NULL DEFAULT 'welcome_roulette',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_cnpj_idx ON public.leads (cnpj);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON public.leads (phone);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);

-- A base de leads (nome, CNPJ, telefone) só é lida/gravada pelo servidor,
-- que usa a service_role. Nada de acesso pela chave pública do navegador.
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
-- Sem policy para anon/authenticated: RLS bloqueia tudo que não for service_role.
