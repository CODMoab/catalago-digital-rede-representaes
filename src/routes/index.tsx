import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  FileDown,
  FileSpreadsheet,
  MessageCircle,
  X,
  Search,
  ArrowLeft,
  Sparkles,
  Package,
  BarChart3,
  Gift,
  Tag,
  CheckCircle2,
  Lock,
  MapPin,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  MIN_ORDER,
  WHATSAPP_NUMBER,
  REP_NAME,
  applyCatalog,
  type BrandId,
} from "@/lib/catalog";
import { getCatalog } from "@/lib/catalog.functions";
import { submitQuote, type QuoteItem } from "@/lib/quotes.functions";
import { buildOrderSheet, downloadBlob, orderSheetFileName } from "@/lib/order-sheet";
import {
  buildQuotePdf,
  downloadPdf,
  quoteFileName,
  shareQuotePdf,
  onlyDigits,
  formatCnpj,
  type QuoteLine,
  type QuoteMeta,
} from "@/lib/quote-pdf";
import {
  getLocalCustomer,
  saveLocalCustomer,
  getDiscountedPrice,
  formatPhone,
  DEFAULT_DISCOUNT_PERCENT,
  COVERAGE_NOTICE,
  type CustomerProfile,
} from "@/lib/leads";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { findLeadByToken } from "@/lib/leads.functions";
import { supabase } from "@/integrations/supabase/client";

import { cn } from "@/lib/utils";
import { CatalogGallery } from "@/components/CatalogGallery";
import { WelcomeGateModal } from "@/components/WelcomeGateModal";

