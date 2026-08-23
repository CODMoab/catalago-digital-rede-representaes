/**
 * Tabelas de preço das indústrias.
 *
 * O que o catálogo guarda já é o preço LÍQUIDO da tabela de varejo, com os 15%
 * do representante aplicados. Conferido contra os arquivos oficiais:
 *   Belliz 115  — talão: 9,52 bruto  ·  catálogo: 8,09  (9,52 x 0,85)
 *   Payot 3999  — tabela: 61,25 cheio ·  catálogo: 52,06 (61,25 x 0,85)
 *
 * Para chegar em outra tabela, primeiro se recupera o bruto e depois se aplica
 * o desconto dela. Assim nenhum desconto entra em cima de outro.
 */
export const TABELA_VAREJO = 15;
export const TABELA_ATACADO = 25;

export const TABELAS = {
  varejo: { label: "Varejo · 15%", desconto: TABELA_VAREJO },
  atacado: { label: "Atacado · 25%", desconto: TABELA_ATACADO },
} as const;

export type TabelaId = keyof typeof TABELAS;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Preço cheio, antes de qualquer desconto de tabela. */
export function precoBruto(precoLiquidoVarejo: number): number {
  return precoLiquidoVarejo / ((100 - TABELA_VAREJO) / 100);
}

/**
 * Preço na tabela escolhida, a partir do preço de varejo guardado no catálogo.
 * Com desconto de 15% devolve o próprio valor guardado.
 */
export function precoDaTabela(precoLiquidoVarejo: number, descontoTabela: number): number {
  if (!precoLiquidoVarejo) return 0;
  if (descontoTabela === TABELA_VAREJO) return round2(precoLiquidoVarejo);
  return round2(precoBruto(precoLiquidoVarejo) * ((100 - descontoTabela) / 100));
}
