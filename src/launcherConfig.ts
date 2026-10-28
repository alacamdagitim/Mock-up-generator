import type { EditorConfig } from "./types";

type Variant = NonNullable<EditorConfig["variants"]>[number];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Tasarım editörünün ürün ayarları geçersiz.");
  return value as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  name: string,
  maximum: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maximum)
    throw new Error(`${name} geçersiz veya çok uzun.`);
  return value.trim() || undefined;
}

function positiveId(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^\d+$/.test(value))
  )
    return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function publicUrl(value: unknown, name: string): string | undefined {
  const text = optionalString(value, name, 2048);
  if (!text) return undefined;
  if (text.startsWith("/") && !text.startsWith("//") && !text.includes("\\")) {
    if (text.includes("?") || text.includes("#"))
      throw new Error(`${name} sorgu veya sayfa işareti içeremez.`);
    return text.replace(/\/$/, "") || "/";
  }
  try {
    const url = new URL(text);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url.href.replace(/\/$/, "");
  } catch {
    throw new Error(
      `${name} HTTPS, yerel geliştirme veya / ile başlayan bir adres olmalı.`,
    );
  }
}

function assetUrl(value: unknown, name: string): string | undefined {
  const text = optionalString(value, name, 2048);
  if (!text) return undefined;
  if (text.startsWith("/") && !text.startsWith("//") && !text.includes("\\"))
    return text;
  try {
    const url = new URL(text.startsWith("//") ? `https:${text}` : text);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error(`${name} güvenli bir dosya adresi olmalı.`);
  }
}

function selectedVariant(variants: Variant[], value: unknown): number {
  const id = positiveId(value);
  const variant = variants.find((item) => item.id === id);
  if (!variant || !variant.available)
    throw new Error(
      "Seçili ürün varyantı geçersiz veya satışa kapalı. Ürün seçimini kontrol edin.",
    );
  return variant.id;
}

/** Public merchant configuration only; unknown properties never enter the editor. */
export function validateLaunchConfig(value: unknown): EditorConfig {
  const input = record(value);
  const rawProductId =
    typeof input.productId === "number" && Number.isSafeInteger(input.productId)
      ? String(input.productId)
      : input.productId;
  const productId = optionalString(rawProductId, "Ürün kimliği", 100);
  if (!productId)
    throw new Error("Tasarım editörü için Shopify ürün kimliği gerekli.");
  if (
    !Array.isArray(input.variants) ||
    input.variants.length === 0 ||
    input.variants.length > 10000
  )
    throw new Error("Ürünün geçerli Shopify varyantları tanımlanmalı.");
  const ids = new Set<number>();
  const variants = input.variants.map((value): Variant => {
    const item = record(value);
    const id = positiveId(item.id);
    if (
      id === null ||
      ids.has(id) ||
      typeof item.title !== "string" ||
      item.title.length > 300 ||
      typeof item.available !== "boolean"
    )
      throw new Error("Ürün varyantı ayarları geçersiz veya yineleniyor.");
    ids.add(id);
    return { id, title: item.title, available: item.available };
  });
  const cartRoot = optionalString(input.cartRoot, "Sepet kökü", 500) || "/";
  if (
    !cartRoot.startsWith("/") ||
    cartRoot.startsWith("//") ||
    /[\\?#]/.test(cartRoot)
  )
    throw new Error("Sepet kökü / ile başlayan bir mağaza yolu olmalı.");
  return {
    productId,
    productTitle: optionalString(input.productTitle, "Ürün adı", 300),
    productImage: assetUrl(input.productImage, "Ürün görseli"),
    productDielineUrl: assetUrl(input.productDielineUrl, "Bıçak izi dosyası"),
    apiBase: publicUrl(input.apiBase, "Tasarım API adresi"),
    variants,
    initialVariantId:
      input.initialVariantId === undefined
        ? undefined
        : selectedVariant(variants, input.initialVariantId),
    cartRoot,
    storageKey:
      optionalString(input.storageKey, "Taslak anahtarı", 500) ||
      `alacam:shopify:v1:${productId}`,
    libraryKey: optionalString(input.libraryKey, "Kütüphane anahtarı", 500),
  };
}

function formVariant(form: HTMLFormElement): string | null {
  const field = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    'select[name="id"], input[name="id"]:not([type="radio"]), input[name="id"][type="radio"]:checked',
  );
  return field ? field.value : null;
}

