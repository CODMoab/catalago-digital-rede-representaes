import modeloBase from "@/data/payot-modelo-linhas.json";

/**
 * Mapa de linhas da tabela da Payot.
 *
 * A colagem da coluna QTD é por posição, não por código: se a indústria inserir
 * ou tirar um produto, tudo abaixo desce uma linha e as quantidades caem no
 * produto errado. Por isso o mapa fica guardado e é atualizado quando uma tabela
 * nova é importada no painel.
 *
 * Fica no navegador do representante, junto de quem gera as planilhas. O mapa que
 * veio no código serve de partida e nunca é perdido.
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

const CHAVE = "rede.modelo-payot";

const BASE: ModeloPayot = {
  primeiraLinha: modeloBase.primeiraLinha,
  colunaQtd: modeloBase.colunaQtd,
  linhas: modeloBase.linhas,
};

function valido(m: unknown): m is ModeloPayot {
  const x = m as ModeloPayot | null;
  return Boolean(
    x &&
      typeof x.primeiraLinha === "number" &&
      typeof x.colunaQtd === "string" &&
      Array.isArray(x.linhas) &&
      x.linhas.length > 0,
  );
}

/** O mapa em uso: o importado, se houver, senão o que veio no código. */
export function modeloPayotAtual(): ModeloPayot {
  if (typeof localStorage === "undefined") return BASE;
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (!salvo) return BASE;
    const parsed: unknown = JSON.parse(salvo);
    return valido(parsed) ? parsed : BASE;
  } catch {
    return BASE;
  }
}

export function salvarModeloPayot(modelo: ModeloPayot): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CHAVE, JSON.stringify(modelo));
}

export function limparModeloPayot(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CHAVE);
}

/** Frase curta sobre a origem do mapa, para mostrar antes de gerar a colagem. */
export function origemDoModelo(m: ModeloPayot = modeloPayotAtual()): string {
  return m.atualizadoEm
    ? `Mapa da tabela importado em ${new Date(m.atualizadoEm).toLocaleDateString("pt-BR")}.`
    : "Mapa da tabela original do sistema — importe a tabela do mês se a Payot mudou a lista de produtos.";
}
