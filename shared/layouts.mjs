/** Original scene arrangements, in model-local units. No third-party assets. */
export const LAYOUTS = [
  {
    id: "single",
    name: "Tek ürün",
    note: "Ürün fotoğrafı",
    items: [[0, 0, 0, 0, 0, 1]],
  },
  {
    id: "side-pair",
    name: "Ön ve yan",
    note: "Ön yüz ve yan profil",
    items: [
      [-1.15, 0, 0, 0, 0, 1],
      [1.35, 0, 0, 1.45, 0, 1],
    ],
  },
  {
    id: "front-back",
    name: "Ön ve arka",
    note: "İki yüz bir arada",
    items: [
      [-1.35, 0, 0, -0.12, 0, 1],
      [1.35, 0, -0.2, Math.PI + 0.12, 0, 1],
    ],
  },
  {
    id: "tilted-duo",
    name: "Eğik ikili",
    note: "İki açılı ambalaj",
    items: [
      [-1.25, 0, 0, -0.1, -0.2, 0.94],
      [1.25, 0, 0.1, 0.15, 0.2, 1],
    ],
  },
  {
    id: "duo",
    name: "İkili",
    note: "Dengeli kompozisyon",
    items: [
      [-1.15, 0, 0.35, -0.25, -0.06, 1],
      [1.2, 0, -0.4, 0.3, 0.06, 1],
    ],
  },
  {
    id: "trio",
    name: "Üçlü seri",
    note: "Ön planda ana ürün",
    items: [
      [-2.05, 0, -0.7, -0.3, -0.05, 0.92],
      [2.05, 0, -0.7, 0.3, 0.05, 0.92],
      [0, 0, 0.5, 0, 0, 1],
    ],
  },
  {
    id: "fan",
    name: "Yelpaze",
    note: "Açılı ürün sunumu",
    items: [
      [-1.65, 0.1, -0.5, -0.25, 0.2, 0.94],
      [1.65, 0.1, -0.5, 0.25, -0.2, 0.94],
      [0, 0, 0.4, 0, 0, 1],
    ],
  },
  {
    id: "stagger",
    name: "Kademeli",
    note: "Derinlik ve ritim",
    items: [
      [-1.9, 0, 0.7, -0.2, 0, 1],
      [0, 0.25, -0.8, -0.15, 0, 1],
      [1.9, 0.5, -2.3, -0.1, 0, 1],
    ],
  },
  {
    id: "hero",
    name: "Vitrin",
    note: "Bir ana, iki destek ürün",
    items: [
      [-1.9, 0, -0.9, -0.4, 0, 0.72],
      [1.9, 0, -0.9, 0.4, 0, 0.72],
      [0, 0, 0.65, 0, 0, 1.12],
    ],
  },
  {
    id: "lineup",
    name: "Beşli seri",
    note: "Beş ürün yan yana",
    items: [
      [-4, 0, -0.6, -0.35, 0, 0.8],
      [-2, 0, -0.2, -0.15, 0, 0.92],
      [0, 0, 0.3, 0, 0, 1.08],
      [2, 0, -0.2, 0.15, 0, 0.92],
      [4, 0, -0.6, 0.35, 0, 0.8],
    ],
  },
  {
    id: "catalog",
    name: "Katalog",
    note: "Dört ürünlük düzen",
    items: [
      [-1.4, 0, 0.5, -0.12, 0, 1],
      [1.4, 0, 0.5, 0.12, 0, 1],
      [-1.4, 3.95, 0.15, -0.12, 0, 1],
      [1.4, 3.95, 0.15, 0.12, 0, 1],
    ],
  },
];
export function layoutDefinition(id) {
  return LAYOUTS.find((x) => x.id === id) || LAYOUTS[0];
}
export function layoutPoses(id, spacing = 1) {
  const factor = Math.min(
    1.6,
    Math.max(0.8, Number.isFinite(spacing) ? spacing : 1),
  );
  return layoutDefinition(id).items.map(([x, y, z, ry, rz, scale]) => ({
    x: x * factor,
    y: y * factor - 1.8 + 1.8 * scale,
    z: z * factor,
    ry,
    rz,
    scale,
  }));
}
