import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  FileDown,
  MessageCircle,

  X,
  Search,
  ArrowLeft,
  Sparkles,
  Package,
  BarChart3,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  BELLIZ,
  productImage,
  PAYOT,
  BRANDS,
  WHATSAPP_NUMBER,
  REP_NAME,
  type BrandId,
} from "@/lib/catalog";
import {
  buildQuotePdf,
  downloadPdf,
  quoteFileName,
  shareQuotePdf,
  type QuoteLine,
  type QuoteMeta,
} from "@/lib/quote-pdf";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { CatalogGallery } from "@/components/CatalogGallery";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Catálogo Belliz & Payot — Pedido por WhatsApp" },
      {
        name: "description",
        content:
          "Catálogo oficial das marcas Belliz (Ricca, Enox, Kess, Vertix) e Payot. Monte seu pedido e envie direto pelo WhatsApp.",
      },
      { property: "og:title", content: "Catálogo Belliz & Payot" },
      {
        property: "og:description",
        content:
          "Monte seu pedido das marcas Belliz e Payot e receba o orçamento no WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogPage,
});

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Cart = {
  belliz: Record<string, number>; // code -> qty (múltiplos do coletivo)
  payot: Record<string, number>;
};

const emptyCart: Cart = { belliz: {}, payot: {} };

function CatalogPage() {
  const [activeBrand, setActiveBrand] = useState<BrandId | null>(null);
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [openQuote, setOpenQuote] = useState<BrandId | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", notes: "" });

  const totals = useMemo(() => {
    const bellizItems = Object.entries(cart.belliz);
    const payotItems = Object.entries(cart.payot);
    let bellizTotal = 0;
    let bellizCount = 0;
    for (const [code, qty] of bellizItems) {
      const p = BELLIZ.find((x) => x.code === code);
      if (!p) continue;
      bellizCount += qty;
      const unit = p.priceColetivo && p.coletivo ? p.priceColetivo / p.coletivo : p.priceUnit;
      bellizTotal += unit * qty;
    }
    let payotTotal = 0;
    let payotCount = 0;
    for (const [code, qty] of payotItems) {
      const p = PAYOT.find((x) => x.code === code);
      if (!p) continue;
      payotCount += qty;
      payotTotal += p.price * qty;
    }
    return {
      belliz: { count: bellizCount, total: bellizTotal, items: bellizItems.length },
      payot: { count: payotCount, total: payotTotal, items: payotItems.length },
      all: bellizCount + payotCount,
    };
  }, [cart]);

  const setQty = (brand: BrandId, code: string, qty: number) => {
    setCart((prev) => {
      const map = { ...prev[brand] };
      if (qty <= 0) delete map[code];
      else map[code] = qty;
      return { ...prev, [brand]: map };
    });
  };

  const collectLines = (brand: BrandId): QuoteLine[] => {
    const out: QuoteLine[] = [];
    if (brand === "belliz") {
      for (const [code, qty] of Object.entries(cart.belliz)) {
        const p = BELLIZ.find((x) => x.code === code);
        if (!p) continue;
        const unit =
          p.priceColetivo && p.coletivo ? p.priceColetivo / p.coletivo : p.priceUnit;
        out.push({
          brand: BRANDS.belliz.name,
          code: p.code,
          name: p.name,
          line: p.line,
          pack: p.coletivo || 1,
          qty,
          unitPrice: unit,
        });
      }
    } else {
      for (const [code, qty] of Object.entries(cart.payot)) {
        const p = PAYOT.find((x) => x.code === code);
        if (!p) continue;
        out.push({
          brand: BRANDS.payot.name,
          code: p.code,
          name: p.name,
          line: p.line,
          pack: 1,
          qty,
          unitPrice: p.price,
        });
      }
    }
    return out;
  };

  const prepare = (brand: BrandId) => {
    if (!customer.name.trim()) {
      toast.error("Informe seu nome antes de enviar.");
      return null;
    }
    const lines = collectLines(brand);
    if (lines.length === 0) {
      toast.error("Adicione ao menos 1 produto.");
      return null;
    }
    const meta: QuoteMeta = {
      title: `Pedido — ${BRANDS[brand].name}`,
      customerName: customer.name.trim(),
      customerPhone: customer.phone,
      notes: customer.notes,
    };
    const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    return { lines, meta, total, blob: buildQuotePdf(lines, meta), fileName: quoteFileName(meta) };
  };

  const downloadQuote = (brand: BrandId) => {
    const data = prepare(brand);
    if (!data) return;
    downloadPdf(data.blob, data.fileName);
    toast.success("PDF do pedido baixado.");
  };

  const sendQuote = async (brand: BrandId) => {
    const data = prepare(brand);
    if (!data) return;
    const msg =
      `*Novo pedido — ${BRANDS[brand].name}*\n` +
      `Cliente: ${customer.name}\n` +
      (customer.phone ? `Telefone: ${customer.phone}\n` : "") +
      `Itens: ${data.lines.length} · Total estimado: ${currency(data.total)}\n` +
      `Detalhamento completo no PDF em anexo.`;
    const result = await shareQuotePdf(data.blob, data.fileName, msg);
    toast.success(
      result === "shared"
        ? "Escolha o WhatsApp para enviar o PDF."
        : "PDF baixado — anexe no WhatsApp que abrimos para você.",
    );
  };


  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader
        totals={totals}
        cart={cart}
        setQty={setQty}
        setOpenQuote={setOpenQuote}
        activeBrand={activeBrand}
        setActiveBrand={setActiveBrand}
      />

      {activeBrand === null ? (
        <LandingView setActiveBrand={setActiveBrand} totals={totals} />
      ) : (
        <BrandView
          brand={activeBrand}
          cart={cart}
          setQty={setQty}
          totals={totals}
          onOpenQuote={() => setOpenQuote(activeBrand)}
        />
      )}

      <SiteFooter />

      <QuoteDrawer
        open={openQuote}
        onClose={() => setOpenQuote(null)}
        cart={cart}
        setQty={setQty}
        totals={totals}
        customer={customer}
        setCustomer={setCustomer}
        onSend={sendQuote}
        onDownload={downloadQuote}
      />
    </div>
  );
}

