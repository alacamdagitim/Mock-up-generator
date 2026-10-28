import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

export type ConfigValues = {
  substrate: "white" | "kraft" | "metallic";
  printMode: "color" | "black" | "blank";
  finishing: "gloss" | "matte" | "none";
};

type ConfigureDialogProps = {
  values: ConfigValues;
  onApply: (values: ConfigValues) => void;
  onClose: () => void;
};

type IllustrationProps = {
  kind: "material" | "print";
  value: string;
};

/** Original material samples and standard print symbols for this editor. */
function ConfigIllustration({ kind, value }: IllustrationProps) {
  const id = useId().replace(/:/g, "");
  if (kind === "print") {
    const colors =
      value === "color"
        ? ["#00b5de", "#ed3992", "#ffe500", "#161616"]
        : ["#161616", "#161616", "#161616", "#161616"];
    return (
      <svg
        className="configure-illustration"
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
      >
        {[
          [36, 36],
          [64, 36],
          [36, 64],
          [64, 64],
        ].map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="11"
            fill={value === "blank" ? "none" : colors[index]}
            stroke={value === "blank" ? "#d9d9d9" : "none"}
            strokeWidth="1.2"
          />
        ))}
        {value === "blank" && (
          <path
            d="m25 75 50-50"
            stroke="#ef4f4f"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </svg>
    );
  }
  const kraft = value === "kraft";
  const metallic = value === "metallic";
  const fill = kraft ? "#c5a06b" : "#f5f5f5";
  return (
    <svg
      className="configure-illustration"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${id}-sample`}
          x1="20"
          y1="24"
          x2="77"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={metallic ? "#8f949c" : fill} />
          <stop
            offset=".38"
            stopColor={metallic ? "#fff" : kraft ? "#dabc92" : "#fff"}
          />
          <stop offset=".7" stopColor={metallic ? "#abb0b9" : fill} />
          <stop
            offset="1"
            stopColor={metallic ? "#e7e9ec" : kraft ? "#b28a55" : "#dddfe2"}
          />
        </linearGradient>
        <linearGradient
          id={`${id}-gloss`}
          x1="35"
          y1="26"
          x2="69"
          y2="68"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" stopOpacity="0" />
          <stop offset=".45" stopColor="white" stopOpacity=".88" />
          <stop offset=".61" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <pattern
          id={`${id}-grain`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="m1 1 1 .3m2 3 .6-.3M1 5h.4"
            stroke="#77592f"
            strokeOpacity=".22"
            strokeWidth=".45"
          />
        </pattern>
      </defs>
      <ellipse cx="51" cy="83" rx="32" ry="3" fill="#151515" opacity=".075" />
      <path
        d="m22 28 48-10 13 54-48 13-13-57Z"
        fill={kraft ? "#ad8552" : "#c6c8cc"}
      />
      <path
        d="m22 24 48-10 13 54-48 13-13-57Z"
        fill={`url(#${id}-sample)`}
        stroke={kraft ? "#b69365" : "#d4d5d9"}
        strokeWidth=".5"
      />
      {kraft && (
        <path d="m22 24 48-10 13 54-48 13-13-57Z" fill={`url(#${id}-grain)`} />
      )}
      {metallic && (
        <path d="m22 24 48-10 13 54-48 13-13-57Z" fill={`url(#${id}-gloss)`} />
      )}
      <path d="m70 14 13 54-11-7-2-47Z" fill="white" opacity=".3" />
      <path
        d="m25 31 12 45 42-11"
        stroke={kraft ? "#e7ccaa" : "#fff"}
        opacity=".7"
        strokeWidth=".5"
      />
    </svg>
  );
}

const materialOptions = [
  { value: "white", label: "White film" },
  { value: "kraft", label: "Kraft" },
  { value: "metallic", label: "Metallic" },
] as const;

const printOptions = [
  { value: "color", label: "Full Color" },
  { value: "black", label: "Black" },
  { value: "blank", label: "Blank" },
] as const;

const finishingOptions = [
  { value: "gloss", label: "Gloss" },
  { value: "matte", label: "Matte" },
  { value: "none", label: "Blank" },
] as const;

export function ConfigureDialog({
  values,
  onApply,
  onClose,
}: ConfigureDialogProps) {
  const [draft, setDraft] = useState<ConfigValues>(() => ({ ...values }));
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const noteId = useId();
  const groupId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const root = dialog.getRootNode();
    const previousFocus = (
      root instanceof ShadowRoot ? root.activeElement : document.activeElement
    ) as HTMLElement | null;
    dialog.querySelector<HTMLButtonElement>(".configure-close")?.focus();
    return () => {
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    // Editor shortcuts must not transform the artwork behind this dialog.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled):not([type="radio"]), input[type="radio"]:checked:not(:disabled), [tabindex="0"]',
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const root = dialogRef.current?.getRootNode();
    const active =
      root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    if (
      event.shiftKey &&
      (active === first || !dialogRef.current?.contains(active))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (active === last || !dialogRef.current?.contains(active))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className="configure-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="configure-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        onKeyDown={handleKeys}
      >
        <header className="configure-header">
          <h2 id={titleId}>Configure</h2>
          <button
            className="configure-close"
            type="button"
            aria-label="Close configuration"
            onClick={onClose}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="configure-content">
          <section
            className="configure-size"
            aria-labelledby={`${titleId}-size`}
          >
            <h3 id={`${titleId}-size`}>Size</h3>
            <div className="configure-dimensions">
              <label>
                <span>Width</span>
                <span className="configure-dimension-value">
                  140 <span>mm</span>
                </span>
              </label>
              <span className="configure-dimension-times" aria-hidden="true">
                ×
              </span>
              <label>
                <span>Height</span>
                <span className="configure-dimension-value">
                  210 <span>mm</span>
                </span>
              </label>
            </div>
            <p className="configure-size-note">
              Sample dimensions · The production dieline is not configured.
            </p>
          </section>

          <fieldset className="configure-section">
            <legend>
              <span>Material</span>
              <span className="configure-section-value" aria-hidden="true">
                {
                  materialOptions.find(
                    (option) => option.value === draft.substrate,
                  )?.label
                }
              </span>
            </legend>
            <div className="configure-options">
              {materialOptions.map((option) => (
                <label className="configure-option" key={option.value}>
                  <input
                    type="radio"
                    name={`${groupId}-material`}
                    value={option.value}
                    checked={draft.substrate === option.value}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        substrate: option.value,
                      }))
                    }
                  />
                  <span className="configure-option-card">
                    <span className="configure-option-tile">
                      <ConfigIllustration
                        kind="material"
                        value={option.value}
                      />
                    </span>
                    <span className="configure-option-label">
                      {option.label}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="configure-section">
            <legend>
              <span>Print</span>
              <span className="configure-section-value" aria-hidden="true">
                {
                  printOptions.find(
                    (option) => option.value === draft.printMode,
                  )?.label
                }
              </span>
            </legend>
            <div className="configure-options">
              {printOptions.map((option) => (
                <label className="configure-option" key={option.value}>
                  <input
                    type="radio"
                    name={`${groupId}-print`}
                    value={option.value}
                    checked={draft.printMode === option.value}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        printMode: option.value,
                      }))
                    }
                  />
                  <span className="configure-option-card">
                    <span className="configure-option-tile">
                      <ConfigIllustration kind="print" value={option.value} />
                    </span>
                    <span className="configure-option-label">
                      {option.label}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="configure-section">
            <legend>
              <span>Finishing</span>
              <span className="configure-section-value" aria-hidden="true">
                {
                  finishingOptions.find(
                    (option) => option.value === draft.finishing,
                  )?.label
                }
              </span>
            </legend>
            <div className="configure-pills">
              {finishingOptions.map((option) => (
                <label className="configure-option" key={option.value}>
                  <input
                    type="radio"
                    name={`${groupId}-finishing`}
                    value={option.value}
                    checked={draft.finishing === option.value}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        finishing: option.value,
                      }))
                    }
                  />
                  <span className="configure-pill">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <footer className="configure-footer">
          <p id={noteId}>
            Materials and finishes are preview options until the merchant maps
            them to a product.
          </p>
          <div className="configure-actions">
            <button
              className="configure-discard"
              type="button"
              onClick={onClose}
            >
              Discard
            </button>
            <button
              className="configure-apply"
              type="button"
              onClick={() => onApply({ ...draft })}
            >
              Apply
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
