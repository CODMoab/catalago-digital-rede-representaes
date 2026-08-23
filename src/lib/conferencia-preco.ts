import type { QuoteItem } from "@/lib/quotes.functions";
import type { BrandId } from "@/lib/catalog";
import { catalogOf } from "@/lib/order-import";
import { TABELA_VAREJO, precoDaTabela } from "@/lib/tabela-preco";

/**
 * REGRA DE PREÇO DO SISTEMA
 *
 * O preço que o catálogo mostra JÁ É o preço com os nossos 15%. É esse valor
 * que vai para a planilha e para o orçamento. Nada aplica desconto em cima
 * dele — nem a importação, nem o lançamento manual, nem a planilha.
 *
 * Para outra tabela (atacado 25%), o cálculo reconstrói o preço cheio e aplica
 * o desconto dela uma única vez. Ver `precoDaTabela` em @/lib/tabela-preco.
 *
 * Esta conferência é a rede de segurança: antes de gerar qualquer orçamento,
 * compara item a item o preço gravado com o preço da tabela e denuncia
 * qualquer diferença, para nenhum desconto entrar escondido.
 */
export type Divergencia = {
  code: string;
  name: string;
  esperado: number;
  encontrado: number;
  /** Diferença percentual em relação ao preço de tabela. */
  percentual: number;
};

export type ChecagemPreco = {
  ok: boolean;
  /** Itens cujo preço não é o da tabela escolhida. */
  divergencias: Divergencia[];
  /** Itens que nem existem no catálogo — não dá para conferir. */
  semCatalogo: string[];
  descontoTabela: number;
};

/** Diferença de até 1 centavo é arredondamento, não erro. */
const TOLERANCIA = 0.01;

export function conferirPrecos(
  items: QuoteItem[],
  brand: BrandId,
  descontoTabela: number = TABELA_VAREJO,
): ChecagemPreco {
  const catalogo = new Map(catalogOf(brand).map((e) => [e.code, e]));
  const divergencias: Divergencia[] = [];
  const semCatalogo: string[] = [];

  for (const item of items) {
    const entry = catalogo.get(item.code);
    if (!entry) {
      if (item.code) semCatalogo.push(item.code);
      continue;
    }
    const esperado = precoDaTabela(entry.baseUnit, descontoTabela);
    if (Math.abs(item.unitPrice - esperado) > TOLERANCIA) {
      divergencias.push({
        code: item.code,
        name: item.name,
        esperado,
        encontrado: item.unitPrice,
        percentual: esperado > 0 ? ((item.unitPrice - esperado) / esperado) * 100 : 0,
      });
    }
  }

  return {
    ok: divergencias.length === 0,
    divergencias,
    semCatalogo,
    descontoTabela,
  };
}

/** Frase curta para mostrar na tela ou escrever na planilha. */
export function resumoChecagem(c: ChecagemPreco): string {
  if (c.ok && c.semCatalogo.length === 0) {
    return `Preços conferidos: todos batem com a tabela de ${c.descontoTabela}%.`;
  }
  const partes: string[] = [];
  if (c.divergencias.length > 0) {
    const abaixo = c.divergencias.filter((d) => d.encontrado < d.esperado).length;
    partes.push(
      `${c.divergencias.length} item(ns) fora da tabela de ${c.descontoTabela}%` +
        (abaixo > 0 ? ` (${abaixo} abaixo do preço de tabela)` : ""),
    );
  }
  if (c.semCatalogo.length > 0) {
    partes.push(`${c.semCatalogo.length} item(ns) sem preço de catálogo para comparar`);
  }
  return partes.join(" · ");
}
