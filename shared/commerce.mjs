/** Shopify Liquid prices are expressed in hundredths, including zero-decimal currencies. */
const maximumQuantity = 1_000_000;

function integer(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function text(value, maximum = 300) {
  return typeof value === "string" && value.length <= maximum
    ? value
    : undefined;
}

/** Keep only public, validated commerce data. A missing price stays missing. */
export function normalizeStoreVariant(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !integer(value.id, 1) ||
    text(value.title) === undefined ||
    typeof value.available !== "boolean"
  )
    throw new Error("Ürün varyantı ayarları geçersiz.");
  /** @type {import("../src/types").StoreVariant} */
  const variant = {
    id: value.id,
    title: value.title,
    available: value.available,
  };
  for (const key of ["price", "compareAtPrice", "unitPrice"])
    if (value[key] !== undefined && value[key] !== null) {
      if (!integer(value[key]))
        throw new Error(
          "Ürün fiyatı geçersiz. Shopify fiyatı tam sayı olmalı.",
        );
      variant[key] = value[key];
    }
  if (value.options !== undefined && value.options !== null) {
    if (
      !Array.isArray(value.options) ||
      value.options.length > 3 ||
      value.options.some((option) => text(option) === undefined)
    )
      throw new Error("Ürün seçenekleri geçersiz.");
    variant.options = [...value.options];
  }
  if (value.sku !== undefined && value.sku !== null) {
    if (text(value.sku, 255) === undefined)
      throw new Error("Ürün stok kodu geçersiz.");
    variant.sku = value.sku;
  }
  if (value.quantityRule !== undefined && value.quantityRule !== null) {
    const rule = value.quantityRule;
    if (
      !integer(rule.min, 1, maximumQuantity) ||
      !integer(rule.increment, 1, maximumQuantity) ||
      (rule.max !== undefined &&
        rule.max !== null &&
        !integer(rule.max, rule.min, maximumQuantity))
    )
      throw new Error("Ürünün adet kuralları geçersiz.");
    variant.quantityRule = {
      min: rule.min,
      increment: rule.increment,
      max: rule.max ?? null,
    };
  }
  if (
    value.quantityPriceBreaks !== undefined &&
    value.quantityPriceBreaks !== null
  ) {
    if (
      !Array.isArray(value.quantityPriceBreaks) ||
      value.quantityPriceBreaks.length > 100
    )
      throw new Error("Ürünün adet fiyatları geçersiz.");
    const seen = new Set();
    variant.quantityPriceBreaks = value.quantityPriceBreaks
      .map((item) => {
        if (
          !item ||
          !integer(item.minimumQuantity, 1, maximumQuantity) ||
          !integer(item.price) ||
          seen.has(item.minimumQuantity)
        )
          throw new Error("Ürünün adet fiyatları geçersiz veya yineleniyor.");
        seen.add(item.minimumQuantity);
        return { minimumQuantity: item.minimumQuantity, price: item.price };
      })
      .sort((a, b) => a.minimumQuantity - b.minimumQuantity);
  }
  if (
    value.unitPriceMeasurement !== undefined &&
    value.unitPriceMeasurement !== null
  ) {
    const measurement = value.unitPriceMeasurement;
    if (
      !measurement ||
      !["volume", "weight", "length", "area", "count"].includes(
        measurement.measuredType,
      ) ||
      typeof measurement.quantityValue !== "number" ||
      !Number.isFinite(measurement.quantityValue) ||
      measurement.quantityValue <= 0 ||
      typeof measurement.referenceValue !== "number" ||
      !Number.isFinite(measurement.referenceValue) ||
      measurement.referenceValue <= 0 ||
      text(measurement.quantityUnit, 30) === undefined ||
      text(measurement.referenceUnit, 30) === undefined
    )
      throw new Error("Ürünün birim ölçüsü geçersiz.");
    variant.unitPriceMeasurement = {
      measuredType: measurement.measuredType,
      quantityValue: measurement.quantityValue,
      quantityUnit: measurement.quantityUnit,
      referenceValue: measurement.referenceValue,
      referenceUnit: measurement.referenceUnit,
    };
  }
  if (value.unitsPerItem !== undefined && value.unitsPerItem !== null) {
    if (!integer(value.unitsPerItem, 1, maximumQuantity))
      throw new Error("Paket içi adet pozitif tam sayı olmalı.");
    variant.unitsPerItem = value.unitsPerItem;
  } else if (
    variant.unitPriceMeasurement?.measuredType === "count" &&
    integer(variant.unitPriceMeasurement.quantityValue, 1, maximumQuantity)
  ) {
    variant.unitsPerItem = variant.unitPriceMeasurement.quantityValue;
  }
  return variant;
}

export function normalizeProductOptions(value, variants = []) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 3)
    throw new Error("Ürün seçenek tanımları geçersiz.");
  const positions = new Set();
  return value
    .map((option) => {
      if (
        !option ||
        !text(option.name) ||
        !integer(option.position, 1, 3) ||
        positions.has(option.position) ||
        !Array.isArray(option.values) ||
        !option.values.length ||
        option.values.length > 10000 ||
        option.values.some((item) => !text(item))
      )
        throw new Error("Ürün seçenek tanımları geçersiz veya yineleniyor.");
      positions.add(option.position);
      return {
        name: option.name,
        position: option.position,
        values: [...new Set(option.values)],
      };
    })
    .sort((a, b) => a.position - b.position)
    .filter(
      (option) =>
        !(
          option.name === "Title" &&
          option.values.length === 1 &&
          option.values[0] === "Default Title" &&
          variants.length <= 1
        ),
    );
}

