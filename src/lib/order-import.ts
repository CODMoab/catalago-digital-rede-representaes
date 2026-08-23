import { BELLIZ, PAYOT, type BrandId } from "@/lib/catalog";
import { getDiscountedPrice, DEFAULT_DISCOUNT_PERCENT } from "@/lib/leads";
import type { QuoteItem } from "@/lib/quotes.functions";
import type { ExtractedOrder } from "@/lib/order-import.functions";

/** Linha do rascunho: o que a IA leu + o produto do catálogo que casou com ela. */
export type DraftLine = QuoteItem & {
  /** Texto original do pedido, para conferir lado a lado. */
  raw: string;
  /** Como o item foi identificado. */
  match: "codigo" | "ean" | "nome" | "nenhum";
  packLabel: string;
  /** Código que veio no pedido e não é nosso — normalmente o código interno do cliente. */
  customerCode: string;
  /** Outros produtos parecidos, para resolver a dúvida em um clique. */
  suggestions: { code: string; name: string; line: string }[];
};

// Faixa de acentos combinantes (U+0300..U+036F), montada sem escapes no fonte.
const DIACRITICOS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  "g",
);

export const norm = (v: string) =>
  (v ?? "")
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const digits = (v: string) => (v ?? "").replace(/\D/g, "");

/** Palavras genéricas demais para valer ponto na comparação. */
const STOP = new Set([
  "de","da","do","com","para","e","a","o","un","und","unidade","unidades",
  "cx","caixa","display","kit","pct","pacote","cor","tam",
]);

