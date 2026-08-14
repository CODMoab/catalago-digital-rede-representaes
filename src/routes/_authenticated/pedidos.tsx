import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, FileSpreadsheet, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BRANDS, type BrandId } from "@/lib/catalog";
import { checkAdmin } from "@/lib/catalog.functions";
import { listQuotes, setQuoteStatus, type QuoteRecord } from "@/lib/quotes.functions";
import { buildOrderSheet, downloadBlob, orderSheetFileName } from "@/lib/order-sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos recebidos — Rede Representações" },
      {
        name: "description",
        content:
          "Todos os orçamentos enviados pelos clientes, com download da planilha no padrão Belliz ou Payot.",
      },
      { property: "og:title", content: "Pedidos recebidos — Rede Representações" },
      {
        property: "og:description",
        content: "Acompanhe os orçamentos dos clientes e baixe a planilha de cada pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuotesPage,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS = ["novo", "enviado", "faturado", "cancelado"] as const;

function QuotesPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkAdmin);
  const list = useServerFn(listQuotes);
  const setStatus = useServerFn(setQuoteStatus);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await list({ data: { limit: 100 } });
      setRows(res.rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar pedidos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    check()
      .then((r) => {
        setIsAdmin(r.isAdmin);
        if (r.isAdmin) void load();
      })
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAdmin === null) {
    return <main className="p-10 text-sm text-muted-foreground">Carregando pedidos…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta conta não tem permissão de administrador.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          Sair
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Pedidos recebidos</h1>
          <p className="text-sm text-muted-foreground">
            Cada pedido do cliente fica registrado aqui — baixe a planilha já no padrão da marca.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin">
            <Button variant="outline" size="sm">
              Base de preços
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {rows.map((q) => (
          <QuoteCard
            key={q.id}
            quote={q}
            onStatus={async (status) => {
              try {
                await setStatus({ data: { id: q.id, status } });
                setRows((prev) => prev.map((r) => (r.id === q.id ? { ...r, status } : r)));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.");
              }
            }}
          />
        ))}
        {!loading && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum pedido recebido ainda.
          </p>
        )}
      </div>
    </main>
  );
}

function QuoteCard({
  quote,
  onStatus,
}: {
  quote: QuoteRecord;
  onStatus: (status: (typeof STATUS)[number]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const brand = quote.brand_id as BrandId;
  const brandName = BRANDS[brand]?.name ?? quote.brand_id;

  const download = () => {
    const meta = {
      brandId: brand as "belliz" | "payot",
      brandName,
      customerName: quote.customer_name,
      customerPhone: quote.customer_phone,
      customerCnpj: quote.customer_cnpj,
      createdAt: quote.created_at,
    };
    downloadBlob(buildOrderSheet(quote.items, meta), orderSheetFileName(meta));
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {quote.customer_name}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              · {brandName} · {quote.source === "curva-a" ? "Curva A" : "Catálogo"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(quote.created_at).toLocaleString("pt-BR")} · {quote.customer_phone} ·{" "}
            {quote.customer_cnpj}
          </p>
          <p className="mt-1 text-sm">
            {quote.items_count} itens · {quote.units_count} unidades ·{" "}
            <strong>{brl(Number(quote.total))}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={quote.status}
            onChange={(e) => void onStatus(e.target.value as (typeof STATUS)[number])}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={download}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Planilha
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Ocultar" : "Itens"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">
          {quote.items.map((i) => (
            <div key={i.code} className="flex justify-between gap-3 border-b border-border/50 py-1">
              <span>
                {i.code} · {i.name}
                {i.pack > 1 ? ` · coletivo ${i.pack}` : ""}
              </span>
              <span className="whitespace-nowrap">
                {i.qty} un × {brl(i.unitPrice)} = <strong>{brl(i.qty * i.unitPrice)}</strong>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
