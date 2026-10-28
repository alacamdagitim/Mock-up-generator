import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { LAYOUTS } from "../shared/layouts.mjs";
import type { Presentation } from "./types";

export function LayoutPanel({
  layout,
  spacing,
  onSelect,
  onSpacing,
  getCovers,
  revision,
}: {
  layout: NonNullable<Presentation["layout"]>;
  spacing: number;
  onSelect: (layout: NonNullable<Presentation["layout"]>) => void;
  onSpacing: (spacing: number) => void;
  getCovers: (signal: AbortSignal) => Promise<Record<string, string>>;
  revision: unknown;
}) {
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Ürününüzün yerleşimleri hazırlanıyor…");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("Ürününüzün yerleşimleri hazırlanıyor…");
      getCovers(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) {
            setCovers(value);
            setStatus("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setStatus(
              "Kart önizlemeleri hazırlanamadı. Yerleşimleri seçerek 3B alanda görebilirsiniz.",
            );
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision, spacing, getCovers]);
  return (
    <div className="layout-panel">
      {status && (
        <p className="panel-note" role="status">
          {status}
        </p>
      )}
      <div className="layout-grid">
        {LAYOUTS.map((item) => (
          <button
            key={item.id}
            aria-label={`${item.name} yerleşimini uygula`}
            title={item.name}
            aria-pressed={layout === item.id}
            onClick={() =>
              onSelect(item.id as NonNullable<Presentation["layout"]>)
            }
          >
            <div className="layout-cover">
              {covers[item.id] && (
                <img src={covers[item.id]} alt="" draggable={false} />
              )}
              <span className="layout-apply">Uygula</span>
            </div>
            <span className="layout-name">
              {item.name}
              {layout === item.id && <Check size={13} />}
            </span>
          </button>
        ))}
      </div>
      <label className="layout-spacing">
        <span>
          Ürün aralığı<output>{Math.round(spacing * 100)}%</output>
        </span>
        <input
          aria-label="Yerleşim aralığı"
          type="range"
          min="0.8"
          max="1.6"
          step="0.05"
          value={spacing}
          disabled={layout === "single"}
          onChange={(event) => onSpacing(Number(event.target.value))}
        />
      </label>
      <p className="panel-note">
        Kartlar seçili ürününüzü ve tasarımınızı gösterir. Kopyalar aynı
        tasarımı kullanır; yerleşim sipariş adedini değiştirmez.
      </p>
    </div>
  );
}
