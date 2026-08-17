-- ============================================================
-- SETUP COMPLETO DO BANCO — Catálogo Digital Rede Representações
-- Cole este arquivo inteiro no SQL Editor de um projeto Supabase NOVO
-- (vazio) e clique em Run. Rode uma única vez.
-- ============================================================

-- ---------- 20260810215015_ae4fd3cb-7069-4fca-bd98-217b160133c7.sql ----------
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.brands (
  id text PRIMARY KEY,
  name text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brands are public" ON public.brands FOR SELECT USING (true);
CREATE POLICY "Admins manage brands" ON public.brands FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  line text NOT NULL DEFAULT '',
  ean text NOT NULL DEFAULT '',
  price_unit numeric(12,2) NOT NULL DEFAULT 0,
  price_full numeric(12,2),
  coletivo integer NOT NULL DEFAULT 1,
  price_coletivo numeric(12,2),
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, code)
);
CREATE INDEX products_brand_active_idx ON public.products (brand_id, active);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active products are public" ON public.products FOR SELECT USING (active = true);
CREATE POLICY "Admins view all products" ON public.products FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER brands_touch BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.brands (id, name, tagline, description, sort_order) VALUES
 ('belliz','Belliz','Acessórios de beleza','Pentes, escovas, espelhos e acessórios das marcas Ricca, Belliz, Enox, Kess e Vertix. Venda por coletivo.',1),
 ('payot','Payot','Skincare e maquiagem','Cosméticos brasileiros com foco em tratamento, proteção solar e maquiagem. Preços já com desconto de representante.',2);
-- ---------- 20260810215035_750a440f-138e-4205-9ab6-55a7fa1e99d2.sql ----------
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;
-- ---------- 20260810215200_88d2fe53-4301-4563-944c-f02c2da42f65.sql ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.brands TO sandbox_exec';
  END IF;
END $$;
-- ---------- 20260810215807_6971c8d2-f333-4d3e-9a24-ab41c387aeb2.sql ----------
CREATE OR REPLACE FUNCTION public.grant_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.grant_first_admin() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created_grant_first_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_first_admin();
-- ---------- 20260814184557_dba0e725-e427-4722-8b03-8b55c1dae8f4.sql ----------
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
-- ---------- 20260817103900_leads.sql ----------
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

-- ---------- 20260817150000_leads_city_state.sql ----------
-- Cidade e estado do lead: a representação atende somente a Bahia (BA),
-- então o estado serve de filtro e a cidade ajuda na rota/logística do vendedor.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'BA';

CREATE INDEX IF NOT EXISTS leads_city_idx ON public.leads (city);
CREATE INDEX IF NOT EXISTS leads_state_idx ON public.leads (state);

