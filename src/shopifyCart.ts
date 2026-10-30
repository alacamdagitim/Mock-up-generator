type CartResult = { cartUrl: string };

export type AddVariantToCartInput = {
  root: string;
  variantId: number;
  quantity: number;
  /** Keep this key stable when retrying the same user action. */
  attemptKey: string;
};

type Attempt = {
  root: string;
  variantId: number;
  quantity: number;
  phase: "new" | "uncertain" | "complete";
  baseline?: number;
  target?: number;
  pending?: Promise<CartResult>;
};

// Only this page's outstanding user actions live here. Nothing is persisted or
// attached to a Shopify line item, cart attribute, or customer record.
const attempts = new Map<string, Attempt>();
const uncertainMessage =
  "Sepete ekleme sonucu kesinleştirilemedi. Aynı ürünü yeniden eklemeden önce sepetinizi kontrol edin.";

function shopifyRoot(value: string) {
  if (typeof value !== "string" || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value))
    throw new Error(
      "Shopify sepet adresi geçersiz. Ürün sayfasından yeniden açın.",
    );
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol))
    throw new Error(
      "Sepete ekleme mağazanın kendi ürün sayfasından yapılmalı.",
    );
  return value;
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function variantId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number) && number > 0) return number;
  }
  return null;
}

/** Discount allocations may split an otherwise ordinary variant into several lines. */
function normalQuantity(value: unknown, selectedVariant: number) {
  if (!object(value) || !Array.isArray(value.items))
    throw new Error("Shopify sepet bilgisi okunamadı.");
  let quantity = 0;
  for (const item of value.items) {
    if (
      !object(item) ||
      !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) < 0
    )
      throw new Error("Shopify sepet miktarı doğrulanamadı.");
    const id = variantId(item.variant_id ?? item.id);
    if (!id) throw new Error("Shopify sepet ürünü doğrulanamadı.");
    if (id !== selectedVariant) continue;
    if (
      item.selling_plan_allocation ||
      item.selling_plan ||
      item.parent_relationship
    )
      continue;
    if (item.properties != null) {
      if (!object(item.properties))
        throw new Error("Shopify sepet satırı doğrulanamadı.");
      if (Object.keys(item.properties).length) continue;
    }
    quantity += item.quantity as number;
    if (!Number.isSafeInteger(quantity))
      throw new Error("Shopify sepet miktarı doğrulanamadı.");
  }
  return quantity;
}

function shopifyMessage(value: unknown) {
  if (object(value)) {
    for (const key of ["description", "message", "errors"]) {
      if (typeof value[key] === "string" && value[key].trim())
        return value[key].slice(0, 800);
    }
  }
  return "Shopify ürünü sepete ekleyemedi. Fiyat ve stok bilgisini kontrol edin.";
}

async function request(url: string, body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function readQuantity(attempt: Attempt) {
  const response = await request(`${attempt.root}cart.js`);
  if (!response.ok)
    throw new Error(
      "Shopify sepeti alınamadı. Ürün sayfasını yenileyip yeniden deneyin.",
    );
  return normalQuantity(response.data, attempt.variantId);
}

async function perform(attempt: Attempt): Promise<CartResult> {
  const cartUrl = `${attempt.root}cart`;
  let current: number;
  try {
    current = await readQuantity(attempt);
  } catch {
    throw new Error(
      attempt.phase === "new"
        ? "Sepet bilgisi alınamadı. Bağlantınızı kontrol edip yeniden deneyin."
        : uncertainMessage,
    );
  }
  if (attempt.phase !== "new") {
    if (attempt.target !== undefined && current >= attempt.target) {
      attempt.phase = "complete";
      return { cartUrl };
    }
    // A timed-out write can still finish later. Do not send a second write just
    // because an immediate cart read has not observed the first one yet.
    throw new Error(uncertainMessage);
  }
  const target = current + attempt.quantity;
  if (!Number.isSafeInteger(target))
    throw new Error("Sipariş miktarı hesaplanamadı. Sepetinizi kontrol edin.");
  attempt.baseline = current;
  attempt.target = target;
  attempt.phase = "uncertain";

  let added: Awaited<ReturnType<typeof request>> | undefined;
  let responseVerified = false;
  try {
    added = await request(`${attempt.root}cart/add.js`, {
      items: [{ id: attempt.variantId, quantity: attempt.quantity }],
    });
    if (added.ok) {
      // Existing lines return their new total, rather than only the increment.
      responseVerified =
        normalQuantity(added.data, attempt.variantId) >= attempt.quantity;
    }
  } catch {
    // Reconcile a timeout, invalid success payload, or disconnected response
    // against the actual cart instead of automatically repeating the POST.
  }

  let actual: number;
  try {
    actual = await readQuantity(attempt);
  } catch {
    throw new Error(uncertainMessage);
  }
  if (actual >= target) {
    // A cart read can confirm a completed write even when its response was lost.
    attempt.phase = "complete";
    return { cartUrl };
  }

  if (
    added &&
    !added.ok &&
    added.status >= 400 &&
    added.status < 500 &&
    actual === current
  ) {
    // Shopify returned a definitive rejection and the cart did not change.
    // A later retry may try again from a fresh baseline (e.g. after throttling).
    // A 422 can also add partial stock; that case intentionally stays uncertain.
    attempt.phase = "new";
    attempt.baseline = undefined;
    attempt.target = undefined;
    throw new Error(shopifyMessage(added.data));
  }
  if (added && !added.ok)
    throw new Error(`${shopifyMessage(added.data)} ${uncertainMessage}`);
  if (responseVerified)
    throw new Error(
      "Sepetteki miktar işlem sırasında değişti. Tekrar eklemeden önce sepetinizi kontrol edin.",
    );
  throw new Error(uncertainMessage);
}

/** Add an ordinary Shopify product without PSD, design storage, or line properties. */
export function addVariantToCart(
  input: AddVariantToCartInput,
): Promise<CartResult> {
  try {
    const root = shopifyRoot(input.root);
    if (!Number.isSafeInteger(input.variantId) || input.variantId <= 0)
      throw new Error("Satışa açık bir ürün seçeneği belirleyin.");
    if (
      !Number.isSafeInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > 1_000_000
    )
      throw new Error("Geçerli bir sipariş miktarı girin.");
    if (
      typeof input.attemptKey !== "string" ||
      !input.attemptKey ||
      input.attemptKey.length > 200
    )
      throw new Error(
        "Sepete ekleme işlemi başlatılamadı. Ürün sayfasından yeniden açın.",
      );
    const key = `${window.location.origin}:${root}:${input.attemptKey}`;
    let attempt = attempts.get(key);
    if (
      attempt &&
      (attempt.variantId !== input.variantId ||
        attempt.quantity !== input.quantity)
    )
      throw new Error(
        "Ürün seçimi değişti. Yeni seçim için yeni bir sepet işlemi başlatın.",
      );
    if (!attempt) {
      attempt = {
        root,
        variantId: input.variantId,
        quantity: input.quantity,
        phase: "new",
      };
      attempts.set(key, attempt);
    }
    if (attempt.pending) return attempt.pending;
    const pending = perform(attempt);
    attempt.pending = pending;
    const release = () => {
      if (attempt.pending === pending) attempt.pending = undefined;
    };
    void pending.then(release, release);
    return pending;
  } catch (error) {
    return Promise.reject(error);
  }
}