function cartForms(container: ParentNode): HTMLFormElement[] {
  return Array.from(container.querySelectorAll<HTMLFormElement>("form")).filter(
    (form) => {
      try {
        return /\/cart\/add(?:\.js)?\/?$/.test(new URL(form.action).pathname);
      } catch {
        return false;
      }
    },
  );
}

function matchingForm(
  forms: HTMLFormElement[],
  variants: Variant[],
): HTMLFormElement | null {
  const matches = forms.filter((form) => {
    const id = positiveId(formVariant(form));
    return variants.some((variant) => variant.id === id);
  });
  const selectedIds = new Set(
    matches.map((form) => positiveId(formVariant(form))),
  );
  if (selectedIds.size > 1)
    throw new Error(
      "Birden fazla ürün formu bulundu. Düğmeye data-alacam-product-form ile doğru formu bağlayın.",
    );
  return matches[0] || null;
}

/** Resolve the current form selection on click, never when the page first loads. */
export function configFromButton(button: HTMLElement): EditorConfig {
  const document = button.ownerDocument;
  const configId = button.dataset.alacamOpen?.trim();
  const script = configId ? document.getElementById(configId) : null;
  if (
    !script ||
    script.tagName !== "SCRIPT" ||
    script.getAttribute("type")?.trim().toLowerCase() !== "application/json"
  )
    throw new Error(
      "Düğmeye bağlı ürün ayarları bulunamadı. data-alacam-open bağlantısını kontrol edin.",
    );
  let input: unknown;
  try {
    input = JSON.parse(script.textContent || "");
  } catch {
    throw new Error(
      "Tasarım editörünün ürün ayarları okunamadı. JSON biçimini kontrol edin.",
    );
  }
  const rawConfig = record(input);
  // Liquid is rendered once; an available live form choice can replace its stale variant.
  // The imperative validator stays strict because it has no live product form.
  const config = validateLaunchConfig({
    ...rawConfig,
    initialVariantId: undefined,
  });
  const variants = config.variants!;
  const explicit = button.dataset.alacamProductForm;
  let form: HTMLFormElement | null = null;
  if (explicit !== undefined) {
    if (!explicit.trim() || explicit.length > 500)
      throw new Error(
        "data-alacam-product-form için geçerli bir form seçicisi gerekli.",
      );
    let found: Element | null;
    try {
      found = document.querySelector(explicit);
    } catch {
      throw new Error("data-alacam-product-form seçicisi geçersiz.");
    }
    if (!found || found.tagName !== "FORM")
      throw new Error("Düğmeye bağlanan ürün formu bulunamadı.");
    form = found as HTMLFormElement;
    if (formVariant(form) === null)
      throw new Error("Bağlı ürün formunda seçili varyant alanı bulunamadı.");
  } else {
    const containing = button.closest<HTMLFormElement>("form");
    if (containing && formVariant(containing) !== null) form = containing;
    if (!form) {
      const section = button.closest(".shopify-section");
      if (section) form = matchingForm(cartForms(section), variants);
    }
    if (!form) form = matchingForm(cartForms(document), variants);
  }
  if (form)
    return {
      ...config,
      initialVariantId: selectedVariant(variants, formVariant(form)),
    };
  const view = document.defaultView;
  const variantInUrl = view
    ? new URL(view.location.href).searchParams.get("variant")
    : null;
  if (variantInUrl !== null)
    return {
      ...config,
      initialVariantId: selectedVariant(variants, variantInUrl),
    };
  const initial =
    rawConfig.initialVariantId !== undefined
      ? rawConfig.initialVariantId
      : variants.find((variant) => variant.available)?.id;
  return { ...config, initialVariantId: selectedVariant(variants, initial) };
}