export function normalizeCurrency(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new Error("Mağazanın para birimi geçersiz.");
  try {
    new Intl.NumberFormat("tr", { style: "currency", currency: value });
  } catch {
    throw new Error("Mağazanın para birimi geçersiz.");
  }
  return value;
}

export function normalizeLocale(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 50)
    throw new Error("Mağazanın dil ayarı geçersiz.");
  try {
    return Intl.getCanonicalLocales(value.replace(/_/g, "-"))[0];
  } catch {
    throw new Error("Mağazanın dil ayarı geçersiz.");
  }
}

function normalizedOptionName(value) {
  return typeof value === "string"
    ? value
        .trim()
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .replace(/\s+/g, " ")
    : "";
}

/** Only an explicitly named quantity option describes pieces; dimensions and titles do not. */
export function quantityProductOption(productOptions = []) {
  const names = new Set([
    "adet",
    "miktar",
    "quantity",
    "siparis adedi",
    "siparis miktari",
    "order quantity",
    "piece count",
    "number of pieces",
    "pieces",
    "paket ici adet",
  ]);
  const matches = productOptions.filter((option) =>
    names.has(normalizedOptionName(option.name)),
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Accept integers or consistently grouped thousands, with an optional count suffix. */
export function parsePieceCount(value) {
  if (typeof value !== "string" || value.length > 80) return undefined;
  const count = value
    .trim()
    .replace(/\s+(?:adet|ad|pcs\.?|pieces?|units?)$/i, "")
    .trim();
  let digits;
  if (/^[1-9]\d*$/.test(count)) digits = count;
  else if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(count))
    digits = count.replace(/\./g, "");
  else if (/^[1-9]\d{0,2}(?:,\d{3})+$/.test(count))
    digits = count.replace(/,/g, "");
  else if (/^[1-9]\d{0,2}(?:[ \u00a0\u202f]\d{3})+$/.test(count))
    digits = count.replace(/[ \u00a0\u202f]/g, "");
  else return undefined;
  const parsed = Number(digits);
  return integer(parsed, 1, maximumQuantity) ? parsed : undefined;
}

export function resolveVariantUnits(variant, productOptions = []) {
  if (integer(variant?.unitsPerItem, 1, maximumQuantity))
    return variant.unitsPerItem;
  if (
    variant?.unitPriceMeasurement?.measuredType === "count" &&
    integer(variant.unitPriceMeasurement.quantityValue, 1, maximumQuantity)
  )
    return variant.unitPriceMeasurement.quantityValue;
  const option = quantityProductOption(productOptions);
  return option
    ? parsePieceCount(variant?.options?.[option.position - 1])
    : undefined;
}

export function enrichVariantQuantities(variants, productOptions = []) {
  return variants.map((variant) => {
    const units = resolveVariantUnits(variant, productOptions);
    return units === undefined ? variant : { ...variant, unitsPerItem: units };
  });
}

export function variantOptions(variant, productOptions = []) {
  return productOptions.map(
    (option) => variant?.options?.[option.position - 1] ?? "",
  );
}

export function variantByOptions(variants, options) {
  return (
    variants.find(
      (variant) =>
        Array.isArray(variant.options) &&
        options.every((option, index) => variant.options[index] === option),
    ) || null
  );
}

export function quantityRule(variant) {
  return variant?.quantityRule || { min: 1, increment: 1, max: null };
}

/** Quantity is Shopify cart quantity, never the printed physical-piece count. */
export function quoteVariant(variant, quantity) {
  const rule = quantityRule(variant);
  let error;
  if (!variant?.available) error = "Bu seçenek şu anda satışa kapalı.";
  else if (!integer(quantity, 1, maximumQuantity))
    error = "Geçerli bir sipariş adedi girin.";
  else if (quantity < rule.min) error = `En az ${rule.min} adet seçin.`;
  else if (rule.max != null && quantity > rule.max)
    error = `En fazla ${rule.max} adet seçebilirsiniz.`;
  else if (quantity % rule.increment !== 0)
    error = `Adedi ${rule.increment} ve katları olarak seçin.`;
  const priceBreak = variant?.quantityPriceBreaks
    ?.filter((item) => item.minimumQuantity <= quantity)
    .at(-1);
  const itemPrice = integer(variant?.price)
    ? (priceBreak?.price ?? variant.price)
    : null;
  const unitsPerItem = integer(variant?.unitsPerItem, 1, maximumQuantity)
    ? variant.unitsPerItem
    : 1;
  const totalUnits = integer(quantity, 1, maximumQuantity)
    ? quantity * unitsPerItem
    : null;
  const total =
    itemPrice !== null &&
    integer(quantity, 1, maximumQuantity) &&
    Number.isSafeInteger(itemPrice * quantity)
      ? itemPrice * quantity
      : null;
  if (itemPrice !== null && total === null && !error)
    error = "Sipariş tutarı hesaplanamadı.";
  return {
    quantity,
    itemPrice,
    total,
    unitPrice: itemPrice === null ? null : itemPrice / unitsPerItem,
    totalUnits,
    unitsPerItem,
    valid: !error,
    error,
    priceBreak,
  };
}

/** Show real quantity thresholds; the editor does not invent volume discounts. */
export function quantityChoices(variant) {
  const rule = quantityRule(variant);
  return [
    ...new Set([
      rule.min,
      ...(variant?.quantityPriceBreaks || []).map(
        (item) => item.minimumQuantity,
      ),
    ]),
  ]
    .filter((quantity) => quoteVariant(variant, quantity).valid)
    .sort((a, b) => a - b);
}

export function formatMoney(value, currency, locale = "tr-TR", precision = 2) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !currency
  )
    return "—";
  try {
    return new Intl.NumberFormat(locale || "tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: Math.max(2, Math.min(6, precision)),
    }).format(value / 100);
  } catch {
    return "—";
  }
}
