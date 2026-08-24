-- Link pessoal do cliente.
--
-- O representante manda o catálogo por WhatsApp. Com um token no link, o cliente
-- abre e já entra reconhecido, sem digitar CNPJ nem passar pela tela de cadastro.
--
-- É um uuid aleatório, e não o CNPJ, de propósito: link é coisa que se
-- encaminha, e CNPJ em endereço de site seria adivinhável e vazaria dado do
-- cliente para quem receber o link repassado.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS leads_access_token_idx ON public.leads (access_token);
