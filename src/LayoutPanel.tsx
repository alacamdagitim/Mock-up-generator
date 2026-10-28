import { Check } from "lucide-react";
import { LAYOUTS } from "../shared/layouts.mjs";
import type { Presentation } from "./types";

const names: Record<string, string> = {
  single: "Single",
  "front-back": "Front & back",
  duo: "Duo",
  trio: "Trio",
  fan: "Fan",
  stagger: "Staggered",
  hero: "Hero",
  catalog: "Catalog",
  "side-pair": "Front & side",
  "tilted-duo": "Tilted pair",
  lineup: "Five products",
};
const covers = import.meta.glob("./assets/layout-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function LayoutPanel({
  layout,
  spacing,
  onSelect,
  onSpacing,
}: {
  layout: NonNullable<Presentation["layout"]>;
  spacing: number;
  onSelect: (layout: NonNullable<Presentation["layout"]>) => void;
  onSpacing: (spacing: number) => void;
}) {
  return (
    <div className="layout-panel">
      <div className="layout-grid">
        {LAYOUTS.map((item) => (
          <button
            key={item.id}
            aria-label={`${item.name} yerleşimini uygula`}
            title={names[item.id]}
            aria-pressed={layout === item.id}
            onClick={() =>
              onSelect(item.id as NonNullable<Presentation["layout"]>)
            }
          >
            <div className="layout-cover">
              <img
                src={covers[`./assets/layout-${item.id}.webp`]}
                alt=""
                draggable={false}
              />
              <span className="layout-apply">Apply</span>
            </div>
            <span className="layout-name">
              {names[item.id]}
              {layout === item.id && <Check size={13} />}
            </span>
          </button>
        ))}
      </div>
      <label className="layout-spacing">
        <span>
          Product spacing<output>{Math.round(spacing * 100)}%</output>
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
        Copies share the same front and back design. Layout does not change
        order quantity. Your selected layout is retained while editing in 2D.
      </p>
    </div>
  );
}
