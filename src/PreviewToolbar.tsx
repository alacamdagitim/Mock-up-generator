import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { Box, Hand, Minus, MousePointer2, Plus } from "lucide-react";
import type { PreviewHandle } from "./Preview";

export function PreviewToolbar({
  preview,
  allowInflate = true,
  inflate,
  onInflate,
  interaction,
  onInteraction,
}: {
  preview: RefObject<PreviewHandle>;
  allowInflate?: boolean;
  inflate: number;
  onInflate: (value: number) => void;
  interaction: "rotate" | "pan";
  onInteraction: (value: "rotate" | "pan") => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewTrigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const [menu, setMenu] = useState(false);

  function closeMenu(restoreFocus = false) {
    setMenu(false);
    if (restoreFocus) viewTrigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!menu) return;
    popover.current?.querySelector<HTMLButtonElement>("button")?.focus({
      preventScroll: true,
    });
    const outside = (event: PointerEvent) => {
      if (host.current && !event.composedPath().includes(host.current))
        setMenu(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
    };
  }, [menu]);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!menu) return;
    if (event.key === "Escape") {
      // Consume this layer's Escape before the storefront launcher sees it.
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (!popover.current?.contains(event.target as Node)) return;
    event.stopPropagation();
    const buttons = Array.from(
      popover.current.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const direction =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + direction + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
  }

  return (
    <div
      className="online-camera-dock"
      role="toolbar"
      aria-label="3D araçları"
      ref={host}
      onKeyDown={handleKeys}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setMenu(false);
      }}
    >
      <button
        type="button"
        aria-label="3B yakınlaştır"
        title="Zoom in"
        onClick={() => preview.current?.zoom(0.9)}
      >
        <Plus size={18} />
      </button>
      <button
        type="button"
        aria-label="3B uzaklaştır"
        title="Zoom out"
        onClick={() => preview.current?.zoom(1.1)}
      >
        <Minus size={18} />
      </button>
      <i className="preview-toolbar-divider" aria-hidden="true" />
      {allowInflate && (
        <label className="preview-inflate">
          <span>Inflate</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label="Paket dolgunluğu"
            aria-valuetext={`${inflate}%`}
            value={inflate}
            onChange={(event) => onInflate(Number(event.target.value))}
          />
          <output>{inflate}%</output>
        </label>
      )}
      <i className="preview-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        ref={viewTrigger}
        className="preview-view-trigger"
        aria-label="3D görünüm seçenekleri"
        aria-expanded={menu}
        aria-controls={menu ? popoverId : undefined}
        title="View"
        onClick={() => setMenu(!menu)}
      >
        <Box size={19} />
      </button>
      {menu && (
        <div
          id={popoverId}
          ref={popover}
          className="preview-view-popover"
          role="group"
          aria-label="3D görünüm seçenekleri"
        >
          <div className="preview-interaction-options">
            <button
              type="button"
              aria-label="Rotate 3D"
              aria-pressed={interaction === "rotate"}
              onClick={() => onInteraction("rotate")}
            >
              <MousePointer2 size={18} /> Rotate
            </button>
            <button
              type="button"
              aria-label="Pan 3D"
              aria-pressed={interaction === "pan"}
              onClick={() => onInteraction("pan")}
            >
              <Hand size={18} /> Pan
            </button>
          </div>
          {(["front", "back", "perspective"] as const).map((view) => (
            <button
              type="button"
              key={view}
              onClick={() => {
                preview.current?.view(view);
                closeMenu(true);
              }}
            >
              {view === "front"
                ? "Front"
                : view === "back"
                  ? "Back"
                  : "Perspective"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
