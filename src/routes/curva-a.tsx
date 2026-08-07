import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Check,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BRANDS, REP_NAME, WHATSAPP_NUMBER, productImage } from "@/lib/catalog";
import {
  BUSINESS_PRESETS,
  FOCUSES,
  PUBLICO_LABEL,
  buildCurvaA,
  type Answers,
  type BusinessType,
  type FocusId,
  type Publico,
  type SuggestedItem,
} from "@/lib/curva-a";

export const Route = createFileRoute("/curva-a")({
  head: () => ({
    meta: [
      { title: "Montar orçamento Curva A — Belliz & Payot" },
      {
        name: "description",
        content:
          "Responda 4 perguntas sobre o seu negócio e receba um mix de produtos Curva A dentro da sua verba, pronto para enviar por WhatsApp.",
      },
      { property: "og:title", content: "Montar orçamento Curva A" },
      {
        property: "og:description",
        content:
          "Mix inteligente de produtos Belliz e Payot dentro da sua verba, com curva ABC e envio direto no WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CurvaAPage,
});

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CURVA_STYLE: Record<"A" | "B" | "C", string> = {
  A: "bg-primary text-primary-foreground",
  B: "bg-secondary text-secondary-foreground",
  C: "bg-muted text-muted-foreground",
};

function CurvaAPage() {
  const [step, setStep] = useState(0);
  const [business, setBusiness] = useState<BusinessType | null>(null);
  const [focos, setFocos] = useState<FocusId[]>([]);
  const [publico, setPublico] = useState<Publico>("intermediario");
  const [budget, setBudget] = useState("2000");
  const [items, setItems] = useState<SuggestedItem[] | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", notes: "" });

  const budgetNumber = Number(budget.replace(/[^\d]/g, "")) || 0;

  const generate = () => {
    if (!business) return;
    const answers: Answers = {
      business,
      focos: focos.length ? focos : BUSINESS_PRESETS[business].focos,
      publico,
      budget: budgetNumber,
    };
    const result = buildCurvaA(answers);
    if (result.items.length === 0) {
      toast.error("Não consegui montar um mix com essa verba. Tente um valor maior.");
      return;
    }
    setItems(result.items);
    setStep(4);
  };

  const total = useMemo(
    () => (items ?? []).reduce((sum, i) => sum + i.unitPrice * i.qty, 0),
    [items],
  );

  const changeQty = (code: string, brand: string, delta: number) => {
    setItems((prev) =>
      (prev ?? [])
        .map((i) =>
          i.code === code && i.brand === brand
            ? { ...i, qty: Math.max(0, i.qty + delta * i.packSize) }
            : i,
        )
        .filter((i) => i.qty > 0),
    );
  };

  const removeItem = (code: string, brand: string) =>
    setItems((prev) => (prev ?? []).filter((i) => !(i.code === code && i.brand === brand)));

  const send = () => {
    if (!customer.name.trim()) {
      toast.error("Informe seu nome antes de enviar.");
      return;
    }
    const list = items ?? [];
    if (list.length === 0) {
      toast.error("Seu mix está vazio.");
      return;
    }
    const byBrand = (["belliz", "payot"] as const).map((b) => ({
      brand: b,
      list: list.filter((i) => i.brand === b),
    }));
    const blocks = byBrand
      .filter((g) => g.list.length > 0)
      .map(
        (g) =>
          `*${BRANDS[g.brand].name}*\n` +
          g.list
            .map(
              (i) =>
                `• (${i.curva}) [${i.code}] ${i.qty}x ${i.name} — ${currency(i.unitPrice)} un = ${currency(i.unitPrice * i.qty)}`,
            )
            .join("\n"),
      );

    const msg =
      `*Orçamento Curva A*\n\n` +
      `*Perfil:* ${business ? BUSINESS_PRESETS[business].label : "-"}\n` +
      `*Público:* ${PUBLICO_LABEL[publico]}\n` +
      `*Verba informada:* ${currency(budgetNumber)}\n\n` +
      `${blocks.join("\n\n")}\n\n` +
      `*Total do mix:* ${currency(total)}\n` +
      `*Itens:* ${list.length}\n\n` +
      `*Cliente:* ${customer.name}\n` +
      (customer.phone ? `*Telefone:* ${customer.phone}\n` : "") +
      (customer.notes ? `*Observações:* ${customer.notes}\n` : "");

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener",
    );
    toast.success("Abrindo WhatsApp com seu orçamento…");
  };

  const activeFocos = focos.length
    ? focos
    : business
      ? BUSINESS_PRESETS[business].focos
      : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold">Catálogo</p>
              <p className="text-[11px] text-muted-foreground">{REP_NAME}</p>
            </div>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1 size-4" /> Voltar ao catálogo
            </Link>
          </Button>
        </div>
      </header>

      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <BarChart3 className="size-3" /> Consultoria de mix
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
            Monte seu <span className="text-primary">orçamento Curva A</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Não sabe por onde começar? Responda 4 perguntas rápidas e eu monto um mix de
            produtos de maior giro, distribuído em curva ABC dentro da sua verba.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-10">
        {step < 4 && (
          <div className="mb-8 flex items-center gap-2">
            {[0, 1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  s <= step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        )}

        {step === 0 && (
          <StepShell
            title="Qual o tipo do seu negócio?"
            subtitle="Uso isso para priorizar as categorias certas."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(BUSINESS_PRESETS) as BusinessType[]).map((b) => (
                <SelectCard
                  key={b}
                  active={business === b}
                  title={BUSINESS_PRESETS[b].label}
                  hint={BUSINESS_PRESETS[b].hint}
                  onClick={() => {
                    setBusiness(b);
                    setFocos(BUSINESS_PRESETS[b].focos);
                    setStep(1);
                  }}
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell
            title="O que você quer priorizar?"
            subtitle="Já deixei marcado o mais comum para o seu perfil — ajuste se quiser."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {FOCUSES.map((f) => {
                const active = activeFocos.includes(f.id);
                return (
                  <SelectCard
                    key={f.id}
                    active={active}
                    title={f.label}
                    hint={`${BRANDS[f.brand].name} · ${f.hint}`}
                    onClick={() =>
                      setFocos((prev) => {
                        const base = prev.length ? prev : activeFocos;
                        return base.includes(f.id)
                          ? base.filter((x) => x !== f.id)
                          : [...base, f.id];
                      })
                    }
                  />
                );
              })}
            </div>
            <StepNav
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
              disabled={activeFocos.length === 0}
            />
          </StepShell>
        )}

        {step === 2 && (
          <StepShell
            title="Qual o perfil do seu público?"
            subtitle="Isso define a faixa de preço dos itens sugeridos."
          >
            <div className="grid gap-3">
              {(Object.keys(PUBLICO_LABEL) as Publico[]).map((p) => (
                <SelectCard
                  key={p}
                  active={publico === p}
                  title={PUBLICO_LABEL[p]}
                  onClick={() => {
                    setPublico(p);
                    setStep(3);
                  }}
                />
              ))}
            </div>
            <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            title="Quanto você quer investir neste pedido?"
            subtitle="Vou distribuir a verba entre as categorias escolhidas."
          >
            <div className="max-w-sm">
              <Label htmlFor="verba">Verba (R$)</Label>
              <Input
                id="verba"
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="2000"
                className="mt-1 text-lg"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[500, 1000, 2000, 5000, 10000].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBudget(String(v))}
                  >
                    {currency(v)}
                  </Button>
                ))}
              </div>
            </div>
            <StepNav
              onBack={() => setStep(2)}
              onNext={generate}
              nextLabel="Gerar meu mix Curva A"
              disabled={budgetNumber < 100}
            />
            {budgetNumber < 100 && (
              <p className="text-xs text-muted-foreground">Informe pelo menos R$ 100.</p>
            )}
          </StepShell>
        )}

        {step === 4 && items && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-card p-6">
              <div>
                <h2 className="text-2xl font-bold">Seu mix sugerido</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {items.length} produtos · verba informada {currency(budgetNumber)}
                </p>
                <p className="mt-2 text-3xl font-bold text-primary">{currency(total)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <RefreshCw className="mr-1 size-4" /> Refazer
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(["A", "B", "C"] as const).map((c) => {
                const list = items.filter((i) => i.curva === c);
                const value = list.reduce((s, i) => s + i.unitPrice * i.qty, 0);
                return (
                  <div key={c} className="rounded-xl border border-border bg-card p-4">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold",
                        CURVA_STYLE[c],
                      )}
                    >
                      {c}
                    </span>
                    <p className="mt-2 text-sm font-semibold">
                      Curva {c} · {list.length} itens
                    </p>
                    <p className="text-sm text-muted-foreground">{currency(value)}</p>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              {items.map((i) => {
                const img = productImage(i.brand, i.code);
                return (
                  <div
                    key={`${i.brand}-${i.code}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {img ? (
                        <img
                          src={img}
                          alt={i.name}
                          loading="lazy"
                          className="size-full object-contain"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-[10px] text-muted-foreground">
                          sem foto
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-bold",
                            CURVA_STYLE[i.curva],
                          )}
                        >
                          {i.curva}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {BRANDS[i.brand].name} · {i.line} · [{i.code}]
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {currency(i.unitPrice)} un
                        {i.packSize > 1 ? ` · coletivo de ${i.packSize}` : ""} ={" "}
                        <span className="font-semibold text-foreground">
                          {currency(i.unitPrice * i.qty)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => changeQty(i.code, i.brand, -1)}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-10 text-center text-sm font-semibold">{i.qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => changeQty(i.code, i.brand, 1)}
                      >
                        <Plus className="size-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground"
                        onClick={() => removeItem(i.code, i.brand)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">Enviar orçamento</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nome">Seu nome *</Label>
                  <Input
                    id="nome"
                    value={customer.name}
                    maxLength={100}
                    onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="tel">Telefone</Label>
                  <Input
                    id="tel"
                    value={customer.phone}
                    maxLength={20}
                    onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="obs">Observações</Label>
                  <Textarea
                    id="obs"
                    value={customer.notes}
                    maxLength={500}
                    onChange={(e) => setCustomer((c) => ({ ...c, notes: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button className="mt-4 w-full gap-2" size="lg" onClick={send}>
                <MessageCircle className="size-4" /> Enviar no WhatsApp ·{" "}
                {currency(total)}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function SelectCard({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:border-primary/60",
        active ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
          active ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {active && <Check className="size-3" />}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = "Continuar",
  disabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="mr-1 size-4" /> Voltar
      </Button>
      <Button onClick={onNext} disabled={disabled}>
        {nextLabel}
      </Button>
    </div>
  );
}
