import modeloBase from "@/data/payot-modelo-linhas.json";

/**
 * Mapa de linhas da tabela da Payot.
 *
 * A colagem da coluna QTD é por posição, não por código: se a indústria inserir
 * ou tirar um produto, tudo abaixo desce uma linha e as quantidades caem no
 * produto errado. Por isso o mapa fica guardado e é atualizado quando uma tabela
 * nova é importada no painel.
 *
 * Onde ele mora: no banco (app_settings), para valer em qualquer aparelho —
 * importa no notebook, o celular pega sozinho ao abrir o painel. O navegador
 * guarda uma cópia só para não depender da internet na hora de gerar o arquivo,
 * e o mapa que veio no código é o último recurso.
 */
export type ModeloPayot = {
  /** Primeira linha da planilha coberta pelo mapa (1-based). */
  primeiraLinha: number;
  /** Coluna onde a quantidade é colada. */
  colunaQtd: string;
  /** Uma entrada por linha: o código do produto, ou "" para linha de grupo. */
  linhas: string[];
  /** Quando esse mapa foi importado. Ausente no mapa que veio no código. */
  atualizadoEm?: string;
};

export const CHAVE_MODELO_PAYOT = "modelo-payot";
const CHAVE_LOCAL = "rede.modelo-payot";

const BASE: ModeloPayot = {
  primeiraLinha: modeloBase.primeiraLinha,
  colunaQtd: modeloBase.colunaQtd,
  linhas: modeloBase.linhas,
};

/** De onde veio o mapa que está em uso agora. */
export type OrigemModelo = "servidor" | "navegador" | "base";

let cache: ModeloPayot | null = null;
let origem: OrigemModelo = "base";

export function valido(m: unknown): m is ModeloPayot {
  const x = m as ModeloPayot | null;
  return Boolean(
    x &&
      typeof x.primeiraLinha === "number" &&
      typeof x.colunaQtd === "string" &&
      Array.isArray(x.linhas) &&
      x.linhas.length > 0,
  );
}

function lerLocal(): ModeloPayot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const salvo = localStorage.getItem(CHAVE_LOCAL);
    if (!salvo) return null;
    const parsed: unknown = JSON.parse(salvo);
    return valido(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function gravarLocal(modelo: ModeloPayot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(modelo));
  } catch {
    /* sem espaço no navegador: o banco continua sendo a fonte */
  }
}

/**
 * O mapa em uso. Lê o que o painel já sincronizou do banco; se ainda não
 * sincronizou nesta sessão, usa a cópia do navegador; sem nenhuma das duas,
 * o mapa que veio no código.
 */
export function modeloPayotAtual(): ModeloPayot {
  if (cache) return cache;
  const local = lerLocal();
  if (local) {
    cache = local;
    origem = "navegador";
    return local;
  }
  origem = "base";
  return BASE;
}

/** Guarda o que veio do banco. Chamado pelo painel ao abrir. */
export function hidrataModeloPayot(value: unknown): boolean {
  if (!valido(value)) return false;
  cache = value;
  origem = "servidor";
  gravarLocal(value);
  return true;
}

/**
 * Grava o mapa novo na cópia local. Quem chama diz se o banco já aceitou:
 * enquanto não aceitou, o mapa vale só neste aparelho e a frase de origem avisa.
 */
export function salvarModeloPayot(modelo: ModeloPayot, sincronizado = false): void {
  cache = modelo;
  origem = sincronizado ? "servidor" : "navegador";
  gravarLocal(modelo);
}

export function limparModeloPayot(): void {
  cache = null;
  origem = "base";
  if (typeof localStorage !== "undefined") localStorage.removeItem(CHAVE_LOCAL);
}

export function origemAtual(): OrigemModelo {
  modeloPayotAtual();
  return origem;
}

/** Frase curta sobre a origem do mapa, para mostrar antes de gerar a colagem. */
export function origemDoModelo(m: ModeloPayot = modeloPayotAtual()): string {
  const quando = m.atualizadoEm
    ? new Date(m.atualizadoEm).toLocaleDateString("pt-BR")
    : "";
  if (!quando) {
    return "Mapa da tabela original do sistema — importe a tabela do mês se a Payot mudou a lista de produtos.";
  }
  return origem === "servidor"
    ? `Mapa da tabela importado em ${quando}, sincronizado com o sistema.`
    : `Mapa da tabela importado em ${quando} (cópia deste aparelho — ainda não confirmada com o sistema).`;
}
