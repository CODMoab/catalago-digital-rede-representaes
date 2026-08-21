import type { QuoteRecord } from "@/lib/quotes.functions";
import type { ReactivationLead } from "@/lib/leads.functions";

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * Chave de identificação do cliente: o CNPJ quando existe, senão o telefone.
 * É o mesmo critério usado no painel para cruzar cadastro com pedidos.
 */
export function customerKey(source: {
  cnpj?: string | null;
  phone?: string | null;
}): string {
  return digits(source.cnpj) || digits(source.phone) || "";
}

export function quoteKey(q: QuoteRecord): string {
  return digits(q.customer_cnpj) || digits(q.customer_phone) || "";
}

export type TopProduct = {
  code: string;
  name: string;
  units: number;
  total: number;
  orders: number;
};

export type CustomerProfile = {
  key: string;
  name: string;
  cnpj: string;
  phone: string;
  city: string;
  state: string;
  discountPercent: number | null;
  registeredAt: string | null;
  /** true quando o cliente se cadastrou pelo catálogo (e não só apareceu em pedidos) */
  isLead: boolean;
  quotes: QuoteRecord[];
  ordersCount: number;
  totalValue: number;
  avgTicket: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  byBrand: Record<"belliz" | "payot", { orders: number; total: number }>;
  topProducts: TopProduct[];
};

/** Dias inteiros entre uma data e hoje. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/**
 * Junta cadastro e pedidos de um mesmo cliente numa ficha só.
 * Funciona tanto para quem se cadastrou no catálogo quanto para quem só aparece
 * em pedidos lançados no painel.
 */
export function buildCustomerProfile(
  key: string,
  leads: ReactivationLead[],
  quotes: QuoteRecord[],
): CustomerProfile | null {
  if (!key) return null;

  const lead = leads.find((l) => customerKey(l) === key) ?? null;
  const mine = quotes
    .filter((q) => quoteKey(q) === key)
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  if (!lead && mine.length === 0) return null;

  const ultimo = mine[0] ?? null;
  const totalValue = mine.reduce((s, q) => s + Number(q.total || 0), 0);

  const byBrand: CustomerProfile["byBrand"] = {
    belliz: { orders: 0, total: 0 },
    payot: { orders: 0, total: 0 },
  };
  for (const q of mine) {
    const b = q.brand_id === "payot" ? "payot" : "belliz";
    byBrand[b].orders += 1;
    byBrand[b].total += Number(q.total || 0);
  }

  // O que ele costuma repor — base da conversa de reposição
  const produtos = new Map<string, TopProduct>();
  for (const q of mine) {
    for (const item of q.items ?? []) {
      if (!item?.code) continue;
      const atual = produtos.get(item.code) ?? {
        code: item.code,
        name: item.name,
        units: 0,
        total: 0,
        orders: 0,
      };
      atual.units += Number(item.qty || 0);
      atual.total += Number(item.qty || 0) * Number(item.unitPrice || 0);
      atual.orders += 1;
      produtos.set(item.code, atual);
    }
  }
  const topProducts = [...produtos.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, 8);

  return {
    key,
    name: lead?.name || ultimo?.customer_name || "Cliente sem nome",
    cnpj: lead?.cnpj || ultimo?.customer_cnpj || "",
    phone: lead?.phone || ultimo?.customer_phone || "",
    city: lead?.city || "",
    state: lead?.state || "",
    discountPercent: lead?.discount_percent ?? null,
    registeredAt: lead?.created_at ?? null,
    isLead: Boolean(lead),
    quotes: mine,
    ordersCount: mine.length,
    totalValue,
    avgTicket: mine.length > 0 ? totalValue / mine.length : 0,
    lastOrderAt: ultimo?.created_at ?? null,
    daysSinceLastOrder: daysSince(ultimo?.created_at ?? null),
    byBrand,
    topProducts,
  };
}
