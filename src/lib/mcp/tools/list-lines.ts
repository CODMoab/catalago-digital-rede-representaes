import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { BELLIZ, PAYOT, type BrandId } from "@/lib/catalog";

export default defineTool({
  name: "list_product_lines",
  title: "Listar linhas de produtos",
  description: "Lista as linhas disponíveis em uma marca e a quantidade de produtos em cada linha.",
  inputSchema: {
    brand: z.enum(["belliz", "payot"]).describe("Marca do catálogo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ brand }) => {
    const products = brand === "belliz" ? BELLIZ : PAYOT;
    const counts = products.reduce<Record<string, number>>((result, product) => {
      result[product.line] = (result[product.line] ?? 0) + 1;
      return result;
    }, {});
    const lines = Object.entries(counts)
      .map(([name, productCount]) => ({ name, productCount }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return {
      content: [{ type: "text", text: JSON.stringify({ brand: brand as BrandId, lines }) }],
      structuredContent: { brand, lines },
    };
  },
});