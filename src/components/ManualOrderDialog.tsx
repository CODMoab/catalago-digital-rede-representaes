import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  Save,
  UserSearch,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BELLIZ,
  PAYOT,
  BRANDS,
  MIN_ORDER,
  productImage,
  type BrandId,
} from "@/lib/catalog";
import {
  formatCnpj,
  formatPhone,
  onlyDigits,
  getDiscountedPrice,
  DEFAULT_DISCOUNT_PERCENT,
} from "@/lib/leads";
import { findLead } from "@/lib/leads.functions";
import {
  createManualQuote,
  MANUAL_SOURCES,
  type ManualSource,
  type QuoteItem,
} from "@/lib/quotes.functions";
import { buildOrderSheet, downloadBlob, orderSheetFileName } from "@/lib/order-sheet";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Draft = QuoteItem & { packLabel: string };

interface ManualOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function ManualOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: ManualOrderDialogProps) {
  const [brand, setBrand] = useState<BrandId>("belliz");
  const [source, setSource] = useState<ManualSource>("whatsapp");
  const [status, setStatus] = useState<"novo" | "enviado" | "faturado">("novo");

  const [cnpj, setCnpj] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);

  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  const findLeadFn = useServerFn(findLead);
  const createFn = useServerFn(createManualQuote);

  const total = useMemo(
    () => items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    [items],
  );
  const minOrder = MIN_ORDER[brand];

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const src = brand === "belliz" ? BELLIZ : PAYOT;
    return src
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.ean ?? "").includes(q) ||
          p.line.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [search, brand]);

  const reset = () => {
    setItems([]);
    setSearch("");
    setCnpj("");
    setName("");
    setPhone("");
    setStatus("novo");
  };

  const lookupCustomer = async () => {
    const clean = onlyDigits(cnpj) || onlyDigits(phone);
    if (clean.length < 8) {
      toast.error("Informe o CNPJ (ou o WhatsApp) para buscar o cliente.");
      return;
    }
    setSearching(true);
    try {
      const res = await findLeadFn({ data: { identifier: clean } });
      if (res.found && res.customer) {
        setName(res.customer.name);
        setPhone(formatPhone(res.customer.phone));
        setCnpj(formatCnpj(res.customer.cnpj));
        toast.success(`Cliente encontrado: ${res.customer.name}`);
      } else {
        toast.info("Cliente ainda não cadastrado — preencha os dados à mão.");
      }
    } catch {
      toast.error("Não foi possível consultar a base de clientes.");
    } finally {
      setSearching(false);
    }
  };

  const addProduct = (code: string) => {
    if (items.some((i) => i.code === code)) {
      toast.info("Esse produto já está no pedido.");
      return;
    }
    if (brand === "belliz") {
      const p = BELLIZ.find((x) => x.code === code);
      if (!p) return;
      const pack = Math.max(1, p.coletivo || 1);
      const baseUnit = p.priceColetivo ? p.priceColetivo / pack : p.priceUnit;
      setItems((prev) => [
        ...prev,
        {
          code: p.code,
          name: p.name,
          line: p.line ?? "",
          ean: p.ean ?? "",
          pack,
          qty: pack,
          unitPrice: getDiscountedPrice(baseUnit, DEFAULT_DISCOUNT_PERCENT),
          curva: null,
          packLabel: `coletivo de ${pack}`,
        },
      ]);
    } else {
      const p = PAYOT.find((x) => x.code === code);
      if (!p) return;
      setItems((prev) => [
        ...prev,
        {
          code: p.code,
          name: p.name,
          line: p.line ?? "",
          ean: p.ean ?? "",
          pack: 1,
          qty: 1,
          unitPrice: getDiscountedPrice(p.price, DEFAULT_DISCOUNT_PERCENT),
          curva: null,
          packLabel: "unidade",
        },
      ]);
    }
    setSearch("");
  };

  /** Belliz é vendida por coletivo: o campo recebe coletivos e vira unidades. */
  const setPacks = (code: string, packs: number) =>
    setItems((prev) =>
      prev.map((i) =>
        i.code === code
          ? {
              ...i,
              qty: Math.max(1, Math.round(packs)) * (brand === "belliz" ? i.pack : 1),
            }
          : i,
      ),
    );

  const setUnitPrice = (code: string, price: number) =>
    setItems((prev) =>
      prev.map((i) => (i.code === code ? { ...i, unitPrice: Math.max(0, price) } : i)),
    );

  const removeItem = (code: string) =>
    setItems((prev) => prev.filter((i) => i.code !== code));

  const validate = () => {
    if (onlyDigits(cnpj).length !== 14) {
      toast.error("Informe um CNPJ válido (14 dígitos).");
      return false;
    }
    if (name.trim().length < 2) {
      toast.error("Informe o nome da loja / razão social.");
      return false;
    }
    if (onlyDigits(phone).length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return false;
    }
    if (items.length === 0) {
      toast.error("Adicione ao menos 1 produto ao pedido.");
      return false;
    }
    return true;
  };

  const payloadItems = (): QuoteItem[] =>
    items.map(({ packLabel: _packLabel, ...rest }) => ({
      ...rest,
      unitPrice: Math.round(rest.unitPrice * 100) / 100,
    }));

  const sheetMeta = () => ({
    brandId: brand,
    brandName: BRANDS[brand].name,
    customerName: name.trim(),
    customerPhone: phone,
    customerCnpj: cnpj,
  });

  const save = async (alsoDownload: boolean) => {
    if (!validate()) return;
    setSaving(true);
    try {
      await createFn({
        data: {
          brand_id: brand,
          source,
          customer_name: name.trim(),
          customer_phone: phone,
          customer_cnpj: cnpj,
          items: payloadItems(),
          status,
        },
      });
      if (alsoDownload) {
        const meta = sheetMeta();
        downloadBlob(buildOrderSheet(payloadItems(), meta), orderSheetFileName(meta));
      }
      toast.success(`Pedido ${BRANDS[brand].name} registrado.`, {
        description: `${items.length} produto(s) · ${brl(total)} · origem ${MANUAL_SOURCES[source]}.`,
      });
      reset();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível registrar o pedido.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[95vw] max-w-3xl overflow-y-auto p-0">
        <div className="border-b border-border bg-muted/40 px-6 py-4">
          <h2 className="text-lg font-bold tracking-tight">Lançar pedido recebido</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Para pedidos que chegaram por fora do catálogo. Fica no mesmo padrão dos
            demais: sai na planilha da indústria e é rastreável pelo CNPJ.
          </p>
        </div>

        <div className="space-y-5 p-6">
          {/* Marca, origem e situação */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs font-semibold">Marca *</Label>
              <div className="mt-1 flex gap-1">
                {(["belliz", "payot"] as const).map((b) => (
                  <Button
                    key={b}
                    type="button"
                    size="sm"
                    variant={brand === b ? "default" : "outline"}
                    className="flex-1 text-xs"
                    onClick={() => {
                      setBrand(b);
                      setItems([]);
                    }}
                  >
                    {BRANDS[b].name}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="mo-source" className="text-xs font-semibold">
                Chegou por *
              </Label>
              <select
                id="mo-source"
                value={source}
                onChange={(e) => setSource(e.target.value as ManualSource)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm"
              >
                {Object.entries(MANUAL_SOURCES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="mo-status" className="text-xs font-semibold">
                Situação
              </Label>
              <select
                id="mo-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm"
              >
                <option value="novo">Novo</option>
                <option value="enviado">Enviado à indústria</option>
                <option value="faturado">Faturado</option>
              </select>
            </div>
          </div>

          {/* Cliente */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cliente
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="mo-cnpj" className="text-xs font-semibold">
                    CNPJ *
                  </Label>
                  <Input
                    id="mo-cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="mo-name" className="text-xs font-semibold">
                    Loja / Razão Social *
                  </Label>
                  <Input
                    id="mo-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Supermercado Central"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="mo-phone" className="text-xs font-semibold">
                    WhatsApp *
                  </Label>
                  <Input
                    id="mo-phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(71) 98888-7777"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={lookupCustomer}
                  disabled={searching}
                  className="gap-1.5 text-xs"
                >
                  <UserSearch className="size-3.5" />
                  {searching ? "Buscando…" : "Buscar cadastro"}
                </Button>
              </div>
            </div>
          </div>

          {/* Produtos */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Produtos {BRANDS[brand].name}
            </p>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, código ou EAN…"
                className="pl-9"
              />
              {results.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  {results.map((p) => {
                    const img = productImage(brand, p.code);
                    const unit =
                      "price" in p
                        ? p.price
                        : p.priceColetivo
                          ? p.priceColetivo / Math.max(1, p.coletivo || 1)
                          : p.priceUnit;
                    return (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => addProduct(p.code)}
                        className="flex w-full items-center gap-3 border-b border-border/60 p-2 text-left last:border-0 hover:bg-muted/60"
                      >
                        <div className="size-10 shrink-0 overflow-hidden rounded bg-white">
                          {img && (
                            <img
                              src={img}
                              alt={p.name}
                              loading="lazy"
                              className="size-full object-contain"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            [{p.code}] {p.line} ·{" "}
                            {brl(getDiscountedPrice(unit, DEFAULT_DISCOUNT_PERCENT))} un
                          </p>
                        </div>
                        <Plus className="size-4 shrink-0 text-primary" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Nenhum produto ainda. Busque acima e clique para adicionar.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {items.map((i) => (
                  <div
                    key={i.code}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{i.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        [{i.code}] · {i.packLabel} · {i.qty} un
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">
                          {brand === "belliz" ? "Coletivos" : "Unidades"}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={brand === "belliz" ? i.qty / i.pack : i.qty}
                          onChange={(e) => setPacks(i.code, Number(e.target.value))}
                          className="h-8 w-20 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">
                          Preço un.
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={i.unitPrice}
                          onChange={(e) => setUnitPrice(i.code, Number(e.target.value))}
                          className="h-8 w-24 text-sm"
                        />
                      </div>
                      <div className="w-24 text-right">
                        <Label className="text-[10px] text-muted-foreground">Total</Label>
                        <p className="text-sm font-bold">{brl(i.qty * i.unitPrice)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(i.code)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total e aviso de mínimo */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4",
              total >= minOrder
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-muted/40",
            )}
          >
            <div>
              <p className="text-xs text-muted-foreground">
                Total do pedido · {items.length} produto(s)
              </p>
              <p className="text-2xl font-bold text-primary">{brl(total)}</p>
            </div>
            {items.length > 0 && total < minOrder && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="size-4" />
                Abaixo do mínimo da marca ({brl(minOrder)}) — dá para registrar assim mesmo.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1 gap-2 font-bold"
              size="lg"
              disabled={saving}
              onClick={() => save(true)}
            >
              <FileSpreadsheet className="size-4" />
              {saving ? "Salvando…" : "Salvar e baixar planilha"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              disabled={saving}
              onClick={() => save(false)}
            >
              <Save className="size-4" /> Só salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
