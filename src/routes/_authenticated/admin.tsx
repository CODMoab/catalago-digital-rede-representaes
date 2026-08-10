import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LogOut, Save, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { BRANDS, type BrandId } from "@/lib/catalog";
import {
  applyImport,
  checkAdmin,
  listAdminProducts,
  previewImport,
  updateProduct,
  type ImportRow,
} from "@/lib/catalog.functions";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Painel de preços — Rede Representações" },
      {
        name: "description",
        content:
          "Atualize preços, coletivos e disponibilidade dos produtos Belliz e Payot importando a planilha ou editando item a item.",
      },
      { property: "og:title", content: "Painel de preços — Rede Representações" },
      {
        property: "og:description",
        content: "Base viva do catálogo: importação de planilha e edição item a item.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type AdminProduct = {
  id: string;
  code: string;
  name: string;
  line: string;
  price_unit: number;
  coletivo: number;
  price_coletivo: number | null;
  active: boolean;
  updated_at: string;
};

type Preview = {
  total: number;
  created: string[];
  removed: string[];
  priceChanges: { code: string; name: string; from: number; to: number }[];
  priceChangeCount: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AdminPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkAdmin);
  const list = useServerFn(listAdminProducts);
  const save = useServerFn(updateProduct);
  const preview = useServerFn(previewImport);
  const apply = useServerFn(applyImport);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [brand, setBrand] = useState<BrandId>("belliz");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<ImportRow[] | null>(null);
  const [diff, setDiff] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    check().then((r) => setIsAdmin(r.isAdmin)).catch(() => setIsAdmin(false));
  }, [check]);

  const load = useMemo(
    () => async (b: BrandId, term: string) => {
      setLoading(true);
      try {
        const res = await list({ data: { brand: b, search: term, limit: 100 } });
        setRows(res.rows as unknown as AdminProduct[]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar produtos.");
      } finally {
        setLoading(false);
      }
    },
    [list],
  );

  useEffect(() => {
    if (isAdmin) void load(brand, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, brand]);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSpreadsheet(brand, buffer);
      if (!parsed.length) throw new Error("Nenhum produto encontrado na planilha.");
      const d = await preview({ data: { brand, rows: parsed } });
      setPending(parsed);
      setDiff(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui ler a planilha.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await apply({ data: { brand, rows: pending, deactivateMissing: true } });
      toast.success(`${res.upserted} produtos atualizados · ${res.deactivated} desativados`);
      setPending(null);
      setDiff(null);
      void load(brand, search);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao aplicar a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(row: AdminProduct, patchData: Record<string, unknown>) {
    try {
      await save({ data: { id: row.id, patch: patchData } });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patchData } as AdminProduct : r)));
      toast.success("Produto atualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  if (isAdmin === null) {
    return <main className="p-10 text-sm text-muted-foreground">Carregando painel…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta conta não tem permissão de administrador. Peça a liberação do acesso.
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
          <h1 className="mt-1 text-2xl font-bold">Base viva de preços</h1>
        </div>
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

      <div className="mt-6 flex gap-2">
        {(Object.keys(BRANDS) as BrandId[]).map((b) => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium",
              brand === b ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {BRANDS[b].name}
          </button>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Importar planilha {BRANDS[brand].name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie o Excel mais recente. Mostro a prévia das mudanças antes de aplicar.
          {brand === "belliz" && " Os preços Belliz entram já com o desconto de 15% (preço líquido)."}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="mr-2 h-4 w-4" /> Escolher planilha
          </Button>
        </div>

        {diff && (
          <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium">
              {diff.total} itens na planilha · {diff.priceChangeCount} preços mudam · {diff.created.length} novos ·{" "}
              {diff.removed.length} saem do catálogo
            </p>
            {diff.priceChanges.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                {diff.priceChanges.slice(0, 40).map((c) => (
                  <li key={c.code}>
                    {c.code} · {c.name}: {brl(c.from)} → <strong>{brl(c.to)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={confirmImport} disabled={busy}>
                Aplicar atualização
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPending(null);
                  setDiff(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="busca">Buscar produto</Label>
            <Input
              id="busca"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, código, EAN ou linha"
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(brand, search);
              }}
            />
          </div>
          <Button variant="outline" onClick={() => void load(brand, search)} disabled={loading}>
            Buscar
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((row) => (
            <ProductRow key={row.id} row={row} onSave={patch} />
          ))}
          {!loading && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function ProductRow({
  row,
  onSave,
}: {
  row: AdminProduct;
  onSave: (row: AdminProduct, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(row.price_unit));
  const [coletivo, setColetivo] = useState(String(row.coletivo));

  const dirty = Number(price) !== Number(row.price_unit) || Number(coletivo) !== row.coletivo;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <div className="min-w-[200px] flex-1">
        <p className="text-sm font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">
          {row.code} · {row.line}
        </p>
      </div>
      <div className="w-28">
        <Label className="text-xs">Preço un.</Label>
        <Input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="w-20">
        <Label className="text-xs">Coletivo</Label>
        <Input value={coletivo} inputMode="numeric" onChange={(e) => setColetivo(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={!dirty}
        onClick={() => {
          const p = Number(price.replace(",", "."));
          const c = Math.max(1, Math.round(Number(coletivo)) || 1);
          if (!Number.isFinite(p) || p < 0) {
            toast.error("Preço inválido.");
            return;
          }
          void onSave(row, {
            price_unit: Math.round(p * 100) / 100,
            coletivo: c,
            price_coletivo: Math.round(p * c * 100) / 100,
          });
        }}
      >
        <Save className="mr-1 h-4 w-4" /> Salvar
      </Button>
      <Button
        size="sm"
        variant={row.active ? "outline" : "default"}
        onClick={() => void onSave(row, { active: !row.active })}
      >
        {row.active ? "Desativar" : "Ativar"}
      </Button>
    </div>
  );
}
