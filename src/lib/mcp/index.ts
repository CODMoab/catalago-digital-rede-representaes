import { defineMcp } from "@lovable.dev/mcp-js";

import getProductTool from "./tools/get-product";
import listBrandsTool from "./tools/list-brands";
import listLinesTool from "./tools/list-lines";
import searchProductsTool from "./tools/search-products";

export default defineMcp({
  name: "seu-catalogo-digital",
  title: "Seu Catálogo Digital",
  version: "0.1.0",
  instructions:
    "Consulte o catálogo comercial público das marcas Belliz e Payot. Use list_brands e list_product_lines para explorar, search_products para localizar itens e get_product para confirmar código, EAN, preço e coletivo.",
  tools: [listBrandsTool, listLinesTool, searchProductsTool, getProductTool],
});