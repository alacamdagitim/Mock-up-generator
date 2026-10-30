import { parseMockupImages, parseMockupScenes } from "./mockup-scenes.mjs";
import {
  normalizeCurrency,
  normalizeLocale,
  normalizeProductOptions,
  normalizeStoreVariant,
  enrichVariantQuantities,
} from "./commerce.mjs";

/** Storefront product data comes from the merchant's Liquid section, never a third-party model library. */
export function storefrontProducts(config) {
  const supplied = Array.isArray(config.products) ? config.products : [];
  const initialId = String(config.productId || supplied[0]?.id || "");
  const products = supplied.map((p) => ({
    ...p,
    mockupScenes: parseMockupScenes(p.mockupScenes),
    mockupImages: parseMockupImages(p.mockupImages),
    id: String(p.id),
    variants: Array.isArray(p.variants)
      ? p.variants.map(normalizeStoreVariant)
      : [],
    productOptions: normalizeProductOptions(p.productOptions, p.variants || []),
    currency: normalizeCurrency(p.currency ?? config.currency),
    locale: normalizeLocale(p.locale ?? config.locale),
    category: p.category || "Diğer",
  }));
  const found = products.find((p) => p.id === initialId);
  if (!found && initialId)
    products.unshift({
      id: initialId,
      title: config.productTitle || "Ürün",
      category: "Ürün",
      variants: (config.variants || []).map(normalizeStoreVariant),
      productOptions: normalizeProductOptions(
        config.productOptions,
        config.variants || [],
      ),
      currency: normalizeCurrency(config.currency),
      locale: normalizeLocale(config.locale),
      handle: config.productHandle,
      url: config.productUrl,
      requiresSellingPlan: config.requiresSellingPlan === true,
      image: config.productImage,
      modelUrl: config.productModelUrl,
      dielineUrl: config.productDielineUrl,
      mockupScenes: parseMockupScenes(config.productMockupScenes),
      mockupImages: parseMockupImages(config.productMockupImages),
    });
  else if (found) {
    if (config.productModelUrl) found.modelUrl = config.productModelUrl;
    if (config.productDielineUrl) found.dielineUrl = config.productDielineUrl;
    if (config.productMockupScenes !== undefined)
      found.mockupScenes = parseMockupScenes(config.productMockupScenes);
    if (config.productMockupImages !== undefined)
      found.mockupImages = parseMockupImages(config.productMockupImages);
    if (config.variants !== undefined)
      found.variants = config.variants.map(normalizeStoreVariant);
    if (config.productOptions !== undefined)
      found.productOptions = normalizeProductOptions(
        config.productOptions,
        found.variants,
      );
    if (config.currency) found.currency = normalizeCurrency(config.currency);
    if (config.locale) found.locale = normalizeLocale(config.locale);
    if (config.productHandle) found.handle = config.productHandle;
    if (config.productUrl) found.url = config.productUrl;
    if (config.requiresSellingPlan !== undefined)
      found.requiresSellingPlan = config.requiresSellingPlan === true;
  }
  return products
    .filter(
      (p, i, all) =>
        p.id && p.title && all.findIndex((x) => x.id === p.id) === i,
    )
    .map((p) => ({
      ...p,
      variants: enrichVariantQuantities(p.variants, p.productOptions),
    }));
}

export function productDraftKey(config, id) {
  const originalId = String(config.productId || config.products?.[0]?.id || "");
  if (config.storageKey)
    return id === originalId
      ? config.storageKey
      : `${config.storageKey}:product:${id}`;
  return `alacam:draft:v1:${id}`;
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
