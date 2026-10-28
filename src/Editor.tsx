import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Canvas,
  StaticCanvas,
  Rect,
  Circle,
  Textbox,
  FabricImage,
  FabricObject,
  Polygon,
  Path,
} from "fabric";
import type { Element, Face } from "./types";
import { PRODUCT } from "../shared/schema.mjs";
import { DesignFontError, ensureDesignFont } from "./designFonts";
type Meta = {
  id: string;
  name: string;
  pixelWidth?: number;
  pixelHeight?: number;
  isVector?: boolean;
  src?: string;
  shape?: Element["shape"];
};
type Obj = FabricObject & { alacam?: Meta };
export type EditorHandle = {
  add: (el: Element) => Promise<void>;
  update: (values: Partial<Element>) => void;
  remove: () => void;
  layer: (direction: "up" | "down" | "front" | "back") => void;
  select: (id: string) => void;
  deselect: () => void;
  exportCanvas: () => HTMLCanvasElement | null;
};
const serialize = (o: Obj): Element => {
  const m = o.alacam!;
  const type =
    o instanceof Textbox
      ? "text"
      : o instanceof FabricImage
        ? "image"
        : o instanceof Circle
          ? "circle"
          : "rect";
  const result: Element = {
    id: m.id,
    name: m.name,
    kind: type,
    x: o.left,
    y: o.top,
    width: o.width,
    height: o.height,
    scaleX: o.scaleX,
    scaleY: o.scaleY,
    angle: o.angle,
    shape: m.shape,
    opacity: o.opacity,
    locked: !!o.lockMovementX,
    flipX: o.flipX,
    flipY: o.flipY,
    fill:
      typeof o.fill === "string" && /^#[a-f\d]{6}$/i.test(o.fill)
        ? o.fill
        : "#254d3c",
  };
  if (o instanceof Textbox)
    Object.assign(result, {
      text: o.text,
      fontWeight: o.fontWeight === "bold" ? "bold" : "normal",
      fontStyle: o.fontStyle,
      underline: o.underline,
      fontSize: o.fontSize,
      fontFamily: o.fontFamily,
      textAlign: o.textAlign,
    });
  if (type === "image")
    Object.assign(result, {
      src: m.src,
      pixelWidth: m.pixelWidth,
      pixelHeight: m.pixelHeight,
      isVector: m.isVector,
    });
  return result;
};
async function objectFrom(e: Element): Promise<Obj> {
  const opts = {
    left: e.x,
    top: e.y,
    width: e.width,
    height: e.height,
    scaleX: e.scaleX,
    scaleY: e.scaleY,
    angle: e.angle,
    opacity: e.opacity ?? 1,
    lockMovementX: !!e.locked,
    lockMovementY: !!e.locked,
    lockScalingX: !!e.locked,
    lockScalingY: !!e.locked,
    lockRotation: !!e.locked,
    hasControls: !e.locked,
    flipX: e.flipX ?? false,
    flipY: e.flipY ?? false,
    fill: e.fill,
    cornerColor: "#202020",
    cornerStrokeColor: "#ffffff",
    borderColor: "#202020",
    transparentCorners: false,
    cornerSize: 11,
    padding: 3,
  };
  let o: Obj;
  if (e.kind === "text") {
    await ensureDesignFont(e);
    o = new Textbox(e.text || "Yazınız", {
      ...opts,
      fontSize: e.fontSize,
      fontWeight: e.fontWeight || "normal",
      fontStyle: e.fontStyle || "normal",
      underline: e.underline || false,
      fontFamily: e.fontFamily,
      textAlign: e.textAlign,
      splitByGrapheme: false,
      editable: !e.locked,
    });
  } else if (e.kind === "image")
    o = await FabricImage.fromURL(e.src!, {}, opts);
  else if (e.kind === "circle")
    o = new Circle({ ...opts, radius: e.width / 2 });
  else if (e.shape === "triangle")
    o = new Polygon(
      [
        { x: e.width / 2, y: 0 },
        { x: e.width, y: e.height },
        { x: 0, y: e.height },
      ],
      opts,
    );
  else if (e.shape === "star")
    o = new Polygon(
      Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5 - Math.PI / 2,
          r = i % 2 ? 0.22 : 0.5;
        return {
          x: e.width * (0.5 + Math.cos(a) * r),
          y: e.height * (0.5 + Math.sin(a) * r),
        };
      }),
      opts,
    );
  else if (e.shape === "dashed") {
    const parts = Array.from({ length: 7 }, (_, i) => {
      const x = (i * e.width) / 7;
      return `M ${x} 0 h ${e.width / 12} v ${e.height} h ${-e.width / 12} Z`;
    });
    o = new Path(parts.join(" "), opts);
  } else
    o = new Rect({
      ...opts,
      rx: e.shape === "rounded" ? 24 : e.shape === "pill" ? e.height / 2 : 0,
      ry: e.shape === "rounded" ? 24 : e.shape === "pill" ? e.height / 2 : 0,
    });
  o.alacam = {
    id: e.id,
    name: e.name,
    shape: e.shape,
    src: e.src,
    pixelWidth: e.pixelWidth,
    pixelHeight: e.pixelHeight,
    isVector: e.isVector,
  };
  return o;
}
export const Editor = forwardRef<
  EditorHandle,
  {
    face: Face;
    elements: Element[];
    background: string;
    loadKey: number;
    guides: boolean;
    showMaterial?: boolean;
    cutBleedline?: boolean;
    guidesTopmost?: boolean;
    interactive?: boolean;
    onChange: (elements: Element[]) => void;
    onSelect: (e: Element | null) => void;
    onTexture: (face: Face, c: HTMLCanvasElement) => void;
    onError: (s: string) => void;
  }
