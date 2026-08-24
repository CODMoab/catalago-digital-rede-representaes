-- Dados que a Receita Federal devolve na consulta do CNPJ.
--
-- Ficam gravados no lead para o painel poder etiquetar o cliente sem consultar
-- de novo, e para servir de base ao preenchimento da ficha cadastral das
-- indústrias. Inscrição Estadual e Municipal NÃO vêm daqui — são da Sefaz e da
-- prefeitura — e continuam sendo digitadas.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS razao_social      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_fantasia     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS situacao_cadastral text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnae              text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnae_descricao    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS perfil            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS endereco          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bairro            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cep               text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS consultado_em     timestamptz;

CREATE INDEX IF NOT EXISTS leads_perfil_idx ON public.leads (perfil);
CREATE INDEX IF NOT EXISTS leads_situacao_idx ON public.leads (situacao_cadastral);
