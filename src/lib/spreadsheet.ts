import * as XLSX from "xlsx";

import type { ImportRow } from "@/lib/catalog.functions";

/** Desconto de representante aplicado sobre o preço de tabela da Belliz. */
export const BELLIZ_DISCOUNT = 0.15;

const clean = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = Number(clean(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (v: number) => Math.round(v * 100) / 100;

type Grid = unknown[][];

function sheetGrid(wb: XLSX.WorkBook, name: string): Grid {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

function findHeader(grid: Grid, needle: string) {
  return grid.findIndex((row) => row.some((c) => clean(c).toUpperCase().startsWith(needle)));
}

function indexOfHeader(row: unknown[], labels: string[]) {
  return row.findIndex((c) => labels.some((l) => clean(c).toUpperCase() === l));
}

export function parseBelliz(buffer: ArrayBuffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.SheetNames.find((n) => n.toLowerCase().includes("lista")) ?? wb.SheetNames[0];
  const grid = sheetGrid(wb, sheet);
  const h = findHeader(grid, "CÓDIGO");
  if (h < 0) throw new Error("Não encontrei a coluna CÓDIGO na planilha Belliz.");
  const head = grid[h];
  const cCode = indexOfHeader(head, ["CÓDIGO", "CODIGO"]);
  const cName = indexOfHeader(head, ["DESCRIÇÃO", "DESCRICAO"]);
  const cLine = indexOfHeader(head, ["MARCA"]);
  const cEan = indexOfHeader(head, ["EAN-13", "EAN"]);
  const cUnit = indexOfHeader(head, ["R$ UNITÁRIO", "R$ UNITARIO"]);
  const cCol = indexOfHeader(head, ["QTDE COLETIVO", "COLETIVO"]);

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const code = clean(r[cCode]).replace(/\.0$/, "");
    const unit = num(r[cUnit]);
    if (!code || !Number.isFinite(unit) || unit <= 0 || seen.has(code)) continue;
    seen.add(code);
    const coletivo = Math.max(1, Math.round(num(r[cCol])) || 1);
    const liquido = round2(unit * (1 - BELLIZ_DISCOUNT));
    rows.push({
      brand_id: "belliz",
      code,
      name: clean(r[cName]).toLowerCase().replace(/(^|\s|\/)\S/g, (m) => m.toUpperCase()),
      line: clean(r[cLine]),
      ean: clean(r[cEan]).replace(/\D/g, ""),
      price_unit: liquido,
      price_full: round2(unit),
      coletivo,
      price_coletivo: round2(liquido * coletivo),
    });
  }
  return rows;
}

export function parsePayot(buffer: ArrayBuffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const grid = sheetGrid(wb, wb.SheetNames[0]);
  const h = findHeader(grid, "CÓDIGO");
  if (h < 0) throw new Error("Não encontrei a coluna CÓDIGO na planilha Payot.");
  const head = grid[h];
  const cCode = indexOfHeader(head, ["CÓDIGO", "CODIGO"]);
  const cName = indexOfHeader(head, ["DESCRIÇÃO", "DESCRICAO"]);
  const cEan = indexOfHeader(head, ["EAN-13", "EAN"]);
  const cFull = indexOfHeader(head, ["PRÇ CHEIO", "PREÇO CHEIO", "PRC CHEIO"]);
  const cPrice = indexOfHeader(head, ["PREÇO", "PRECO"]);

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let line = "";
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const first = clean(r[cCode] ?? r[0]).toUpperCase();
    if (first.startsWith("LINHA")) {
      line = clean(r[cCode] ?? r[0]).replace(/^LINHA\s*/i, "");
      continue;
    }
    const code = clean(r[cCode]).replace(/\.0$/, "");
    const price = num(r[cPrice]);
    if (!code || !Number.isFinite(price) || price <= 0 || seen.has(code)) continue;
    seen.add(code);
    const full = num(r[cFull]);
    rows.push({
      brand_id: "payot",
      code,
      name: clean(r[cName]),
      line,
      ean: clean(r[cEan]).replace(/\D/g, ""),
      price_unit: round2(price),
      price_full: Number.isFinite(full) && full > 0 ? round2(full) : null,
      coletivo: 1,
      price_coletivo: round2(price),
    });
  }
  return rows;
}

export function parseSpreadsheet(brand: "belliz" | "payot", buffer: ArrayBuffer): ImportRow[] {
  return brand === "belliz" ? parseBelliz(buffer) : parsePayot(buffer);
}
