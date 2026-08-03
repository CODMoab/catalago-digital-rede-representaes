import payotDataRaw from "@/data/payot.json";
import bellizDataRaw from "@/data/belliz.json";
import bellizImagesRaw from "@/data/belliz-images.json";

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

export const PAYOT: PayotProduct[] = payotDataRaw as PayotProduct[];
export const BELLIZ: BellizProduct[] = bellizDataRaw as BellizProduct[];

export const BRANDS: Record<BrandId, { id: BrandId; name: string; tagline: string; description: string }> = {
  belliz: {
    id: "belliz",
    name: "Belliz",
    tagline: "Acessórios de beleza",
    description:
      "Pentes, escovas, espelhos e acessórios das marcas Ricca, Belliz, Enox, Kess e Vertix. Venda por coletivo.",
  },
  payot: {
    id: "payot",
    name: "Payot",
    tagline: "Skincare e maquiagem",
    description:
      "Cosméticos brasileiros com foco em tratamento, proteção solar e maquiagem. Preços já com desconto de representante.",
  },
};

// EDITE AQUI: seu WhatsApp em formato internacional apenas com dígitos.
export const WHATSAPP_NUMBER = "5571981862336";
export const REP_NAME = "Representante Comercial";

// Imagens oficiais dos produtos Belliz (bellizcompany.com.br)
export const BELLIZ_IMAGES: Record<string, string> = bellizImagesRaw as Record<string, string>;

// Imagens oficiais dos produtos Payot (payot.com.br)
export const PAYOT_IMAGES: Record<string, string> = payotImagesRaw as Record<string, string>;

export function productImage(brand: BrandId, code: string): string | null {
  if (brand === "belliz") return BELLIZ_IMAGES[code] ?? null;
  return PAYOT_IMAGES[code] ?? null;
}

