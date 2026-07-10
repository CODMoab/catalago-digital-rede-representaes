import product1 from "@/assets/product-1.jpg";
import product2 from "@/assets/product-2.jpg";
import product3 from "@/assets/product-3.jpg";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
};

export type Brand = {
  id: string;
  name: string;
  tagline: string;
  products: Product[];
};

// EDITE AQUI: adicione/remova marcas e produtos livremente.
export const BRANDS: Brand[] = [
  {
    id: "marca-verde",
    name: "Marca Verde",
    tagline: "Bebidas artesanais premium",
    products: [
      {
        id: "mv-1",
        name: "Bebida Cítrica 500ml",
        description: "Refrescante, natural, sem conservantes.",
        price: 12.9,
        image: product1,
      },
      {
        id: "mv-2",
        name: "Bebida Tropical 500ml",
        description: "Sabor tropical intenso.",
        price: 13.9,
        image: product1,
      },
      {
        id: "mv-3",
        name: "Bebida Herbal 500ml",
        description: "Infusão de ervas frescas.",
        price: 14.5,
        image: product1,
      },
    ],
  },
  {
    id: "snack-pro",
    name: "Snack Pro",
    tagline: "Snacks premium para todos os momentos",
    products: [
      {
        id: "sp-1",
        name: "Snack Salgado 120g",
        description: "Crocante, salgado na medida.",
        price: 8.9,
        image: product2,
      },
      {
        id: "sp-2",
        name: "Snack Apimentado 120g",
        description: "Toque de pimenta especial.",
        price: 9.5,
        image: product2,
      },
    ],
  },
  {
    id: "pure-care",
    name: "Pure Care",
    tagline: "Cosméticos naturais de alta performance",
    products: [
      {
        id: "pc-1",
        name: "Hidratante Facial 50g",
        description: "Hidratação profunda com ativos naturais.",
        price: 79.9,
        image: product3,
      },
      {
        id: "pc-2",
        name: "Creme Anti-idade 50g",
        description: "Reduz linhas finas em 4 semanas.",
        price: 119.9,
        image: product3,
      },
      {
        id: "pc-3",
        name: "Máscara Revitalizante 50g",
        description: "Revitaliza e ilumina a pele.",
        price: 89.9,
        image: product3,
      },
    ],
  },
];

// EDITE AQUI: seu número de WhatsApp no formato internacional, apenas dígitos.
export const WHATSAPP_NUMBER = "5571981862336";
export const REP_NAME = "Representante Comercial";
