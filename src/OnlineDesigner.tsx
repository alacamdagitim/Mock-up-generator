import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Box,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  HardDrive,
  Download,
  FileJson,
  ImagePlus,
  Camera,
  Layers,
  Loader2,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  Plus,
  Shapes,
  Square,
  ShoppingBag,
  Type,
  Upload,
  X,
} from "lucide-react";
import type { EditorConfig, Element, ResolvedProductMockups } from "./types";
import { resolveProductMockups } from "../shared/mockup-scenes.mjs";
import { DesignCanvas } from "./DesignCanvas";
import { MockupPreview } from "./mockups/MockupPreview";
import type { MockupPreviewHandle } from "./mockups/types";
import type { ArtworkProvider } from "./mockups/compositor";
import { ProductPreview } from "./ProductPreview";
import { OrderPanel } from "./OrderPanel";
import { LayoutPanel } from "./LayoutPanel";
import { useDesigner, newElement } from "./useDesigner";
import { SelectionInspector } from "./SelectionInspector";
import { manufacturerDielineUrl } from "../shared/storefront.mjs";
import { pngBlob } from "./files";
import { PackagingSymbols } from "./PackagingSymbols";
import { InterfaceIcon } from "./InterfaceIcon";
import { ModeSwitch } from "./ModeSwitch";
import { PreviewWindowControls } from "./PreviewWindowControls";
import { PreviewToolbar } from "./PreviewToolbar";
import { RenderDialog } from "./RenderDialog";
import { DielineExportPanel } from "./ExportPanels";
import { faceBackground } from "../shared/surface-colors.mjs";
import { renderFace } from "./Editor";
import {
  artworkMultiplier,
  renderTextureSize,
} from "../shared/render-quality.mjs";
import type { RenderOptions } from "./render/types";
import {
  BASIC_SHAPES,
  SOCIAL_SYMBOLS,
  PATTERNS,
  patternSvg,
  svgUrl,
} from "./designLibrary";

