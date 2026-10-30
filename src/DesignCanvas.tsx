import { useEffect, useId, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import {
  Eye,
  Hand,
  MousePointer2,
  Redo2,
  Undo2,
  Minus,
  Plus,
} from "lucide-react";
import { InterfaceIcon } from "./InterfaceIcon";
import { Editor } from "./Editor";
import type { EditorHandle } from "./Editor";
import type { Design, Element, Face } from "./types";
import { effectiveDpi } from "../shared/schema.mjs";
import {
  faceBackground,
  recommendedSurfaceColors,
} from "../shared/surface-colors.mjs";
import { SurfaceColorPicker } from "./SurfaceColorPicker";

export function DesignCanvas({
  open,
  templateUrl,
  singleFace,
  faceLabels,
  editor,
  design,
  face,
  loadKey,
  guides,
  selected,
  historyCount,
  onFace,
  onGuides,
  onUndo,
  onChange,
  onSelect,
  onTexture,
  onError,
  onBackground,
}: {
  open: boolean;
  templateUrl?: string;
  singleFace?: boolean;
  faceLabels?: Partial<Record<Face, string>>;
  editor: RefObject<EditorHandle>;
  design: Design;
  face: Face;
  loadKey: number;
  guides: boolean;
  selected: Element | null;
  historyCount: number[];
  onFace: (face: Face) => void;
  onGuides: () => void;
  onUndo: (redo?: boolean) => void;
  onChange: (elements: Element[]) => void;
  onSelect: (element: Element | null) => void;
  onTexture: (face: Face, canvas: HTMLCanvasElement) => void;
  onError: (message: string) => void;
  onBackground?: (color: string, record?: boolean) => void;
}) {
  const workbench = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [popover, setPopover] = useState<"zoom" | "view" | null>(null);
  const popoverState = useRef(popover);
  popoverState.current = popover;
  const zoomControl = useRef<HTMLDivElement>(null);
  const viewControl = useRef<HTMLDivElement>(null);
  const zoomTrigger = useRef<HTMLButtonElement>(null);
  const viewTrigger = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  const [showDimensions, setShowDimensions] = useState(true);
  const [showMaterial, setShowMaterial] = useState(true);
  const [cutBleedline, setCutBleedline] = useState(false);
  const [guidesTopmost, setGuidesTopmost] = useState(true);
  const [spacePan, setSpacePan] = useState(false);
  const spaceHeld = useRef(false);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const artworkPointer = useRef<number | null>(null);
  const gesture = useRef<
    | {
        kind: "pan";
        pointer: number;
        x: number;
        y: number;
        pan: { x: number; y: number };
      }
    | {
        kind: "pinch";
        distance: number;
        x: number;
        y: number;
        scale: number;
        pan: { x: number; y: number };
      }
    | null
  >(null);
  const width = design.artboard?.canvasWidth || 600;
  const height = design.artboard?.canvasHeight || 900;
  const widthMm = design.artboard?.widthMm;
  const heightMm = design.artboard ? design.artboard.heightMm : undefined;
  useEffect(() => {
    if (singleFace && face !== "front") onFace("front");
  }, [singleFace, face, onFace]);
  const scale = zoom ?? fit;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const viewState = useRef({ scale, pan });
  viewState.current = { scale, pan };
  const isEditable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input, textarea, select"));
  const moveView = (nextScale: number, nextPan: { x: number; y: number }) => {
    viewState.current = { scale: nextScale, pan: nextPan };
    setZoom(nextScale);
    setPan(nextPan);
  };
  // The paper keeps its 600 × 900 design coordinate system. Navigation applies
  // only a screen-space transform, including while the paper is rotated.
  const zoomAt = (nextScale: number, clientX?: number, clientY?: number) => {
    const node = viewport.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const current = viewState.current;
    const bounded = Math.max(
      fitRef.current * 0.25,
      Math.min(fitRef.current * 2, nextScale),
    );
    const ratio = bounded / current.scale;
    const x =
      (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
    const y =
      (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
    moveView(bounded, {
      x: x - (x - current.pan.x) * ratio,
      y: y - (y - current.pan.y) * ratio,
    });
  };
  const fitCanvas = () => {
    setZoom(null);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setPopover(null);
  };
  const stepZoom = (direction: -1 | 1) => {
    const percent = Math.round(
      (viewState.current.scale / fitRef.current) * 100,
    );
    const step =
      direction < 0 ? (percent <= 100 ? 25 : 50) : percent < 100 ? 25 : 50;
    zoomAt(
      (fitRef.current *
        Math.max(25, Math.min(200, percent + direction * step))) /
        100,
    );
  };
  useEffect(() => {
    if (!popover || !open) return;
    const control =
      popover === "zoom" ? zoomControl.current : viewControl.current;
    const trigger =
      popover === "zoom" ? zoomTrigger.current : viewTrigger.current;
    const panel = control?.querySelector<HTMLElement>(".canvas-tools-popover");
    const frame = requestAnimationFrame(() => {
      (
        panel?.querySelector<HTMLElement>('[aria-checked="true"]') ||
        panel?.querySelector<HTMLElement>("button,input")
      )?.focus();
    });
    const outside = (event: Event) => {
      if (control && !event.composedPath().includes(control)) setPopover(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPopover(null);
      trigger?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [popover, open]);
  useEffect(() => {
    const node = viewport.current!;
    const resize = () => {
      if (!node.clientWidth || !node.clientHeight) return;
      setViewportSize({ width: node.clientWidth, height: node.clientHeight });
      setFit(
        Math.max(
          0.08,
          Math.min(
            (node.clientWidth - 96) / (rotation % 180 ? height : width),
            (node.clientHeight - 92) / (rotation % 180 ? width : height),
            1,
          ),
        ),
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, [rotation, width, height]);
  useEffect(() => {
    const node = viewport.current!;
    const wheel = (event: WheelEvent) => {
      if (
        !open ||
        isEditable(event.target) ||
        (event.target instanceof globalThis.Element &&
          event.target.closest(".surface-color-control"))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node.clientHeight
            : 1;
      if (
        event.shiftKey ||
        (Math.abs(event.deltaY) < 0.01 && event.deltaX !== 0)
      ) {
        const current = viewState.current;
        moveView(current.scale, {
          x: current.pan.x - (event.deltaX || event.deltaY) * unit,
          y: current.pan.y,
        });
      } else {
        zoomAt(
          viewState.current.scale *
            (event.ctrlKey || event.metaKey
              ? Math.exp(-event.deltaY * unit * 0.005)
              : event.deltaY > 0
                ? 0.975
                : event.deltaY < 0
                  ? 1.025
                  : 1),
          event.clientX,
          event.clientY,
        );
      }
    };
    // A native non-passive handler prevents browser pinch/page scrolling only
    // inside this viewport; the surrounding Shopify page keeps its gestures.
    node.addEventListener("wheel", wheel, { passive: false, capture: true });
    const keyDown = (event: KeyboardEvent) => {
      if (
        !open ||
        event.composedPath().some(isEditable) ||
        popoverState.current
      )
        return;
      const focused = (node.getRootNode() as Document | ShadowRoot)
        .activeElement;
      const ownApp = node.closest(".online-app");
      if (
        !node.matches(":hover") &&
        !node.contains(focused) &&
        !event.composedPath().includes(ownApp!)
      )
        return;
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        ["v", "h"].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        setTool(event.key.toLowerCase() === "v" ? "select" : "pan");
        return;
      }
      if (event.code !== "Space") return;
      event.preventDefault();
      spaceHeld.current = true;
      setSpacePan(true);
    };
    const releaseSpace = (event: Event) => {
      if (event instanceof KeyboardEvent && event.code !== "Space") return;
      spaceHeld.current = false;
      setSpacePan(false);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", releaseSpace);
    return () => {
      node.removeEventListener("wheel", wheel, true);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", releaseSpace);
      spaceHeld.current = false;
    };
  }, [open]);
  useEffect(() => {
    if (workbench.current) workbench.current.inert = !open;
    if (open) return;
    const active = gesture.current;
    const captured = new Set(touches.current.keys());
    if (active?.kind === "pan") captured.add(active.pointer);
    gesture.current = null;
    for (const pointer of captured)
      if (viewport.current?.hasPointerCapture(pointer))
        viewport.current.releasePointerCapture(pointer);
    touches.current.clear();
    artworkPointer.current = null;
    spaceHeld.current = false;
    setSpacePan(false);
    setPopover(null);
  }, [open]);
  useEffect(() => setSurfaceOpen(false), [face, open]);
  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    const belongedToArtwork = artworkPointer.current === event.pointerId;
    touches.current.delete(event.pointerId);
    if (belongedToArtwork) artworkPointer.current = null;
    if (belongedToArtwork && event.type === "pointercancel") {
      // Fabric listens for pointer-up rather than pointer-cancel. Finish only
      // this editor's primary touch transform if the OS cancels a gesture.
      document.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: true,
          clientX: event.clientX,
          clientY: event.clientY,
          button: 0,
        }),
      );
    }
    if (!active) return;
    // Let the original primary artwork pointer-up reach Fabric so its pending
    // transform finalizes. All navigation moves were captured before Fabric.
    if (!belongedToArtwork) {
      event.preventDefault();
      event.stopPropagation();
    }
    const remainingTouches = [...touches.current.entries()];
    const remaining = remainingTouches[0];
    if (remainingTouches.length >= 2) {
      const [a, b] = remainingTouches.map(([, point]) => point);
      const rect = event.currentTarget.getBoundingClientRect();
      gesture.current = {
        kind: "pinch",
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        x: (a.x + b.x) / 2 - rect.left - rect.width / 2,
        y: (a.y + b.y) / 2 - rect.top - rect.height / 2,
        scale: viewState.current.scale,
        pan: viewState.current.pan,
      };
    } else
      gesture.current = remaining
        ? {
            kind: "pan",
            pointer: remaining[0],
            x: remaining[1].x,
            y: remaining[1].y,
            pan: viewState.current.pan,
          }
        : null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const warnings = design.faces[face].filter((element) => {
    const dpi = effectiveDpi(element, design.artboard);
    return dpi !== null && dpi < 300;
  });
  const zoomPercent = Math.round((scale / fit) * 100);
  const colorInset = Math.min(150, viewportSize.width / 2);
  const colorLeft = Math.max(
    colorInset,
    Math.min(viewportSize.width - colorInset, viewportSize.width / 2 + pan.x),
  );
  // On phones a wide dieline sits near the viewport centre. Keep its color
  // controls at the top so the whole picker fits without scrolling its title
  // away when the HEX field receives focus.
  const colorTop = matchMedia("(max-width: 700px)").matches
    ? 10
    : Math.max(
        10,
        Math.min(
          viewportSize.height - 70,
          viewportSize.height / 2 +
            pan.y -
            ((rotation % 180 ? width : height) * scale) / 2 -
            54,
        ),
      );
  const navigateZoomMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ];
    const active = (event.currentTarget.getRootNode() as Document | ShadowRoot)
      .activeElement;
    const index = items.findIndex((item) => item === active);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[next]?.focus();
  };
  return (
    <section
      ref={workbench}
      className={`design-panel design-workbench ${open ? "is-open" : ""}`}
      aria-label="2B tasarım düzenleyici"
      aria-hidden={!open}
    >
      <div className="design-face-bar">
        <div className="face-switch" role="group" aria-label="Baskı yüzü">
          <select
            aria-label="Baskı yüzü"
            value={face}
            onChange={(event) => onFace(event.target.value as Face)}
          >
            <option value="front">
              {faceLabels?.front || (singleFace ? "Sarım yüzeyi" : "Ön yüz")}
            </option>
            {!singleFace && (
              <option value="back">{faceLabels?.back || "Arka yüz"}</option>
            )}
          </select>
        </div>
        <span>
          {design.artboard
            ? `Ürün bıçak izi · ${widthMm && heightMm ? `${widthMm} × ${heightMm} mm` : "Ölçü tanımlanmadı"}`
            : "Ürün çalışma alanı · Bıçak izi bekleniyor"}
        </span>
      </div>
      <div
        className={`design-viewport tool-${spacePan ? "pan" : tool}`}
        ref={viewport}
        tabIndex={0}
        style={{ touchAction: "none" }}
        onPointerDownCapture={(event) => {
          if (!open) return;
          if (
            event.target instanceof globalThis.Element &&
            event.target.closest(".surface-color-control")
          )
            return;
          if (event.pointerType === "touch") {
            touches.current.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
            event.currentTarget.setPointerCapture(event.pointerId);
            if (touches.current.size >= 2) {
              const [a, b] = [...touches.current.values()];
              const rect = event.currentTarget.getBoundingClientRect();
              gesture.current = {
                kind: "pinch",
                distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
                x: (a.x + b.x) / 2 - rect.left - rect.width / 2,
                y: (a.y + b.y) / 2 - rect.top - rect.height / 2,
                scale: viewState.current.scale,
                pan: viewState.current.pan,
              };
              for (const pointer of touches.current.keys())
                event.currentTarget.setPointerCapture(pointer);
              event.preventDefault();
              event.stopPropagation();
              return;
            }
          }
          if (tool !== "pan" && !spaceHeld.current && event.button !== 1) {
            if (event.pointerType === "touch")
              artworkPointer.current = event.pointerId;
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = {
            kind: "pan",
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            pan: viewState.current.pan,
          };
        }}
        onPointerMoveCapture={(event) => {
          if (!open) return;
          if (touches.current.has(event.pointerId))
            touches.current.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
          const start = gesture.current;
          if (!start) return;
          event.preventDefault();
          event.stopPropagation();
          if (start.kind === "pinch") {
            const [a, b] = [...touches.current.values()];
            if (!a || !b) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const nextScale = Math.max(
              fitRef.current * 0.25,
              Math.min(
                fitRef.current * 2,
                (start.scale * Math.hypot(b.x - a.x, b.y - a.y)) /
                  start.distance,
              ),
            );
            const ratio = nextScale / start.scale;
            moveView(nextScale, {
              x:
                (a.x + b.x) / 2 -
                rect.left -
                rect.width / 2 -
                (start.x - start.pan.x) * ratio,
              y:
                (a.y + b.y) / 2 -
                rect.top -
                rect.height / 2 -
                (start.y - start.pan.y) * ratio,
            });
          } else if (start.pointer === event.pointerId) {
            moveView(viewState.current.scale, {
              x: start.pan.x + event.clientX - start.x,
              y: start.pan.y + event.clientY - start.y,
            });
          }
        }}
        onPointerUpCapture={endPointer}
        onPointerCancelCapture={endPointer}
        onLostPointerCapture={(event) => {
          if (touches.current.has(event.pointerId)) return;
          if (
            gesture.current?.kind === "pan" &&
            gesture.current.pointer === event.pointerId
          )
            gesture.current = null;
        }}
      >
        {onBackground && open && (
          <SurfaceColorPicker
            key={face}
            value={faceBackground(design, face)}
            colors={recommendedSurfaceColors(design, face) as string[]}
            faceLabel={
              faceLabels?.[face] ||
              (singleFace
                ? "Sarım yüzeyi"
                : face === "front"
                  ? "Ön yüz"
                  : "Arka yüz")
            }
            onChange={onBackground}
            onOpenChange={setSurfaceOpen}
            style={{ left: colorLeft, top: colorTop }}
            availableHeight={Math.max(100, viewportSize.height - colorTop - 58)}
          />
        )}
        <div
          className={`design-paper${surfaceOpen ? " surface-selected" : ""}`}
          style={{
            width,
            height,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
        >
          <div
            className="paper-width"
            hidden={!showDimensions || !widthMm || !heightMm}
          >
            <span>{widthMm} mm</span>
          </div>
          <div
            className="paper-height"
            hidden={!showDimensions || !widthMm || !heightMm}
          >
            <span>{heightMm} mm</span>
          </div>
          <Editor
            key={`${width}x${height}`}
            ref={editor}
            artboard={design.artboard}
            templateUrl={templateUrl}
            face={face}
            elements={design.faces[face]}
            background={faceBackground(design, face)}
            loadKey={loadKey}
            guides={guides}
            showMaterial={showMaterial}
            cutBleedline={cutBleedline}
            guidesTopmost={guidesTopmost}
            interactive={open}
            onChange={onChange}
            onSelect={onSelect}
            onTexture={onTexture}
            onError={onError}
          />
        </div>
      </div>
      <div className="design-footnotes">
        {design.artboard ? (
          <span>Ürün SVG bıçak izi · Güvenli alan tanımlanmadı</span>
        ) : (
          <>
            <span>
              <i className="print-dot" /> Baskı alanı
            </span>
            <span>
              <i className="safe-dot" /> Güvenli alan
            </span>
          </>
        )}
        <span className="production-note">
          {design.artboard
            ? "Üretim onayı gerekli"
            : "Örnek şablon · Üretim için kullanılamaz"}
        </span>
      </div>
      {warnings.length > 0 && (
        <div className="design-dpi-warning" role="status">
          {warnings.length} görselin çözünürlüğü,{" "}
          {design.artboard ? "şablon" : "örnek baskı"} ölçüsünde 300 DPI’ın
          altında.
        </div>
      )}
      <div
        className="design-canvas-dock"
        role="toolbar"
        aria-label="Tuval araçları"
      >
        <button
          aria-label="Öğe seç"
          title="Öğe seç (V)"
          aria-pressed={tool === "select" && !spacePan}
          className={tool === "select" && !spacePan ? "active" : ""}
          onClick={() => setTool("select")}
        >
          <MousePointer2 size={20} />
        </button>
        <button
          aria-label="Tuvali kaydır"
          title="Tuvali kaydır (H)"
          aria-pressed={tool === "pan" || spacePan}
          className={tool === "pan" || spacePan ? "active" : ""}
          onClick={() => setTool("pan")}
        >
          <Hand size={20} />
        </button>
        <i />
        <button
          aria-label="Geri al"
          title="Geri al (Ctrl/⌘ + Z)"
          disabled={!historyCount[0]}
          onClick={() => onUndo()}
        >
          <Undo2 size={20} />
        </button>
        <button
          aria-label="Yinele"
          title="Yinele (Ctrl/⌘ + Shift + Z)"
          disabled={!historyCount[1]}
          onClick={() => onUndo(true)}
        >
          <Redo2 size={20} />
        </button>
        <i />
        <button
          aria-label="Tuvali uzaklaştır"
          title="Uzaklaştır"
          disabled={zoomPercent <= 25}
          onClick={() => stepZoom(-1)}
        >
          <Minus size={20} />
        </button>
        <div className="canvas-tool-control" ref={zoomControl}>
          <button
            ref={zoomTrigger}
            className="zoom-reset"
            aria-label="Yakınlaştırma seçenekleri"
            title="Yakınlaştırma"
            aria-haspopup="menu"
            aria-expanded={popover === "zoom"}
            aria-controls={`${popupId}-zoom`}
            onClick={() => setPopover(popover === "zoom" ? null : "zoom")}
          >
            <output aria-label="Tuval yakınlaştırma oranı">
              {zoomPercent}%
            </output>
          </button>
          {popover === "zoom" && (
            <div
              id={`${popupId}-zoom`}
              className="canvas-tools-popover canvas-zoom-menu"
              role="menu"
              aria-label="Yakınlaştırma"
              onKeyDown={navigateZoomMenu}
            >
              {[50, 100, 200].map((percent) => (
                <button
                  key={percent}
                  role="menuitemradio"
                  aria-checked={zoomPercent === percent}
                  onClick={() => {
                    zoomAt((fitRef.current * percent) / 100);
                    setPopover(null);
                    zoomTrigger.current?.focus({ preventScroll: true });
                  }}
                >
                  {percent}%
                </button>
              ))}
              <button
                role="menuitem"
                aria-label="Tuvali ekrana sığdır"
                onClick={() => {
                  fitCanvas();
                  zoomTrigger.current?.focus({ preventScroll: true });
                }}
              >
                Ekrana sığdır
              </button>
            </div>
          )}
        </div>
        <button
          aria-label="Tuvali yakınlaştır"
          title="Yakınlaştır"
          disabled={zoomPercent >= 200}
          onClick={() => stepZoom(1)}
        >
          <Plus size={20} />
        </button>
        <i />
        <button
          aria-label="Tuvali 90 derece döndür"
          title="Tuvali 90° döndür"
          onClick={() => setRotation((rotation + 90) % 360)}
        >
          <InterfaceIcon name="rotate" size={20} />
        </button>
        <div className="canvas-tool-control" ref={viewControl}>
          <button
            ref={viewTrigger}
            aria-label="Görünüm seçenekleri"
            title="Görünüm seçenekleri"
            aria-expanded={popover === "view"}
            aria-controls={`${popupId}-view`}
            className={popover === "view" ? "active" : ""}
            onClick={() => setPopover(popover === "view" ? null : "view")}
          >
            <Eye size={20} />
          </button>
          {popover === "view" && (
            <div
              id={`${popupId}-view`}
              className="canvas-tools-popover canvas-view-menu"
              role="group"
              aria-label="Görünüm seçenekleri"
            >
              <label>
                <input
                  type="checkbox"
                  checked={showDimensions}
                  onChange={(event) => setShowDimensions(event.target.checked)}
                />
                <span>Ölçüleri göster</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showMaterial}
                  onChange={(event) => setShowMaterial(event.target.checked)}
                />
                <span>Malzemeyi göster</span>
              </label>
              <label>
                <input type="checkbox" checked={guides} onChange={onGuides} />
                <span>Taşma çizgisini göster</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={cutBleedline}
                  onChange={(event) => setCutBleedline(event.target.checked)}
                />
                <span>Baskı alanı dışını kırp</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={guidesTopmost}
                  onChange={(event) => setGuidesTopmost(event.target.checked)}
                />
                <span>Taşma çizgisini en üste taşı</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
