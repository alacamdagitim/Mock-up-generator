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
      dielineUrl: config.productDielineUrl,
    });
  else if (!found.modelId) found.modelId = "doypack-v1";
  return products.filter(
    (p, i, all) => p.id && p.title && all.findIndex((x) => x.id === p.id) === i,
  );
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
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
