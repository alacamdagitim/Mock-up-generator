import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { ModelBinding } from "./types";
import type { PrintSurfaceOption } from "./productModel";

function surfaceLabel(label: string) {
  return label
    .replace(/贴图/g, "Etiket / sarım")
    .replace(/拉环/g, "Açma halkası")
    .replace(/瓶盖|盖子/g, "Kapak")
    .replace(/主体/g, "Gövde")
    .replace(/填充物/g, "İç dolgu");
}

export function ModelMappingDialog({
  modelUrl,
  options,
  selected,
  binding,
  onApply,
  onClose,
  container,
}: {
  modelUrl: string;
  options: PrintSurfaceOption[];
  selected?: string;
  binding?: ModelBinding;
  onApply: (binding?: ModelBinding) => void;
  onClose: () => void;
  container: HTMLElement;
}) {
  const [targetId, setTargetId] = useState(
    selected || options.find((option) => option.usable)?.id || "",
  );
  const [flipY, setFlipY] = useState(binding?.flipY || false);
  const panel = useRef<HTMLDivElement>(null);
  const target = options.find((option) => option.id === targetId);
  useEffect(() => {
    const root = panel.current?.getRootNode();
    const before = (
      root instanceof ShadowRoot ? root.activeElement : document.activeElement
    ) as HTMLElement | null;
    panel.current?.querySelector<HTMLSelectElement>("select")?.focus();
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const items = [
      ...(panel.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),select,input",
      ) || []),
    ];
    const root = panel.current?.getRootNode();
    const active =
      root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    if (event.shiftKey && active === items[0]) {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (!event.shiftKey && active === items.at(-1)) {
      event.preventDefault();
      items[0]?.focus();
    }
  }
  return createPortal(
    <div
      className="model-mapping-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="model-mapping-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-mapping-title"
        onKeyDown={keys}
      >
        <header>
          <h2 id="model-mapping-title">Baskı yüzeyini seç</h2>
          <button
            type="button"
            aria-label="Baskı yüzeyi penceresini kapat"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <p>
          Tasarımı ürünün etiket veya gövde yüzeyine uygula. Kapak ve diğer
          parçalar kendi görünümünü korur.
        </p>
        <label>
          Baskı yapılacak yüzey
          <select
            aria-label="Baskı yapılacak yüzey"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="" disabled>
              Bir yüzey seç
            </option>
            {options.map((option) => (
              <option
                key={option.id}
                value={option.id}
                disabled={!option.usable}
              >
                {surfaceLabel(option.label)}
                {option.recommended ? " · Önerilen" : ""}
                {!option.usable ? " · Kullanılabilir UV yok" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="model-mapping-check">
          <input
            type="checkbox"
            checked={flipY}
            onChange={(event) => setFlipY(event.target.checked)}
          />
          Dikey yönü çevir
        </label>
        {target && (
          <p className="model-mapping-hint">{target.reasons.join(" ")}</p>
        )}
        <p className="model-mapping-hint">
          Seçim bu GLB’ye özel tasarım JSON’unda saklanır. Geometri ve üretici
          dosyası değiştirilmez; yerleşimi 3B görünümde kontrol et.
        </p>
        <footer>
          <button
            type="button"
            className="model-mapping-reset"
            onClick={() => onApply(undefined)}
          >
            Otomatik eşlemeye dön
          </button>
          <button
            type="button"
            className="model-mapping-apply"
            disabled={!target?.usable}
            onClick={() =>
              onApply({
                modelUrl: new URL(modelUrl, location.href).href,
                targetId,
                flipY,
              })
            }
          >
            Bu yüzeye uygula
          </button>
        </footer>
      </div>
    </div>,
    container,
  );
}
