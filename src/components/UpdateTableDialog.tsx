import { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { applyImport } from "@/lib/catalog.functions";
import { lerTabelaPayot, type LeituraTabela } from "@/lib/table-import";
import { origemDoModelo, type ModeloPayot } from "@/lib/modelo-payot";
import type { StatusModelo } from "@/lib/use-modelo-payot";
import { TABELA_VAREJO } from "@/lib/tabela-preco";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface UpdateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
  /** Publica o mapa no banco. Devolve false se só deu para salvar localmente. */
  publicarModelo: (modelo: ModeloPayot) => Promise<boolean>;
  statusModelo: StatusModelo;
}

export function UpdateTableDialog({
  open,
  onOpenChange,
  onApplied,
  publicarModelo,
  statusModelo,
}: UpdateTableDialogProps) {
  const [leitura, setLeitura] = useState<LeituraTabela | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const applyFn = useServerFn(applyImport);

  const escolher = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      toast.error("Envie a planilha da Payot em .xlsx.");
      return;
    }
    try {
      const res = lerTabelaPayot(await f.arrayBuffer());
      setLeitura(res);
      setNomeArquivo(f.name);
      toast.success(`${res.produtos.length} produtos lidos da tabela.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui ler a planilha.");
    }
  };

  const tabelaErrada =
    leitura !== null && leitura.descontoDetectado !== TABELA_VAREJO;

  const aplicar = async () => {
    if (!leitura || tabelaErrada) return;
    setAplicando(true);
    try {
      const res = await applyFn({
        data: {
          brand: "payot",
          rows: leitura.produtos,
          deactivateMissing: true,
        },
      });
      const sincronizou = await publicarModelo(leitura.modelo);
      toast.success("Tabela da Payot atualizada.", {
        description: `${res.upserted} produtos gravados${res.deactivated ? `, ${res.deactivated} desativados` : ""}. ${
          sincronizou
            ? "O mapa da colagem valia para todos os seus aparelhos."
            : "Atenção: o mapa da colagem ficou só neste aparelho — não consegui gravar no sistema."
        }`,
      });
      setLeitura(null);
      setNomeArquivo("");
      onApplied();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível aplicar.");
    } finally {
      setAplicando(false);
    }
  };

  const d = leitura?.diff;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[95vw] max-w-3xl overflow-y-auto p-0">
        <div className="border-b border-border bg-muted/40 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <RefreshCw className="size-5 text-primary" /> Atualizar tabela da Payot
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Envie a Tabela de Preços do mês. O sistema mostra o que mudou antes de
            gravar, e realinha a coluna de colagem.
          </p>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-xl border border-dashed border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Tabela de Preços Payot (.xlsx)</p>
                <p className="text-[11px] text-muted-foreground">
                  {statusModelo === "carregando"
                    ? "Buscando o mapa da tabela no sistema…"
                    : origemDoModelo()}
                </p>
                {statusModelo === "offline" && (
                  <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
                    Sem contato com o sistema: o que for importado agora vale só
                    neste aparelho.
                  </p>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => void escolher(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-4" /> Escolher arquivo
              </Button>
            </div>
            {nomeArquivo && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs">
                <FileSpreadsheet className="size-4 text-primary" />
                <span className="flex-1 truncate">{nomeArquivo}</span>
              </p>
            )}
          </div>

          {leitura && tabelaErrada && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4">
              <p className="flex items-start gap-2 text-sm font-bold text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Esta é a tabela de {leitura.descontoDetectado}%, não a de varejo
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                O catálogo do site trabalha com a tabela de varejo ({TABELA_VAREJO}%).
                Importar esta aqui derrubaria o preço de todos os produtos. Para vender
                no atacado, use o seletor de tabela na hora de montar o pedido.
              </p>
            </div>
          )}

          {d && !tabelaErrada && (
            <>
              <div
                className={cn(
                  "rounded-xl border p-4",
                  d.layoutMudou
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-primary/30 bg-primary/5",
                )}
              >
                <p className="flex items-center gap-2 text-sm font-bold">
                  {d.layoutMudou ? (
                    <>
                      <AlertTriangle className="size-4 text-amber-600" />
                      <span className="text-amber-700">
                        A ordem das linhas mudou — a colagem antiga sairia torta
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 text-primary" />
                      <span className="text-primary">
                        A ordem das linhas continua igual
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.layoutMudou
                    ? "Aplicar agora realinha a coluna de colagem com esta tabela."
                    : "Os preços podem ter mudado, mas a colagem continua caindo nos mesmos produtos."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Resumo label="Produtos" valor={String(d.totalProdutos)} />
                <Resumo label="Desconto da tabela" valor={`${leitura?.descontoDetectado ?? 0}%`} />
                <Resumo label="Novos / Saíram" valor={`${d.novos.length} / ${d.sairam.length}`} />
                <Resumo label="Preços alterados" valor={String(d.precos.length)} />
              </div>

              {d.novos.length > 0 && (
                <Lista
                  titulo="Produtos novos"
                  itens={d.novos.map((p) => `[${p.code}] ${p.name}`)}
                />
              )}
              {d.sairam.length > 0 && (
                <Lista
                  titulo="Saíram da tabela (ficam desativados no catálogo)"
                  itens={d.sairam.map((p) => `[${p.code}] ${p.name}`)}
                />
              )}

              {d.precos.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Preços alterados
                  </h3>
                  <div className="mt-2 space-y-1">
                    {d.precos.slice(0, 12).map((p) => (
                      <div
                        key={p.code}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <strong>[{p.code}]</strong> {p.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {brl(p.de)} → <strong className="text-foreground">{brl(p.para)}</strong>
                        </span>
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-1 font-bold",
                            p.percentual > 0 ? "text-emerald-700" : "text-destructive",
                          )}
                        >
                          {p.percentual > 0 ? (
                            <TrendingUp className="size-3" />
                          ) : (
                            <TrendingDown className="size-3" />
                          )}
                          {p.percentual > 0 ? "+" : ""}
                          {p.percentual.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                    {d.precos.length > 12 && (
                      <p className="text-[11px] text-muted-foreground">
                        e mais {d.precos.length - 12} produto(s).
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-[11px] text-muted-foreground">
                  Ao aplicar, os preços do catálogo do site passam a ser os desta tabela,
                  e o mapa de colagem passa a valer em todos os seus aparelhos. Os preços continuam
                  sendo os líquidos com os 15% — nada é descontado por cima.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="gap-2 font-bold"
                    disabled={aplicando}
                    onClick={() => void aplicar()}
                  >
                    <CheckCircle2 className="size-4" />
                    {aplicando ? "Aplicando…" : "Aplicar esta tabela"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={aplicando}
                    onClick={() => {
                      setLeitura(null);
                      setNomeArquivo("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-black">{valor}</p>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h3>
      <ul className="mt-2 space-y-1">
        {itens.slice(0, 10).map((t) => (
          <li
            key={t}
            className="truncate rounded bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
          >
            {t}
          </li>
        ))}
        {itens.length > 10 && (
          <li className="text-[11px] text-muted-foreground">
            e mais {itens.length - 10}.
          </li>
        )}
      </ul>
    </div>
  );
}
