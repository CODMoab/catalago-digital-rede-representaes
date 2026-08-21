import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const itemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  line: z.string().default(""),
  ean: z.string().default(""),
  pack: z.number().int().positive(),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  curva: z.enum(["A", "B", "C"]).nullable().default(null),
  /** Item lido automaticamente que precisa de conferência humana. */
  review: z.boolean().default(false),
  reviewNote: z.string().default(""),
});

/**
 * Tipo de entrada: campos com valor padrão (review, reviewNote, line…) são
 * opcionais para quem monta o item; o servidor preenche ao validar.
 */
export type QuoteItem = z.input<typeof itemSchema>;

const submitSchema = z.object({
  brand_id: z.enum(["belliz", "payot"]),
  source: z.enum(["catalogo", "curva-a"]).default("catalogo"),
  customer_name: z.string().min(2).max(120),
  customer_phone: z.string().min(8).max(30),
  customer_cnpj: z.string().min(14).max(20),
  items: z.array(itemSchema).min(1).max(500),
});

/** Registra o orçamento enviado pelo cliente (gravação feita no servidor). */
export const submitQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const units = data.items.reduce((s, i) => s + i.qty, 0);
    const total = Math.round(data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;

    const { data: row, error } = await supabaseAdmin
      .from("quotes")
      .insert({
        brand_id: data.brand_id,
        source: data.source,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_cnpj: data.customer_cnpj,
        items: data.items,
        items_count: data.items.length,
        units_count: units,
        total,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export type QuoteRecord = {
  id: string;
  brand_id: string;
  source: string;
  customer_name: string;
  customer_phone: string;
  customer_cnpj: string;
  items: QuoteItem[];
  items_count: number;
  units_count: number;
  total: number;
  status: string;
  created_at: string;
};

/** Lista dos orçamentos recebidos (somente admin). */
export const listQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ limit: z.number().int().positive().max(200).default(100) })
      .default({ limit: 100 })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("quotes")
      .select(
        "id, brand_id, source, customer_name, customer_phone, customer_cnpj, items, items_count, units_count, total, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as QuoteRecord[] };
  });

/** Altera a situação do orçamento (somente admin). */
export const setQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["novo", "enviado", "faturado", "cancelado"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quotes")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Pedido lançado pelo painel (WhatsApp, foto, e-mail…) ---------------- */

/** Canais por onde o pedido chegou fora do catálogo. */
export const MANUAL_SOURCES = {
  whatsapp: "WhatsApp",
  foto: "Foto / Print",
  email: "E-mail",
  telefone: "Telefone",
  presencial: "Visita presencial",
} as const;

export type ManualSource = keyof typeof MANUAL_SOURCES;

/** Rótulo de origem para qualquer pedido, do catálogo ou lançado à mão. */
export function sourceLabel(source: string): string {
  if (source === "curva-a") return "Curva A";
  if (source === "catalogo") return "Catálogo Oficial";
  return MANUAL_SOURCES[source as ManualSource] ?? source;
}

const manualQuoteSchema = z.object({
  brand_id: z.enum(["belliz", "payot"]),
  source: z.enum(["whatsapp", "foto", "email", "telefone", "presencial"]),
  customer_name: z.string().max(120).default(""),
  customer_phone: z.string().max(30).default(""),
  customer_cnpj: z.string().max(20).default(""),
  items: z.array(itemSchema).min(1).max(500),
  status: z.enum(["novo", "enviado", "faturado", "cancelado"]).default("novo"),
});

async function assertQuoteAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Acesso restrito ao administrador.");
}

/**
 * Registra no painel um pedido que chegou por fora do catálogo, mantendo o
 * mesmo formato dos demais — assim ele sai na planilha padrão da indústria e
 * fica rastreável pelo CNPJ e pela data.
 */
export const createManualQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => manualQuoteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertQuoteAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const units = data.items.reduce((s, i) => s + i.qty, 0);
    const total =
      Math.round(data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;

    const { data: row, error } = await supabaseAdmin
      .from("quotes")
      .insert({
        brand_id: data.brand_id,
        source: data.source,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_cnpj: data.customer_cnpj,
        items: data.items,
        items_count: data.items.length,
        units_count: units,
        total,
        status: data.status,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Apaga um orçamento (somente admin). Orçamento não é pedido fechado — some da lista. */
export const deleteQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertQuoteAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("quotes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
