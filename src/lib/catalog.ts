import payotDataRaw from "@/data/payot.json";
import bellizDataRaw from "@/data/belliz.json";
import bellizImagesRaw from "@/data/belliz-images.json";
import payotImagesRaw from "@/data/payot-images.json";


export type BellizProduct = {
  code: string;
  name: string;
  line: string;
  ean: string;
  priceUnit: number;
  coletivo: number;
  priceColetivo: number | null;
};

export type PayotProduct = {
  code: string;
  name: string;
  line: string;
  ean: string;
  priceFull: number | null;
  price: number;
};

export type BrandId = "belliz" | "payot";

// Seed local (planilhas de abril/26). Em runtime é substituído pelos dados do banco.
export const PAYOT: PayotProduct[] = [...(payotDataRaw as PayotProduct[])];
export const BELLIZ: BellizProduct[] = [...(bellizDataRaw as BellizProduct[])];

export const BRANDS: Record<
  BrandId,
  { id: BrandId; name: string; tagline: string; description: string; terms: string }
> = {
  belliz: {
    id: "belliz",
    name: "Belliz",
    tagline: "Acessórios de beleza",
    description: "Ricca, Vertix, Belliz, Enox e Kess.",
    terms: "Venda por coletivo · pedido mínimo R$ 2.000",
  },
  payot: {
    id: "payot",
    name: "Payot",
    tagline: "Skincare e maquiagem",
    description: "Tratamento facial, proteção solar e maquiagem.",
    terms: "Venda por unidade · pedido mínimo R$ 1.200",
  },
};

/**
 * Pedido mínimo exigido por cada indústria (em R$, já com o desconto aplicado).
 * Como cada pedido é fechado por marca, o mínimo também é validado marca a marca.
 */
export const MIN_ORDER: Record<BrandId, number> = {
  belliz: 2000,
  payot: 1200,
};

// EDITE AQUI: seu WhatsApp em formato internacional apenas com dígitos.
export const WHATSAPP_NUMBER = "5571981862336";
export const REP_NAME = "Rede Representações";

// Imagens oficiais dos produtos Belliz (bellizcompany.com.br)
export const BELLIZ_IMAGES: Record<string, string> = { ...(bellizImagesRaw as Record<string, string>) };

// Imagens oficiais dos produtos Payot (payot.com.br)
export const PAYOT_IMAGES: Record<string, string> = { ...(payotImagesRaw as Record<string, string>) };

export function productImage(brand: BrandId, code: string): string | null {
  if (brand === "belliz") return BELLIZ_IMAGES[code] ?? null;
  return PAYOT_IMAGES[code] ?? null;
}

export type CatalogRow = {
  brand_id: string;
  code: string;
  name: string;
  line: string;
  ean: string;
  price_unit: number;
  price_full: number | null;
  coletivo: number;
  price_coletivo: number | null;
  image_url: string | null;
  updated_at?: string;
};

export const catalogState = { updatedAt: null as string | null, loaded: false };

/** Substitui o catálogo em memória pelos dados vindos do banco. */
export function applyCatalog(rows: CatalogRow[]) {
  if (!rows.length) return;
  const belliz: BellizProduct[] = [];
  const payot: PayotProduct[] = [];
  const bImgs: Record<string, string> = {};
  const pImgs: Record<string, string> = {};
  let updatedAt: string | null = null;

  for (const r of rows) {
    if (r.updated_at && (!updatedAt || r.updated_at > updatedAt)) updatedAt = r.updated_at;
    if (r.brand_id === "belliz") {
      belliz.push({
        code: r.code,
        name: r.name,
        line: r.line,
        ean: r.ean,
        priceUnit: Number(r.price_unit),
        coletivo: r.coletivo || 1,
        priceColetivo: r.price_coletivo === null ? null : Number(r.price_coletivo),
      });
      if (r.image_url) bImgs[r.code] = r.image_url;
    } else if (r.brand_id === "payot") {
      payot.push({
        code: r.code,
        name: r.name,
        line: r.line,
        ean: r.ean,
        priceFull: r.price_full === null ? null : Number(r.price_full),
        price: Number(r.price_unit),
      });
      if (r.image_url) pImgs[r.code] = r.image_url;
    }
  }

  if (belliz.length) {
    BELLIZ.length = 0;
    BELLIZ.push(...belliz);
    for (const k of Object.keys(BELLIZ_IMAGES)) delete BELLIZ_IMAGES[k];
    Object.assign(BELLIZ_IMAGES, bImgs);
  }
  if (payot.length) {
    PAYOT.length = 0;
    PAYOT.push(...payot);
    for (const k of Object.keys(PAYOT_IMAGES)) delete PAYOT_IMAGES[k];
    Object.assign(PAYOT_IMAGES, pImgs);
  }
  catalogState.updatedAt = updatedAt;
  catalogState.loaded = true;
}

