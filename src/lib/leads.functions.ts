import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveLeadSchema = z.object({
  name: z.string().min(2).max(150),
  phone: z.string().min(8).max(30),
  cnpj: z.string().min(14).max(25),
  city: z.string().max(120).default(""),
  state: z.string().max(2).default("BA"),
  discount_percent: z.number().default(15),
  source: z.string().default("welcome_roulette"),
});

export const saveLead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveLeadSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Tenta gravar na tabela 'leads' (se existir no Supabase)
      const { data: row, error } = await supabaseAdmin
        .from("leads" as any)
        .upsert(
          {
            name: data.name,
            phone: data.phone,
            cnpj: data.cnpj,
            city: data.city,
            state: data.state,
            discount_percent: data.discount_percent,
            source: data.source,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "cnpj" as any }
        )
        .select()
        .single();

      if (error) {
        // Não mentir sucesso: se não gravou, o lead existe só no navegador do cliente
        console.error("[leads] Falha ao gravar lead no Supabase:", error.message);
        return { success: false, error: error.message, lead: data };
      }
      return { success: true, error: null as string | null, lead: row ?? data };
    } catch (err: any) {
      console.error("[leads] Exceção ao gravar lead no servidor:", err?.message);
      return { success: false, error: String(err?.message ?? err), lead: data };
    }
  });

const findLeadSchema = z.object({
  identifier: z.string().min(3),
});

export const findLead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => findLeadSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const clean = data.identifier.replace(/\D/g, "");

      // Procura primeiro por CNPJ ou Telefone na tabela de leads
      const { data: lead } = await supabaseAdmin
        .from("leads" as any)
        .select("*")
        .or(`cnpj.ilike.%${clean}%,phone.ilike.%${clean}%`)
        .limit(1)
        .maybeSingle();

      if (lead) {
        return {
          found: true,
          customer: {
            name: (lead as any).name,
            phone: (lead as any).phone,
            cnpj: (lead as any).cnpj,
            city: (lead as any).city || "",
            state: (lead as any).state || "BA",
            discountPercent: (lead as any).discount_percent || 15,
            registeredAt: (lead as any).created_at || new Date().toISOString(),
            spunRoulette: true,
          },
        };
      }

      // Se não encontrou em leads, busca se já fez algum pedido anterior em quotes
      const { data: quote } = await supabaseAdmin
        .from("quotes")
        .select("customer_name, customer_phone, customer_cnpj, created_at")
        .or(`customer_cnpj.ilike.%${clean}%,customer_phone.ilike.%${clean}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (quote) {
        return {
          found: true,
          customer: {
            name: quote.customer_name,
            phone: quote.customer_phone,
            cnpj: quote.customer_cnpj,
            city: "",
            state: "BA",
            discountPercent: 15,
            registeredAt: quote.created_at,
            spunRoulette: true,
          },
        };
      }

      return { found: false };
    } catch (err: any) {
      console.warn("Erro ao buscar lead:", err?.message);
      return { found: false };
    }
  });

export type ReactivationLead = {
  id: string;
  name: string;
  phone: string;
  cnpj: string;
  city: string;
  state: string;
  discount_percent: number;
  created_at: string;
  quotes_count: number;
  quotes_total: number;
  last_quote_at: string | null;
  has_ordered: boolean;
};

/** Lista todos os clientes/leads cadastrados e cruza com pedidos para identificar oportunidades de reativação (admin) */
export const listLeadsForReactivation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Busca leads da tabela de leads
      const { data: leadsRows } = await supabaseAdmin
        .from("leads" as any)
        .select("*")
        .order("created_at", { ascending: false });

      // Busca todos os quotes para cruzar
      const { data: quotesRows } = await supabaseAdmin
        .from("quotes")
        .select("id, customer_name, customer_phone, customer_cnpj, total, created_at")
        .order("created_at", { ascending: false });

      const quotesByCnpj = new Map<string, { count: number; total: number; lastAt: string }>();

      for (const q of quotesRows ?? []) {
        const cleanCnpj = (q.customer_cnpj || "").replace(/\D/g, "");
        const cleanPhone = (q.customer_phone || "").replace(/\D/g, "");
        const key = cleanCnpj || cleanPhone;
        if (!key) continue;

        const curr = quotesByCnpj.get(key) ?? { count: 0, total: 0, lastAt: q.created_at };
        curr.count += 1;
        curr.total += Number(q.total || 0);
        if (new Date(q.created_at) > new Date(curr.lastAt)) {
          curr.lastAt = q.created_at;
        }
        quotesByCnpj.set(key, curr);
      }

      const registeredKeys = new Set<string>();
      const result: ReactivationLead[] = [];

      // Processa leads registrados
      for (const l of (leadsRows ?? []) as any[]) {
        const cleanCnpj = (l.cnpj || "").replace(/\D/g, "");
        const cleanPhone = (l.phone || "").replace(/\D/g, "");
        const key = cleanCnpj || cleanPhone;
        registeredKeys.add(key);

        const quoteInfo = quotesByCnpj.get(cleanCnpj) || quotesByCnpj.get(cleanPhone);
        const count = quoteInfo?.count ?? 0;
        const total = quoteInfo?.total ?? 0;
        const lastAt = quoteInfo?.lastAt ?? null;

        result.push({
          id: l.id || key,
          name: l.name,
          phone: l.phone,
          cnpj: l.cnpj,
          city: l.city || "",
          state: l.state || "BA",
          discount_percent: l.discount_percent || 15,
          created_at: l.created_at || new Date().toISOString(),
          quotes_count: count,
          quotes_total: total,
          last_quote_at: lastAt,
          has_ordered: count > 0,
        });
      }

      // Adiciona clientes que fizeram pedidos mesmo sem estarem na tabela 'leads'
      for (const q of quotesRows ?? []) {
        const cleanCnpj = (q.customer_cnpj || "").replace(/\D/g, "");
        const cleanPhone = (q.customer_phone || "").replace(/\D/g, "");
        const key = cleanCnpj || cleanPhone;
        if (!key || registeredKeys.has(key)) continue;
        registeredKeys.add(key);

        const quoteInfo = quotesByCnpj.get(key);
        result.push({
          id: q.id,
          name: q.customer_name,
          phone: q.customer_phone,
          cnpj: q.customer_cnpj,
          city: "",
          state: "BA",
          discount_percent: 15,
          created_at: q.created_at,
          quotes_count: quoteInfo?.count ?? 1,
          quotes_total: quoteInfo?.total ?? Number(q.total || 0),
          last_quote_at: quoteInfo?.lastAt ?? q.created_at,
          has_ordered: true,
        });
      }

      return { leads: result };
    } catch (err: any) {
      console.warn("Erro ao listar leads para reativação:", err?.message);
      return { leads: [] };
    }
  });
