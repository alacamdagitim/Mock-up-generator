import { useId } from "react";
import { Loader2 } from "lucide-react";
import type { StoreProduct, StoreVariant } from "./types";
import { QuantityDropdown } from "./QuantityDropdown";
import {
  formatMoney,
  orderQuantityChoices,
  quantityProductOption,
  quantityRule,
  quoteVariant,
  variantByOptions,
  variantOptions,
} from "../shared/commerce.mjs";

type OrderPanelProps = {
  product: StoreProduct;
  variant: string;
  quantity: number;
  busy: boolean;
  orderStatus?: "" | "checking" | "adding" | "redirecting";
  onVariantChange: (id: string) => void;
  onQuantityChange: (quantity: number) => void;
  onOrder: () => void;
};

/** Every displayed offer corresponds to a real variant and a permitted Shopify quantity. */
export function OrderPanel({
  product,
  variant,
  quantity,
  busy,
  orderStatus = "",
  onVariantChange,
  onQuantityChange,
  onOrder,
}: OrderPanelProps) {
  const messageId = useId();
  const selected = product.variants.find((item) => String(item.id) === variant);
  const quote = quoteVariant(selected, quantity);
  const money = (value: number | null | undefined, precision = 2) =>
    value == null
      ? "—"
      : formatMoney(
          value,
          product.currency,
          product.locale || "tr-TR",
          precision,
        );
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
    );
  const quantityOption = quantityProductOption(options);
  const quantityIndex = options.findIndex(
    (option) => option.position === quantityOption?.position,
  );
  const quantityVariants =
    hasNamedOptions && quantityIndex >= 0
      ? product.variants.filter((item) =>
          variantOptions(item, options).every(
            (value, index) =>
              index === quantityIndex || value === currentOptions[index],
          ),
        )
      : [];
  const quantityVariantsActive = quantityVariants.length > 0;

  const offer = (item: StoreVariant, amount: number) => {
    const price = quoteVariant(item, amount);
    const hasPieces = item.unitsPerItem !== undefined;
    const label =
      hasPieces && price.totalUnits !== null
        ? `${number(price.totalUnits)} adet`
        : quantityVariantsActive
          ? item.options?.[(quantityOption?.position || 1) - 1] || item.title
          : `${number(amount)} paket`;
    const precision =
      price.unitPrice !== null && price.unitPrice > 0 && price.unitPrice < 1
        ? 6
        : 4;
    return {
      id: `${item.id}:${amount}`,
      variant: item,
      quantity: amount,
      label: `${label}${item.available ? "" : " · Tükendi"}`,
      priceLabel: hasPieces
        ? `${money(price.unitPrice, precision)} / adet`
        : `${money(price.itemPrice)} / seçenek`,
      disabled: !price.valid || price.itemPrice === null,
    };
  };
  const offers = quantityVariantsActive
    ? [...quantityVariants]
        .sort((a, b) => (a.unitsPerItem || 0) - (b.unitsPerItem || 0))
        .map((item) => offer(item, quantityRule(item).min))
    : selected
      ? (orderQuantityChoices(selected, options).length
          ? orderQuantityChoices(selected, options)
          : [quantityRule(selected).min]
        ).map((amount) => offer(selected, amount))
      : [];
  const selectedOffer = offers.find(
    (item) => item.id === `${variant}:${quantity}`,
  );
  const blocked = !product.variants.length
    ? "Ürünün satış seçenekleri alınamadı. Ürün sayfasından yeniden açın."
    : product.requiresSellingPlan
      ? "Bu ürün abonelik seçimi gerektiriyor. Ürün sayfasından devam edin."
      : !selected
        ? "Ürün seçeneklerini belirleyin."
        : !selected.available
          ? "Bu seçenek tükendi. Başka bir seçenek belirleyin."
          : !quote.valid
            ? quote.error || "Geçerli bir adet seçin."
            : !selectedOffer
              ? "Tanımlı adet seçeneklerinden birini seçin."
              : quote.total === null || !product.currency
                ? "Güncel fiyat alınamadı. Ürün sayfasını yenileyin."
                : "";
  const actionLabel = {
    checking: "Kontrol ediliyor…",
    adding: "Ekleniyor…",
    redirecting: "Sepet açılıyor…",
    "": "Sepete ekle",
  }[orderStatus];

  const changeOption = (index: number, value: string) => {
    const next = [...currentOptions];
    next[index] = value;
    const exact = variantByOptions(product.variants, next);
    if (exact) {
      onVariantChange(String(exact.id));
      return;
    }
    const matches = product.variants
      .filter((item) => variantOptions(item, options)[index] === value)
      .sort((a, b) => {
        const score = (item: StoreVariant) =>
          variantOptions(item, options).reduce(
            (sum, itemValue, position) =>
              sum + (itemValue === currentOptions[position] ? 2 : 0),
            item.available ? 1 : 0,
          );
        return score(b) - score(a);
      });
    if (matches[0]) onVariantChange(String(matches[0].id));
  };

  return (
    <section className="product-order-panel" aria-label="Sipariş seçenekleri">
      {hasNamedOptions ? (
        <div className="order-option-fields">
          {options.map((option, index) =>
            quantityVariantsActive && index === quantityIndex ? null : (
              <label className="order-option-row" key={option.position}>
                <span>{option.name}</span>
                <select
                  title={currentOptions[index]}
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
                        {matches.length &&
                        !matches.some((item) => item.available)
                          ? " · Tükendi"
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            ),
          )}
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
                {item.available ? "" : " · Tükendi"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selected && (
        <QuantityDropdown
          label={quantityOption?.name || "Adet"}
          value={`${variant}:${quantity}`}
          options={offers}
          disabled={busy}
          onChange={(id) => {
            const chosen = offers.find((item) => item.id === id);
            if (!chosen || chosen.disabled) return;
            if (chosen.variant.id !== selected.id)
              onVariantChange(String(chosen.variant.id));
            onQuantityChange(chosen.quantity);
          }}
        />
      )}
      {selectedOffer &&
        selectedOffer.quantity > 1 &&
        selected?.unitsPerItem &&
        selected.unitsPerItem > 1 && (
          <p className="order-quantity-caption">
            Bu seçim {number(selectedOffer.quantity)} paket içerir.
          </p>
        )}

      <div className="order-purchase-row">
        <div className="order-total" aria-live="polite">
          <span>Toplam</span>
          <strong>
            {quote.valid && selectedOffer ? money(quote.total) : "—"}
          </strong>
        </div>
        <button
          type="button"
          className="black-button product-order-action"
          disabled={busy || Boolean(blocked)}
          aria-describedby={messageId}
          onClick={onOrder}
        >
          {busy && <Loader2 size={16} className="spin" aria-hidden="true" />}
          <span>{actionLabel}</span>
        </button>
      </div>
      <p id={messageId} className="order-action-message" role="status">
        {blocked || "Sepete eklenir; ödeme Shopify’da tamamlanır."}
      </p>
      <p className="order-price-note">
        Tasarım dosyası siparişe eklenmez. PNG veya JSON olarak
        indirebilirsiniz.
      </p>
    </section>
  );
}
