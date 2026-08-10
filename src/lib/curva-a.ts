import { BELLIZ, PAYOT, type BrandId } from "@/lib/catalog";

export type FocusId =
  | "cabelo"
  | "unhas"
  | "maquiagem-acessorios"
  | "higiene"
  | "eletro"
  | "skincare"
  | "maquiagem-payot";

export type Publico = "popular" | "intermediario" | "premium";

export type BusinessType = "salao" | "barbearia" | "loja" | "farmacia" | "revenda";

export type Answers = {
  brand: BrandId;
  business: BusinessType;
  focos: FocusId[];
  publico: Publico;
  budget: number;
};

export type Focus = {
  id: FocusId;
  brand: BrandId;
  label: string;
  hint: string;
  match: (p: { name: string; line: string }) => boolean;
};

const norm = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

export const FOCUSES: Focus[] = [
  {
    id: "cabelo",
    brand: "belliz",
    label: "Cabelo, escovas e pentes",
    hint: "Escovas, pentes, piranhas, elásticos e modeladores",
    match: (p) =>
      has(norm(p.name), [
        "escova",
        "pente",
        "piranha",
        "prendedor",
        "elastico",
        "modelador",
        "presilha",
        "tiara",
        "touca",
        "bob",
      ]),
  },
  {
    id: "unhas",
    brand: "belliz",
    label: "Unhas e manicure",
    hint: "Lixas, alicates, palitos, pinças e acessórios",
    match: (p) =>
      has(norm(p.name), ["unha", "lixa", "alicate", "palito", "pinca", "cuticula", "espatula"]),
  },
  {
    id: "maquiagem-acessorios",
    brand: "belliz",
    label: "Pincéis e acessórios de maquiagem",
    hint: "Pincéis, esponjas, espelhos e cílios postiços",
    match: (p) =>
      has(norm(p.name), ["pincel", "esponja", "cilio", "espelho", "aplicador", "necessaire"]),
  },
  {
    id: "higiene",
    brand: "belliz",
    label: "Higiene e barbearia",
    hint: "Escova dental, navalhas, algodão e descartáveis",
    match: (p) =>
      has(norm(p.name), ["dental", "navalha", "barb", "algodao", "cotonete", "haste", "descartavel"]),
  },
  {
    id: "eletro",
    brand: "belliz",
    label: "Eletroportáteis Vertix",
    hint: "Secadores, pranchas, máquinas e babyliss",
    match: (p) =>
      has(norm(p.name), ["secador", "prancha", "chapinha", "maquina", "babyliss", "aparador", "cortador"]),
  },
  {
    id: "skincare",
    brand: "payot",
    label: "Skincare Payot",
    hint: "Tratamento facial, vitamina C, retinol e protetor solar",
    match: (p) =>
      has(norm(p.line), [
        "vitamina",
        "retinol",
        "tratamento",
        "acnederm",
        "essencial",
        "botanico",
        "protetor",
        "maternite",
        "shampoo",
      ]) && !norm(p.line).includes("base"),
  },
  {
    id: "maquiagem-payot",
    brand: "payot",
    label: "Maquiagem Payot",
    hint: "Batons, bases, corretivos, pós e máscaras",
    match: (p) =>
      has(norm(p.line), [
        "cherie",
        "batom",
        "lapis",
        "corretivo",
        "de po",
        "blush",
        "gloss",
        "mascara",
        "caneta",
        "delineador",
        "maquilagem",
        "base",
      ]),
  },
];

export const BUSINESS_PRESETS: Record<
  BusinessType,
  { label: string; hint: string; focos: FocusId[] }
> = {
  salao: {
    label: "Salão de beleza / cabeleireiro",
    hint: "Foco em cabelo, unhas e acessórios profissionais",
    focos: ["cabelo", "unhas", "maquiagem-acessorios"],
  },
  barbearia: {
    label: "Barbearia",
    hint: "Barbear, higiene e eletroportáteis",
    focos: ["higiene", "eletro", "cabelo"],
  },
  loja: {
    label: "Loja de cosméticos / perfumaria",
    hint: "Mix amplo de beleza e maquiagem",
    focos: ["cabelo", "maquiagem-acessorios", "maquiagem-payot", "skincare"],
  },
  farmacia: {
    label: "Farmácia / drogaria",
    hint: "Skincare, higiene e itens de giro rápido",
    focos: ["skincare", "higiene", "unhas"],
  },
  revenda: {
    label: "Revenda / consultora",
    hint: "Itens de alto giro e ticket acessível",
    focos: ["maquiagem-payot", "skincare", "maquiagem-acessorios"],
  },
};

