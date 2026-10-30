import { parseMockupImages, parseMockupScenes } from "./mockup-scenes.mjs";

/** Storefront product data comes from the merchant's Liquid section, never a third-party model library. */
export function storefrontProducts(config) {
  const supplied = Array.isArray(config.products) ? config.products : [];
  const initialId = String(
    config.productId ||
      supplied.find((p) => p.modelId === "doypack-v1")?.id ||
      "doypack-v1",
  );
  const products = supplied.map((p) => ({
    ...p,
    mockupScenes: parseMockupScenes(p.mockupScenes),
    mockupImages: parseMockupImages(p.mockupImages),
    id: String(p.id),
    variants: Array.isArray(p.variants) ? p.variants : [],
    category: p.category || "Diğer",
  }));
  const found = products.find((p) => p.id === initialId);
  if (!found)
    products.unshift({
      id: initialId,
      title: config.productTitle || "Beyaz doypack",
      category: "Doypack",
      modelId: "doypack-v1",
      variants: config.variants || [],
      image: config.productImage,
      modelUrl: config.productModelUrl,
      dielineUrl: config.productDielineUrl,
      mockupScenes: parseMockupScenes(config.productMockupScenes),
      mockupImages: parseMockupImages(config.productMockupImages),
    });
  else {
    if (!found.modelId) found.modelId = "doypack-v1";
    if (config.productModelUrl) found.modelUrl = config.productModelUrl;
    if (config.productDielineUrl) found.dielineUrl = config.productDielineUrl;
    if (config.productMockupScenes !== undefined)
      found.mockupScenes = parseMockupScenes(config.productMockupScenes);
    if (config.productMockupImages !== undefined)
      found.mockupImages = parseMockupImages(config.productMockupImages);
  }
  return products.filter(
    (p, i, all) => p.id && p.title && all.findIndex((x) => x.id === p.id) === i,
  );
}

/** A product's prepared JSON is authoritative, including an explicitly empty catalog. */
export function usesRemoteMockupCatalog(config) {
  if (!config.mockupApiBase) return false;
  const initialId = String(
    config.productId ||
      config.products?.find((p) => p.modelId === "doypack-v1")?.id ||
      "doypack-v1",
  );
  const product = storefrontProducts(config).find((p) => p.id === initialId);
  return !product?.mockupScenes;
}

export function productDraftKey(config, id) {
  const originalId = String(config.productId || "doypack-v1");
  if (config.storageKey)
    return id === originalId
      ? config.storageKey
      : `${config.storageKey}:product:${id}`;
  return `alacam:draft:v1:${id === "doypack-v1" && !config.productId ? "doypack" : id}`;
}

/** Only direct HTTPS links from the merchant configuration may be opened. */
export function manufacturerDielineUrl(value) {
  try {
    const url = new URL(
      typeof value === "string" && value.startsWith("//")
        ? `https:${value}`
        : value,
    );
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
