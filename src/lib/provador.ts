import type { QuoteItem } from "@/lib/quotes.functions";

/**
 * Provador Payot: a cada 6 unidades compradas, 1 vai de bonificação.
 *
 * O item bonificado tem código próprio, derivado do código de venda trocando
 * o primeiro dígito — 4 vira 5, 7 vira 8. É a mesma regra da fórmula usada
 * hoje na planilha:
 *
 *   =IF(LEFT(A;1)="4";"5"&RIGHT(A;LEN(A)-1);
 *      IF(LEFT(A;1)="7";"8"&RIGHT(A;LEN(A)-1);A))
 *
 * Códigos que não começam com 4 nem com 7 não têm provador — na fórmula eles
 * voltam iguais, aqui eles simplesmente ficam de fora do pedido de bonificação.
 */
export const PROVADOR_A_CADA = 6;

/** Código do provador, ou null quando o item não tem essa modalidade. */
export function provadorCode(code: string): string | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  if (c.startsWith("4")) return `5${c.slice(1)}`;
  if (c.startsWith("7")) return `8${c.slice(1)}`;
  return null;
}

export type ProvadorLine = {
  /** Código a digitar no pedido de bonificação. */
  code: string;
  /** Código do item de venda que gerou a bonificação. */
  originCode: string;
  name: string;
  line: string;
  /** Quantidade comprada no pedido principal. */
  boughtQty: number;
  /** Quantidade bonificada. */
  qty: number;
};

/**
 * Monta o pedido de provador a partir do pedido principal.
 * Some as quantidades por item antes de dividir, para o caso de o mesmo
 * produto aparecer em mais de uma linha.
 */
export function buildProvadorOrder(items: QuoteItem[]): ProvadorLine[] {
  const porItem = new Map<string, ProvadorLine>();

  for (const i of items) {
    const code = provadorCode(i.code);
    if (!code) continue;

    const atual = porItem.get(i.code);
    if (atual) {
      atual.boughtQty += i.qty;
    } else {
      porItem.set(i.code, {
        code,
        originCode: i.code,
        name: i.name,
        line: i.line ?? "",
        boughtQty: i.qty,
        qty: 0,
      });
    }
  }

  return [...porItem.values()]
    .map((l) => ({ ...l, qty: Math.floor(l.boughtQty / PROVADOR_A_CADA) }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => b.qty - a.qty);
}

/** Quantas unidades faltam para o item ganhar mais um provador. */
export function faltaParaProximo(boughtQty: number): number {
  const resto = boughtQty % PROVADOR_A_CADA;
  return resto === 0 ? PROVADOR_A_CADA : PROVADOR_A_CADA - resto;
}
