import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const COLUMNS =
  "brand_id, code, name, line, ean, price_unit, price_full, coletivo, price_coletivo, image_url, updated_at";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type PublicCatalogRow = {
  brand_id: string;
  code: string;
  name: string;
  line: string;
  ean: string;
  price_unit: number;
  price_full: number | null;
  coletivo: number;
  price_coletivo: number | null;
  image_url: string | null;
  updated_at: string;
};

/** Catálogo público (produtos ativos), lido do banco. */
export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const rows: PublicCatalogRow[] = [];
  const page = 1000;
  for (let from = 0; from < 10000; from += page) {
    const { data, error } = await supabase
      .from("products")
      .select(COLUMNS)
      .eq("active", true)
      .order("code", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as PublicCatalogRow[]));
    if (!data || data.length < page) break;
  }
  return { rows };
});

const rowSchema = z.object({
  brand_id: z.enum(["belliz", "payot"]),
  code: z.string().min(1),
  name: z.string().min(1),
  line: z.string().default(""),
  ean: z.string().default(""),
  price_unit: z.number().nonnegative(),
  price_full: z.number().nonnegative().nullable().default(null),
  coletivo: z.number().int().positive().default(1),
  price_coletivo: z.number().nonnegative().nullable().default(null),
});
export type ImportRow = z.infer<typeof rowSchema>;

async function assertAdmin(context: { supabase: ReturnType<typeof publicClient>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito ao administrador.");
}

/** Confirma se o usuário logado é administrador. */
export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: Boolean(data) };
  });

/** Lista produtos (inclui inativos) para o painel. */
export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ brand: z.enum(["belliz", "payot"]), search: z.string().default(""), limit: z.number().int().min(1).max(200).default(50) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context as never);
    let query = context.supabase
      .from("products")
      .select(`id, ${COLUMNS}, active`)
      .eq("brand_id", data.brand)
      .order("code")
      .limit(data.limit);
    if (data.search.trim()) {
      const s = data.search.trim().replace(/[%,]/g, " ");
      query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%,ean.ilike.%${s}%,line.ilike.%${s}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/** Atualiza um produto item a item. */
export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).optional(),
          line: z.string().optional(),
          price_unit: z.number().nonnegative().optional(),
          price_full: z.number().nonnegative().nullable().optional(),
          coletivo: z.number().int().positive().optional(),
          price_coletivo: z.number().nonnegative().nullable().optional(),
          image_url: z.string().url().nullable().optional(),
          active: z.boolean().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("products").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Compara a planilha enviada com o banco e devolve o resumo das mudanças. */
export const previewImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ brand: z.enum(["belliz", "payot"]), rows: z.array(rowSchema).min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context as never);
    const { data: current, error } = await context.supabase
      .from("products")
      .select("code, name, price_unit, coletivo, active")
      .eq("brand_id", data.brand)
      .limit(5000);
    if (error) throw new Error(error.message);
    const byCode = new Map((current ?? []).map((p) => [p.code, p]));
    const incoming = new Set(data.rows.map((r) => r.code));

    const priceChanges: { code: string; name: string; from: number; to: number }[] = [];
    const created: string[] = [];
    for (const r of data.rows) {
      const cur = byCode.get(r.code);
      if (!cur) {
        created.push(r.code);
        continue;
      }
      if (Math.abs(Number(cur.price_unit) - r.price_unit) > 0.001)
        priceChanges.push({ code: r.code, name: r.name, from: Number(cur.price_unit), to: r.price_unit });
    }
    const removed = (current ?? []).filter((p) => p.active && !incoming.has(p.code)).map((p) => p.code);
    return {
      total: data.rows.length,
      created,
      removed,
      priceChanges: priceChanges.slice(0, 200),
      priceChangeCount: priceChanges.length,
    };
  });

/** Aplica a planilha: atualiza preços, cria novos e desativa os que saíram. */
export const applyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brand: z.enum(["belliz", "payot"]),
        rows: z.array(rowSchema).min(1),
        deactivateMissing: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context as never);
    const { data: current, error: readError } = await context.supabase
      .from("products")
      .select("code, image_url")
      .eq("brand_id", data.brand)
      .limit(5000);
    if (readError) throw new Error(readError.message);
    const images = new Map((current ?? []).map((p) => [p.code, p.image_url]));

    const payload = data.rows.map((r) => ({
      ...r,
      image_url: images.get(r.code) ?? null,
      active: true,
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await context.supabase
        .from("products")
        .upsert(payload.slice(i, i + 500), { onConflict: "brand_id,code" });
      if (error) throw new Error(error.message);
    }

    let deactivated = 0;
    if (data.deactivateMissing) {
      const incoming = new Set(data.rows.map((r) => r.code));
      const missing = (current ?? []).map((p) => p.code).filter((c) => !incoming.has(c));
      for (let i = 0; i < missing.length; i += 500) {
        const chunk = missing.slice(i, i + 500);
        if (!chunk.length) continue;
        const { error } = await context.supabase
          .from("products")
          .update({ active: false })
          .eq("brand_id", data.brand)
          .in("code", chunk);
        if (error) throw new Error(error.message);
        deactivated += chunk.length;
      }
    }
    return { upserted: payload.length, deactivated };
  });