function tokens(v: string): string[] {
  return norm(v)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * Número da variação (cor/tom) do produto.
 * No pedido vem como "COR 04"; no catálogo vem no fim do nome ("... Cobertura 4").
 * Sem isso, "Base Matte cor 04" casa com a cor 1 e ninguém percebe.
 */
function variante(v: string): string {
  // norm() transforma "2,5" e "2.5" em "2 5", então a fração vira dois grupos
  const t = norm(v).replace(/\s(payot|belliz)$/, "").trim();
  const cor = t.match(/\bcor\s*0*(\d{1,2})(?:\s+(\d))?\b/);
  if (cor) return cor[2] ? `${cor[1]}.${cor[2]}` : cor[1];
  const fim = t.match(/(?:^|\s)0*(\d{1,2})(?:\s+(\d))?$/);
  if (!fim) return "";
  return fim[2] ? `${fim[1]}.${fim[2]}` : fim[1];
}

type CatalogEntry = {
  code: string;
  name: string;
  line: string;
  ean: string;
  pack: number;
  baseUnit: number;
};

export function catalogOf(brand: BrandId): CatalogEntry[] {
  if (brand === "belliz") {
    return BELLIZ.map((p) => {
      const pack = Math.max(1, p.coletivo || 1);
      return {
        code: p.code,
        name: p.name,
        line: p.line ?? "",
        ean: p.ean ?? "",
        pack,
        baseUnit: p.priceColetivo ? p.priceColetivo / pack : p.priceUnit,
      };
    });
  }
  return PAYOT.map((p) => ({
    code: p.code,
    name: p.name,
    line: p.line ?? "",
    ean: p.ean ?? "",
    pack: 1,
    baseUnit: p.price,
  }));
}

/** Pontua o quanto a descrição lida se parece com o nome do produto (0 a 1). */
function score(queryTokens: string[], entry: CatalogEntry): number {
  if (queryTokens.length === 0) return 0;
  const alvo = norm(`${entry.name} ${entry.line}`);
  let hits = 0;
  for (const t of queryTokens) if (alvo.includes(t)) hits += 1;
  return hits / queryTokens.length;
}

/** Marca sugerida pela IA, validada contra os valores que o sistema aceita. */
export function brandFromExtraction(order: ExtractedOrder): BrandId | null {
  const m = norm(order.marca);
  if (m.includes("belliz")) return "belliz";
  if (m.includes("payot")) return "payot";
  return null;
}

/**
 * Converte o que a IA leu em linhas de pedido casadas com o catálogo.
 * Tudo que não bater com segurança volta marcado para conferência.
 */
export function matchExtractedOrder(order: ExtractedOrder, brand: BrandId): DraftLine[] {
  const catalog = catalogOf(brand);
  const byCode = new Map(catalog.map((e) => [norm(e.code), e]));
  const byEan = new Map(catalog.filter((e) => e.ean).map((e) => [digits(e.ean), e]));

  return order.itens.map((item) => {
    const raw = [item.descricao, item.codigo, item.ean].filter(Boolean).join(" · ");

    let entry: CatalogEntry | undefined;
    let match: DraftLine["match"] = "nenhum";

    const corPedida = variante(item.descricao);
    let empatados = 0;

    if (item.codigo && byCode.has(norm(item.codigo))) {
      entry = byCode.get(norm(item.codigo));
      match = "codigo";
    } else if (item.ean && byEan.has(digits(item.ean))) {
      entry = byEan.get(digits(item.ean));
      match = "ean";
    } else {
      // O código do catálogo às vezes vem escrito no meio da descrição:
      // "GEL DE SOBRANCELHAS PAYOT COD 772101"
      for (const n of item.descricao.match(/\d{4,6}/g) ?? []) {
        if (byCode.has(norm(n))) {
          entry = byCode.get(norm(n));
          match = "codigo";
          break;
        }
      }
    }

    // Ranking por nome: serve para escolher o produto e para sugerir alternativas
    const qt = tokens(item.descricao);
    const ranking = catalog
      .map((e) => {
        let s = score(qt, e);
        // A cor decide entre produtos de nome idêntico
        if (corPedida) {
          const corItem = variante(e.name);
          if (corItem === corPedida) s = Math.min(1, s + 0.35);
          else if (corItem) s *= 0.25;
        }
        return { e, s };
      })
      .filter((r) => r.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6);

    if (!entry && ranking.length > 0 && ranking[0].s >= 0.6) {
      entry = ranking[0].e;
      match = "nome";
      empatados = ranking.filter((r) => Math.abs(r.s - ranking[0].s) <= 0.001).length;
    }

    // Código do cliente que por acaso existe no nosso catálogo: o nome manda.
    // Sem isso, "PALETA DE SOMBRAS CHIC" com código interno 3999 viraria
    // "Upderm Hialuronico" — erro silencioso e caro.
    let codigoIgnorado = "";
    if (
      entry &&
      match === "codigo" &&
      qt.length > 0 &&
      score(qt, entry) < 0.3 &&
      ranking.length > 0 &&
      ranking[0].s >= 0.6
    ) {
      codigoIgnorado = entry.code;
      entry = ranking[0].e;
      match = "nome";
    }

    // Código que veio no pedido mas não é do nosso catálogo: é do cliente
    const customerCode =
      item.codigo && (!entry || entry.code !== item.codigo) ? item.codigo : "";

    const suggestions = ranking
      .filter((r) => r.e.code !== entry?.code)
      .slice(0, 3)
      .map((r) => ({ code: r.e.code, name: r.e.name, line: r.e.line }));

    const notas: string[] = [];
    if (item.incerto && item.observacao) notas.push(item.observacao);
    if (!entry) notas.push("produto não encontrado no catálogo");
    else if (match === "nome") notas.push("produto identificado pelo nome, confirmar");

    if (codigoIgnorado) {
      notas.push(
        `o código ${item.codigo} existe no catálogo (${codigoIgnorado}) mas com outro produto — usei o nome e tratei o código como interno do cliente`,
      );
    }

    if (entry && corPedida) {
      const corItem = variante(entry.name);
      if (corItem !== corPedida) {
        notas.push(`o pedido diz cor ${corPedida} e o produto escolhido é a cor ${corItem || "sem número"} — confirme`);
      }
    }
    if (entry && match === "nome" && empatados > 1) {
      notas.push(`há ${empatados} produtos com nome parecido, confirme qual é`);
    }

    const pack = entry?.pack ?? 1;
    let qty = Math.max(0, Math.round(item.quantidade || 0));

    // Belliz vende por coletivo: arredonda para cima e sinaliza o ajuste
    if (entry && pack > 1) {
      const unidadeColetivo = /caixa|coletivo|cx|display/i.test(item.unidade || "");
      if (unidadeColetivo) qty = qty * pack;
      if (qty % pack !== 0) {
        const ajustado = Math.max(pack, Math.ceil(qty / pack) * pack);
        notas.push(`quantidade ajustada de ${qty} para ${ajustado} (coletivo de ${pack})`);
        qty = ajustado;
      }
    }
    if (qty <= 0) {
      qty = pack;
      notas.push("quantidade não identificada, assumido o mínimo");
    }

    const precoCatalogo = entry
      ? getDiscountedPrice(entry.baseUnit, DEFAULT_DISCOUNT_PERCENT)
      : 0;
    const unitPrice =
      item.precoUnitario > 0 ? Math.round(item.precoUnitario * 100) / 100 : precoCatalogo;

    if (entry && item.precoUnitario > 0 && Math.abs(item.precoUnitario - precoCatalogo) > 0.01) {
      notas.push(
        `preço do pedido (${item.precoUnitario.toFixed(2)}) difere do catálogo (${precoCatalogo.toFixed(2)})`,
      );
    }

    const precisaConferir = !entry || item.incerto || match === "nome" || notas.length > 0;

    return {
      code: entry?.code ?? "",
      name: entry?.name ?? item.descricao,
      line: entry?.line ?? "",
      ean: entry?.ean ?? item.ean ?? "",
      pack,
      qty,
      unitPrice,
      curva: null,
      review: precisaConferir,
      reviewNote: notas.join(" · "),
      raw,
      match,
      packLabel: pack > 1 ? `coletivo de ${pack}` : "unidade",
      customerCode,
      suggestions,
    } satisfies DraftLine;
  });
}
