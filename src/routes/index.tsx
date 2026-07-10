import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, MessageCircle, X } from "lucide-react";
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
import { BRANDS, WHATSAPP_NUMBER, REP_NAME, type Brand } from "@/lib/catalog";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Catálogo de Marcas — Peça seu orçamento" },
      {
        name: "description",
        content:
          "Catálogo online das marcas que represento. Monte seu pedido por marca e receba orçamento no WhatsApp.",
      },
      { property: "og:title", content: "Catálogo de Marcas — Peça seu orçamento" },
      {
        property: "og:description",
        content:
          "Catálogo online das marcas que represento. Monte seu pedido por marca e receba orçamento no WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogPage,
});

type Cart = Record<string, Record<string, number>>; // brandId -> productId -> qty

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CatalogPage() {
  const [cart, setCart] = useState<Cart>({});
  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", notes: "" });

  const updateQty = (brandId: string, productId: string, delta: number) => {
    setCart((prev) => {
      const brand = { ...(prev[brandId] ?? {}) };
      const next = Math.max(0, (brand[productId] ?? 0) + delta);
      if (next === 0) delete brand[productId];
      else brand[productId] = next;
      const out = { ...prev, [brandId]: brand };
      if (Object.keys(brand).length === 0) delete out[brandId];
      return out;
    });
  };

  const setQty = (brandId: string, productId: string, qty: number) => {
    setCart((prev) => {
      const brand = { ...(prev[brandId] ?? {}) };
      if (qty <= 0) delete brand[productId];
      else brand[productId] = qty;
      const out = { ...prev, [brandId]: brand };
      if (Object.keys(brand).length === 0) delete out[brandId];
      return out;
    });
  };

  const brandTotals = useMemo(() => {
    const out: Record<string, { items: number; total: number }> = {};
    for (const b of BRANDS) {
      const items = cart[b.id] ?? {};
      let count = 0;
      let total = 0;
      for (const p of b.products) {
        const q = items[p.id] ?? 0;
        count += q;
        total += q * p.price;
      }
      out[b.id] = { items: count, total };
    }
    return out;
  }, [cart]);

  const activeBrand = openBrand ? BRANDS.find((b) => b.id === openBrand) ?? null : null;

  const sendQuote = (brand: Brand) => {
    if (!customer.name.trim()) {
      toast.error("Informe seu nome antes de enviar.");
      return;
    }
    const items = cart[brand.id] ?? {};
    const lines = brand.products
      .filter((p) => (items[p.id] ?? 0) > 0)
      .map(
        (p) =>
          `• ${items[p.id]}x ${p.name} — ${currency(p.price)} (subtotal ${currency(
            items[p.id] * p.price,
          )})`,
      );
    if (lines.length === 0) {
      toast.error("Adicione ao menos 1 produto.");
      return;
    }
    const total = brandTotals[brand.id].total;
    const msg =
      `*Novo pedido de orçamento*\n` +
      `Marca: *${brand.name}*\n\n` +
      `${lines.join("\n")}\n\n` +
      `*Total estimado:* ${currency(total)}\n\n` +
      `*Cliente:* ${customer.name}\n` +
      (customer.phone ? `*Telefone:* ${customer.phone}\n` : "") +
      (customer.notes ? `*Observações:* ${customer.notes}\n` : "");
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener");
    toast.success("Abrindo WhatsApp com seu pedido…");
  };

  const totalItems = Object.values(brandTotals).reduce((a, b) => a + b.items, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <ShoppingBag className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Catálogo</p>
              <p className="text-xs text-muted-foreground">{REP_NAME}</p>
            </div>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ShoppingBag className="size-4" />
                Meus pedidos
                {totalItems > 0 && (
                  <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {totalItems}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Pedidos em andamento</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {BRANDS.filter((b) => brandTotals[b.id].items > 0).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Você ainda não adicionou produtos. Escolha uma marca abaixo.
                  </p>
                )}
                {BRANDS.filter((b) => brandTotals[b.id].items > 0).map((b) => (
                  <div
                    key={b.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {brandTotals[b.id].items} itens ·{" "}
                          {currency(brandTotals[b.id].total)}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setOpenBrand(b.id)}>
                        Enviar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Catálogo oficial
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
            As marcas que <span className="text-primary">represento</span>,
            <br className="hidden sm:block" /> na palma da sua mão.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Navegue pelo portfólio, monte seu pedido por marca e envie
            direto para o WhatsApp. Você recebe o orçamento personalizado em
            minutos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#marcas">
              <Button size="lg" className="gap-2">
                <ShoppingBag className="size-4" />
                Ver marcas
              </Button>
            </a>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener"
            >
              <Button size="lg" variant="outline" className="gap-2">
                <MessageCircle className="size-4" />
                Falar direto
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Brands */}
      <section id="marcas" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Marcas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Um orçamento por marca — mais simples para você e para o fornecedor.
            </p>
          </div>
        </div>

        <div className="space-y-16">
          {BRANDS.map((brand) => (
            <div key={brand.id}>
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold sm:text-2xl">{brand.name}</h3>
                  <p className="text-sm text-muted-foreground">{brand.tagline}</p>
                </div>
                <Button
                  variant={brandTotals[brand.id].items > 0 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOpenBrand(brand.id)}
                  className="gap-2"
                  disabled={brandTotals[brand.id].items === 0}
                >
                  <MessageCircle className="size-4" />
                  Pedir orçamento
                  {brandTotals[brand.id].items > 0 && (
                    <span className="ml-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs">
                      {brandTotals[brand.id].items}
                    </span>
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {brand.products.map((p) => {
                  const qty = cart[brand.id]?.[p.id] ?? 0;
                  return (
                    <article
                      key={p.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg"
                    >
                      <div className="aspect-square overflow-hidden bg-muted">
                        <img
                          src={p.image}
                          alt={p.name}
                          width={1024}
                          height={1024}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h4 className="font-semibold">{p.name}</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {p.description}
                        </p>
                        <div className="mt-3 text-lg font-bold text-primary">
                          {currency(p.price)}
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          {qty === 0 ? (
                            <Button
                              className="flex-1"
                              onClick={() => updateQty(brand.id, p.id, 1)}
                            >
                              <Plus className="mr-1 size-4" /> Adicionar
                            </Button>
                          ) : (
                            <div className="flex flex-1 items-center justify-between rounded-md border border-border">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => updateQty(brand.id, p.id, -1)}
                              >
                                <Minus className="size-4" />
                              </Button>
                              <input
                                type="number"
                                min={0}
                                value={qty}
                                onChange={(e) =>
                                  setQty(
                                    brand.id,
                                    p.id,
                                    Math.max(0, Number(e.target.value) || 0),
                                  )
                                }
                                className="w-14 bg-transparent text-center text-sm font-semibold outline-none"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => updateQty(brand.id, p.id, 1)}
                              >
                                <Plus className="size-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} {REP_NAME}. Todos os direitos reservados.</p>
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

      {/* Quote drawer */}
      <Sheet open={!!activeBrand} onOpenChange={(o) => !o && setOpenBrand(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {activeBrand && (
            <>
              <SheetHeader>
                <SheetTitle>Pedido — {activeBrand.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex h-[calc(100vh-8rem)] flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {activeBrand.products
                    .filter((p) => (cart[activeBrand.id]?.[p.id] ?? 0) > 0)
                    .map((p) => {
                      const qty = cart[activeBrand.id][p.id];
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-2"
                        >
                          <img
                            src={p.image}
                            alt={p.name}
                            className="size-14 rounded-md object-cover"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {qty} × {currency(p.price)} ={" "}
                              <span className="font-semibold text-foreground">
                                {currency(qty * p.price)}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => updateQty(activeBrand.id, p.id, -1)}
                            >
                              <Minus className="size-4" />
                            </Button>
                            <span className="w-6 text-center text-sm font-semibold">
                              {qty}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => updateQty(activeBrand.id, p.id, 1)}
                            >
                              <Plus className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setQty(activeBrand.id, p.id, 0)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <div className="flex justify-between">
                      <span>Itens</span>
                      <span>{brandTotals[activeBrand.id].items}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-base font-bold">
                      <span>Total estimado</span>
                      <span className="text-primary">
                        {currency(brandTotals[activeBrand.id].total)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div>
                      <Label htmlFor="name">Seu nome *</Label>
                      <Input
                        id="name"
                        value={customer.name}
                        onChange={(e) =>
                          setCustomer((c) => ({ ...c, name: e.target.value }))
                        }
                        placeholder="Ex: João da Silva"
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Telefone / WhatsApp</Label>
                      <Input
                        id="phone"
                        value={customer.phone}
                        onChange={(e) =>
                          setCustomer((c) => ({ ...c, phone: e.target.value }))
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
                          setCustomer((c) => ({ ...c, notes: e.target.value }))
                        }
                        placeholder="Prazo, endereço de entrega, etc."
                        maxLength={500}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2 border-t border-border pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setOpenBrand(null)}
                  >
                    <X className="mr-1 size-4" /> Cancelar
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => sendQuote(activeBrand)}
                  >
                    <MessageCircle className="size-4" />
                    Enviar no WhatsApp
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
