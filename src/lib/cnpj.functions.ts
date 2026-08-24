import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  classificarCnae,
  cnpjValido,
  type ConsultaCnpj,
  type SituacaoCnpj,
} from "@/lib/cnpj";

/**
 * Consulta o CNPJ na base pública da Receita Federal (via BrasilAPI).
 *
 * Roda no servidor por dois motivos: o navegador do cliente não fala com um
 * serviço de fora sem esbarrar em CORS, e assim o endereço do serviço fica
 * trocável em um lugar só. Falha de rede não derruba o cadastro — devolve
 * `disponivel: false` e o cliente segue digitando à mão.
 */
const FONTE = "https://brasilapi.com.br/api/cnpj/v1";
const TEMPO_LIMITE = 8000;

export type RespostaCnpj =
  | { ok: true; dados: ConsultaCnpj }
  | { ok: false; motivo: "invalido" | "nao_encontrado" | "indisponivel"; mensagem: string };

function situacaoDe(texto: string): SituacaoCnpj {
  const t = (texto || "").toLowerCase();
  if (t.includes("ativa")) return "ativa";
  if (t.includes("baixada")) return "baixada";
  if (t.includes("suspensa")) return "suspensa";
  if (t.includes("inapta")) return "inapta";
  if (t.includes("nula")) return "nula";
  return "desconhecida";
}

function texto(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

export const consultarCnpj = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ cnpj: z.string().min(11).max(20) }).parse(d))
  .handler(async ({ data }): Promise<RespostaCnpj> => {
    const limpo = data.cnpj.replace(/\D/g, "");
    if (!cnpjValido(limpo)) {
      return {
        ok: false,
        motivo: "invalido",
        mensagem: "Esse CNPJ não confere. Verifique os números digitados.",
      };
    }

    const corta = AbortSignal.timeout ? AbortSignal.timeout(TEMPO_LIMITE) : undefined;
    let resposta: Response;
    try {
      resposta = await fetch(`${FONTE}/${limpo}`, { signal: corta });
    } catch {
      return {
        ok: false,
        motivo: "indisponivel",
        mensagem: "Não consegui consultar a Receita agora. Pode seguir e preencher à mão.",
      };
    }

    if (resposta.status === 404) {
      return {
        ok: false,
        motivo: "nao_encontrado",
        mensagem: "A Receita Federal não tem esse CNPJ. Confira os números.",
      };
    }
    if (!resposta.ok) {
      return {
        ok: false,
        motivo: "indisponivel",
        mensagem: "A consulta à Receita não respondeu. Pode seguir e preencher à mão.",
      };
    }

    const r = (await resposta.json()) as Record<string, unknown>;
    const situacaoTexto = texto(r["descricao_situacao_cadastral"]);
    const cnae = texto(r["cnae_fiscal"]);
    const cnaeDescricao = texto(r["cnae_fiscal_descricao"]);
    const numero = texto(r["numero"]);
    const logradouro = texto(r["logradouro"]);

    return {
      ok: true,
      dados: {
        cnpj: limpo,
        razaoSocial: texto(r["razao_social"]),
        nomeFantasia: texto(r["nome_fantasia"]),
        situacao: situacaoDe(situacaoTexto),
        situacaoTexto: situacaoTexto || "Desconhecida",
        desde: texto(r["data_situacao_cadastral"]),
        abertura: texto(r["data_inicio_atividade"]),
        cnae,
        cnaeDescricao,
        perfil: classificarCnae(cnae, cnaeDescricao),
        endereco: [logradouro, numero].filter(Boolean).join(", "),
        bairro: texto(r["bairro"]),
        cidade: texto(r["municipio"]),
        uf: texto(r["uf"]),
        cep: texto(r["cep"]),
        telefone: texto(r["ddd_telefone_1"]),
        email: texto(r["email"]),
        porte: texto(r["porte"]),
        simples: r["opcao_pelo_simples"] === true,
        mei: r["opcao_pelo_mei"] === true,
      },
    };
  });
