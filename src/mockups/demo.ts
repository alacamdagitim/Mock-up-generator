import type { MockupScene } from "./types";
/** Original procedural sample; never silently substituted for a Shopify product. */
export const DEMO_MOCKUP_SCENES: MockupScene[] = [
  {
    id: "original-cup-studio",
    title: "Örnek bardak · Stüdyo",
    width: 1024,
    height: 1365,
    baseImageUrl: "/product-assets/mockup-scenes/original-cup/base.png",
    thumbnailUrl: "/product-assets/mockup-scenes/original-cup/thumbnail.jpg",
    distribution: "public-web",
    license: "Özgün prosedürel örnek · CC0-1.0",
    surfaces: [
      {
        id: "front",
        face: "front",
        mapping: {
          type: "uv-rg16le",
          url: "/product-assets/mockup-scenes/original-cup/front.uv.bin",
        },
        maskUrl: "/product-assets/mockup-scenes/original-cup/front-mask.png",
        blend: "multiply",
      },
    ],
    layers: [
      {
        imageUrl: "/product-assets/mockup-scenes/original-cup/highlights.png",
        blend: "screen",
        opacity: 1,
      },
    ],
  },
];
