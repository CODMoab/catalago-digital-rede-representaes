import { useEffect, useState } from "react";
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
  ArrowLeft,
  Tag,
  LogOut,
  ShoppingBag,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  saveLocalCustomer,
  clearLocalCustomer,
  formatCnpj,
  formatPhone,
  onlyDigits,
  type CustomerProfile,
  DEFAULT_DISCOUNT_PERCENT,
  SERVED_STATE,
  SERVED_STATE_NAME,
  COVERAGE_NOTICE,
  BR_STATES,
  BA_CITIES,
} from "@/lib/leads";
import { saveLead, findLead } from "@/lib/leads.functions";
import { cn } from "@/lib/utils";
import { consultarCnpj } from "@/lib/cnpj.functions";
import { avaliarCnpj, PERFIS, type ConsultaCnpj, type PerfilLead } from "@/lib/cnpj";
import { DiscountRoulette } from "./DiscountRoulette";
import { useServerFn } from "@tanstack/react-start";

type GateView = "choice" | "register" | "login" | "roulette";

interface WelcomeGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerReady: (customer: CustomerProfile | null) => void;
  /** Canal de entrada: escolha, primeiro acesso (roleta) ou login de cliente. */
  initialView?: "choice" | "register" | "login";
  currentCustomer?: CustomerProfile | null;
}

