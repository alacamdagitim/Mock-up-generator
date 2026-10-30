import { useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

type PreviewWindowControlsProps = {
  size: number;
  onResize: (size: number) => void;
  minSize?: number;
  maxSize: number;
};

type WindowDrag = {
  pointerId: number;
  x: number;
  y: number;
  startSize: number;
  value: number;
};

export function PreviewWindowControls({
  size,
  onResize,
  minSize = 280,
  maxSize,
}: PreviewWindowControlsProps) {
  const drag = useRef<WindowDrag | null>(null);
  const resizeTipId = useId();
  const [dragging, setDragging] = useState(false);
  const upperBound = Math.max(1, maxSize);
  const lowerBound = Math.max(1, Math.min(minSize, upperBound));
  const clamp = (value: number) =>
    Math.round(Math.max(lowerBound, Math.min(upperBound, value)));

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    const startSize = clamp(size);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startSize,
      value: startSize,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    // Keep the pointer's grab offset so the preview never jumps on first drag.
    const next = clamp(
      current.startSize +
        Math.min(current.x - event.clientX, event.clientY - current.y),
    );
    if (next === current.value) return;
    current.value = next;
    onResize(next);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 20 : 10;
    const change =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? step
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? -step
          : 0;
    if (!change && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "Home"
        ? lowerBound
        : event.key === "End"
          ? upperBound
          : clamp(size + change);
    if (next !== clamp(size)) onResize(next);
  }

  return (
    <>
      <div className="preview-window-indicator" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <text
            x="14"
            y="13"
            fill="currentColor"
            textAnchor="middle"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="11"
            fontWeight="700"
          >
            3B
          </text>
          <path
            d="M6.5 14.5C1 17.1 4.2 21.4 13.2 21.4c5.7 0 10.3-1.6 10.3-4.1 0-1.2-1-2.3-2.8-3.1"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="m16.7 18 3.6 3-3.6 2.7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="preview-window-indicator-tip" role="tooltip">
          Modeli döndürmek için sürükleyin
        </span>
      </div>
      <div
        className="preview-window-resize"
        role="slider"
        tabIndex={0}
        aria-label="Önizleme penceresini boyutlandır"
        aria-valuemin={lowerBound}
        aria-valuemax={upperBound}
        aria-valuenow={clamp(size)}
        aria-valuetext={`${clamp(size)} × ${clamp(size)} piksel`}
        aria-describedby={resizeTipId}
        aria-keyshortcuts="ArrowLeft ArrowDown ArrowRight ArrowUp Home End"
        data-dragging={dragging || undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointerId === event.pointerId) {
            drag.current = null;
            setDragging(false);
          }
        }}
        onKeyDown={handleKeys}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 0v28h28L0 0Z" fill="#c6c7c9" />
          <path
            d="m5 13 10 10m-10-4 4 4"
            stroke="white"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span
          id={resizeTipId}
          className="preview-window-resize-tip"
          role="tooltip"
        >
          {clamp(size) >= upperBound
            ? "Önizleme en büyük boyutta"
            : "Boyutlandırmak için sürükleyin"}
        </span>
      </div>
    </>
  );
}