export const PUBLICO_LABEL: Record<Publico, string> = {
  popular: "Popular (preço baixo, alto giro)",
  intermediario: "Intermediário (equilíbrio preço x margem)",
  premium: "Premium (ticket alto, itens exclusivos)",
};

export type SuggestedItem = {
  brand: BrandId;
  code: string;
  name: string;
  line: string;
  ean: string;
  unitPrice: number;
  packSize: number; // Belliz: coletivo; Payot: 1
  packPrice: number;
  qty: number; // unidades totais
  curva: "A" | "B" | "C";
  focus: FocusId;
};

type Candidate = Omit<SuggestedItem, "qty" | "curva"> & { score: number };

const priceFit = (price: number, publico: Publico) => {
  // faixa alvo de preço unitário por perfil de público
  const target =
    publico === "popular" ? [0, 15] : publico === "intermediario" ? [10, 45] : [35, 500];
  if (price >= target[0] && price <= target[1]) return 1;
  const dist = price < target[0] ? target[0] - price : price - target[1];
  return Math.max(0.15, 1 - dist / 60);
};

function candidatesFor(focus: Focus, publico: Publico): Candidate[] {
  const list: Candidate[] = [];
  if (focus.brand === "belliz") {
    for (const p of BELLIZ) {
      if (!focus.match(p)) continue;
      const unit = p.priceColetivo && p.coletivo ? p.priceColetivo / p.coletivo : p.priceUnit;
      if (!unit || !Number.isFinite(unit)) continue;
      const packSize = Math.max(1, p.coletivo || 1);
      list.push({
        brand: "belliz",
        code: p.code,
        name: p.name,
        line: p.line,
        ean: p.ean,
        unitPrice: unit,
        packSize,
        packPrice: unit * packSize,
        focus: focus.id,
        score: priceFit(unit, publico),
      });
    }
  } else {
    for (const p of PAYOT) {
      if (!focus.match(p)) continue;
      if (!p.price) continue;
      list.push({
        brand: "payot",
        code: p.code,
        name: p.name,
        line: p.line,
        ean: p.ean,
        unitPrice: p.price,
        packSize: 1,
        packPrice: p.price,
        focus: focus.id,
        score: priceFit(p.price, publico),
      });
    }
  }
  // diversifica: no máximo 3 itens muito parecidos (mesmo prefixo de nome)
  const seen = new Map<string, number>();
  return list
    .sort((a, b) => b.score - a.score || a.packPrice - b.packPrice)
    .filter((c) => {
      const key = norm(c.name).split(" ").slice(0, 2).join(" ");
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n <= 3;
    });
}

export function buildCurvaA(answers: Answers): {
  items: SuggestedItem[];
  total: number;
  budget: number;
} {
  const focos = answers.focos.length
    ? answers.focos
    : BUSINESS_PRESETS[answers.business].focos;
  const budget = Math.max(0, answers.budget);
  const perFocus = budget / focos.length;

  const items: SuggestedItem[] = [];
  let total = 0;

  for (const id of focos) {
    const focus = FOCUSES.find((f) => f.id === id);
    if (!focus) continue;
    const pool = candidatesFor(focus, answers.publico);
    if (pool.length === 0) continue;

    // Curva ABC: 20% A, 30% B, 50% C do orçamento da categoria
    const aCount = Math.max(1, Math.round(Math.min(pool.length, 12) * 0.25));
    const bCount = Math.max(1, Math.round(Math.min(pool.length, 16) * 0.35));
    const selection = pool.slice(0, Math.min(pool.length, 20));

    let spent = 0;
    // 1ª passada: 1 pack de cada, começando pelos melhores
    for (const c of selection) {
      if (spent + c.packPrice > perFocus) continue;
      items.push({ ...c, qty: c.packSize, curva: "C" });
      spent += c.packPrice;
    }
    // 2ª passada: reforça os itens curva A/B até esgotar a verba da categoria
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.focus !== id) continue;
        const idx = selection.findIndex((c) => c.code === it.code && c.brand === it.brand);
        const isA = idx > -1 && idx < aCount;
        const isB = idx > -1 && idx < aCount + bCount;
        if (!isA && !(isB && round < 2)) continue;
        if (spent + it.packPrice > perFocus) continue;
        it.qty += it.packSize;
        spent += it.packPrice;
      }
    }
    // classifica curva pelo valor investido em cada item
    const focusItems = items.filter((i) => i.focus === id);
    focusItems
      .sort((a, b) => b.unitPrice * b.qty - a.unitPrice * a.qty)
      .forEach((it, i) => {
        const share = i / Math.max(1, focusItems.length);
        it.curva = share < 0.2 ? "A" : share < 0.5 ? "B" : "C";
      });
    total += spent;
  }

  return { items, total, budget };
}