export function WelcomeGateModal({
  open,
  onOpenChange,
  onCustomerReady,
  initialView = "choice",
  currentCustomer,
}: WelcomeGateModalProps) {
  const [view, setView] = useState<GateView>(initialView);

  // Form de cadastro (canal: primeiro acesso)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState(SERVED_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Login de cliente existente (canal: já sou cliente)
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  // Consulta do CNPJ na Receita: confere se a empresa existe, se está ativa e
  // que ramo é. Nunca trava o cadastro se a consulta não responder.
  const [consulta, setConsulta] = useState<ConsultaCnpj | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [erroCnpj, setErroCnpj] = useState("");

  const saveLeadFn = useServerFn(saveLead);
  const findLeadFn = useServerFn(findLead);
  const consultarCnpjFn = useServerFn(consultarCnpj);

  const isOutOfCoverage = state !== SERVED_STATE;

  // Cada abertura do modal começa no canal escolhido por quem chamou (roleta ou login).
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);

  // Assim que o CNPJ fica completo, confere na Receita e preenche o que der.
  useEffect(() => {
    const limpo = onlyDigits(cnpj);
    if (limpo.length !== 14) {
      setConsulta(null);
      setErroCnpj("");
      return;
    }
    let vivo = true;
    setConsultando(true);
    setErroCnpj("");
    void (async () => {
      try {
        const res = await consultarCnpjFn({ data: { cnpj: limpo } });
        if (!vivo) return;
        if (res.ok) {
          setConsulta(res.dados);
          // Só preenche o que o cliente ainda não escreveu, para não atropelar
          // o nome que ele prefere usar.
          setName((atual) => atual.trim() || res.dados.nomeFantasia || res.dados.razaoSocial);
          setCity((atual) => atual.trim() || res.dados.cidade);
          if (res.dados.uf) setState(res.dados.uf);
        } else {
          setConsulta(null);
          setErroCnpj(res.mensagem);
        }
      } catch {
        if (vivo) setErroCnpj("");
      } finally {
        if (vivo) setConsultando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cnpj, consultarCnpjFn]);

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
    if (!city.trim() || city.trim().length < 2) {
      toast.error("Por favor, informe a cidade da sua loja.");
      return;
    }
    if (consulta && avaliarCnpj(consulta).bloqueia) {
      toast.error(avaliarCnpj(consulta).titulo, {
        description: "Fale com a gente pelo WhatsApp para resolvermos o cadastro.",
      });
      return;
    }
    if (isOutOfCoverage) {
      toast.error(`No momento atendemos apenas empresas da ${SERVED_STATE_NAME}.`, {
        description: "Nossa representação é exclusiva do estado da Bahia.",
      });
      return;
    }

    // Avança para a etapa da roleta (apenas 1x no primeiro cadastro)
    setView("roulette");
  };

  const handleFinishRoulette = async (discountPercent: number) => {
    setIsSubmitting(true);
    const profile: CustomerProfile = {
      name: name.trim(),
      phone: onlyDigits(phone),
      cnpj: onlyDigits(cnpj),
      city: city.trim(),
      state,
      discountPercent: discountPercent || DEFAULT_DISCOUNT_PERCENT,
      registeredAt: new Date().toISOString(),
      spunRoulette: true,
    };

    try {
      // Salva localmente para navegação imediata
      saveLocalCustomer(profile);

      // Salva no banco de dados / servidor em background
      const res = await saveLeadFn({
        data: {
          name: profile.name,
          phone: profile.phone,
          cnpj: profile.cnpj,
          city: profile.city,
          state: profile.state,
          discount_percent: profile.discountPercent,
          source: "welcome_roulette",
          razao_social: consulta?.razaoSocial ?? "",
          nome_fantasia: consulta?.nomeFantasia ?? "",
          situacao_cadastral: consulta?.situacaoTexto ?? "",
          cnae: consulta?.cnae ?? "",
          cnae_descricao: consulta?.cnaeDescricao ?? "",
          perfil: consulta?.perfil ?? "",
          endereco: consulta?.endereco ?? "",
          bairro: consulta?.bairro ?? "",
          cep: consulta?.cep ?? "",
        },
      });
      if (!res?.success) {
        // O cliente segue navegando, mas o cadastro NÃO entrou na base do painel
        console.error("[leads] Cadastro não foi gravado na base:", res?.error);
      }
    } catch (e) {
      console.error("[leads] Falha ao enviar cadastro para o servidor:", e);
    } finally {
      setIsSubmitting(false);
      onCustomerReady(profile);
      setView("choice");
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
          city: res.customer.city || "",
          state: res.customer.state || SERVED_STATE,
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
        setView("register");
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
    setCity("");
    setState(SERVED_STATE);
    setView("choice");
    toast.info("Você saiu da conta. Cadastre-se ou entre com outro CNPJ.");
  };

  // Se o cliente já está cadastrado, exibimos a visualização de perfil clean (SEM roleta)
  const isAlreadyRegistered = currentCustomer && currentCustomer.spunRoulette;

  const headerTitle = isAlreadyRegistered
    ? "Minha Conta / Loja"
    : view === "register" || view === "roulette"
      ? "Primeiro Acesso"
      : view === "login"
        ? "Acesso do Cliente"
        : "Catálogo Belliz & Payot";

  const headerSubtitle = isAlreadyRegistered
    ? "Seus dados cadastrais e desconto ativo no catálogo."
    : view === "register" || view === "roulette"
      ? "Cadastre sua loja para liberar a roleta da sorte."
      : view === "login"
        ? "Entre com o CNPJ ou WhatsApp já cadastrado."
        : "Preços de fábrica e condições exclusivas para lojistas e revendedores.";

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
            {headerTitle}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{headerSubtitle}</p>

          {/* Aviso de área de atuação — visível em todas as etapas */}
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <MapPin className="size-3.5 text-primary" /> {COVERAGE_NOTICE}
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
                  {currentCustomer.city && (
                    <p>
                      Cidade:{" "}
                      <strong className="text-foreground">
                        {currentCustomer.city}/{currentCustomer.state || SERVED_STATE}
                      </strong>
                    </p>
                  )}
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
          ) : view === "roulette" ? (
            /* Etapa da Roleta — exclusiva do Primeiro Acesso */
            <DiscountRoulette
              customerName={name || "Lojista"}
              onFinished={handleFinishRoulette}
            />
          ) : view === "choice" ? (
            /* Tela de escolha do canal: Primeiro Acesso x Já sou Cliente */
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setView("register")}
                className="group w-full rounded-xl border-2 border-primary/40 bg-primary/5 p-5 text-left transition-all hover:border-primary hover:bg-primary/10 hover:shadow-md"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                  <Gift className="size-3.5" /> Primeiro Acesso
                </span>
                <h3 className="mt-2 text-base font-bold text-foreground sm:text-lg">
                  Cadastrar minha loja e girar a Roleta da Sorte
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Preencha os dados da sua empresa para liberar a roleta e concorrer a descontos exclusivos no catálogo.
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                  Começar cadastro <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  ou
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                onClick={() => setView("login")}
                className="group w-full rounded-xl border border-border bg-muted/30 p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/50"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Lock className="size-3.5" /> Já sou Cliente
                </span>
                <h3 className="mt-1 text-sm font-bold text-foreground">
                  Entrar com CNPJ ou WhatsApp cadastrado
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Acesso direto ao catálogo com seu desconto já ativo.
                </p>
              </button>
            </div>
          ) : view === "register" ? (
            /* Canal 1: Primeiro Acesso (Cadastro + Roleta) */
            <div className="space-y-4">
              <BackButton onClick={() => setView("choice")} />

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
                  <RetornoDaReceita
                    consultando={consultando}
                    consulta={consulta}
                    erro={erroCnpj}
                  />
                </div>

                {/* Cidade + Estado (filtro da área de atuação) */}
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <div>
                    <Label htmlFor="reg-city" className="text-xs font-semibold">
                      Cidade da Loja *
                    </Label>
                    <div className="relative mt-1">
                      <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reg-city"
                        required
                        list="ba-cities"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Ex: Feira de Santana"
                        className="pl-9"
                      />
                      <datalist id="ba-cities">
                        {BA_CITIES.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="reg-state" className="text-xs font-semibold">
                      Estado *
                    </Label>
                    <Select value={state} onValueChange={setState}>
                      <SelectTrigger id="reg-state" className="mt-1">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {BR_STATES.map((s) => (
                          <SelectItem key={s.uf} value={s.uf}>
                            {s.uf === SERVED_STATE ? `${s.uf} · ${s.name}` : s.uf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isOutOfCoverage ? (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-xs">
                    <p className="flex items-center gap-1.5 font-bold text-destructive">
                      <AlertTriangle className="size-4" /> Fora da nossa área de atendimento
                    </p>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      A Rede Representações atende <strong>somente parceiros sediados na {SERVED_STATE_NAME} (BA)</strong> — lojas, supermercados, farmácias e distribuidores. Se o seu CNPJ é da Bahia, selecione BA para continuar.
                    </p>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="size-3.5 text-primary" /> Representação exclusiva do estado da {SERVED_STATE_NAME}.
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={isOutOfCoverage || isSubmitting}
                  className="w-full gap-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-transform hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
                >
                  <Gift className="size-4" /> Continuar e Girar Roleta da Sorte
                </Button>
              </form>
            </div>
          ) : (
            /* Canal 2: Já sou Cliente (Login rápido por WhatsApp ou CNPJ) — sem roleta */
            <div className="space-y-4">
              <BackButton onClick={() => setView("choice")} />

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
                  onClick={() => setView("register")}
                  className="text-xs text-primary hover:underline"
                >
                  Primeira vez aqui? Faça o cadastro para girar a roleta
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft className="size-3.5" /> Voltar
    </button>
  );
}

/**
 * O que a Receita respondeu, em uma caixa curta embaixo do campo.
 *
 * Serve para o cliente ver que o sistema conferiu — e para ele perceber cedo se
 * digitou o CNPJ errado, em vez de descobrir quando o pedido não faturar.
 */
function RetornoDaReceita({
  consultando,
  consulta,
  erro,
}: {
  consultando: boolean;
  consulta: ConsultaCnpj | null;
  erro: string;
}) {
  if (consultando) {
    return (
      <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Conferindo na Receita Federal…
      </p>
    );
  }

  if (erro) {
    return (
      <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-[11px] font-semibold text-destructive">
        {erro}
      </p>
    );
  }

  if (!consulta) return null;

  const veredito = avaliarCnpj(consulta);
  const perfil = PERFIS[consulta.perfil as PerfilLead];
  const ativa = consulta.situacao === "ativa";

  return (
    <div
      className={cn(
        "mt-2 rounded-lg border px-3 py-2 text-[11px]",
        veredito.bloqueia
          ? "border-destructive/40 bg-destructive/5"
          : ativa
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <p className="flex items-center gap-1.5 font-bold">
        {veredito.bloqueia ? (
          <AlertTriangle className="size-3.5 text-destructive" />
        ) : ativa ? (
          <CheckCircle2 className="size-3.5 text-emerald-600" />
        ) : (
          <AlertTriangle className="size-3.5 text-amber-600" />
        )}
        <span
          className={
            veredito.bloqueia
              ? "text-destructive"
              : ativa
                ? "text-emerald-700"
                : "text-amber-700"
          }
        >
          {consulta.situacaoTexto}
        </span>
      </p>
      <p className="mt-1 font-semibold text-foreground">{consulta.razaoSocial}</p>
      {consulta.cidade && (
        <p className="text-muted-foreground">
          {consulta.cidade}/{consulta.uf}
          {consulta.bairro ? ` — ${consulta.bairro}` : ""}
        </p>
      )}
      {perfil && <p className="mt-1 text-muted-foreground">{perfil.label}</p>}
      {veredito.avisos.map((a) => (
        <p key={a} className="mt-1 font-semibold text-amber-700">
          {a}
        </p>
      ))}
    </div>
  );
}
