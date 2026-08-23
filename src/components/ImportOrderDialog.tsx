import { useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Search,
  FileSpreadsheet,
  ArrowLeft,
  Zap,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BRANDS, type BrandId } from "@/lib/catalog";
import { formatCnpj, formatPhone, onlyDigits } from "@/lib/leads";
import { parseOrderDocument, type ExtractedOrder } from "@/lib/order-import.functions";
import { parseOrderText } from "@/lib/order-text-parser";
import {
  matchExtractedOrder,
  brandFromExtraction,
  catalogOf,
  type DraftLine,
} from "@/lib/order-import";
import {
  createManualQuote,
  MANUAL_SOURCES,
  type ManualSource,
  type QuoteItem,
} from "@/lib/quotes.functions";
import { buildOrderSheet, downloadBlob, orderSheetFileName } from "@/lib/order-sheet";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MAX_FILE_MB = 8;

interface ImportOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function ImportOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: ImportOrderDialogProps) {
  const [step, setStep] = useState<"entrada" | "conferencia">("entrada");
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; base64: string; mediaType: string } | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [brand, setBrand] = useState<BrandId>("belliz");
  const [source, setSource] = useState<ManualSource>("whatsapp");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [obs, setObs] = useState("");
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [lidoPor, setLidoPor] = useState<"local" | "ia">("local");

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");

  const fileInput = useRef<HTMLInputElement | null>(null);
  const parseFn = useServerFn(parseOrderDocument);
  const createFn = useServerFn(createManualQuote);

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    [lines],
  );
  const pendentes = lines.filter((l) => l.review).length;

  const reset = () => {
    setStep("entrada");
    setText("");
    setFile(null);
    setLines([]);
    setObs("");
    setIgnoradas([]);
    setAvisos([]);
    setName("");
    setCnpj("");
    setPhone("");
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máximo ${MAX_FILE_MB} MB).`);
      return;
    }
    const ok = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    if (!ok.includes(f.type)) {
      toast.error("Formato aceito: PDF, PNG, JPG ou WEBP.");
      return;
    }
    const buf = await f.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    setFile({ name: f.name, base64: btoa(binary), mediaType: f.type });
  };

  /** Joga o pedido lido (pela IA ou pelo leitor local) na tela de conferência. */
  const aplicar = (order: ExtractedOrder, origem: "local" | "ia") => {
    const marca = brandFromExtraction(order) ?? brand;
    setBrand(marca);
    setLines(matchExtractedOrder(order, marca));
    setObs(order.observacaoGeral ?? "");
    if (order.cliente) setName(order.cliente);
    if (order.cnpj) setCnpj(formatCnpj(order.cnpj));
    if (order.telefone) setPhone(formatPhone(order.telefone));
    setLidoPor(origem);
    setStep("conferencia");
  };

  /** Leitura sem IA: instantânea e sem custo, para o texto do dia a dia. */
  const lerLocal = () => {
    if (!text.trim()) {
      toast.error("Cole o texto do pedido para ler sem IA.");
      return;
    }
    const res = parseOrderText(text);
    setIgnoradas(res.ignoradas);
    setAvisos(res.avisos);
    if (res.order.itens.length === 0) {
      toast.error("Não reconheci nenhum produto nesse texto.", {
        description: "Tente o botão Ler com IA, que entende escrita mais solta.",
      });
      return;
    }
    aplicar(res.order, "local");
    toast.success(`${res.order.itens.length} item(ns) reconhecidos sem gastar IA.`, {
      description:
        res.ignoradas.length > 0
          ? `${res.ignoradas.length} linha(s) não foram entendidas — dá para mandar para a IA.`
          : "Confira as linhas marcadas em amarelo antes de salvar.",
    });
  };

  const interpretar = async () => {
    if (!text.trim() && !file) {
      toast.error("Cole o texto do pedido ou envie um arquivo.");
      return;
    }
    setReading(true);
    try {
      const res = await parseFn({
        data: {
          text,
          file: file ? { base64: file.base64, mediaType: file.mediaType } : null,
        },
      });
      if (!res.ok || !res.order) {
        toast.error(res.error ?? "Não consegui ler este pedido.");
        return;
      }
      setIgnoradas([]);
      setAvisos([]);
      aplicar(res.order, "ia");
      toast.success(`${res.order.itens.length} item(ns) lido(s).`, {
        description: "Confira as linhas marcadas em amarelo antes de salvar.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler o pedido.");
    } finally {
      setReading(false);
    }
  };

  /** Troca o produto de uma linha por outro do catálogo, resolvendo a dúvida. */
  const trocarProduto = (index: number, code: string) => {
    const entry = catalogOf(brand).find((e) => e.code === code);
    if (!entry) return;
    setLines((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              code: entry.code,
              name: entry.name,
              line: entry.line,
              ean: entry.ean,
              pack: entry.pack,
              qty: Math.max(entry.pack, Math.ceil(l.qty / entry.pack) * entry.pack),
              match: "codigo",
              packLabel: entry.pack > 1 ? `coletivo de ${entry.pack}` : "unidade",
            }
          : l,
      ),
    );
  };

  const patch = (index: number, campos: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...campos } : l)));

  const confirmarLinha = (index: number) =>
    patch(index, { review: false, reviewNote: "" });

  const removerLinha = (index: number) =>
    setLines((prev) => prev.filter((_, i) => i !== index));

  const payloadItems = (): QuoteItem[] =>
    lines.map(({ raw: _raw, match: _match, packLabel: _packLabel, ...rest }) => ({
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

  const salvar = async (alsoDownload: boolean) => {
    const semCodigo = lines.filter((l) => !l.code).length;
    if (lines.length === 0) {
      toast.error("Nenhum item para salvar.");
      return;
    }
    if (semCodigo > 0) {
      toast.error(`${semCodigo} item(ns) sem produto do catálogo.`, {
        description: "Escolha o produto correto ou remova a linha.",
      });
      return;
    }
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
          status: "novo",
        },
      });
      if (alsoDownload) {
        const meta = sheetMeta();
        downloadBlob(buildOrderSheet(payloadItems(), meta), orderSheetFileName(meta));
      }
      toast.success(`Pedido ${BRANDS[brand].name} registrado.`, {
        description:
          pendentes > 0
            ? `${pendentes} item(ns) seguem marcados para conferência na planilha.`
            : `${lines.length} item(ns) · ${brl(total)}.`,
      });
      reset();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[95vw] max-w-4xl overflow-y-auto p-0">
        <div className="border-b border-border bg-muted/40 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Sparkles className="size-5 text-primary" /> Importar pedido
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Texto do WhatsApp é lido na hora, sem gastar IA. Foto e PDF precisam da IA.
            Nos dois casos, o que ficar em dúvida vem marcado para você conferir antes de salvar.
          </p>
        </div>

        {step === "entrada" ? (
          <div className="space-y-5 p-6">
            <div>
              <Label htmlFor="imp-text" className="text-xs font-semibold">
                Texto do pedido
              </Label>
              <Textarea
                id="imp-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={
                  "Cole aqui a mensagem do cliente. Ex:\n\nOi, quero 3 caixas do pente 4567, 10 escovas ricca profissional e 2 displays de espelho"
                }
                className="mt-1 text-sm"
              />
            </div>

            <div className="rounded-xl border border-dashed border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Ou envie o arquivo do pedido
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    PDF, foto do papel ou print de tela · até {MAX_FILE_MB} MB
                  </p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void pickFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" /> Escolher arquivo
                </Button>
              </div>
              {file && (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs">
                  <FileText className="size-4 text-primary" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full gap-2 font-bold"
                disabled={reading || !text.trim() || Boolean(file)}
                onClick={lerLocal}
              >
                <Zap className="size-4" /> Ler o texto agora (sem gastar IA)
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 font-bold"
                disabled={reading}
                onClick={interpretar}
              >
                <Sparkles className={cn("size-4", reading && "animate-pulse")} />
                {reading ? "Lendo o pedido…" : "Ler com IA"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {file
                  ? "Arquivo anexado: só a IA consegue ler foto e PDF."
                  : "Comece pelo botão de cima. Se ele não entender a mensagem, use a IA."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <button
              type="button"
              onClick={() => setStep("entrada")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="size-3.5" /> Voltar e reenviar
            </button>

            {/* Resumo da leitura */}
            <div
              className={cn(
                "rounded-xl border p-4",
                pendentes > 0
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-primary/30 bg-primary/5",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-bold">
                {pendentes > 0 ? (
                  <>
                    <AlertTriangle className="size-4 text-amber-600" />
                    <span className="text-amber-700">
                      {pendentes} de {lines.length} item(ns) precisam de conferência
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4 text-primary" />
                    <span className="text-primary">
                      Todos os {lines.length} itens foram identificados
                    </span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Itens que continuarem marcados saem sinalizados na coluna CONFERIR da
                planilha, para você validar com o cliente.
              </p>
              {obs && (
                <p className="mt-2 rounded-lg bg-card p-2 text-xs">
                  <strong>Observação lida no pedido:</strong> {obs}
                </p>
              )}
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                {lidoPor === "local" ? (
                  <>
                    <Zap className="size-3.5 text-primary" /> Lido sem IA · custo zero
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 text-primary" /> Lido com IA
                  </>
                )}
              </p>
            </div>

            {avisos.map((a) => (
              <p
                key={a}
                className="flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-500/5 p-3 text-xs font-medium text-amber-700"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {a}
              </p>
            ))}

            {ignoradas.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-xs font-bold">
                  {ignoradas.length} linha(s) não foram entendidas
                </p>
                <ul className="mt-2 space-y-1">
                  {ignoradas.slice(0, 6).map((l) => (
                    <li
                      key={l}
                      className="truncate rounded bg-card px-2 py-1 text-[11px] italic text-muted-foreground"
                    >
                      "{l}"
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Se alguma dessas era um produto, mande o texto para a IA — ela entende
                  escrita mais solta. Se era só conversa, pode ignorar.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-1.5 text-xs"
                  disabled={reading}
                  onClick={interpretar}
                >
                  <Sparkles className={cn("size-3.5", reading && "animate-pulse")} />
                  {reading ? "Lendo…" : "Ler tudo de novo com IA"}
                </Button>
              </div>
            )}

            {/* Marca, origem e cliente */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold">Marca</Label>
                <div className="mt-1 flex gap-1">
                  {(["belliz", "payot"] as const).map((b) => (
                    <Button
                      key={b}
                      type="button"
                      size="sm"
                      variant={brand === b ? "default" : "outline"}
                      className="flex-1 text-xs"
                      onClick={() => setBrand(b)}
                    >
                      {BRANDS[b].name}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="imp-source" className="text-xs font-semibold">
                  Chegou por
                </Label>
                <select
                  id="imp-source"
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
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Cliente <span className="font-medium normal-case">(opcional)</span>
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Loja / Razão social"
                />
                <Input
                  value={cnpj}
                  onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                  placeholder="CNPJ"
                  inputMode="numeric"
                />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="WhatsApp"
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Se preencher, o nome e o CNPJ entram no arquivo da planilha e o pedido fica
                rastreável pelo cliente.
              </p>
            </div>

            {/* Linhas lidas */}
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div
                  key={`${l.code}-${i}`}
                  className={cn(
                    "rounded-xl border p-3",
                    l.review ? "border-amber-500/50 bg-amber-500/5" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">
                        Lido no pedido:{" "}
                        <span className="italic">
                          {l.raw.trim()
                            ? `"${l.raw}"`
                            : "(a leitura não devolveu o texto original desta linha)"}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        {l.code ? `[${l.code}] ${l.name}` : "— produto não identificado —"}
                      </p>
                      {l.reviewNote && (
                        <p className="mt-1 flex items-start gap-1.5 text-[11px] font-medium text-amber-700">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          {l.reviewNote}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">
                          {l.pack > 1 ? "Unidades" : "Qtde"}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={l.qty}
                          onChange={(e) =>
                            patch(i, { qty: Math.max(1, Number(e.target.value)) })
                          }
                          className="h-8 w-20 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Preço un.</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.unitPrice}
                          onChange={(e) =>
                            patch(i, { unitPrice: Math.max(0, Number(e.target.value)) })
                          }
                          className="h-8 w-24 text-sm"
                        />
                      </div>
                      <div className="w-24 text-right">
                        <Label className="text-[10px] text-muted-foreground">Total</Label>
                        <p className="text-sm font-bold">{brl(l.qty * l.unitPrice)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removerLinha(i)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {l.review && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-500/30 pt-3">
                      <ProductPicker
                        brand={brand}
                        onPick={(code) => trocarProduto(i, code)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        onClick={() => confirmarLinha(i)}
                        disabled={!l.code}
                      >
                        <CheckCircle2 className="size-3.5" /> Está certo, confirmar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Total · {lines.length} item(ns)
                </p>
                <p className="text-2xl font-bold text-primary">{brl(total)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-2 font-bold"
                  disabled={saving}
                  onClick={() => salvar(true)}
                >
                  <FileSpreadsheet className="size-4" />
                  {saving ? "Salvando…" : "Salvar e baixar planilha"}
                </Button>
                <Button variant="outline" disabled={saving} onClick={() => salvar(false)}>
                  Só salvar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Busca rápida no catálogo para corrigir o produto de uma linha duvidosa. */
function ProductPicker({
  brand,
  onPick,
}: {
  brand: BrandId;
  onPick: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (termo.length < 2) return [];
    return catalogOf(brand)
      .filter(
        (e) =>
          e.name.toLowerCase().includes(termo) ||
          e.code.toLowerCase().includes(termo) ||
          onlyDigits(e.ean).includes(termo),
      )
      .slice(0, 6);
  }, [q, brand]);

  return (
    <div className="relative flex-1 min-w-[220px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Trocar pelo produto certo…"
        className="h-8 pl-8 text-xs"
      />
      {results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {results.map((e) => (
            <button
              key={e.code}
              type="button"
              onClick={() => {
                onPick(e.code);
                setQ("");
              }}
              className="block w-full border-b border-border/60 p-2 text-left text-xs last:border-0 hover:bg-muted/60"
            >
              <span className="font-medium">{e.name}</span>
              <span className="block text-[10px] text-muted-foreground">
                [{e.code}] {e.line}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
