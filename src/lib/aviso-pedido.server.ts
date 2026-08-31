/**
 * Aviso de pedido novo por e-mail.
 *
 * Roda só no servidor (arquivo `.server.ts`) e é chamado logo depois de gravar
 * o orçamento. NUNCA lança erro: o pedido do cliente não pode falhar porque o
 * e-mail não saiu. Quando algo dá errado, registra no log e devolve o motivo,
 * para o painel poder mostrar que o aviso não foi.
 *
 * Configuração (Lovable Cloud → Secrets):
 *   RESEND_API_KEY       chave da conta do Resend
 *   AVISO_PEDIDO_EMAIL   para quem avisar (pode ser mais de um, separado por vírgula)
 *   AVISO_PEDIDO_DE      opcional; remetente. Sem isso usa o de teste do Resend,
 *                        que só entrega no e-mail dono da conta.
 *   SITE_URL             opcional; usado no link do painel dentro do e-mail.
 */
import type { QuoteItem } from "@/lib/quotes.functions";

const REMETENTE_TESTE = "Rede Representações <onboarding@resend.dev>";

export type ResultadoAviso =
  | { enviado: true }
  | { enviado: false; motivo: string };

export type PedidoParaAviso = {
  id: string;
  brand_id: string;
  customer_name: string;
  customer_phone: string;
  customer_cnpj: string;
  items: QuoteItem[];
  total: number;
  criadoEm: string;
};

/** Código curto que o cliente e o Gabriel usam para falar do mesmo pedido. */
export function protocoloDoPedido(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const escapar = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

const MARCAS: Record<string, string> = { belliz: "Belliz", payot: "Payot" };

function corpo(p: PedidoParaAviso, protocolo: string): string {
  const marca = MARCAS[p.brand_id] ?? p.brand_id;
  const unidades = p.items.reduce((s, i) => s + i.qty, 0);
  const zap = p.customer_phone.replace(/\D/g, "");
  const site = process.env["SITE_URL"] || "";
  const quando = new Date(p.criadoEm).toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
  });

  const linhas = p.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace">${escapar(i.code)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapar(i.name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${i.qty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${dinheiro(i.unitPrice)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${dinheiro(i.qty * i.unitPrice)}</td>
      </tr>`,
    )
    .join("");

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;color:#111">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666">Pedido novo · protocolo ${protocolo}</p>
    <h1 style="margin:0 0 2px;font-size:22px">${escapar(p.customer_name)}</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#555">${marca} · ${dinheiro(p.total)} · ${p.items.length} itens · ${unidades} unidades</p>

    <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
      <tr><td style="padding:3px 14px 3px 0;color:#666">Telefone</td><td style="padding:3px 0"><a href="https://wa.me/55${zap}" style="color:#059669;font-weight:600;text-decoration:none">${escapar(p.customer_phone)}</a></td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#666">CNPJ</td><td style="padding:3px 0">${escapar(p.customer_cnpj)}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#666">Recebido</td><td style="padding:3px 0">${quando}</td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f6f6f6;text-align:left">
        <th style="padding:8px 10px">Código</th><th style="padding:8px 10px">Produto</th>
        <th style="padding:8px 10px;text-align:right">Qtde</th>
        <th style="padding:8px 10px;text-align:right">Unit.</th>
        <th style="padding:8px 10px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr>
        <td colspan="4" style="padding:10px;text-align:right;font-weight:700">Total do pedido</td>
        <td style="padding:10px;text-align:right;font-weight:700;font-size:15px">${dinheiro(p.total)}</td>
      </tr></tfoot>
    </table>

    ${site ? `<p style="margin:22px 0 0"><a href="${escapar(site)}/pedidos" style="background:#059669;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Abrir no painel</a></p>` : ""}

    <p style="margin:26px 0 0;font-size:12px;color:#888">Confira os códigos e as quantidades no painel antes de lançar no site da indústria.</p>
  </div>`;
}

export async function avisarPedidoNovo(p: PedidoParaAviso): Promise<ResultadoAviso> {
  const chave = process.env["RESEND_API_KEY"];
  const destino = (process.env["AVISO_PEDIDO_EMAIL"] || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (!chave) return { enviado: false, motivo: "RESEND_API_KEY não configurada" };
  if (destino.length === 0)
    return { enviado: false, motivo: "AVISO_PEDIDO_EMAIL não configurado" };

  const protocolo = protocoloDoPedido(p.id);
  const marca = MARCAS[p.brand_id] ?? p.brand_id;

  try {
    // Sem timeout o pedido do cliente ficaria preso esperando o e-mail sair.
    const corta = AbortSignal.timeout(8000);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      signal: corta,
      body: JSON.stringify({
        from: process.env["AVISO_PEDIDO_DE"] || REMETENTE_TESTE,
        to: destino,
        subject: `Pedido novo · ${marca} · ${p.customer_name} · ${dinheiro(p.total)}`,
        html: corpo(p, protocolo),
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.error("[aviso-pedido] Resend recusou:", r.status, detalhe.slice(0, 400));
      return { enviado: false, motivo: `Resend respondeu ${r.status}` };
    }
    return { enviado: true };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "falha desconhecida";
    console.error("[aviso-pedido] não consegui enviar:", motivo);
    return { enviado: false, motivo };
  }
}
