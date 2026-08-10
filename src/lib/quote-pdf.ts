import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { REP_NAME, WHATSAPP_NUMBER } from "@/lib/catalog";

export type QuoteLine = {
  brand: string; // nome da marca (Belliz / Payot)
  code: string;
  name: string;
  line?: string;
  pack?: number;
  qty: number;
  unitPrice: number;
  curva?: "A" | "B" | "C";
};

export type QuoteMeta = {
  title: string;
  customerName: string;
  customerPhone?: string;
  customerCnpj?: string;
  business?: string;
  publico?: string;
  budget?: number;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const GREEN: [number, number, number] = [22, 122, 62];
const DARK: [number, number, number] = [23, 23, 23];

const slug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "cliente";

export function quoteFileName(meta: QuoteMeta) {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  return `Orcamento-${slug(meta.customerName)}-${date}.pdf`;
}

export function buildQuotePdf(lines: QuoteLine[], meta: QuoteMeta): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Cabeçalho
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageW, 76, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(meta.title, margin, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${REP_NAME} · WhatsApp +${WHATSAPP_NUMBER}`, margin, 52);
  doc.text(
    `Emitido em ${new Date().toLocaleDateString("pt-BR")}`,
    pageW - margin,
    52,
    { align: "right" },
  );

  // Dados do cliente
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Dados do cliente", margin, 106);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const info: string[] = [`Nome: ${meta.customerName}`];
  if (meta.customerPhone) info.push(`Telefone: ${meta.customerPhone}`);
  if (meta.customerCnpj) info.push(`CNPJ: ${meta.customerCnpj}`);
  if (meta.business) info.push(`Negócio: ${meta.business}`);
  if (meta.publico) info.push(`Público: ${meta.publico}`);
  if (typeof meta.budget === "number" && meta.budget > 0)
    info.push(`Verba informada: ${brl(meta.budget)}`);

  let y = 122;
  for (const l of info) {
    doc.text(l, margin, y);
    y += 14;
  }

  const hasCurva = lines.some((l) => l.curva);
  const brands = Array.from(new Set(lines.map((l) => l.brand)));
  let cursor = y + 8;
  let total = 0;
  let totalUnits = 0;

  for (const brand of brands) {
    const group = lines.filter((l) => l.brand === brand);
    const order = { A: 0, B: 1, C: 2 } as const;
    group.sort(
      (a, b) =>
        (order[a.curva ?? "C"] ?? 3) - (order[b.curva ?? "C"] ?? 3) ||
        b.unitPrice * b.qty - a.unitPrice * a.qty,
    );

    const body = group.map((l) => {
      const sub = l.unitPrice * l.qty;
      total += sub;
      totalUnits += l.qty;
      const row: string[] = [];
      if (hasCurva) row.push(l.curva ?? "-");
      row.push(
        l.code,
        l.name,
        l.line ?? "-",
        l.pack ? String(l.pack) : "1",
        String(l.qty),
        brl(l.unitPrice),
        brl(sub),
      );
      return row;
    });

    const head = [
      ...(hasCurva ? ["Curva"] : []),
      "Código",
      "Produto",
      "Linha",
      "Pack",
      "Qtd",
      "Unit.",
      "Total",
    ];

    // Título da marca acima da tabela
    if (cursor > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      cursor = 40;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...GREEN);
    doc.text(brand, margin, cursor + 12);
    doc.setTextColor(...DARK);

    autoTable(doc, {
      startY: cursor + 18,
      head: [head],
      body,
      margin: { left: margin, right: margin },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: DARK },
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 248, 245] },
      columnStyles: hasCurva
        ? {
            0: { cellWidth: 32, halign: "center" },
            1: { cellWidth: 52 },
            3: { cellWidth: 70 },
            4: { cellWidth: 30, halign: "center" },
            5: { cellWidth: 30, halign: "center" },
            6: { cellWidth: 52, halign: "right" },
            7: { cellWidth: 58, halign: "right" },
          }
        : {
            0: { cellWidth: 55 },
            2: { cellWidth: 80 },
            3: { cellWidth: 32, halign: "center" },
            4: { cellWidth: 32, halign: "center" },
            5: { cellWidth: 58, halign: "right" },
            6: { cellWidth: 62, halign: "right" },
          },
    });


    cursor = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
  }

  // Resumo
  const summaryY = cursor + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Total do orçamento: ${brl(total)}`, margin, summaryY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${lines.length} itens distintos · ${totalUnits} unidades`,
    margin,
    summaryY + 14,
  );

  if (hasCurva) {
    const dist = (["A", "B", "C"] as const).map((c) => {
      const g = lines.filter((l) => l.curva === c);
      const v = g.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      const pct = total > 0 ? Math.round((v / total) * 100) : 0;
      return `Curva ${c}: ${g.length} itens · ${brl(v)} (${pct}%)`;
    });
    doc.text(dist.join("   |   "), margin, summaryY + 28);
  }

  // Rodapé + numeração
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "Orçamento sem valor fiscal. Preços e disponibilidade sujeitos a alteração.",
      margin,
      h - 24,
    );
    doc.text(`Página ${i} de ${pages}`, pageW - margin, h - 24, { align: "right" });
  }

  return doc.output("blob");
}

export function downloadPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Tenta compartilhar o PDF pelo menu nativo (celular → WhatsApp com anexo).
 * Se não houver suporte, baixa o arquivo e abre o WhatsApp com a mensagem resumo.
 * Retorna "shared" ou "downloaded".
 */
export async function shareQuotePdf(
  blob: Blob,
  fileName: string,
  message: string,
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], fileName, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: fileName, text: message });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "shared";
    }
  }
  downloadPdf(blob, fileName);
  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener",
  );
  return "downloaded";
}
