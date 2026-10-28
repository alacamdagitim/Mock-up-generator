import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { Check, Pipette, X } from "lucide-react";
import { hexToHsv, hsvToHex, normalizeHex } from "../shared/surface-colors.mjs";

type Hsv = { h: number; s: number; v: number };
type EyeDropperInstance = {
  open: (options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>;
};
type EyeDropperConstructor = new () => EyeDropperInstance;

export function SurfaceColorPicker({
  value,
  colors,
  faceLabel,
  onChange,
  onOpenChange,
  style,
  availableHeight,
}: {
  value: string;
  colors: string[];
  faceLabel: string;
  onChange: (color: string, record?: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  style?: CSSProperties;
  availableHeight: number;
}) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const hsvRef = useRef(hsv);
  const [hex, setHex] = useState(value);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const transaction = useRef<{ started: boolean } | null>(null);
  const eyeAbort = useRef<AbortController>();
  const dialogId = useId();
  const titleId = useId();
  const keyboardId = useId();
  const errorId = useId();
  const EyeDropper = (window as Window & { EyeDropper?: EyeDropperConstructor })
    .EyeDropper;
  const changeOpen = (next: boolean) => {
    if (!next) {
      eyeAbort.current?.abort();
      transaction.current = null;
    }
    setOpen(next);
    onOpenChange?.(next);
  };
  useEffect(() => {
    setHex(value);
    setError("");
    setHsv((previous) => {
      const next = hsvToHex(previous) === value ? previous : hexToHsv(value);
      hsvRef.current = next;
      return next;
    });
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    const outside = (event: Event) => {
      if (!event.composedPath().includes(root.current!)) changeOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      changeOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
      eyeAbort.current?.abort();
    };
  }, [open]);
  useEffect(() => () => eyeAbort.current?.abort(), []);
  const emit = (color: string) => {
    if (color.toLowerCase() === value.toLowerCase()) return;
    const record = !transaction.current?.started;
    if (transaction.current) transaction.current.started = true;
    onChange(color, record);
  };
  const choose = (color: string) => {
    const next = hexToHsv(color);
    hsvRef.current = next;
    setHsv(next);
    setHex(color);
    setError("");
    emit(color);
  };
  const chooseHsv = (next: Hsv) => {
    hsvRef.current = next;
    setHsv(next);
    setHex(hsvToHex(next));
    setError("");
    emit(hsvToHex(next));
  };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    chooseHsv({
      ...hsvRef.current,
      s: Math.max(
        0,
        Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
      ),
      v: Math.max(
        0,
        Math.min(
          100,
          100 - ((event.clientY - bounds.top) / bounds.height) * 100,
        ),
      ),
    });
  };
  const squareKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(key)
    )
      return;
    event.preventDefault();
    const next = { ...hsvRef.current },
      step = event.shiftKey ? 10 : 1;
    if (key === "ArrowLeft") next.s = Math.max(0, next.s - step);
    if (key === "ArrowRight") next.s = Math.min(100, next.s + step);
    if (key === "ArrowUp") next.v = Math.min(100, next.v + step);
    if (key === "ArrowDown") next.v = Math.max(0, next.v - step);
    if (key === "Home") next.s = 0;
    if (key === "End") next.s = 100;
    chooseHsv(next);
  };
  const applyHex = () => {
    const color = normalizeHex(hex);
    if (!color) {
      setError("Geçerli bir renk kodu girin. Örnek: #A3C83E");
      return;
    }
    if (color !== value) choose(color);
    else setHex(color);
  };
  const pick = async () => {
    if (!EyeDropper) return;
    eyeAbort.current?.abort();
    const controller = new AbortController();
    eyeAbort.current = controller;
    setPicking(true);
    setError("");
    try {
      const result = await new EyeDropper().open({ signal: controller.signal });
      const color = normalizeHex(result.sRGBHex);
      if (color && !controller.signal.aborted) choose(color);
    } catch (reason) {
      if (!controller.signal.aborted && (reason as Error).name !== "AbortError")
        setError("Ekrandan renk alınamadı. Renk kodu girebilirsiniz.");
    } finally {
      setPicking(false);
    }
  };
  return (
    <div className="surface-color-control" ref={root} style={style}>
      <button
        className="surface-color-trigger"
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={dialogId}
        aria-haspopup="dialog"
        onClick={() => changeOpen(!open)}
        title={`${faceLabel} için yüzey rengi`}
      >
        <i className="surface-color-wheel" aria-hidden="true">
          <i style={{ background: value }} />
        </i>
        Yüzey rengi
      </button>
      {open && (
        <div
          className="surface-color-popover"
          id={dialogId}
          role="dialog"
          aria-labelledby={titleId}
          style={{ maxHeight: availableHeight }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="surface-color-heading">
            <strong id={titleId}>Yüzey rengi</strong>
            <button
              type="button"
              aria-label="Renk seçiciyi kapat"
              onClick={() => {
                changeOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          </div>
          <span className="surface-color-face">{faceLabel}</span>
          <label className="surface-color-label">Önerilen renkler</label>
          <div
            className="surface-color-swatches"
            role="group"
            aria-label="Önerilen yüzey renkleri"
          >
            {colors.map((color) => (
              <button
                type="button"
                key={color}
                style={{ background: color }}
                aria-label={`Yüzey rengini ${color.toUpperCase()} yap`}
                aria-pressed={value.toLowerCase() === color}
                onClick={() => choose(color)}
                title={color.toUpperCase()}
              >
                {value.toLowerCase() === color && (
                  <Check
                    size={17}
                    style={{
                      color: hexToHsv(color).v > 60 ? "#111111" : "#ffffff",
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="surface-color-divider" />
          <label className="surface-color-label">Renk</label>
          <div
            className="surface-color-square"
            style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }}
            role="slider"
            tabIndex={0}
            aria-label="Doygunluk ve parlaklık"
            aria-describedby={keyboardId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s)}
            aria-valuetext={`Yüzde ${Math.round(hsv.s)} doygunluk, yüzde ${Math.round(hsv.v)} parlaklık`}
            onKeyDown={squareKey}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              transaction.current = { started: false };
              point(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                point(event);
            }}
            onPointerUp={(event) => {
              transaction.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              transaction.current = null;
            }}
            onLostPointerCapture={() => {
              transaction.current = null;
            }}
          >
            <i
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                background: hsvToHex(hsv),
              }}
            />
          </div>
          <span id={keyboardId} className="surface-color-sr">
            Sağ ve sol oklarla doygunluğu, yukarı ve aşağı oklarla parlaklığı
            değiştirin. Shift ile 10 adım ilerleyin.
          </span>
          <input
            className="surface-color-hue"
            type="range"
            min="0"
            max="359"
            step="1"
            value={hsv.h}
            aria-label="Renk tonu"
            aria-valuetext={`${Math.round(hsv.h)} derece`}
            onPointerDown={() => {
              transaction.current = { started: false };
            }}
            onPointerUp={() => {
              transaction.current = null;
            }}
            onPointerCancel={() => {
              transaction.current = null;
            }}
            onLostPointerCapture={() => {
              transaction.current = null;
            }}
            onBlur={() => {
              transaction.current = null;
            }}
            onChange={(event) =>
              chooseHsv({ ...hsvRef.current, h: Number(event.target.value) })
            }
          />
          <div className="surface-color-input-row">
            {EyeDropper && (
              <button
                type="button"
                className="surface-color-eyedropper"
                title="Ekrandan renk seç"
                aria-label="Ekrandan renk seç"
                disabled={picking}
                onClick={() => void pick()}
              >
                <Pipette size={19} />
              </button>
            )}
            <input
              ref={input}
              type="text"
              className="surface-color-hex"
              aria-label="HEX renk kodu"
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              spellCheck={false}
              autoComplete="off"
              maxLength={7}
              value={hex}
              onChange={(event) => {
                setHex(event.target.value);
                setError("");
              }}
              onBlur={applyHex}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyHex();
                }
              }}
            />
          </div>
          {error && (
            <p className="surface-color-error" role="status" id={errorId}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