/* ---------------- Header ---------------- */

function SiteHeader({
  totals,
  cart,
  setQty,
  setOpenQuote,
  activeBrand,
  setActiveBrand,
}: {
  totals: {
    belliz: { count: number; total: number; items: number };
    payot: { count: number; total: number; items: number };
    all: number;
  };
  cart: Cart;
  setQty: (brand: BrandId, code: string, qty: number) => void;
  setOpenQuote: (b: BrandId | null) => void;
  activeBrand: BrandId | null;
  setActiveBrand: (b: BrandId | null) => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <button
          onClick={() => setActiveBrand(null)}
          className="flex items-center gap-2 text-left"
        >
          <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">Catálogo</p>
            <p className="text-[11px] text-muted-foreground">{REP_NAME}</p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {activeBrand && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setActiveBrand(null)}
            >
              <ArrowLeft className="mr-1 size-4" /> Marcas
            </Button>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ShoppingBag className="size-4" />
                <span className="hidden sm:inline">Meus pedidos</span>
                {totals.all > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {totals.all}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Pedidos em andamento</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                {(["belliz", "payot"] as const).map((b) => {
                  const t = totals[b];
                  if (t.count === 0) return null;
                  return (
                    <div
                      key={b}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{BRANDS[b].name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.items} produtos · {t.count} unid ·{" "}
                            {currency(t.total)}
                          </p>
                        </div>
                        <Button size="sm" onClick={() => setOpenQuote(b)}>
                          Enviar
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {totals.all === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Você ainda não adicionou produtos. Escolha uma marca para
                    começar.
                  </p>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Landing ---------------- */

function LandingView({
  setActiveBrand,
  totals,
}: {
  setActiveBrand: (b: BrandId) => void;
  totals: {
    belliz: { count: number; total: number; items: number };
    payot: { count: number; total: number; items: number };
  };
}) {
  return (
    <>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Catálogo oficial
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
            As marcas <span className="text-primary">Belliz</span> e{" "}
            <span className="text-primary">Payot</span>,
            <br className="hidden sm:block" /> na palma da sua mão.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Monte seu pedido de cada marca e envie direto para o WhatsApp.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Dentro de cada marca você também encontra o{" "}
            <span className="font-semibold text-foreground">
              plano de sortimento Curva A
            </span>
            : a Rede Representações desenha com você o mix de maior giro dentro
            da verba, marca a marca.
          </p>
        </div>
      </section>


      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {(["belliz", "payot"] as const).map((b) => {
            const brand = BRANDS[b];
            const count = b === "belliz" ? BELLIZ.length : PAYOT.length;
            const t = totals[b];
            return (
              <button
                key={b}
                onClick={() => setActiveBrand(b)}
                className={cn(
                  "group flex flex-col rounded-2xl border border-border bg-card p-8 text-left transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                    <Package className="size-3" /> {count} produtos
                  </span>
                  {t.count > 0 && (
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      {t.count} no pedido
                    </span>
                  )}
                </div>
                <h2 className="mt-6 text-4xl font-bold tracking-tight">
                  {brand.name}
                </h2>
                <p className="mt-1 text-sm font-medium text-primary">
                  {brand.tagline}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  {brand.description}
                </p>
                <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Ver catálogo
                  <ArrowLeft className="size-4 rotate-180 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ---------------- Brand view ---------------- */

function BrandView({
  brand,
  cart,
  setQty,
  totals,
  onOpenQuote,
}: {
  brand: BrandId;
  cart: Cart;
  setQty: (brand: BrandId, code: string, qty: number) => void;
  totals: {
    belliz: { count: number; total: number; items: number };
    payot: { count: number; total: number; items: number };
  };
  onOpenQuote: () => void;
}) {
  const info = BRANDS[brand];
  const [search, setSearch] = useState("");
  const [line, setLine] = useState<string>("Todas");
  const [limit, setLimit] = useState(60);

  const allLines = useMemo(() => {
    const src = brand === "belliz" ? BELLIZ : PAYOT;
    const set = new Set<string>();
    for (const p of src) set.add(p.line);
    return ["Todas", ...Array.from(set).sort()];
  }, [brand]);

  const filtered = useMemo(() => {
    const src = brand === "belliz" ? BELLIZ : PAYOT;
    const q = search.trim().toLowerCase();
    return src.filter((p) => {
      if (line !== "Todas" && p.line !== line) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.line.toLowerCase().includes(q)
      );
    });
  }, [brand, search, line]);

  const visible = filtered.slice(0, limit);
  const t = totals[brand];

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Marca
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">{info.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{info.tagline}</p>
        </div>
        <Button
          size="lg"
          className="gap-2"
          onClick={onOpenQuote}
          disabled={t.count === 0}
        >
          <MessageCircle className="size-4" />
          Enviar pedido {t.count > 0 && `(${currency(t.total)})`}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="max-w-xl">
          <p className="text-sm font-semibold">
            Plano de sortimento Curva A · {info.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A Rede Representações monta com você o mix {info.name} de maior giro
            dentro da sua verba, distribuído em curva ABC. Cada plano é exclusivo
            desta marca — sem misturar indústrias no mesmo pedido.
          </p>
        </div>
        <Button asChild size="lg" className="gap-2">
          <Link to="/curva-a" search={{ marca: brand }}>
            <BarChart3 className="size-4" />
            Montar meu plano {info.name}
          </Link>
        </Button>
      </div>

      {brand === "payot" && <CatalogGallery />}

      {/* Filters */}
      <div className="sticky top-[57px] z-30 -mx-4 mb-6 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(60);
            }}
            placeholder="Buscar por nome, código ou linha…"
            className="pl-9"
          />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {allLines.map((l) => (
            <button
              key={l}
              onClick={() => {
                setLine(l);
                setLimit(60);
              }}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                line === l
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              {formatLine(l)}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        {filtered.length} produtos {line !== "Todas" && `em ${formatLine(line)}`}
      </p>

      {brand === "belliz" && (
        <p className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
          <strong>Venda por coletivo:</strong> as quantidades são múltiplas da
          embalagem coletiva de cada item (indicado no card).
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <ProductCard
            key={p.code}
            brand={brand}
            product={p}
            qty={cart[brand][p.code] ?? 0}
            setQty={(q) => setQty(brand, p.code, q)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </div>
      )}

      {visible.length < filtered.length && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + 60)}>
            Carregar mais ({filtered.length - visible.length} restantes)
          </Button>
        </div>
      )}
    </section>
  );
}

function formatLine(l: string) {
  if (l === "Todas") return "Todas as linhas";
  return l
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------------- Product card ---------------- */

type AnyProduct =
  | (import("@/lib/catalog").BellizProduct & { _kind?: "belliz" })
  | (import("@/lib/catalog").PayotProduct & { _kind?: "payot" });

function ProductCard({
  brand,
  product,
  qty,
  setQty,
}: {
  brand: BrandId;
  product: AnyProduct;
  qty: number;
  setQty: (q: number) => void;
}) {
  const isBelliz = brand === "belliz";
  const p = product as any;
  const img = productImage(brand, p.code);

  const coletivo = isBelliz ? Math.max(1, p.coletivo || 1) : 1;
  const unitPrice = isBelliz
    ? p.priceColetivo && p.coletivo
      ? p.priceColetivo / p.coletivo
      : p.priceUnit
    : p.price;

  const step = coletivo;
  const inc = () => setQty(qty === 0 ? step : qty + step);
  const dec = () => setQty(Math.max(0, qty - step));

  return (
    <article className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md">
      <div className="mb-3 flex h-40 items-center justify-center overflow-hidden rounded-lg bg-white">
        {img ? (
          <img
            src={img}
            alt={p.name}
            loading="lazy"
            className="h-40 w-full object-contain transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : (
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            sem foto
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
          {formatLine(p.line)}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground">
          #{p.code}
        </span>
      </div>


      <h3 className="mt-3 line-clamp-2 min-h-[2.75rem] text-sm font-semibold leading-snug">
        {p.name}
      </h3>

      <div className="mt-3 flex items-end justify-between">
        <div>
          {isBelliz ? (
            <>
              <p className="text-lg font-bold text-primary">
                {currency(p.priceColetivo ?? p.priceUnit * coletivo)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                coletivo com {coletivo} un · {currency(unitPrice)} / unidade
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-primary">{currency(unitPrice)}</p>
              {p.priceFull && p.priceFull > p.price ? (
                <p className="text-[11px] text-muted-foreground line-through">
                  {currency(p.priceFull)}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">preço unitário</p>
              )}
            </>
          )}
        </div>
      </div>


      <div className="mt-4">
        {qty === 0 ? (
          <Button size="sm" className="w-full" onClick={inc}>
            <Plus className="mr-1 size-4" />
            {isBelliz ? `Adicionar ${coletivo} un` : "Adicionar"}
          </Button>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-border">
            <Button variant="ghost" size="icon" onClick={dec}>
              <Minus className="size-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-bold leading-none">{qty}</p>
              <p className="text-[10px] text-muted-foreground">
                {isBelliz ? `${qty / coletivo}x coletivo` : "unidades"}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={inc}>
              <Plus className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------------- Quote drawer ---------------- */

function QuoteDrawer({
  open,
  onClose,
  cart,
  setQty,
  totals,
  customer,
  setCustomer,
  onSend,
  onDownload,
}: {
  open: BrandId | null;
  onClose: () => void;
  cart: Cart;
  setQty: (brand: BrandId, code: string, qty: number) => void;
  totals: {
    belliz: { count: number; total: number; items: number };
    payot: { count: number; total: number; items: number };
  };
  customer: { name: string; phone: string; notes: string };
  setCustomer: (v: { name: string; phone: string; notes: string }) => void;
  onSend: (b: BrandId) => void;
  onDownload: (b: BrandId) => void;
}) {
  const brand = open;
  if (!brand) return (
    <Sheet open={false} onOpenChange={() => onClose()}>
      <SheetContent />
    </Sheet>
  );
  const info = BRANDS[brand];
  const t = totals[brand];
  const entries = Object.entries(cart[brand]);

  return (
    <Sheet open={!!brand} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Pedido — {info.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex h-[calc(100vh-8rem)] flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum produto adicionado.
              </p>
            )}
            {entries.map(([code, qty]) => {
              const p =
                brand === "belliz"
                  ? BELLIZ.find((x) => x.code === code)
                  : PAYOT.find((x) => x.code === code);
              if (!p) return null;
              const unit =
                brand === "belliz"
                  ? (p as any).priceColetivo && (p as any).coletivo
                    ? (p as any).priceColetivo / (p as any).coletivo
                    : (p as any).priceUnit
                  : (p as any).price;
              const coletivo = brand === "belliz" ? (p as any).coletivo || 1 : 1;
              return (
                <div
                  key={code}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs font-mono text-muted-foreground">
                        #{p.code}
                      </p>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {qty} un × {currency(unit)} ={" "}
                        <span className="font-semibold text-foreground">
                          {currency(unit * qty)}
                        </span>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQty(brand, code, 0)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() =>
                        setQty(brand, code, Math.max(0, qty - coletivo))
                      }
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-14 text-center text-sm font-semibold">
                      {qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setQty(brand, code, qty + coletivo)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {entries.length > 0 && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="flex justify-between">
                  <span>Unidades</span>
                  <span>{t.count}</span>
                </div>
                <div className="mt-1 flex justify-between text-base font-bold">
                  <span>Total estimado</span>
                  <span className="text-primary">{currency(t.total)}</span>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <div>
                <Label htmlFor="name">Seu nome / loja *</Label>
                <Input
                  id="name"
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({ ...customer, name: e.target.value })
                  }
                  placeholder="Ex: Loja da Ana"
                  maxLength={100}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                  placeholder="(71) 9 9999-9999"
                  maxLength={30}
                />
              </div>
              <div>
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={customer.notes}
                  onChange={(e) =>
                    setCustomer({ ...customer, notes: e.target.value })
                  }
                  placeholder="Prazo, endereço, condições de pagamento…"
                  maxLength={500}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                <X className="mr-1 size-4" /> Fechar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => onSend(brand)}
                disabled={entries.length === 0}
              >
                <MessageCircle className="size-4" />
                Enviar PDF no WhatsApp
              </Button>
            </div>
            <Button
              variant="ghost"
              className="mt-2 w-full gap-2"
              onClick={() => onDownload(brand)}
              disabled={entries.length === 0}
            >
              <FileDown className="size-4" /> Baixar pedido em PDF
            </Button>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              No celular o WhatsApp abre já com o PDF anexado; no computador o PDF é
              baixado para você anexar.
            </p>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Footer ---------------- */

function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            © {new Date().getFullYear()} {REP_NAME}. Belliz & Payot.
          </p>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary"
          >
            <MessageCircle className="size-4" />
            WhatsApp comercial
          </a>
        </div>
      </div>
    </footer>
  );
}