export const Route = createFileRoute("/")({
  loader: async () => {
    const { rows } = await getCatalog();
    applyCatalog(rows);
    return null;
  },
  head: () => ({
    meta: [
      { title: "Catálogo Belliz & Payot — Peça seu orçamento" },
      {
        name: "description",
        content:
          "Catálogo oficial das marcas Belliz (Ricca, Enox, Kess, Vertix) e Payot. Monte seu pedido e gere o orçamento para envio.",
      },
      { property: "og:title", content: "Catálogo Belliz & Payot" },
      {
        property: "og:description",
        content:
          "Monte seu pedido das marcas Belliz e Payot e gere o orçamento para envio.",
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
  const [customer, setCustomer] = useState({ name: "", phone: "", cnpj: "" });
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // Canal de entrada do modal: escolha, primeiro acesso (roleta) ou login de cliente
  const [welcomeView, setWelcomeView] = useState<"choice" | "register" | "login">("choice");
  const save = useServerFn(submitQuote);

  const openWelcome = (view: "choice" | "register" | "login" = "choice") => {
    setWelcomeView(view);
    setWelcomeOpen(true);
  };

  const findByToken = useServerFn(findLeadByToken);

  /**
   * Quem está entrando, na ordem do que dá menos trabalho para o cliente:
   *   1. link pessoal (?c=...) — entra reconhecido sem digitar nada;
   *   2. cadastro já feito neste navegador;
   *   3. representante logado — não é cliente, não vê a portaria;
   *   4. visitante novo — aí sim a tela de escolha.
   */
  useEffect(() => {
    let vivo = true;

    const entrar = (prof: CustomerProfile) => {
      setCustomerProfile(prof);
      setCustomer({
        name: prof.name,
        phone: formatPhone(prof.phone),
        cnpj: formatCnpj(prof.cnpj),
      });
    };

    void (async () => {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("c");
      if (token) {
        // Tira o token da barra de endereço: link é coisa que se encaminha.
        url.searchParams.delete("c");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        try {
          const res = await findByToken({ data: { token } });
          if (!vivo) return;
          if (res.found) {
            const prof = res.customer as CustomerProfile;
            saveLocalCustomer(prof);
            entrar(prof);
            toast.success(`Bem-vindo de volta, ${prof.name.split(" ")[0]}!`);
            return;
          }
        } catch {
          // Link velho ou torto: segue como visitante comum.
        }
      }

      const saved = getLocalCustomer();
      if (saved) {
        if (vivo) entrar(saved);
        return;
      }

      // O representante entra no catálogo para conferir preço e foto, não para
      // se cadastrar. Se há sessão aberta, a portaria não aparece.
      try {
        const { data } = await supabase.auth.getSession();
        if (!vivo) return;
        if (data.session) return;
      } catch {
        // Sem resposta do login: trata como visitante.
      }

      if (vivo) openWelcome("choice");
    })();

    return () => {
      vivo = false;
    };
  }, [findByToken]);

  const handleCustomerReady = (prof: CustomerProfile | null) => {
    setCustomerProfile(prof);
    if (prof) {
      setCustomer({
        name: prof.name,
        phone: formatPhone(prof.phone),
        cnpj: formatCnpj(prof.cnpj),
      });
    } else {
      setCustomer({ name: "", phone: "", cnpj: "" });
    }
  };

  const discountPercent = customerProfile?.discountPercent || DEFAULT_DISCOUNT_PERCENT;

  const totals = useMemo(() => {
    const bellizItems = Object.entries(cart.belliz);
    const payotItems = Object.entries(cart.payot);
    let bellizTotal = 0;
    let bellizOriginal = 0;
    let bellizCount = 0;
    for (const [code, qty] of bellizItems) {
      const p = BELLIZ.find((x) => x.code === code);
      if (!p) continue;
      bellizCount += qty;
      const baseUnit = p.priceColetivo && p.coletivo ? p.priceColetivo / p.coletivo : p.priceUnit;
      const discountedUnit = getDiscountedPrice(baseUnit, discountPercent);
      bellizTotal += discountedUnit * qty;
      bellizOriginal += baseUnit * qty;
    }
    let payotTotal = 0;
    let payotOriginal = 0;
    let payotCount = 0;
    for (const [code, qty] of payotItems) {
      const p = PAYOT.find((x) => x.code === code);
      if (!p) continue;
      payotCount += qty;
      const baseUnit = p.price;
      const discountedUnit = getDiscountedPrice(baseUnit, discountPercent);
      payotTotal += discountedUnit * qty;
      payotOriginal += baseUnit * qty;
    }
    return {
      belliz: { count: bellizCount, total: bellizTotal, original: bellizOriginal, items: bellizItems.length },
      payot: { count: payotCount, total: payotTotal, original: payotOriginal, items: payotItems.length },
      all: bellizCount + payotCount,
    };
  }, [cart, discountPercent]);

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
        const baseUnit =
          p.priceColetivo && p.coletivo ? p.priceColetivo / p.coletivo : p.priceUnit;
        const unit = getDiscountedPrice(baseUnit, discountPercent);
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
        const unit = getDiscountedPrice(p.price, discountPercent);
        out.push({
          brand: BRANDS.payot.name,
          code: p.code,
          name: p.name,
          line: p.line,
          pack: 1,
          qty,
          unitPrice: unit,
        });
      }
    }
    return out;
  };

  const collectItems = (brand: BrandId): QuoteItem[] => {
    const src = brand === "belliz" ? BELLIZ : PAYOT;
    return Object.entries(cart[brand]).flatMap(([code, qty]) => {
      const p = src.find((x) => x.code === code) as any;
      if (!p) return [];
      const pack = brand === "belliz" ? Math.max(1, p.coletivo || 1) : 1;
      const baseUnit =
        brand === "belliz"
          ? p.priceColetivo && p.coletivo
            ? p.priceColetivo / p.coletivo
            : p.priceUnit
          : p.price;
      const unit = getDiscountedPrice(baseUnit, discountPercent);
      return [
        {
          code: p.code,
          name: p.name,
          line: p.line ?? "",
          ean: p.ean ?? "",
          pack,
          qty,
          unitPrice: Math.round(unit * 100) / 100,
          curva: null,
        } satisfies QuoteItem,
      ];
    });
  };

  const prepare = (brand: BrandId) => {
    if (!customer.name.trim()) {
      toast.error("Informe seu nome / loja antes de enviar.");
      return null;
    }
    if (onlyDigits(customer.phone).length < 10) {
      toast.error("Informe um telefone / WhatsApp válido.");
      return null;
    }
    if (onlyDigits(customer.cnpj).length !== 14) {
      toast.error("Informe um CNPJ válido (14 dígitos).");
      return null;
    }
    const lines = collectLines(brand);
    if (lines.length === 0) {
      toast.error("Adicione ao menos 1 produto.");
      return null;
    }
    const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const min = MIN_ORDER[brand];
    if (total < min) {
      toast.error(`Pedido mínimo ${BRANDS[brand].name}: ${currency(min)}.`, {
        description: `Faltam ${currency(min - total)} para fechar este pedido.`,
      });
      return null;
    }
    const meta: QuoteMeta = {
      title: `Pedido — ${BRANDS[brand].name}`,
      customerName: customer.name.trim(),
      customerPhone: customer.phone,
      customerCnpj: customer.cnpj,
    };
    return {
      lines,
      items: collectItems(brand),
      meta,
      total,
      blob: buildQuotePdf(lines, meta),
      fileName: quoteFileName(meta),
    };
  };

  const record = async (brand: BrandId, items: QuoteItem[]) => {
    try {
      await save({
        data: {
          brand_id: brand,
          source: "catalogo" as const,
          customer_name: customer.name.trim(),
          customer_phone: customer.phone,
          customer_cnpj: customer.cnpj,
          items,
        },
      });
    } catch {
      /* o pedido segue pelo WhatsApp mesmo se o registro falhar */
    }
  };

  const downloadQuote = (brand: BrandId) => {
    const data = prepare(brand);
    if (!data) return;
    downloadPdf(data.blob, data.fileName);
    void record(brand, data.items);
    toast.success("PDF do pedido baixado.");
  };

  const downloadSheet = (brand: BrandId) => {
    const data = prepare(brand);
    if (!data) return;
    const meta = {
      brandId: brand,
      brandName: BRANDS[brand].name,
      customerName: customer.name.trim(),
      customerPhone: customer.phone,
      customerCnpj: customer.cnpj,
    };
    downloadBlob(buildOrderSheet(data.items, meta), orderSheetFileName(meta));
    void record(brand, data.items);
    toast.success("Planilha do pedido baixada no padrão da marca.");
  };

  const sendQuote = async (brand: BrandId) => {
    const data = prepare(brand);
    if (!data) return;
    void record(brand, data.items);
    const msg =
      `*Novo pedido — ${BRANDS[brand].name}*\n` +
      `Cliente: ${customer.name}\n` +
      `Telefone: ${customer.phone}\n` + `CNPJ: ${customer.cnpj}\n` +
      `Itens: ${data.lines.length} · Total estimado: ${currency(data.total)} (com ${discountPercent}% OFF)\n` +
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
        customerProfile={customerProfile}
        onOpenWelcome={openWelcome}
        discountPercent={discountPercent}
      />

      {/* Catálogo das marcas só abre para quem está identificado (cadastro ou login) */}
      {activeBrand === null || !customerProfile ? (
        <LandingView
          setActiveBrand={setActiveBrand}
          totals={totals}
          customerProfile={customerProfile}
          onOpenWelcome={openWelcome}
          discountPercent={discountPercent}
        />
      ) : (
        <BrandView
          brand={activeBrand}
          cart={cart}
          setQty={setQty}
          totals={totals}
          onOpenQuote={() => setOpenQuote(activeBrand)}
          discountPercent={discountPercent}
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
        onDownloadSheet={downloadSheet}
        discountPercent={discountPercent}
      />

      <WelcomeGateModal
        open={welcomeOpen}
        onOpenChange={setWelcomeOpen}
        onCustomerReady={handleCustomerReady}
        currentCustomer={customerProfile}
        initialView={welcomeView}
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
  customerProfile,
  onOpenWelcome,
  discountPercent,
}: {
  totals: {
    belliz: { count: number; total: number; original?: number; items: number };
    payot: { count: number; total: number; original?: number; items: number };
    all: number;
  };
  cart: Cart;
  setQty: (brand: BrandId, code: string, qty: number) => void;
  setOpenQuote: (b: BrandId | null) => void;
  activeBrand: BrandId | null;
  setActiveBrand: (b: BrandId | null) => void;
  customerProfile: CustomerProfile | null;
  onOpenWelcome: (view?: "choice" | "register" | "login") => void;
  discountPercent: number;
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
          {/* Identificação do Cliente / Roleta */}
          {customerProfile ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenWelcome("choice")}
              className="gap-1.5 border-primary/30 bg-primary/5 text-xs hover:bg-primary/10 font-semibold text-foreground"
            >
              <Gift className="size-3.5 text-primary" />
              <span className="hidden md:inline max-w-[120px] truncate">
                {customerProfile.name}
              </span>
              <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-primary-foreground">
                {discountPercent}% OFF
              </span>
            </Button>
          ) : (
            /* Topo fica só com o login; o primeiro acesso mora no botão da home */
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenWelcome("login")}
              className="gap-1.5 text-xs font-semibold"
            >
              <Lock className="size-3.5" /> Já sou cliente
            </Button>
          )}

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
              <div className="mt-4 max-h-[calc(100vh-8rem)] space-y-5 overflow-y-auto pr-1">
                {(["belliz", "payot"] as const).map((b) => {
                  const t = totals[b];
                  if (t.count === 0) return null;
                  const entries = Object.entries(cart[b]);
                  return (
                    <div
                      key={b}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{BRANDS[b].name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.items} produtos · {t.count} unid
                          </p>
                        </div>
                        <Button size="sm" onClick={() => setOpenQuote(b)}>
                          Enviar
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {entries.map(([code, qty]) => {
                          const p =
                            b === "belliz"
                              ? BELLIZ.find((x) => x.code === code)
                              : PAYOT.find((x) => x.code === code);
                          if (!p) return null;
                          const baseUnit =
                            b === "belliz"
                              ? (p as any).priceColetivo && (p as any).coletivo
                                ? (p as any).priceColetivo / (p as any).coletivo
                                : (p as any).priceUnit
                              : (p as any).price;
                          const unit = getDiscountedPrice(baseUnit, discountPercent);
                          const coletivo =
                            b === "belliz" ? (p as any).coletivo || 1 : 1;
                          const img = productImage(b, p.code);
                          return (
                            <div key={code} className="flex items-start gap-2">
                              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                                {img ? (
                                  <img
                                    src={img}
                                    alt={p.name}
                                    loading="lazy"
                                    className="size-12 object-contain"
                                  />
                                ) : (
                                  <span className="text-[8px] uppercase text-muted-foreground">
                                    sem foto
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-xs font-medium leading-snug">
                                  {p.name}
                                </p>
                                <div className="mt-1 flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-6"
                                    onClick={() =>
                                      setQty(b, code, Math.max(0, qty - coletivo))
                                    }
                                  >
                                    <Minus className="size-3" />
                                  </Button>
                                  <span className="w-12 text-center text-xs font-semibold">
                                    {qty} un
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-6"
                                    onClick={() => setQty(b, code, qty + coletivo)}
                                  >
                                    <Plus className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6"
                                    onClick={() => setQty(b, code, 0)}
                                  >
                                    <Trash2 className="size-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground">
                                  {currency(unit)} / un
                                </p>
                                <p className="text-sm font-bold text-primary">
                                  {currency(unit * qty)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-bold">
                        <span>Total {BRANDS[b].name}</span>
                        <span className="text-primary">{currency(t.total)}</span>
                      </div>
                    </div>
                  );
                })}
                {totals.all > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Entrega CIF (frete incluso) · valores sem impostos (com {discountPercent}% OFF). Ajuste as
                    quantidades aqui antes de enviar.
                  </p>
                )}
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
  customerProfile,
  onOpenWelcome,
  discountPercent,
}: {
  setActiveBrand: (b: BrandId) => void;
  totals: {
    belliz: { count: number; total: number; original?: number; items: number };
    payot: { count: number; total: number; original?: number; items: number };
  };
  customerProfile: CustomerProfile | null;
  onOpenWelcome: (view?: "choice" | "register" | "login") => void;
  discountPercent: number;
}) {
  return (
    <>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Catálogo oficial
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 text-primary" /> Atendemos somente a Bahia (BA)
            </span>
            {customerProfile && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <Gift className="size-3.5" /> 15% OFF Ativo para {customerProfile.name}
              </span>
            )}
          </div>

          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
            As marcas <span className="text-primary">Belliz</span> e{" "}
            <span className="text-primary">Payot</span>,
            <br className="hidden sm:block" /> na palma da sua mão.
          </h1>

          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Monte seu pedido de cada marca. Este pedido gera o orçamento para envio.
          </p>

          {customerProfile ? (
            <div className="mt-6 max-w-xl rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs">
              <p className="font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" /> Condição Especial de Boas-Vindas
              </p>
              <p className="mt-1 text-muted-foreground">
                Faça seu <strong>1º pedido agora</strong> e garanta <strong>15% de desconto fixo</strong> para todas as próximas reposições da sua loja.
              </p>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={() => onOpenWelcome("register")}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md"
              >
                <Gift className="size-5" /> Primeiro acesso · Girar Roleta
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => onOpenWelcome("login")}
                className="gap-2 font-semibold"
              >
                <Lock className="size-4" /> Já sou cliente
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {(["belliz", "payot"] as const).map((b) => {
            const brand = BRANDS[b];
            const count = b === "belliz" ? BELLIZ.length : PAYOT.length;
            const t = totals[b];
            const locked = !customerProfile;
            return (
              <button
                key={b}
                // Sem cadastro/login o clique não abre a marca: chama o portal de acesso
                onClick={() => (locked ? onOpenWelcome("choice") : setActiveBrand(b))}
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
                {/* Condição comercial na entrada: o mínimo já é obrigatório no
                    envio, e descobrir isso só no fim é o que faz o lead desistir */}
                <p className="mt-2 text-xs font-semibold text-foreground">
                  {brand.terms}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preços já com o desconto de representante.
                </p>
                <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  {locked ? (
                    <>
                      <Lock className="size-4" /> Entre ou cadastre-se para ver o catálogo
                    </>
                  ) : (
                    <>
                      Ver catálogo
                      <ArrowLeft className="size-4 rotate-180 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
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
  discountPercent,
}: {
  brand: BrandId;
  cart: Cart;
  setQty: (brand: BrandId, code: string, qty: number) => void;
  totals: {
    belliz: { count: number; total: number; original?: number; items: number };
    payot: { count: number; total: number; original?: number; items: number };
  };
  onOpenQuote: () => void;
  discountPercent: number;
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

  // Pedido mínimo da indústria — sem atingir, o pedido não pode ser enviado
  const minOrder = MIN_ORDER[brand];
  const missing = Math.max(0, minOrder - t.total);
  const minReached = t.count > 0 && missing === 0;

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
        {/* Abre o carrinho; o envio em si fica bloqueado lá até bater o mínimo */}
        <Button size="lg" className="gap-2" onClick={onOpenQuote} disabled={t.count === 0}>
          <MessageCircle className="size-4" />
          {t.count > 0 && !minReached
            ? `Ver pedido · faltam ${currency(missing)}`
            : `Enviar pedido ${t.count > 0 ? `(${currency(t.total)})` : ""}`}
        </Button>
      </div>

      {/* Aviso de pedido mínimo da marca */}
      <div
        className={cn(
          "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
          minReached
            ? "border-primary/40 bg-primary/5"
            : t.count > 0
              ? "border-amber-500/50 bg-amber-500/5"
              : "border-border bg-muted/40",
        )}
      >
        <div>
          <p className="text-sm font-bold text-foreground">
            Pedido mínimo {info.name}: {currency(minOrder)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Valor exigido pela indústria por pedido. Cada marca é fechada separadamente.
          </p>
        </div>
        {t.count > 0 &&
          (minReached ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
              <CheckCircle2 className="size-3.5" /> Mínimo atingido · {currency(t.total)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700">
              Faltam {currency(missing)} · atual {currency(t.total)}
            </span>
          ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="max-w-xl">
          <p className="text-sm font-semibold">
            Plano de sortimento Curva A · {info.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A Rede Representações desenha com você o mix de maior giro dentro
            da verba, marca a marca. Cada plano é exclusivo desta marca — sem misturar indústrias no mesmo pedido.
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

      <p className="mb-4 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Condições:</strong> entrega{" "}
        <strong className="text-foreground">CIF</strong> (frete incluso) e valores{" "}
        <strong className="text-foreground">sem impostos</strong> (com {discountPercent}% de desconto aplicado).
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
            discountPercent={discountPercent}
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
  discountPercent,
}: {
  brand: BrandId;
  product: AnyProduct;
  qty: number;
  setQty: (q: number) => void;
  discountPercent: number;
}) {
  const isBelliz = brand === "belliz";
  const p = product as any;
  const img = productImage(brand, p.code);

  const coletivo = isBelliz ? Math.max(1, p.coletivo || 1) : 1;
  const baseUnit = isBelliz
    ? p.priceColetivo && p.coletivo
      ? p.priceColetivo / p.coletivo
      : p.priceUnit
    : p.price;

  const unitPrice = getDiscountedPrice(baseUnit, discountPercent);
  const baseColetivo = isBelliz ? (p.priceColetivo ?? p.priceUnit * coletivo) : baseUnit;
  const coletivoPrice = isBelliz ? getDiscountedPrice(baseColetivo, discountPercent) : unitPrice;

  const step = coletivo;
  const inc = () => setQty(qty === 0 ? step : qty + step);
  const dec = () => setQty(Math.max(0, qty - step));

  return (
    <article className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md relative">
      {discountPercent > 0 && (
        <span className="absolute top-3 left-3 z-10 rounded-md bg-primary px-2 py-0.5 text-[10px] font-black text-primary-foreground shadow-sm">
          -{discountPercent}% OFF
        </span>
      )}

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
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-bold text-primary">
                  {currency(coletivoPrice)}
                </p>
                {discountPercent > 0 && (
                  <p className="text-xs text-muted-foreground line-through">
                    {currency(baseColetivo)}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                coletivo com {coletivo} un · {currency(unitPrice)} / unidade
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-bold text-primary">{currency(unitPrice)}</p>
                {discountPercent > 0 && (
                  <p className="text-xs text-muted-foreground line-through">
                    {currency(baseUnit)}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                preço unitário {discountPercent > 0 && `(com ${discountPercent}% OFF)`}
              </p>
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
  onDownloadSheet,
  discountPercent,
}: {
  open: BrandId | null;
  onClose: () => void;
  cart: Cart;
  setQty: (brand: BrandId, code: string, qty: number) => void;
  totals: {
    belliz: { count: number; total: number; original?: number; items: number };
    payot: { count: number; total: number; original?: number; items: number };
  };
  customer: { name: string; phone: string; cnpj: string };
  setCustomer: (v: { name: string; phone: string; cnpj: string }) => void;
  onSend: (b: BrandId) => void;
  onDownload: (b: BrandId) => void;
  onDownloadSheet: (b: BrandId) => void;
  discountPercent: number;
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
  const minOrder = MIN_ORDER[brand];
  const missing = Math.max(0, minOrder - t.total);
  const minReached = entries.length > 0 && missing === 0;

  return (
    <Sheet open={!!brand} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Carrinho — {info.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex h-[calc(100vh-8rem)] flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="rounded-md border border-border bg-muted/50 p-2.5 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>
                Entrega <strong>CIF</strong> (frete incluso) · valores <strong>sem impostos</strong>.
              </span>
              {discountPercent > 0 && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
                  {discountPercent}% OFF Ativo
                </span>
              )}
            </div>

            {discountPercent > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground">
                <p className="font-bold text-primary flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> 1º Pedido com 15% OFF
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Finalize seu 1º pedido para manter a condição especial de 15% em todas as suas próximas reposições.
                </p>
              </div>
            )}

            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Seu carrinho está vazio.
              </p>
            )}
            {entries.map(([code, qty]) => {
              const p =
                brand === "belliz"
                  ? BELLIZ.find((x) => x.code === code)
                  : PAYOT.find((x) => x.code === code);
              if (!p) return null;
              const baseUnit =
                brand === "belliz"
                  ? (p as any).priceColetivo && (p as any).coletivo
                    ? (p as any).priceColetivo / (p as any).coletivo
                    : (p as any).priceUnit
                  : (p as any).price;
              const unit = getDiscountedPrice(baseUnit, discountPercent);
              const coletivo = brand === "belliz" ? (p as any).coletivo || 1 : 1;
              const img = productImage(brand, p.code);
              return (
                <div
                  key={code}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                      {img ? (
                        <img
                          src={img}
                          alt={p.name}
                          loading="lazy"
                          className="size-16 object-contain"
                        />
                      ) : (
                        <span className="text-[9px] uppercase text-muted-foreground">
                          sem foto
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-muted-foreground">
                        #{p.code}
                      </p>
                      <p className="text-sm font-semibold leading-snug">{p.name}</p>
                      <div className="mt-1 flex items-baseline gap-1.5 text-xs">
                        <span className="font-semibold text-primary">{currency(unit)} / un</span>
                        {discountPercent > 0 && (
                          <span className="text-[10px] text-muted-foreground line-through">
                            {currency(baseUnit)}
                          </span>
                        )}
                        {brand === "belliz" && (
                          <span className="text-muted-foreground">· coletivo de {coletivo} un</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQty(brand, code, 0)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
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
                        {qty} un
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
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Total do item
                      </p>
                      <p className="text-sm font-bold text-primary">
                        {currency(unit * qty)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {entries.length > 0 && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="flex justify-between">
                  <span>Itens distintos</span>
                  <span>{t.items}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Unidades</span>
                  <span>{t.count}</span>
                </div>
                {discountPercent > 0 && t.original && t.original > t.total && (
                  <div className="mt-1 flex justify-between text-xs text-primary font-semibold">
                    <span>Economia com 15% OFF</span>
                    <span>- {currency(t.original - t.total)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
                  <span>Total do pedido</span>
                  <span className="text-primary">{currency(t.total)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Pedido mínimo {info.name}</span>
                  <span>{currency(minOrder)}</span>
                </div>
                <p className="mt-1 text-[11px] font-normal text-muted-foreground">
                  Entrega CIF · valores sem impostos.
                </p>
              </div>
            )}

            {entries.length > 0 && !minReached && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-xs">
                <p className="font-bold text-amber-700">
                  Faltam {currency(missing)} para o pedido mínimo
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  A {info.name} só fecha pedidos a partir de {currency(minOrder)}. Adicione
                  mais itens para liberar o envio.
                </p>
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
                <Label htmlFor="phone">Telefone / WhatsApp *</Label>
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
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input
                  id="cnpj"
                  value={customer.cnpj}
                  onChange={(e) =>
                    setCustomer({ ...customer, cnpj: formatCnpj(e.target.value) })
                  }
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                  maxLength={18}
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
                disabled={!minReached}
              >
                <MessageCircle className="size-4" />
                Enviar Pedido
              </Button>
            </div>
            <Button
              variant="ghost"
              className="mt-2 w-full gap-2"
              onClick={() => onDownload(brand)}
              disabled={!minReached}
            >
              <FileDown className="size-4" /> Baixar pedido em PDF
            </Button>
            <Button
              variant="ghost"
              className="mt-1 w-full gap-2"
              onClick={() => onDownloadSheet(brand)}
              disabled={!minReached}
            >
              <FileSpreadsheet className="size-4" /> Baixar planilha do pedido (padrão {BRANDS[brand].name})
            </Button>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              Gera o orçamento detalhado com o desconto de 15% aplicado.
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
          <div className="flex items-center gap-4">
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary"
            >
              <MessageCircle className="size-4" />
              WhatsApp comercial
            </a>
            {/* Entrada discreta do painel interno (pede login) */}
            <Link
              to="/pedidos"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
            >
              <Lock className="size-3.5" /> Área do representante
            </Link>
          </div>
        </div>

        <p className="mt-4 flex items-center gap-1.5 border-t border-border/60 pt-4 text-xs">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          {COVERAGE_NOTICE} Pedidos de empresas de outros estados não são atendidos por esta representação.
        </p>
      </div>
    </footer>
  );
}
