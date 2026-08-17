-- Cidade e estado do lead: a representação atende somente a Bahia (BA),
-- então o estado serve de filtro e a cidade ajuda na rota/logística do vendedor.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'BA';

CREATE INDEX IF NOT EXISTS leads_city_idx ON public.leads (city);
CREATE INDEX IF NOT EXISTS leads_state_idx ON public.leads (state);
