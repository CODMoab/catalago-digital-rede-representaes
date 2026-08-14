CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL REFERENCES public.brands(id),
  source text NOT NULL DEFAULT 'catalogo',
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_cnpj text NOT NULL,
  items jsonb NOT NULL,
  items_count integer NOT NULL DEFAULT 0,
  units_count integer NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'novo',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quotes_created_at_idx ON public.quotes (created_at DESC);

GRANT SELECT, UPDATE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view quotes" ON public.quotes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update quotes" ON public.quotes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));