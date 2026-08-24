import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Configurações guardadas no banco, para valerem em qualquer aparelho.
 *
 * O valor trafega como texto JSON: assim uma configuração nova entra aqui sem
 * mexer em tipo nenhum. No banco fica em jsonb.
 *
 * `disponivel: false` quer dizer que a tabela app_settings ainda não existe no
 * Supabase (migration não aplicada). Nesse caso o sistema continua funcionando
 * com o que estiver salvo no navegador — só não sincroniza.
 */
export type LeituraSetting = {
  valueJson: string | null;
  updatedAt: string | null;
  disponivel: boolean;
};

const TABELA = "app_settings";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<LeituraSetting> => {
    try {
      const supabaseAdmin = await admin();
      const { data: row, error } = await supabaseAdmin
        .from(TABELA as any)
        .select("value, updated_at")
        .eq("key", data.key)
        .maybeSingle();
      if (error) return { valueJson: null, updatedAt: null, disponivel: false };
      const value = (row as any)?.value ?? null;
      return {
        valueJson: value === null ? null : JSON.stringify(value),
        updatedAt: (row as any)?.updated_at ?? null,
        disponivel: true,
      };
    } catch {
      return { valueJson: null, updatedAt: null, disponivel: false };
    }
  });

export const setSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().min(1).max(80), valueJson: z.string().min(2) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: ehAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!ehAdmin) throw new Error("Acesso restrito ao administrador.");

    let value: unknown;
    try {
      value = JSON.parse(data.valueJson);
    } catch {
      throw new Error("Configuração inválida.");
    }

    const supabaseAdmin = await admin();
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from(TABELA as any).upsert(
      {
        key: data.key,
        value,
        updated_at: updatedAt,
        updated_by: context.userId,
      } as never,
      { onConflict: "key" as any },
    );
    if (error) throw new Error(`Não consegui gravar a configuração: ${error.message}`);
    return { ok: true, updatedAt };
  });