type Tool = "uploads" | "text" | "background" | "shapes" | "layout";
const TOOLS = [
  { id: "layout" as const, title: "Yerleşimler", symbol: null, icon: Boxes },
  {
    id: "uploads" as const,
    title: "Görseller",
    symbol: "uploads" as const,
    icon: Upload,
  },
  { id: "text" as const, title: "Yazı", symbol: "text" as const, icon: Type },
  {
    id: "background" as const,
    title: "Renk",
    symbol: "background" as const,
    icon: Palette,
  },
  {
    id: "shapes" as const,
    title: "Şekiller",
    symbol: "shapes" as const,
    icon: Shapes,
  },
];
const COLORS = [
  "#ffffff",
  "#f4f3ef",
  "#efe3cf",
  "#f5d9b1",
  "#e2e9d5",
  "#c8e4df",
  "#e8ddf3",
  "#f3ced4",
  "#bc8355",
  "#244c39",
  "#453226",
  "#191919",
];
export default function OnlineDesigner({
  config,
  onClose,
}: {
  config: EditorConfig;
  onClose?: () => void;
}) {
  const d = useDesigner(config);
  const resolvedMockups = resolveProductMockups(
    d.product,
  ) as ResolvedProductMockups;
  const mockupScenes = resolvedMockups.scenes;
  const hasMockups =
    mockupScenes.length > 0 ||
    resolvedMockups.cards.length > 0 ||
    d.product.mockupImages !== undefined;
  const tools = TOOLS;
  const root = useRef<HTMLDivElement>(null);
  const [selectionPosition, setSelectionPosition] = useState({
    left: 490,
    top: 84,
  });
  const [interaction, setInteraction] = useState<"rotate" | "pan">("rotate");
  const [modelFaces, setModelFaces] = useState<string[]>([]);
  const [mode, setMode] = useState<"2d" | "mockup" | "3d">(() =>
    hasMockups ? "mockup" : "2d",
  );
  const last2dTool = useRef<Tool>("uploads");
  const [previewSize, setPreviewSize] = useState(280);
  const [maxPreviewSize, setMaxPreviewSize] = useState(280);
  const [tool, setTool] = useState<Tool>(hasMockups ? "layout" : "uploads");
  const [panel, setPanel] = useState(
    () => !hasMockups || !matchMedia("(max-width:700px)").matches,
  );
  const [guides, setGuides] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  const [mobileConfig, setMobileConfig] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [renderPreviewUrl, setRenderPreviewUrl] = useState("");
  const [exports, setExports] = useState({ png: "", json: "" });
  const selectedScene =
    mockupScenes.find((scene) => scene.id === d.settings.mockupSceneId) ||
    mockupScenes[0];
  const photoActive = hasMockups && mode !== "3d";
  const mockupPreview = useRef<MockupPreviewHandle>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const exportTrigger = useRef<HTMLButtonElement>(null);
  const artworkProvider = useCallback<ArtworkProvider>(
    (face, backgroundMode) => {
      const snapshot = d.design;
      const longEdge = matchMedia("(max-width:700px)").matches ? 1024 : 2048;
      return renderFace(
        snapshot.faces[face],
        backgroundMode === "transparent"
          ? "transparent"
          : faceBackground(snapshot, face),
        Math.min(
          4,
          longEdge /
            Math.max(
              snapshot.artboard?.canvasWidth || 600,
              snapshot.artboard?.canvasHeight || 900,
            ),
        ),
        snapshot.artboard,
      );
    },
    [d.design],
  );
  const exportArtworkProvider = useCallback<ArtworkProvider>(
    (face, backgroundMode) => {
      const snapshot = d.design;
      return renderFace(
        snapshot.faces[face],
        backgroundMode === "transparent"
          ? "transparent"
          : faceBackground(snapshot, face),
        Math.min(
          4,
          (matchMedia("(max-width:700px)").matches ? 2048 : 4096) /
            Math.max(
              snapshot.artboard?.canvasWidth || 600,
              snapshot.artboard?.canvasHeight || 900,
            ),
        ),
        snapshot.artboard,
      );
    },
    [d.design],
  );
  useEffect(() => {
    if (selectedScene && !d.settings.mockupSceneId) {
      d.change(
        {
          ...d.state.current,
          presentation: { ...d.settings, mockupSceneId: selectedScene.id },
        },
        false,
      );
    }
  }, [selectedScene?.id, d.settings.mockupSceneId]);
  // All save, cart and download paths use the same selected presentation.
  d.captureOverride.current = hasMockups
    ? async () => {
        const snapshot = d.state.current;
        if (!selectedScene)
          throw new Error(
            "Mockup baskı eşlemesi bekleniyor. JSON taslağınızı indirebilirsiniz.",
          );
        if (
          d.settings.mockupSceneId &&
          d.settings.mockupSceneId !== selectedScene?.id
        )
          throw new Error(
            "Kaydedilen mockup sahnesi artık bulunamıyor. Yerleşimler bölümünden bir sahne seçin.",
          );
        if (!mockupPreview.current)
          throw new Error("Mockup sahnesi henüz hazır değil.");
        const png = await mockupPreview.current.png();
        if (snapshot !== d.state.current)
          throw new Error(
            "Tasarım değişti. Son halini yeniden indirin veya kaydedin.",
          );
        return png;
      }
    : null;
  const openImageExport = async () => {
    if (captureBusy || d.busy) return;
    setCaptureBusy(true);
    setExportOpen(false);
    try {
      const png = await d.capturePreview(8);
      if (!hasMockups) changeMode("3d");
      setRenderPreviewUrl(png);
      setRenderOpen(true);
    } catch (error) {
      d.notify((error as Error).message, true);
    } finally {
      setCaptureBusy(false);
    }
  };

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const resize = () => {
      const maximum = Math.max(
        280,
        Math.min(node.clientWidth - 40, node.clientHeight - 322),
      );
      setMaxPreviewSize(maximum);
      setPreviewSize((size) => Math.min(size, maximum));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, []);
  const manufacturerFile = manufacturerDielineUrl(d.product.dielineUrl);
  const manufacturerModel = manufacturerDielineUrl(d.product.modelUrl);
  useEffect(() => {
    if (
      !photoActive &&
      manufacturerModel &&
      modelFaces.length === 1 &&
      modelFaces[0] === "front" &&
      d.face !== "front"
    )
      d.changeFace("front");
  }, [manufacturerModel, modelFaces, d.face, photoActive]);
  useEffect(
    () => () =>
      Object.values(exports).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      }),
    [exports],
  );
  useEffect(() => {
    const stage = root.current,
      paper = stage?.querySelector<HTMLElement>(".design-paper");
    if (!stage || !paper || !d.selected || mode !== "2d") return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selected = d.selected!,
          p = paper.getBoundingClientRect(),
          host = stage.getBoundingClientRect();
        const transform = new DOMMatrixReadOnly(
          getComputedStyle(paper).transform,
        );
        const angle = (selected.angle * Math.PI) / 180,
          w = selected.width * selected.scaleX,
          h = selected.height * selected.scaleY;
        const points = [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ].map(([x, y]) => {
          const dx =
              selected.x +
              x * Math.cos(angle) -
              y * Math.sin(angle) -
              (d.design.artboard?.canvasWidth || 600) / 2,
            dy =
              selected.y +
              x * Math.sin(angle) +
              y * Math.cos(angle) -
              (d.design.artboard?.canvasHeight || 900) / 2;
          return {
            x: p.x + p.width / 2 + transform.a * dx + transform.c * dy,
            y: p.y + p.height / 2 + transform.b * dx + transform.d * dy,
          };
        });
        const left = Math.max(
          180,
          Math.min(
            host.width - 180,
            points.reduce((n, p) => n + p.x, 0) / 4 - host.x,
          ),
        );
        const top = Math.max(
          78,
          Math.min(
            host.height - 100,
            Math.min(...points.map((p) => p.y)) - host.y - 50,
          ),
        );
        setSelectionPosition((old) =>
          Math.abs(old.left - left) < 0.1 && Math.abs(old.top - top) < 0.1
            ? old
            : { left, top },
        );
      });
    };
    const mutation = new MutationObserver(update);
    mutation.observe(paper, { attributes: true, attributeFilter: ["style"] });
    const resize = new ResizeObserver(update);
    resize.observe(stage);
    update();
    return () => {
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
    };
  }, [d.selected, d.design.artboard, mode, panel]);
  const emit = (name: string, detail?: unknown) =>
    root.current?.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  const openTool = (value: Tool) => {
    if (value !== "layout") last2dTool.current = value;
    setTool(value);
    setPanel(true);
    setMobileConfig(false);
    if (value === "layout") {
      d.editor.current?.deselect();
      setMode(hasMockups ? "mockup" : "3d");
    } else if (hasMockups) {
      setMode("2d");
    }
  };
  const afterAdd = () => {
    changeMode("2d");
    if (matchMedia("(max-width:700px)").matches) setPanel(false);
  };
  const add = async (element: Element) => {
    try {
      await d.add(element);
      afterAdd();
    } catch (error) {
      d.notify((error as Error).message, true);
    }
  };
  const addSvg = async (name: string, svg: string, cover = false) => {
    if (
      await d.addImage(
        new File([svg], `${name}.svg`, { type: "image/svg+xml" }),
        cover ? "cover" : "center",
      )
    )
      afterAdd();
  };
  const addImage = async (file?: File) => {
    if (await d.addImage(file)) afterAdd();
  };
  const changeMode = (value: "2d" | "mockup" | "3d") => {
    if (value === mode) return;
    setMode(value);
    if (value !== "2d") {
      d.editor.current?.deselect();
      if (hasMockups && value === "mockup") {
        setTool("layout");
        setPanel(!matchMedia("(max-width:700px)").matches);
      } else setPanel(false);
    } else {
      if (tool === "layout") setTool(last2dTool.current);
      setInteraction("rotate");
      d.preview.current?.interaction("rotate");
      if (!matchMedia("(max-width:700px)").matches) setPanel(true);
    }
  };
  const save = async () => {
    const result = await d.save();
    if (result) emit("alacam:design-saved", result);
  };
  const close = () => {
    if (d.busy) return;
    emit("alacam:close", { productId: d.product.id });
    if (onClose) onClose();
    else setClosed(true);
  };
  const prepareExports = async () => {
    if (exportOpen) {
      setExportOpen(false);
      return;
    }
    let png = "";
    try {
      png = URL.createObjectURL(pngBlob(await d.capturePreview(2)));
    } catch {
      d.notify(
        "Görsel henüz hazırlanamadı. JSON indirme kullanılabilir.",
        true,
      );
    }
    const json = URL.createObjectURL(
      new Blob([JSON.stringify(d.state.current, null, 2)], {
        type: "application/json",
      }),
    );
    setExports({ png, json });
    setExportOpen(true);
  };
  const renderSource = async (options: RenderOptions) => {
    const design = d.state.current;
    const multiplier = artworkMultiplier(
      design.artboard?.canvasWidth || 600,
      design.artboard?.canvasHeight || 900,
      renderTextureSize(
        options.resolution,
        matchMedia("(max-width:700px)").matches,
      ),
    );
    const [front, back] = await Promise.all([
      renderFace(
        design.faces.front,
        faceBackground(design, "front"),
        multiplier,
        design.artboard,
      ),
      renderFace(
        design.faces.back,
        faceBackground(design, "back"),
        multiplier,
        design.artboard,
      ),
    ]);
    try {
      if (!d.preview.current)
        throw new Error("Görsel oluşturmak için 3B sahne hazır değil.");
      return d.preview.current.snapshot({ front, back });
    } finally {
      front.width = back.width = 1;
      front.height = back.height = 1;
    }
  };
  if (closed)
    return (
      <div className="online-closed">
        <Box size={42} />
        <h1>{d.product.title}</h1>
        <p>Tasarımınızın yerel taslağı bu tarayıcıda korunur.</p>
        <button className="black-button" onClick={() => setClosed(false)}>
          Online tasarla
        </button>
      </div>
    );
  return (
    <div
      className={`online-app ${hasMockups ? "mockup-product" : ""} mode-${mode} ${mode === "mockup" ? "mode-3d" : ""} ${photoActive ? "has-mockup-preview" : ""} ${hasMockups && !manufacturerModel ? "mockup-no-model" : ""} tool-${tool} ${panel ? "with-panel" : "without-panel"} ${mobileConfig ? "show-mobile-config" : ""}`}
      style={{ "--preview-size": `${previewSize}px` } as CSSProperties}
      ref={root}
      data-editor-scope={d.keyboardScope}
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        if (
          !(event.target instanceof HTMLElement) ||
          !event.target.closest(
            "button,input,select,textarea,a,[contenteditable]",
          )
        )
          root.current?.focus({ preventScroll: true });
      }}
    >
      <header className="online-header">
        <div className="online-brand" aria-label="Alaçam Dağıtım">
          <span>
            <Box size={21} />
          </span>
        </div>
        <div className="online-document">
          <HardDrive size={22} aria-label="Yerel taslak" />
          <input
            aria-label="Tasarım adı"
            maxLength={100}
            value={d.design.name}
            onChange={(e) =>
              d.change({
                ...d.state.current,
                name: e.target.value || "Tasarımım",
                updatedAt: new Date().toISOString(),
              })
            }
          />
          <span title={d.localStatus} className="document-status">
            Taslak
          </span>
        </div>
        <ModeSwitch mode={mode} onChange={changeMode} hasMockups={hasMockups} />
        <div className="online-header-actions">
          <button
            className="header-render"
            ref={exportTrigger}
            aria-busy={captureBusy}
            aria-label="Görsel indir"
            disabled={d.busy || captureBusy || (hasMockups && !selectedScene)}
            title={hasMockups ? "Seçili hazır mockupı indir" : undefined}
            onClick={() => void openImageExport()}
          >
            {captureBusy ? (
              <Loader2 className="spin" size={19} />
            ) : (
              <Camera size={19} />
            )}
            <span>Görsel indir</span>
          </button>
          <button
            className="icon-button mobile-config-toggle"
            aria-label="Sipariş seçeneklerini aç veya kapat"
            aria-expanded={mobileConfig}
            onClick={() => {
              setMobileConfig(!mobileConfig);
            }}
          >
            <ShoppingBag size={19} />
            <span>Sipariş</span>
          </button>
          {manufacturerFile && (
            <a
              className="outline-button template-link"
              href={manufacturerFile}
              target="_blank"
              rel="noopener noreferrer"
              title="Bıçak izini aç"
            >
              <InterfaceIcon name="dieline" size={23} />
              <span>Bıçak izi</span>
            </a>
          )}
          <button
            className="outline-button header-upload"
            disabled={d.busy}
            onClick={() => {
              openTool("uploads");
              d.upload.current?.click();
            }}
          >
            <InterfaceIcon name="dieline" size={23} />
            <span>Görsel yükle</span>
          </button>
          <div className="online-export">
            <button
              className="icon-button"
              aria-label="İndirme ve JSON araçları"
              onClick={() => void prepareExports()}
            >
              <InterfaceIcon name="image" size={21} />
            </button>
            {exportOpen && (
              <div className="online-export-menu">
                {exports.png && (
                  <a
                    href={exports.png}
                    download={
                      hasMockups
                        ? "alacam-mockup-onizleme.png"
                        : "alacam-3b-onizleme.png"
                    }
                    onClick={() => setExportOpen(false)}
                  >
                    <ImagePlus size={17} />{" "}
                    {hasMockups ? "Mockup PNG" : "Önizleme PNG"}
                  </a>
                )}
                <a
                  href={exports.json}
                  aria-label="Düzenlenebilir JSON"
                  download="alacam-tasarim-v1.json"
                  onClick={() => setExportOpen(false)}
                >
                  <FileJson size={17} /> Düzenlenebilir JSON
                </a>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    d.importer.current?.click();
                  }}
                >
                  <Upload size={17} /> JSON içe aktar
                </button>
                <small>
                  İndirilen görsel önizlemedir; üretim dosyası değildir.
                </small>
              </div>
            )}
          </div>
          <button
            className="icon-button online-close"
            aria-label="Editörü kapat"
            disabled={d.busy}
            onClick={close}
          >
            <X size={25} />
          </button>
        </div>
      </header>
      <main className="online-stage">
        <nav className="online-rail" aria-label="Online tasarım araçları">
          {tools.map((item) => (
            <button
              key={item.id}
              aria-label={item.title}
              aria-pressed={panel && tool === item.id}
              className={panel && tool === item.id ? "active" : ""}
              onClick={() => openTool(item.id)}
            >
              {item.symbol ? (
                <InterfaceIcon
                  name={item.symbol}
                  size={23}
                  active={panel && tool === item.id}
                />
              ) : (
                <item.icon size={23} />
              )}
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
        <aside
          className="online-panel"
          aria-label="Düzenleme paneli"
          hidden={!panel}
        >
          <div className="online-panel-heading">
            <h2>{tools.find((item) => item.id === tool)?.title}</h2>
            <button
              className="icon-button"
              aria-label="Düzenleme panelini kapat"
              onClick={() => setPanel(false)}
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
          {tool === "layout" && (
            <>
              <LayoutPanel
                mockupCards={resolvedMockups.cards}
                mockupSceneId={selectedScene?.id}
                onMockupSelect={(id) => {
                  d.setPresentation({ mockupSceneId: id });
                  setMode("mockup");
                  if (matchMedia("(max-width:700px)").matches) setPanel(false);
                }}
              />
              {selectedScene?.backgroundControl && (
                <label className="mockup-background-control">
                  {selectedScene.backgroundControl.label}
                  <input
                    type="color"
                    aria-label="Mockup arka plan rengi"
                    value={
                      d.settings.mockupBackgrounds?.[selectedScene.id] ||
                      selectedScene.backgroundControl.color
                    }
                    onChange={(e) =>
                      d.setPresentation({
                        mockupBackgrounds: {
                          ...d.settings.mockupBackgrounds,
                          [selectedScene.id]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              )}
            </>
          )}
          {tool === "uploads" && (
            <div className="upload-pane">
              <button
                className="black-button"
                disabled={d.busy}
                onClick={() => d.upload.current?.click()}
              >
                {d.busy ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Upload size={17} />
                )}{" "}
                Görsel ekle
              </button>
              <small className="upload-formats">
                PNG, JPG ve SVG yükleyebilirsiniz
              </small>
              <div
                className={`online-dropzone ${d.assets.length ? "has-assets" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void addImage(e.dataTransfer.files[0]);
                }}
              >
                <ImagePlus size={31} />
                <strong>Görsellerinizi buraya sürükleyin</strong>
                <small>
                  Logonuzu veya tasarımınızı yükleyin
                  <br />
                  PNG/JPG en fazla 8 MB · SVG en fazla 1 MB
                </small>
              </div>
              {d.assets.length > 0 ? (
                <div className="online-upload-grid">
                  {d.assets.map((asset) => (
                    <button
                      key={asset.src}
                      aria-label={`${asset.name} tasarıma ekle`}
                      onClick={() =>
                        void add({
                          ...asset,
                          id: crypto.randomUUID(),
                          x: 300 - (asset.width * asset.scaleX) / 2,
                          y: 450 - (asset.height * asset.scaleY) / 2,
                        })
                      }
                    >
                      <img src={asset.src} alt={asset.name} />
                      <span>{asset.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="panel-note">
                  Yüklediğiniz görseller burada görünür.
                </p>
              )}
              <small className="upload-count">
                {d.assets.length} görsel · Bu oturum
              </small>
            </div>
          )}
          {tool === "text" && (
            <div className="text-pane">
              <button
                aria-label="Yazı ekle"
                className="add-text-button"
                onClick={() =>
                  void add({
                    ...newElement("text", "Yeni yazı"),
                    text: "Yazınızı buraya yazın",
                    fontSize: 40,
                    fontFamily: "DM Sans",
                    textAlign: "center",
                  })
                }
              >
                Yazı ekle
              </button>
            </div>
          )}
          {tool === "background" && (
            <div className="background-pane">
              <h3>Yüzey rengi</h3>
              <div className="online-swatches">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    aria-label={`Ambalaj rengi ${color}`}
                    aria-pressed={faceBackground(d.design, d.face) === color}
                    style={{ background: color }}
                    onClick={() => d.background(color)}
                  >
                    {faceBackground(d.design, d.face) === color && (
                      <Check
                        size={14}
                        style={{
                          color: ["#244c39", "#453226", "#191919"].includes(
                            color,
                          )
                            ? "white"
                            : "black",
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <label className="color-field">
                Özel renk
                <input
                  type="color"
                  aria-label="Özel ambalaj rengi"
                  value={faceBackground(d.design, d.face)}
                  onChange={(e) => d.background(e.target.value)}
                />
                <code>{faceBackground(d.design, d.face).toUpperCase()}</code>
              </label>
              <p className="panel-note">
                Renk seçili baskı yüzeyine uygulanır. Ekran renkleri yaklaşık
                gösterilir.
              </p>
              <h3>Desenler</h3>
              <div className="pattern-grid">
                {PATTERNS.map((pattern) => (
                  <button
                    key={pattern.name}
                    aria-label={`${pattern.name} desenini ekle`}
                    onClick={() =>
                      void addSvg(pattern.name, patternSvg(pattern), true)
                    }
                  >
                    <img
                      alt={pattern.name}
                      src={svgUrl(patternSvg(pattern, 144, 144))}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          {tool === "shapes" && (
            <div className="shapes-pane">
              <div className="online-shape-grid">
                {BASIC_SHAPES.map((shape) => (
                  <button
                    key={shape.id}
                    aria-label={shape.name}
                    onClick={() =>
                      void add({
                        ...newElement(
                          shape.id === "circle" ? "circle" : "rect",
                          shape.name,
                        ),
                        shape: shape.id === "circle" ? undefined : shape.id,
                        width: shape.width,
                        height: shape.height,
                        fill:
                          shape.id === "line" || shape.id === "dashed"
                            ? "#191919"
                            : "#cccccc",
                      })
                    }
                  >
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <path
                        d={shape.path}
                        fill={
                          shape.id === "line" || shape.id === "dashed"
                            ? "none"
                            : "#ccc"
                        }
                        stroke="#191919"
                        strokeWidth={
                          shape.id === "line" || shape.id === "dashed"
                            ? 2.5
                            : 1.2
                        }
                        strokeDasharray={
                          shape.id === "dashed" ? "7 4" : undefined
                        }
                      />
                    </svg>
                  </button>
                ))}
              </div>
              <h3 className="symbols-heading">Ambalaj sembolleri</h3>
              <PackagingSymbols onAdd={(name, svg) => void addSvg(name, svg)} />
              <h3 className="symbols-heading">Sosyal medya</h3>
              <div className="online-shape-grid symbol-grid">
                {SOCIAL_SYMBOLS.map((symbol) => (
                  <button
                    key={symbol.name}
                    aria-label={symbol.name}
                    onClick={() =>
                      void addSvg(
                        symbol.name,
                        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 24 24"><path d="${symbol.path}" fill="none" stroke="#000000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
                      )
                    }
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d={symbol.path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="online-layers" hidden={tool === "layout"}>
            <button
              className="layers-toggle"
              aria-expanded={layersOpen}
              onClick={() => setLayersOpen(!layersOpen)}
            >
              <Layers size={16} /> Katmanlar{" "}
              <span>{d.design.faces[d.face].length}</span>
              {layersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {layersOpen && (
              <div className="online-layer-list">
                {[...d.design.faces[d.face]].reverse().map((element) => (
                  <button
                    key={element.id}
                    className={d.selected?.id === element.id ? "selected" : ""}
                    onClick={() => {
                      setMode("2d");
                      d.editor.current?.select(element.id);
                    }}
                  >
                    {element.kind === "text" ? (
                      <Type size={14} />
                    ) : (
                      <Square size={14} />
                    )}
                    <span>{element.name}</span>
                  </button>
                ))}
                {!d.design.faces[d.face].length && (
                  <p>Bu yüzde henüz öğe yok.</p>
                )}
              </div>
            )}
          </div>
        </aside>
        <DesignCanvas
          open={mode === "2d"}
          faceLabels={
            selectedScene
              ? Object.fromEntries(
                  selectedScene.surfaces
                    .filter((s) => s.title)
                    .map((s) => [s.face, s.title!]),
                )
              : undefined
          }
          templateUrl={d.templateUrl}
          templateNotice={
            manufacturerFile && !d.templateUrl ? d.templateStatus : undefined
          }
          singleFace={
            !hasMockups && modelFaces.length === 1 && modelFaces[0] === "front"
          }
          editor={d.editor}
          design={d.design}
          face={d.face}
          loadKey={d.loadKey}
          guides={guides}
          selected={d.selected}
          historyCount={d.historyCount}
          onFace={d.changeFace}
          onGuides={() => setGuides(!guides)}
          onUndo={d.undo}
          onChange={d.edit}
          onSelect={d.setSelected}
          onTexture={d.onTexture}
          onError={(message) => d.notify(message, true)}
          onBackground={d.background}
        />
        {d.selected && mode === "2d" && tool !== "layout" && (
          <div
            className={`online-selection-floating ${selectionPosition.top > window.innerHeight / 2 ? "popover-above" : ""}`}
            style={{
              left: selectionPosition.left,
              top: selectionPosition.top - 64,
            }}
            key={d.selected.id}
          >
            <SelectionInspector
              selected={d.selected}
              update={(values) => d.editor.current?.update(values)}
              remove={() => d.editor.current?.remove()}
              layer={(direction) => d.editor.current?.layer(direction)}
              duplicate={() =>
                void add({
                  ...d.selected!,
                  locked: false,
                  id: crypto.randomUUID(),
                  x: Math.min(3000, d.selected!.x + 20),
                  y: Math.min(4500, d.selected!.y + 20),
                })
              }
            />
          </div>
        )}
        <section
          className="online-preview"
          aria-label={
            photoActive ? "Canlı mockup önizleme" : "Canlı 3B önizleme"
          }
        >
          {selectedScene && (
            <div
              className="mockup-capture-stage"
              hidden={!photoActive}
              aria-hidden={!photoActive}
            >
              <MockupPreview
                ref={mockupPreview}
                scene={selectedScene}
                backgroundColor={
                  d.settings.mockupBackgrounds?.[selectedScene.id]
                }
                textures={d.textures}
                artworkProvider={artworkProvider}
                exportArtworkProvider={exportArtworkProvider}
              />
            </div>
          )}
          {photoActive && !selectedScene ? (
            <div className="mockup-empty-state" role="status">
              <ImagePlus size={36} />
              <h2>
                {resolvedMockups.cards.length
                  ? "Mockup baskı eşlemesi bekleniyor"
                  : "Bu ürüne henüz mockup eklenmedi"}
              </h2>
              <p>
                {resolvedMockups.cards.length
                  ? "Ürünün görselleri Yerleşimler bölümünde listeleniyor. Tasarımı fotoğrafa uygulamak için hazırlanan sahne bağlantısı gerekli."
                  : "Ürüne hazır mockup sahneleri eklendiğinde burada tasarımınızı görebilirsiniz."}
              </p>
            </div>
          ) : photoActive ? null : hasMockups && !manufacturerModel ? (
            <div className="mockup-missing-model" role="status">
              <Box size={36} />
              <strong>3B model bağlı değil</strong>
              <p>
                Bu ürünün hazır mockup sahnesini kullanabilirsiniz. 3B görünüm
                için ürünün GLB dosyasını ekleyin.
              </p>
              <button
                className="black-button"
                onClick={() => changeMode("mockup")}
              >
                Mockupı göster
              </button>
            </div>
          ) : (
            <ProductPreview
              modelUrl={manufacturerModel}
              onFaces={setModelFaces}
              binding={d.design.modelBinding}
              onBindingChange={(modelBinding) => {
                const next = {
                  ...d.state.current,
                  updatedAt: new Date().toISOString(),
                };
                if (modelBinding) next.modelBinding = modelBinding;
                else delete next.modelBinding;
                d.change(next);
              }}
              ref={d.preview}
              textures={d.textures}
              settings={
                mode === "2d" || hasMockups
                  ? { ...d.settings, layout: "single", spacing: 1 }
                  : d.settings
              }
            />
          )}
          {mode === "2d" ? (
            <PreviewWindowControls
              size={previewSize}
              maxSize={maxPreviewSize}
              onResize={setPreviewSize}
            />
          ) : !photoActive && !!manufacturerModel ? (
            <PreviewToolbar
              preview={d.preview}
              allowInflate={false}
              inflate={d.settings.inflate ?? 100}
              onInflate={(inflate) => d.setPresentation({ inflate })}
              interaction={interaction}
              onInteraction={(value) => {
                setInteraction(value);
                d.preview.current?.interaction(value);
              }}
            />
          ) : null}
        </section>
        <aside className="online-config" aria-label="Sipariş seçenekleri">
          <p className="order-panel-heading">Sipariş</p>
          <h2 className="config-product-title">{d.product.title}</h2>
          <OrderPanel
            product={d.product}
            variant={d.variant}
            quantity={d.quantity}
            busy={d.busy}
            orderStatus={d.orderStatus}
            onVariantChange={d.setVariant}
            onQuantityChange={d.setQuantity}
            onOrder={() => void d.cart()}
          />
        </aside>
        <div className="online-save">
          {hasMockups && (
            <button
              className="black-button mockup-primary-action"
              disabled={d.busy}
              onClick={() => changeMode(mode === "2d" ? "mockup" : "2d")}
            >
              {mode === "2d" ? "Mockupı gör" : "Tasarımı düzenle"}
            </button>
          )}
          <button
            aria-label="Kaydet"
            className={
              hasMockups ? "outline-button mockup-draft-save" : "black-button"
            }
            disabled={d.busy || (hasMockups && !selectedScene)}
            onClick={() => void save()}
          >
            {d.busy && <Loader2 className="spin" size={17} />}
            {"Kaydet"}
          </button>
          <span>
            Taslak bu cihazda korunur · Siparişe tasarım dosyası eklenmez
          </span>
        </div>
        {mode === "3d" && (
          <div className="online-3d-help">
            Döndürmek için sürükleyin · Yakınlaştırmak için kaydırın
          </div>
        )}
      </main>
      <RenderDialog
        open={renderOpen}
        onClose={() => {
          setRenderOpen(false);
          setRenderPreviewUrl("");
          requestAnimationFrame(() =>
            exportTrigger.current?.focus({ preventScroll: true }),
          );
        }}
        source={renderSource}
        allowStudio={!hasMockups}
        imageLabel={hasMockups ? "Hazır mockup" : "Canlı görünüm"}
        previewUrl={renderPreviewUrl}
        panels={{
          dieline: (
            <DielineExportPanel
              design={d.design}
              face={d.face}
              templateUrl={d.templateUrl}
              originalUrl={manufacturerFile || undefined}
            />
          ),
        }}
      />
      {d.toast && (
        <div
          className={`online-toast ${d.toast.error ? "error" : ""}`}
          role={d.toast.error ? "alert" : "status"}
        >
          <span>{d.toast.text}</span>
          <button aria-label="Bildirimi kapat" onClick={() => d.setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      <input
        ref={d.upload}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.svg"
        onChange={(e) => void addImage(e.target.files?.[0])}
      />
      <input
        ref={d.importer}
        type="file"
        hidden
        accept=".json,application/json"
        onChange={(e) => void d.importFile(e.target.files?.[0])}
      />
    </div>
  );
}
