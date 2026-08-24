import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { confirmarItens, type QuoteItem } from "@/lib/quotes.functions";

/**
 * Conferência dos itens que o sistema leu sem certeza.
 *
 * Item lido de foto ou de texto de WhatsApp entra marcado. Enquanto houver
 * marca, o pedido não gera arquivo para a indústria sem passar por aqui: código
 * errado só aparece no faturamento, quando já custou caro.
 */
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface PendingReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  customerName: string;
  pendentes: QuoteItem[];
  /** Recarrega a lista depois de conferir. */
  onConfirmed: () => void;
  /** O que a pessoa tentou fazer quando foi barrada. */
  acaoBloqueada?: { rotulo: string; executar: () => void } | null;
}

export function PendingReviewDialog({
  open,
  onOpenChange,
  quoteId,
  customerName,
  pendentes,
  onConfirmed,
  acaoBloqueada,
}: PendingReviewDialogProps) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const confirmar = useServerFn(confirmarItens);

  const conferir = async (codes: string[]) => {
    setSalvando(codes.length === 1 ? codes[0] : "todos");
    try {
      const res = await confirmar({ data: { id: quoteId, codes } });
      toast.success(
        res.conferidos === 1 ? "Item conferido." : `${res.conferidos} itens conferidos.`,
        {
          description:
            res.pendentes > 0
              ? `Ainda faltam ${res.pendentes}.`
              : "O pedido está liberado para gerar os arquivos.",
        },
      );
      onConfirmed();
      if (res.pendentes === 0) onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui gravar a conferência.");
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[95vw] max-w-2xl overflow-y-auto p-0">
        <div className="border-b border-border bg-amber-500/5 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <AlertTriangle className="size-5 text-amber-600" />
            {pendentes.length === 1
              ? "1 item precisa da sua conferência"
              : `${pendentes.length} itens precisam da sua conferência`}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {customerName || "Pedido"} — o sistema leu estes itens sem certeza. Confira o
            código e a quantidade antes de mandar para a indústria.
          </p>
        </div>

        <div className="space-y-3 p-6">
          {pendentes.map((i) => (
            <div
              key={i.code}
              className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    <span className="text-muted-foreground">[{i.code}]</span> {i.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {i.qty} un · {brl(i.unitPrice)} cada ·{" "}
                    <strong className="text-foreground">{brl(i.qty * i.unitPrice)}</strong>
                  </p>
                  {i.reviewNote && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      Motivo: {i.reviewNote}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  disabled={salvando !== null}
                  onClick={() => void conferir([i.code])}
                >
                  <CheckCircle2 className="size-4" />
                  {salvando === i.code ? "Gravando…" : "Confere"}
                </Button>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              Conferir grava a data no pedido. Se algum item estiver errado, apague o
              pedido e lance de novo — assim o histórico não fica com item trocado.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className="gap-2 font-bold"
                disabled={salvando !== null}
                onClick={() => void conferir([])}
              >
                <CheckCircle2 className="size-4" />
                {salvando === "todos" ? "Gravando…" : "Conferi todos"}
              </Button>
              {acaoBloqueada && (
                <Button
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  disabled={salvando !== null}
                  onClick={() => {
                    acaoBloqueada.executar();
                    onOpenChange(false);
                  }}
                >
                  {acaoBloqueada.rotulo} sem conferir
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
