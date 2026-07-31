import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { BELLIZ, PAYOT, productImage } from "@/lib/catalog";

const digits = (value: string) => value.replace(/\D/g, "");

export default defineTool({
  name: "get_product",
  title: "Consultar produto",
  description: "Consulta um produto específico pelo código interno ou EAN dentro de uma marca.",
  inputSchema: {
    brand: z.enum(["belliz", "payot"]).describe("Marca do produto."),
    codeOrEan: z.string().describe("Código interno ou código de barras EAN."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ brand, codeOrEan }) => {
    const products = brand === "belliz" ? BELLIZ : PAYOT;
    const lookup = digits(codeOrEan);
    const product = products.find(
      (item) => item.code === codeOrEan.trim() || digits(item.ean) === lookup,
    );

    if (!product) {
      return {
        content: [{ type: "text", text: `Produto não encontrado na marca ${brand}.` }],
        isError: true,
      };
    }

    const result = { brand, ...product, imageUrl: productImage(brand, product.code) };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: { product: result },
    };
  },
});