>((props, ref) => {
  const node = useRef<HTMLCanvasElement>(null),
    canvas = useRef<Canvas | null>(null),
    latest = useRef(props);
  latest.current = props;
  const loading = useRef(false),
    generation = useRef(0),
    [busy, setBusy] = useState(true),
    [snap, setSnap] = useState({ x: false, y: false });
  const fontRevision = useRef(0),
    pendingFont = useRef<{
      object: Textbox;
      values: Record<string, unknown>;
    } | null>(null);
  const invalidateFontUpdates = () => {
    fontRevision.current++;
    pendingFont.current = null;
  };
  const guideUnderlay = useRef<FabricImage | null>(null);
  const printClip = () => {
    const p = PRODUCT.print;
    return new Rect({
      left: p.x,
      top: p.y,
      width: p.width,
      height: p.height,
      absolutePositioned: true,
    });
  };
  const applyDisplay = (c: Canvas) => {
    const current = latest.current;
    c.backgroundColor =
      current.showMaterial === false ? "" : current.background;
    c.clipPath = current.cutBleedline === false ? undefined : printClip();
    if (current.guides && current.guidesTopmost === false) {
      if (!guideUnderlay.current) {
        const sheet = document.createElement("canvas");
        sheet.width = 600;
        sheet.height = 900;
        const context = sheet.getContext("2d")!;
        const p = PRODUCT.print,
          inset = PRODUCT.safeInset;
        context.setLineDash([7, 6]);
        context.lineWidth = 1.5;
        context.strokeStyle = "#777777";
        context.strokeRect(p.x, p.y, p.width, p.height);
        context.strokeStyle = "#a6b09a";
        context.strokeRect(
          p.x + inset,
          p.y + inset,
          p.width - inset * 2,
          p.height - inset * 2,
        );
        guideUnderlay.current = new FabricImage(sheet, {
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
        });
      }
      c.backgroundImage = guideUnderlay.current;
    } else c.backgroundImage = undefined;
    c.requestRenderAll();
  };
  const exportCanvas = () => {
    const c = canvas.current;
    if (!c) return null;
    const out = document.createElement("canvas");
    out.width = 600;
    out.height = 900;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = latest.current.background;
    ctx.fillRect(0, 0, 600, 900);
    const background = c.backgroundColor,
      clip = c.clipPath,
      backgroundImage = c.backgroundImage;
    try {
      // Display toggles are never part of artwork, saved JSON or 3D textures.
      // Always export the real material color and the approved sample crop.
      c.backgroundColor = latest.current.background;
      c.clipPath = printClip();
      c.backgroundImage = undefined;
      ctx.drawImage(c.toCanvasElement(1), 0, 0);
    } finally {
      c.backgroundColor = background;
      c.clipPath = clip;
      c.backgroundImage = backgroundImage;
      c.requestRenderAll();
    }
    return out;
  };
  const texture = () => {
    const c = exportCanvas();
    if (c) latest.current.onTexture(latest.current.face, c);
  };
  const commit = () => {
    if (loading.current) return;
    const c = canvas.current!;
    latest.current.onChange(c.getObjects().map((o) => serialize(o as Obj)));
    const selected = c.getActiveObject();
    latest.current.onSelect(selected ? serialize(selected as Obj) : null);
    texture();
  };
  useEffect(() => {
    const c = new Canvas(node.current!, {
      width: 600,
      height: 900,
      preserveObjectStacking: true,
      enablePointerEvents: true,
      selection: false,
      selectionKey: [],
      backgroundColor: "#ffffff",
      stopContextMenu: true,
    });
    canvas.current = c;
    applyDisplay(c);
    c.on("object:modified", commit);
    c.on("text:changed", commit);
    c.on("selection:created", () => {
      invalidateFontUpdates();
      const o = c.getActiveObject();
      latest.current.onSelect(o ? serialize(o as Obj) : null);
    });
    c.on("selection:updated", () => {
      invalidateFontUpdates();
      const o = c.getActiveObject();
      latest.current.onSelect(o ? serialize(o as Obj) : null);
    });
    c.on("selection:cleared", () => {
      invalidateFontUpdates();
      latest.current.onSelect(null);
    });
    let last = 0;
    const live = () => {
      if (performance.now() - last > 70) {
        const selected = c.getActiveObject();
        if (selected) latest.current.onSelect(serialize(selected as Obj));
        texture();
        last = performance.now();
      }
    };
    c.on("object:moving", ({ target }) => {
      const center = target.getCenterPoint();
      const sx = Math.abs(center.x - 300) < 7,
        sy = Math.abs(center.y - 450) < 7;
      if (sx) target.left += 300 - center.x;
      if (sy) target.top += 450 - center.y;
      setSnap({ x: sx, y: sy });
      live();
    });
    c.on("object:scaling", live);
    c.on("object:rotating", live);
    c.on("mouse:up", () => setSnap({ x: false, y: false }));
    return () => {
      invalidateFontUpdates();
      generation.current++;
      canvas.current = null;
      const underlay = guideUnderlay.current;
      if (underlay && c.backgroundImage !== underlay) underlay.dispose();
      guideUnderlay.current = null;
      void c.dispose();
    };
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const gen = ++generation.current;
    invalidateFontUpdates();
    loading.current = true;
    setBusy(true);
    c.discardActiveObject();
    latest.current.onSelect(null);
    void Promise.all(props.elements.map(objectFrom))
      .then((objects) => {
        if (gen !== generation.current) return;
        c.clear();
        applyDisplay(c);
        objects.forEach((o) => c.add(o));
        c.renderAll();
        loading.current = false;
        setBusy(false);
        texture();
      })
      .catch((error) => {
        if (gen === generation.current) {
          loading.current = false;
          setBusy(false);
          latest.current.onError(
            error instanceof DesignFontError
              ? error.message
              : "Tasarım yüklenemedi. JSON içeriğini kontrol edin.",
          );
        }
      });
  }, [props.face, props.loadKey]);
  useEffect(() => {
    const c = canvas.current;
    if (c) {
      applyDisplay(c);
      texture();
    }
  }, [props.background]);
  useEffect(() => {
    const c = canvas.current;
    if (c) applyDisplay(c);
  }, [
    props.showMaterial,
    props.cutBleedline,
    props.guidesTopmost,
    props.guides,
  ]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.skipTargetFind = props.interactive === false;
    if (props.interactive === false) c.discardActiveObject();
    c.requestRenderAll();
  }, [props.interactive]);
  useImperativeHandle(ref, () => ({
    add: async (e) => {
      if (loading.current)
        throw new Error("Yüz yükleniyor, lütfen tekrar deneyin.");
      const c = canvas.current!;
      if (c.getObjects().length >= 60)
        throw new Error("Her yüze en fazla 60 öğe eklenebilir.");
      const gen = generation.current,
        o = await objectFrom(e);
      if (gen !== generation.current)
        throw new Error("Yüz değişti. Lütfen görseli tekrar ekleyin.");
      c.add(o);
      c.setActiveObject(o);
      c.renderAll();
      commit();
    },
    update: (v) => {
      const c = canvas.current!,
        o = c.getActiveObject();
      if (!o || (o.lockMovementX && v.locked === undefined)) return;
      const val: Record<string, unknown> = {};
      for (const [k, value] of Object.entries(v)) {
        if (k === "locked") {
          for (const prop of [
            "lockMovementX",
            "lockMovementY",
            "lockScalingX",
            "lockScalingY",
            "lockRotation",
          ])
            val[prop] = value;
          val.hasControls = !value;
          if (o instanceof Textbox) val.editable = !value;
        } else if (k === "x") val.left = value;
        else if (k === "y") val.top = value;
        else if (
          [
            "angle",
            "opacity",
            "flipX",
            "flipY",
            "fontWeight",
            "fontStyle",
            "underline",
            "fill",
            "fontSize",
            "fontFamily",
            "textAlign",
            "text",
            "scaleX",
            "scaleY",
          ].includes(k)
        )
          val[k] = value;
      }
      const apply = (values: Record<string, unknown>) => {
        o.set(values);
        o.setCoords();
        c.renderAll();
        commit();
      };
      const fontKeys = ["fontFamily", "fontStyle", "fontWeight"];
      if (o instanceof Textbox && fontKeys.some((key) => key in val)) {
        const previous = pendingFont.current;
        const values = {
          ...(previous?.object === o ? previous.values : {}),
          ...val,
        };
        const revision = ++fontRevision.current,
          gen = generation.current;
        pendingFont.current = { object: o, values };
        void ensureDesignFont({
          fontFamily: (values.fontFamily ??
            o.fontFamily) as Element["fontFamily"],
          fontWeight: (values.fontWeight ??
            o.fontWeight) as Element["fontWeight"],
          fontStyle: (values.fontStyle ?? o.fontStyle) as Element["fontStyle"],
        })
          .then(() => {
            if (
              revision !== fontRevision.current ||
              gen !== generation.current ||
              canvas.current !== c ||
              c.getActiveObject() !== o
            )
              return;
            pendingFont.current = null;
            apply(values);
          })
          .catch((error) => {
            if (
              revision !== fontRevision.current ||
              gen !== generation.current ||
              canvas.current !== c
            )
              return;
            pendingFont.current = null;
            latest.current.onError(
              error instanceof Error ? error.message : "Yazı tipi yüklenemedi.",
            );
          });
      } else {
        // Changes made while a font downloads must not be overwritten when its
        // pending family/weight/style mutation eventually completes.
        if (pendingFont.current?.object === o)
          Object.keys(val).forEach(
            (key) => delete pendingFont.current!.values[key],
          );
        apply(val);
      }
    },
    remove: () => {
      const c = canvas.current!;
      c.getActiveObjects()
        .filter((o) => !o.lockMovementX)
        .forEach((o) => c.remove(o));
      c.discardActiveObject();
      c.renderAll();
      commit();
    },
    layer: (d) => {
      const c = canvas.current!,
        o = c.getActiveObject();
      if (o) {
        if (d === "front") c.bringObjectToFront(o);
        else if (d === "back") c.sendObjectToBack(o);
        else if (d === "up") c.bringObjectForward(o);
        else c.sendObjectBackwards(o);
        c.renderAll();
        commit();
      }
    },
    deselect: () => {
      canvas.current?.discardActiveObject();
      canvas.current?.requestRenderAll();
      latest.current.onSelect(null);
    },
    select: (id) => {
      const c = canvas.current!,
        o = c.getObjects().find((o) => (o as Obj).alacam?.id === id);
      if (o) {
        c.setActiveObject(o);
        c.renderAll();
        latest.current.onSelect(serialize(o as Obj));
      }
    },
    exportCanvas,
  }));
  return (
    <div
      className={`artboard ${props.showMaterial === false ? "material-hidden" : ""}`}
      data-testid="artboard"
      data-cut-bleedline={props.cutBleedline !== false}
      data-guides-position={props.guidesTopmost === false ? "bottom" : "top"}
      style={
        props.showMaterial === false
          ? undefined
          : { background: props.background }
      }
    >
      <canvas ref={node} />
      {props.guides && props.guidesTopmost !== false && (
        <div className="guide-overlay">
          <div className="print-guide" />
          <div className="safe-guide" />
        </div>
      )}
      {snap.x && <div className="snap-x" />}
      {snap.y && <div className="snap-y" />}
      {!props.elements.length && !busy && (
        <div className="canvas-empty">
          <strong>Upload your design</strong>
          <small>Add images, text or shapes</small>
        </div>
      )}
      {busy && <div className="canvas-loading">Loading design…</div>}
    </div>
  );
});
export async function renderFace(
  elements: Element[],
  background: string,
  multiplier: 1 | 2 = 1,
) {
  const node = document.createElement("canvas");
  const c = new StaticCanvas(node, {
    width: 600,
    height: 900,
    backgroundColor: background,
  });
  try {
    const p = PRODUCT.print;
    c.clipPath = new Rect({
      left: p.x,
      top: p.y,
      width: p.width,
      height: p.height,
      absolutePositioned: true,
    });
    for (const e of elements) c.add(await objectFrom(e));
    c.renderAll();
    const out = document.createElement("canvas");
    out.width = 600 * multiplier;
    out.height = 900 * multiplier;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c.toCanvasElement(multiplier), 0, 0);
    return out;
  } finally {
    await c.dispose();
  }
}
