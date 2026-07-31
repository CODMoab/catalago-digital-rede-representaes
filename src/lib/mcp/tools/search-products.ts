import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { BELLIZ, PAYOT, productImage } from "@/lib/catalog";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default defineTool({
  name: "search_products",
  title: "Buscar produtos",
  description: "Busca produtos por nome, código, EAN ou linha, com filtros opcionais de marca e linha.",
  inputSchema: {
    query: z.string().optional().describe("Nome, código, EAN ou trecho a procurar."),
    brand: z.enum(["belliz", "payot"]).optional().describe("Marca para filtrar."),
    line: z.string().optional().describe("Linha de produtos para filtrar."),
    limit: z.number().int().optional().describe("Quantidade de resultados, de 1 a 50. O padrão é 20."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query = "", brand, line, limit = 20 }) => {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const queryKey = normalize(query);
    const lineKey = line ? normalize(line) : "";
    const sources = brand
      ? [{ brand, products: brand === "belliz" ? BELLIZ : PAYOT }]
      : [
          { brand: "belliz" as const, products: BELLIZ },
          { brand: "payot" as const, products: PAYOT },
        ];

    const matches = sources.flatMap(({ brand: productBrand, products }) =>
      products
        .filter((product) => {
          const searchable = normalize(`${product.code} ${product.ean} ${product.name} ${product.line}`);
          return (!queryKey || searchable.includes(queryKey)) && (!lineKey || normalize(product.line) === lineKey);
        })
        .map((product) => ({
          brand: productBrand,
          ...product,
          imageUrl: productImage(productBrand, product.code),
        })),
    );
    const products = matches.slice(0, safeLimit);
    const result = { products, returned: products.length, totalMatches: matches.length };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});