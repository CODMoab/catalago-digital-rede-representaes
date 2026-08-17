import { useState } from "react";
import {
  Sparkles,
  Gift,
  Building2,
  Phone,
  User,
  CheckCircle2,
  Search,
  Lock,
  ArrowRight,
  Tag,
  LogOut,
  ShoppingBag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  saveLocalCustomer,
  clearLocalCustomer,
  formatCnpj,
  formatPhone,
  onlyDigits,
  type CustomerProfile,
  DEFAULT_DISCOUNT_PERCENT,
} from "@/lib/leads";
import { saveLead, findLead } from "@/lib/leads.functions";
import { DiscountRoulette } from "./DiscountRoulette";
import { useServerFn } from "@tanstack/react-start";

interface WelcomeGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerReady: (customer: CustomerProfile | null) => void;
  initialTab?: "register" | "login";
  currentCustomer?: CustomerProfile | null;
}

export function WelcomeGateModal({
  open,
  onOpenChange,
  onCustomerReady,
  initialTab = "register",
  currentCustomer,
}: WelcomeGateModalProps) {
  const [tab, setTab] = useState<"register" | "login">(initialTab);
  const [step, setStep] = useState<"form" | "roulette">("form");

  // Form de cadastro
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Login de cliente existente
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const saveLeadFn = useServerFn(saveLead);
  const findLeadFn = useServerFn(findLead);

  const handleStartRoulette = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      toast.error("Por favor, informe o Nome da Loja ou Razão Social.");
      return;
    }
    const cleanPhone = onlyDigits(phone);
    if (cleanPhone.length < 10) {
      toast.error("Por favor, informe um WhatsApp válido com DDD.");
      return;
    }
    const cleanCnpj = onlyDigits(cnpj);
    if (cleanCnpj.length < 14) {
      toast.error("Por favor, informe um CNPJ válido com 14 dígitos.");
      return;
    }

    // Avança para a etapa da roleta (apenas 1x no primeiro cadastro)
    setStep("roulette");
  };

  const handleFinishRoulette = async (discountPercent: number) => {
    setIsSubmitting(true);
    const profile: CustomerProfile = {
      name: name.trim(),
      phone: onlyDigits(phone),
      cnpj: onlyDigits(cnpj),
      discountPercent: discountPercent || DEFAULT_DISCOUNT_PERCENT,
      registeredAt: new Date().toISOString(),
      spunRoulette: true,
    };

    try {
      // Salva localmente para navegação imediata
      saveLocalCustomer(profile);

      // Salva no banco de dados / servidor em background
      await saveLeadFn({
        data: {
          name: profile.name,
          phone: profile.phone,
          cnpj: profile.cnpj,
          discount_percent: profile.discountPercent,
          source: "welcome_roulette",
        },
      });
    } catch (e) {
      console.warn("Aviso ao salvar lead no backend:", e);
    } finally {
      setIsSubmitting(false);
      onCustomerReady(profile);
      setStep("form");
      onOpenChange(false);
      toast.success(`Desconto de ${profile.discountPercent}% ativado com sucesso!`, {
        description: "Faça seu 1º pedido hoje para manter o desconto nos próximos pedidos.",
      });
    }
  };

  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = onlyDigits(loginIdentifier);
    if (!clean || clean.length < 8) {
      toast.error("Digite um WhatsApp (com DDD) ou CNPJ válido.");
      return;
    }

    setIsSearching(true);
    try {
      const res = await findLeadFn({ data: { identifier: clean } });
      if (res.found && res.customer) {
        const profile: CustomerProfile = {
          name: res.customer.name,
          phone: res.customer.phone,
          cnpj: res.customer.cnpj,
          discountPercent: res.customer.discountPercent || DEFAULT_DISCOUNT_PERCENT,
          registeredAt: res.customer.registeredAt,
          spunRoulette: true,
        };
        saveLocalCustomer(profile);
        onCustomerReady(profile);
        onOpenChange(false);
        toast.success(`Bem-vindo de volta, ${profile.name}!`, {
          description: `Seu desconto de ${profile.discountPercent}% está ativo.`,
        });
      } else {
        toast.error("Cadastro não encontrado para este documento/telefone.", {
          description: "Faça o primeiro acesso para cadastrar sua loja e girar a roleta.",
        });
        setTab("register");
      }
    } catch {
      toast.error("Não foi possível consultar os dados no momento. Tente novamente.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogout = () => {
    clearLocalCustomer();
    onCustomerReady(null);
    setName("");
    setPhone("");
    setCnpj("");
    setStep("form");
    setTab("login");
    toast.info("Você saiu da conta. Cadastre-se ou entre com outro CNPJ.");
  };

  // Se o cliente já está cadastrado, exibimos a visualização de perfil clean (SEM roleta)
  const isAlreadyRegistered = currentCustomer && currentCustomer.spunRoulette;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[95vw] max-w-md overflow-y-auto p-0 sm:max-w-lg border-border bg-card shadow-xl rounded-2xl">
        {/* Cabeçalho Clean alinhado ao design do catálogo */}
        <div className="border-b border-border bg-muted/40 px-6 py-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" /> Portal B2B Lojista
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              Rede Representações
            </span>
          </div>

          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {isAlreadyRegistered ? "Minha Conta / Loja" : "Catálogo Belliz & Payot"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAlreadyRegistered
              ? "Seus dados cadastrais e desconto ativo no catálogo."
              : "Preços de fábrica e condições exclusivas para lojistas e revendedores."}
          </p>
        </div>

        <div className="p-6">
          {isAlreadyRegistered ? (
            /* Visualização do Perfil do Cliente Cadastrado (SEM roleta) */
            <div className="space-y-5">
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      Loja Identificada
                    </span>
                    <h3 className="text-lg font-bold text-foreground mt-0.5">
                      {currentCustomer.name}
                    </h3>
                  </div>
                  <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm">
                    {currentCustomer.discountPercent}% OFF Ativo
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground border-t border-primary/15 pt-3">
                  <p>
                    CNPJ: <strong className="font-mono text-foreground">{formatCnpj(currentCustomer.cnpj)}</strong>
                  </p>
                  <p>
                    WhatsApp: <strong className="text-foreground">{formatPhone(currentCustomer.phone)}</strong>
                  </p>
                </div>
              </div>

              {/* Box de incentivo para o 1º pedido */}
              <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShoppingBag className="size-4 text-primary" /> Condição Especial de Boas-Vindas
                </p>
                <p className="mt-1 leading-relaxed">
                  Faça seu <strong>1º pedido agora</strong> e garanta <strong>15% de desconto fixo</strong> para todos os seus próximos pedidos e reposições da sua loja.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  size="lg"
                  onClick={() => onOpenChange(false)}
                  className="w-full gap-2 font-bold"
                >
                  Continuar no Catálogo <ArrowRight className="size-4" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="w-full gap-2 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
                >
                  <LogOut className="size-3.5" /> Trocar de Conta / Sair
                </Button>
              </div>
            </div>
          ) : step === "roulette" ? (
            /* Etapa da Roleta (Giro único na criação do cadastro) */
            <DiscountRoulette
              customerName={name || "Lojista"}
              onFinished={handleFinishRoulette}
            />
          ) : (
            /* Abas de Primeiro Acesso e Login Rápido */
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "register" | "login")}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="register" className="gap-1.5 font-semibold text-xs sm:text-sm">
                  <Gift className="size-4 text-primary" /> Primeiro Acesso
                </TabsTrigger>
                <TabsTrigger value="login" className="gap-1.5 font-semibold text-xs sm:text-sm">
                  <Lock className="size-3.5" /> Já sou Cliente
                </TabsTrigger>
              </TabsList>

              {/* Aba 1: Primeiro Acesso (Cadastro + Roleta) */}
              <TabsContent value="register" className="space-y-4 focus-visible:outline-none">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Tag className="size-4 text-primary" /> Desconto Especial de Boas-Vindas
                  </p>
                  <p className="mt-1">
                    Preencha os dados da sua loja para liberar a roleta da sorte e concorrer a descontos exclusivos no catálogo.
                  </p>
                </div>

                <form onSubmit={handleStartRoulette} className="space-y-4">
                  <div>
                    <Label htmlFor="reg-name" className="text-xs font-semibold">
                      Nome da Loja / Razão Social *
                    </Label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reg-name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Farmácia & Cosméticos Central"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="reg-phone" className="text-xs font-semibold">
                      WhatsApp com DDD *
                    </Label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reg-phone"
                        required
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        placeholder="(71) 98888-7777"
                        className="pl-9"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Para envio rápido do orçamento e confirmação de estoque.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="reg-cnpj" className="text-xs font-semibold">
                      CNPJ da Empresa *
                    </Label>
                    <div className="relative mt-1">
                      <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reg-cnpj"
                        required
                        value={cnpj}
                        onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                        placeholder="00.000.000/0001-00"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-transform hover:scale-[1.01]"
                  >
                    <Gift className="size-4" /> Continuar e Girar Roleta da Sorte
                  </Button>
                </form>
              </TabsContent>

              {/* Aba 2: Já sou Cliente (Login rápido por WhatsApp ou CNPJ) */}
              <TabsContent value="login" className="space-y-4 focus-visible:outline-none">
                <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-primary" /> Acesso Rápido para Lojistas
                  </p>
                  <p className="mt-1">
                    Se você já cadastrou seus dados ou fez orçamentos anteriores, informe seu CNPJ ou WhatsApp para entrar direto.
                  </p>
                </div>

                <form onSubmit={handleQuickLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-id" className="text-xs font-semibold">
                      CNPJ ou WhatsApp cadastrado *
                    </Label>
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-id"
                        required
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder="Digite o CNPJ ou WhatsApp…"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSearching}
                    className="w-full gap-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {isSearching ? (
                      "Buscando cadastro..."
                    ) : (
                      <>
                        Entrar no Catálogo <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setTab("register")}
                    className="text-xs text-primary hover:underline"
                  >
                    Primeira vez aqui? Faça o cadastro para girar a roleta
                  </button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
