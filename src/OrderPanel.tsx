import { useId } from "react";
import { ArrowRight, Loader2, ShoppingBag } from "lucide-react";
import type { StoreProduct } from "./types";
import {
  formatMoney,
  quantityChoices,
  quoteVariant,
  variantByOptions,
  variantOptions,
} from "../shared/commerce.mjs";

type OrderPanelProps = {
  product: StoreProduct;
  variant: string;
  quantity: number;
  busy: boolean;
  storage: boolean;
  previewReady: boolean;
  orderStatus?: "" | "saving" | "adding" | "redirecting";
  onVariantChange: (id: string) => void;
  onQuantityChange: (quantity: number) => void;
  onOrder: () => void;
};

/** Prices and quantities in this panel come exclusively from the selected Shopify variant. */
export function OrderPanel({
  product,
  variant,
  quantity,
  busy,
  storage,
  previewReady,
  orderStatus = "",
  onVariantChange,
  onQuantityChange,
  onOrder,
}: OrderPanelProps) {
  const radioGroup = useId();
  const quantityId = useId();
  const messageId = useId();
  const selected = product.variants.find((item) => String(item.id) === variant);
  const quote = quoteVariant(selected, quantity);
  const currency = product.currency;
  const money = (value: number | null | undefined, precision = 2) =>
    currency && value !== null && value !== undefined
      ? formatMoney(value, currency, product.locale || "tr-TR", precision)
      : "—";
  const unitMoney = (value: number | null) =>
    money(value, value !== null && value > 0 && value < 1 ? 6 : 4);
  const number = (value: number) =>
    value.toLocaleString(product.locale || "tr-TR");
  const options = [...(product.productOptions || [])].sort(
    (a, b) => a.position - b.position,
  );
  const currentOptions = selected ? variantOptions(selected, options) : [];
  const hasNamedOptions =
    Boolean(selected) &&
    options.length > 0 &&
    product.variants.every((item) =>
      variantOptions(item, options).every(Boolean),
    ) &&
    !(
      options.length === 1 &&
      options[0].values.length === 1 &&
      options[0].values[0] === "Default Title"
    );
  const choices = selected ? quantityChoices(selected) : [];
  const counted = selected?.unitsPerItem !== undefined;
  const packed = (selected?.unitsPerItem || 1) > 1;
  const minimum = selected?.quantityRule?.min || 1;
  const increment = selected?.quantityRule?.increment || 1;
  const maximum = selected?.quantityRule?.max || undefined;
  const noPrice = quote.total === null || !currency;
  const blocked = !product.variants.length
    ? "Ürünün satış seçenekleri alınamadı. Ürün sayfasından yeniden açın."
    : product.requiresSellingPlan
      ? "Bu ürün abonelik seçimi gerektiriyor. Siparişi ürün sayfasından tamamlayın."
      : !selected
        ? "Sipariş için ürün seçeneklerini belirleyin."
        : !selected.available
          ? "Bu seçenek şu anda satışa kapalı. Başka bir seçenek belirleyin."
          : !quote.valid
            ? quote.error || "Geçerli bir sipariş miktarı girin."
            : noPrice
              ? "Güncel fiyat bilgisi alınamadı. Ürün sayfasından yeniden açın."
              : !storage
                ? "Sipariş kaydı henüz bağlanmadı."
                : !previewReady
                  ? "Sipariş için ürün önizlemesinin hazır olması gerekiyor."
                  : "";
  const actionLabel = {
    saving: "Tasarım kaydediliyor…",
    adding: "Sepete ekleniyor…",
    redirecting: "Sepet açılıyor…",
    "": "Tasarımla sepete ekle",
  }[orderStatus];
  const changeOption = (index: number, value: string) => {
    const next = [...currentOptions];
    next[index] = value;
    const exact = variantByOptions(product.variants, next);
    if (exact) {
      onVariantChange(String(exact.id));
      return;
    }
    // Some products do not have every possible option combination. Keep them reachable.
    const matches = product.variants
      .filter((item) => variantOptions(item, options)[index] === value)
      .sort((a, b) => {
        const score = (item: typeof a) =>
          variantOptions(item, options).reduce(
            (sum, option, position) =>
              sum + (option === currentOptions[position] ? 2 : 0),
            item.available ? 1 : 0,
          );
        return score(b) - score(a);
      });
    if (matches[0]) onVariantChange(String(matches[0].id));
  };

  return (
    <section className="product-order-panel" aria-label="Sipariş seçenekleri">
      <div className="order-panel-heading">
        <ShoppingBag size={17} aria-hidden="true" />
        <h2>Siparişiniz</h2>
      </div>

      {hasNamedOptions ? (
        <div className="order-option-fields">
          {options.map((option, index) => (
            <label key={`${option.position}:${option.name}`}>
              <span>{option.name}</span>
              <select
                value={currentOptions[index] || ""}
                disabled={busy}
                onChange={(event) => changeOption(index, event.target.value)}
              >
                {!currentOptions[index] && <option value="">Seçin</option>}
                {option.values.map((value) => {
                  const matches = product.variants.filter(
                    (item) => variantOptions(item, options)[index] === value,
                  );
                  return (
                    <option
                      key={value}
                      value={value}
                      disabled={!matches.length}
                    >
                      {value}
                      {matches.length && !matches.some((item) => item.available)
                        ? " · Tükendi"
                        : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
        </div>
      ) : product.variants.length > 1 ||
        (selected && selected.title !== "Default Title") ? (
        <label className="order-variant-field">
          <span>Ürün seçeneği</span>
          <select
            aria-label="Ürün varyantı"
            value={variant}
            disabled={busy}
            onChange={(event) => onVariantChange(event.target.value)}
          >
            {!selected && <option value="">Seçin</option>}
            {product.variants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {!item.available ? " · Tükendi" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {hasNamedOptions && selected && (
        <p className="order-selected-variant" aria-live="polite">
          Seçim: {selected.title}
        </p>
      )}

      {selected && (
        <>
          {packed && (
            <p className="order-pack-information">
              1 paket = <strong>{number(selected.unitsPerItem!)} adet</strong>
            </p>
          )}
          {choices.length > 1 && (
            <fieldset className="order-quantity-choices" disabled={busy}>
              <legend>
                {packed
                  ? "Paket seçenekleri"
                  : counted
                    ? "Adet seçenekleri"
                    : "Miktar seçenekleri"}
              </legend>
              <div className="order-tier-head" aria-hidden="true">
                <span>
                  {packed ? "Paket / Adet" : counted ? "Adet" : "Miktar"}
                </span>
                <span>Toplam</span>
                <span>{counted ? "Birim" : "Seçenek"}</span>
              </div>
              {choices.map((amount: number) => {
                const tier = quoteVariant(selected, amount);
                return (
                  <label
                    key={amount}
                    className={`order-tier ${quantity === amount ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name={radioGroup}
                      value={amount}
                      checked={quantity === amount}
                      onChange={() => onQuantityChange(amount)}
                    />
                    <span className="order-tier-quantity">
                      {number(amount)}
                      {packed && (
                        <small>{number(tier.totalUnits || 0)} adet</small>
                      )}
                    </span>
                    <span>{money(tier.total)}</span>
                    <span>{unitMoney(tier.unitPrice)}</span>
                  </label>
                );
              })}
            </fieldset>
          )}
          <div className="order-quantity-entry">
            <label htmlFor={quantityId}>
              {packed ? "Paket sayısı" : counted ? "Adet" : "Sipariş miktarı"}
            </label>
            <input
              id={quantityId}
              aria-describedby={messageId}
              type="number"
              inputMode="numeric"
              min={minimum}
              max={maximum}
              step={increment}
              value={Number.isFinite(quantity) ? quantity : ""}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                onQuantityChange(Number.isFinite(value) ? value : 0);
              }}
            />
          </div>
          {(minimum > 1 || increment > 1 || maximum) && (
            <p className="order-quantity-rule">
              En az {number(minimum)}{" "}
              {packed ? "paket" : counted ? "adet" : "seçenek"}
              {increment > 1 ? ` · ${number(increment)} katları` : ""}
              {maximum ? ` · En fazla ${number(maximum)}` : ""}
            </p>
          )}
          <dl className="order-price-summary" aria-live="polite">
            {packed && (
              <div>
                <dt>Toplam adet</dt>
                <dd>
                  {quote.valid && quote.totalUnits !== null
                    ? number(quote.totalUnits)
                    : "—"}
                </dd>
              </div>
            )}
            <div>
              <dt>
                {packed
                  ? "Adet başına"
                  : counted
                    ? "Birim fiyat"
                    : "Seçenek başına"}
              </dt>
              <dd>{quote.valid ? unitMoney(quote.unitPrice) : "—"}</dd>
            </div>
            <div className="order-total">
              <dt>Toplam</dt>
              <dd>{quote.valid ? money(quote.total) : "—"}</dd>
            </div>
          </dl>
        </>
      )}

      <button
        type="button"
        className="black-button product-order-action"
        disabled={busy || Boolean(blocked)}
        aria-describedby={messageId}
        onClick={onOrder}
      >
        {busy ? (
          <Loader2 size={17} className="spin" aria-hidden="true" />
        ) : null}
        <span>{actionLabel}</span>
        {!busy && <ArrowRight size={17} aria-hidden="true" />}
      </button>
      <p id={messageId} className="order-action-message" role="status">
        {blocked || "Tasarımınız siparişe bağlanır. Sonraki adım sepet."}
      </p>
      {!blocked && (
        <p className="order-price-note">
          Güncel fiyat ve stok sepette doğrulanır.
        </p>
      )}
    </section>
  );
}
