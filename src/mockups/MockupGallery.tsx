import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Download,
  Expand,
  Grid3X3,
  Images,
  LayoutGrid,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { MockupPreview } from "./MockupPreview";
import { useMockupGallery } from "./useMockupGallery";
import { pngBlob } from "../files";
import type { ArtworkProvider } from "./compositor";
import type { MockupPreviewHandle, MockupScene, MockupTextures } from "./types";

export type MockupGalleryHandle = MockupPreviewHandle & {
  openScene: (id?: string) => void;
  closeScene: () => void;
};

export type MockupGalleryProps = {
  scenes: MockupScene[];
  active: boolean;
  selectedSceneId?: string;
  revision: string;
  textures: MockupTextures;
  artworkProvider?: ArtworkProvider;
  exportArtworkProvider?: ArtworkProvider;
  backgroundColors?: Record<string, string>;
  mobile?: boolean;
  onSelect: (id: string) => void;
  onBackgroundChange?: (id: string, color: string) => void;
  onError?: (message: string) => void;
};

const sceneThumbnail = (scene: MockupScene) =>
  scene.plainThumbnailUrl || scene.baseImageUrl;

function imageFilename(title: string) {
  return `alacam-${
    title
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mockup"
  }.png`;
}

export const MockupGallery = forwardRef<
  MockupGalleryHandle,
  MockupGalleryProps
>(function MockupGallery(
  {
    scenes,
    active,
    selectedSceneId,
    revision,
    textures,
    artworkProvider,
    exportArtworkProvider,
    backgroundColors,
    mobile = false,
    onSelect,
    onBackgroundChange,
    onError,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [viewerSceneId, setViewerSceneId] = useState(selectedSceneId);
  const [previewState, setPreviewState] = useState<{
    key: string;
    status: "loading" | "ready" | "error";
    error?: string;
  }>({ key: "", status: "loading" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [density, setDensity] = useState<"compact" | "large">("compact");
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const { previews, completed, total, running, retry } = useMockupGallery({
    scenes,
    active: active && !open && !exporting,
    revision,
    textures,
    artworkProvider,
    backgroundColors,
    mobile,
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<MockupPreviewHandle>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const filmstrip = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<HTMLElement | null>(null);
  const exportLock = useRef(false);
  const downloadUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  const viewerVisible = open && active;
  const viewerVisibleRef = useRef(viewerVisible);
  viewerVisibleRef.current = viewerVisible;
  const titleId = useId();
  const helpId = useId();
  const scene =
    scenes.find((item) => item.id === viewerSceneId) ||
    scenes.find((item) => item.id === selectedSceneId) ||
    scenes[0];
  const index = scene ? scenes.findIndex((item) => item.id === scene.id) : -1;
  const backgroundColor = scene
    ? backgroundColors?.[scene.id] || scene.backgroundControl?.color
    : undefined;
  const renderKey = JSON.stringify([scene?.id, revision, backgroundColor]);
  const currentRenderKey = useRef(renderKey);
  currentRenderKey.current = renderKey;
  const ready =
    previewState.key === renderKey && previewState.status === "ready";
  const errors = scenes.filter(
    (item) => previews[item.id]?.status === "error",
  ).length;

  // A revision can change while the canvas objects retain their identity.
  // A revision-bound provider makes the one full-size preview recompose too.
  const currentArtwork = useMemo<ArtworkProvider>(
    () => (face, mode) =>
      artworkProvider ? artworkProvider(face, mode) : textures[face],
    [artworkProvider, textures, revision],
  );
  const currentExportArtwork = useMemo<ArtworkProvider>(
    () => (face, mode) =>
      exportArtworkProvider
        ? exportArtworkProvider(face, mode)
        : currentArtwork(face, mode),
    [exportArtworkProvider, currentArtwork, revision],
  );

  const closeScene = useCallback(() => setOpen(false), []);
  const openScene = useCallback(
    (id?: string) => {
      if (!active || exportLock.current || !scenes.length) return;
      const next =
        scenes.find((item) => item.id === id) ||
        scenes.find((item) => item.id === selectedSceneId) ||
        scenes[0];
      const root = dialog.current?.getRootNode();
      returnFocus.current =
        cards.current.get(next.id) ||
        ((root instanceof ShadowRoot
          ? root.activeElement
          : document.activeElement) as HTMLElement | null);
      setViewerSceneId(next.id);
      setExportError("");
      setPreviewState({ key: "", status: "loading" });
      onSelect(next.id);
      setOpen(true);
    },
    [active, scenes, selectedSceneId, onSelect],
  );
  const selectScene = useCallback(
    (id: string) => {
      if (exportLock.current || !scenes.some((item) => item.id === id)) return;
      setViewerSceneId(id);
      setExportError("");
      onSelect(id);
    },
    [scenes, onSelect],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const [url, timer] of downloadUrls.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      downloadUrls.current.clear();
    };
  }, []);
  useEffect(() => {
    if (selectedSceneId && scenes.some((item) => item.id === selectedSceneId))
      setViewerSceneId(selectedSceneId);
  }, [selectedSceneId, scenes]);
  useEffect(() => {
    if (!active || !scene) setOpen(false);
  }, [active, scene]);
  useEffect(() => {
    setExportError("");
  }, [renderKey]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && active && scene) {
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.close();
      const target = returnFocus.current;
      if (target?.isConnected)
        requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  }, [open, active, scene]);
  useEffect(() => {
    if (open && scene)
      filmstrip.current.get(scene.id)?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
  }, [open, scene?.id]);

  const exportImage = useCallback(
    async (format: "png" | "jpg") => {
      if (exportLock.current)
        throw new Error("Görsel zaten hazırlanıyor. Lütfen bekleyin.");
      if (!scene || !preview.current)
        throw new Error("İndirilecek mockup sahnesi bulunamadı.");
      const expectedKey = currentRenderKey.current;
      exportLock.current = true;
      setExporting(true);
      try {
        const result = await preview.current[format]();
        if (!mounted.current || expectedKey !== currentRenderKey.current)
          throw new Error("Tasarım değişti. Güncel görseli yeniden indirin.");
        return result;
      } finally {
        exportLock.current = false;
        if (mounted.current) {
          // Closed exports load on demand. Release that native asset store
          // before the gallery resumes its next scene.
          if (!viewerVisibleRef.current) setPreviewEpoch((value) => value + 1);
          setExporting(false);
        }
      }
    },
    [scene],
  );
  useImperativeHandle(
    ref,
    () => ({
      openScene,
      closeScene,
      png: () => exportImage("png"),
      jpg: () => exportImage("jpg"),
      dimensions: () =>
        scene ? { width: scene.width, height: scene.height } : null,
    }),
    [openScene, closeScene, exportImage, scene],
  );

  async function downloadScene() {
    if (!scene || !ready || exportLock.current) return;
    const filename = imageFilename(scene.title);
    setExportError("");
    try {
      const data = await exportImage("png");
      const host = dialog.current;
      if (!host?.open)
        throw new Error("Sahne kapatıldı. İndirmek için sahneyi yeniden açın.");
      const url = URL.createObjectURL(pngBlob(data));
      downloadUrls.current.set(
        url,
        setTimeout(() => {
          URL.revokeObjectURL(url);
          downloadUrls.current.delete(url);
        }, 60_000),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      // A native modal makes the document body inert. The actual download
      // activation must belong to the open dialog, including in a ShadowRoot.
      host.append(link);
      link.click();
      link.remove();
    } catch (reason) {
      if (!mounted.current) return;
      const message =
        reason instanceof Error ? reason.message : "Görsel indirilemedi.";
      setExportError(message);
      onError?.(message);
    }
  }

  return (
    <section
      className="mg-gallery"
      data-density={density}
      aria-label="Tüm mockup sahneleri"
      hidden={!active}
    >
      <div className="mg-gallery-scroll">
        <header className="mg-gallery-header">
          <div>
            <div className="mg-eyebrow">
              <Images size={15} aria-hidden="true" /> ÜRÜN SAHNELERİ
            </div>
            <h2>Mockup sahneleri</h2>
            <p>
              Tüm sahneleri birlikte görün. İncelemek ve indirmek için bir
              görsele dokunun.
            </p>
          </div>
          <div className="mg-gallery-controls">
            <div className="mg-progress" aria-live="polite" aria-atomic="true">
              {completed === total && total > 0 ? (
                <CheckCheck size={16} aria-hidden="true" />
              ) : running ? (
                <LoaderCircle
                  className="mg-spin"
                  size={16}
                  aria-hidden="true"
                />
              ) : (
                <Images size={16} aria-hidden="true" />
              )}
              <span>
                {completed === total && total > 0
                  ? `${total} sahne hazır`
                  : `${completed} / ${total} sahne hazır`}
              </span>
            </div>
            <div
              className="mg-density"
              role="group"
              aria-label="Sahne kartlarının boyutu"
            >
              <button
                type="button"
                aria-label="Küçük kartlar"
                aria-pressed={density === "compact"}
                title="Küçük kartlar"
                onClick={() => setDensity("compact")}
              >
                <Grid3X3 size={15} aria-hidden="true" />
                <span>Küçük</span>
              </button>
              <button
                type="button"
                aria-label="Büyük kartlar"
                aria-pressed={density === "large"}
                title="Büyük kartlar"
                onClick={() => setDensity("large")}
              >
                <LayoutGrid size={15} aria-hidden="true" />
                <span>Büyük</span>
              </button>
            </div>
          </div>
        </header>
        {total > 0 && completed < total && (
          <div
            className="mg-progress-track"
            role="progressbar"
            aria-label="Sahne önizlemeleri"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
          >
            <span style={{ width: `${(completed / total) * 100}%` }} />
          </div>
        )}
        {errors > 0 && (
          <p className="mg-gallery-notice" role="status">
            {errors} sahnenin önizlemesi hazırlanamadı. İlgili karttan yeniden
            deneyebilir veya sahneyi açabilirsiniz.
          </p>
        )}
        {!scenes.length ? (
          <div className="mg-empty">
            <Images size={32} aria-hidden="true" />
            <h3>Henüz mockup sahnesi eklenmemiş</h3>
            <p>Ürüne sahneler eklendiğinde burada görünecek.</p>
          </div>
        ) : (
          <div className="mg-grid">
            {scenes.map((item, itemIndex) => {
              const state = previews[item.id];
              const composed = !!state?.url;
              const pending =
                !state || state.status === "idle" || state.status === "loading";
              const label =
                state?.status === "error"
                  ? "Önizleme hazırlanamadı"
                  : state?.stale
                    ? "Tasarım güncelleniyor"
                    : composed
                      ? "Tasarım uygulandı"
                      : "Tasarım hazırlanıyor";
              return (
                <article
                  className="mg-card"
                  key={item.id}
                  data-scene-id={item.id}
                >
                  <button
                    type="button"
                    className="mg-card-open"
                    aria-label={`${item.title} sahnesini büyüt`}
                    onClick={() => openScene(item.id)}
                    ref={(node) => {
                      if (node) cards.current.set(item.id, node);
                      else cards.current.delete(item.id);
                    }}
                  >
                    <span className="mg-card-image">
                      <img
                        src={state?.url || sceneThumbnail(item)}
                        alt={
                          composed
                            ? state?.stale
                              ? `${item.title} — önceki tasarımın önizlemesi; güncel tasarım hazırlanıyor`
                              : `${item.title} — tasarımınız uygulanmış önizleme`
                            : `${item.title} — boş sahne, tasarım hazırlanıyor`
                        }
                        loading={itemIndex < 6 ? "eager" : "lazy"}
                        decoding="async"
                      />
                      <span className="mg-card-number" aria-hidden="true">
                        {String(itemIndex + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`mg-card-state${composed && !state?.stale && state.status === "ready" ? " mg-card-state-ready" : ""}`}
                      >
                        {pending ||
                        (state?.stale && state.status !== "error") ? (
                          <LoaderCircle
                            size={12}
                            className="mg-spin"
                            aria-hidden="true"
                          />
                        ) : state?.status === "ready" ? (
                          <Check size={12} aria-hidden="true" />
                        ) : null}
                        {label}
                      </span>
                      <span className="mg-card-expand" aria-hidden="true">
                        <Expand size={18} />
                        <span>Büyüt</span>
                      </span>
                    </span>
                    <span className="mg-card-copy">
                      <span className="mg-card-title">{item.title}</span>
                      <span className="mg-card-resolution">
                        {item.width} × {item.height} px
                      </span>
                    </span>
                  </button>
                  {state?.status === "error" && (
                    <button
                      type="button"
                      className="mg-card-retry"
                      aria-label={`${item.title} önizlemesini yeniden hazırla`}
                      onClick={() => retry(item.id)}
                    >
                      <RefreshCw size={14} aria-hidden="true" /> Yeniden dene
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <dialog
        className="mg-viewer"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helpId}
        onCancel={(event) => {
          event.preventDefault();
          closeScene();
        }}
        onClose={closeScene}
        onKeyDownCapture={(event) => {
          event.stopPropagation();
          const target = event.target as HTMLElement;
          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement ||
            target.isContentEditable
          )
            return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (index > 0) selectScene(scenes[index - 1].id);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            if (index < scenes.length - 1) selectScene(scenes[index + 1].id);
          }
        }}
      >
        <header className="mg-viewer-header">
          <button
            type="button"
            className="mg-back"
            aria-label="Tüm sahnelere dön"
            onClick={closeScene}
            autoFocus
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Tüm sahneler</span>
          </button>
          <div className="mg-viewer-heading">
            <h2 id={titleId}>{scene?.title || "Mockup sahnesi"}</h2>
            <p>
              {index + 1} / {scenes.length}
              <span aria-hidden="true"> · </span>
              {scene?.width} × {scene?.height} px
            </p>
          </div>
          <button
            type="button"
            className="mg-icon-button mg-close"
            aria-label="Büyük sahneyi kapat"
            onClick={closeScene}
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <div className="mg-viewer-image" aria-busy={!ready}>
          {scene && (
            <MockupPreview
              key={`${viewerVisible ? "viewer" : "deferred"}:${previewEpoch}`}
              ref={preview}
              scene={scene}
              active={viewerVisible}
              deferLoading
              textures={textures}
              artworkProvider={currentArtwork}
              exportArtworkProvider={currentExportArtwork}
              backgroundColor={backgroundColor}
              onStatus={(status, error) =>
                setPreviewState({ key: renderKey, status, error })
              }
            />
          )}
        </div>
        <div
          className="mg-viewer-filmstrip"
          aria-label="Sahneler arasında geçiş"
        >
          {scenes.map((item, itemIndex) => (
            <button
              type="button"
              key={item.id}
              className={`mg-filmstrip-item${item.id === scene?.id ? " is-current" : ""}`}
              aria-label={`${itemIndex + 1}. sahne: ${item.title}`}
              aria-current={item.id === scene?.id ? "true" : undefined}
              disabled={exporting}
              title={item.title}
              onClick={() => selectScene(item.id)}
              ref={(node) => {
                if (node) filmstrip.current.set(item.id, node);
                else filmstrip.current.delete(item.id);
              }}
            >
              <img
                src={previews[item.id]?.url || sceneThumbnail(item)}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span aria-hidden="true">{itemIndex + 1}</span>
            </button>
          ))}
        </div>
        <footer className="mg-viewer-footer">
          <div className="mg-viewer-navigation">
            <button
              type="button"
              className="mg-icon-button"
              aria-label="Önceki sahne"
              disabled={index <= 0 || exporting}
              onClick={() => selectScene(scenes[index - 1].id)}
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mg-icon-button"
              aria-label="Sonraki sahne"
              disabled={index >= scenes.length - 1 || exporting}
              onClick={() => selectScene(scenes[index + 1].id)}
            >
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <span id={helpId} className="mg-keyboard-hint">
              Sahneleri ok tuşlarıyla da gezebilirsiniz.
            </span>
          </div>
          <div className="mg-viewer-actions">
            {scene?.backgroundControl && onBackgroundChange && (
              <label className="mg-background-control">
                <input
                  type="color"
                  aria-label="Sahne arka plan rengi"
                  value={backgroundColor}
                  disabled={exporting}
                  onChange={(event) =>
                    onBackgroundChange(scene.id, event.target.value)
                  }
                />
                <span>{scene.backgroundControl.label}</span>
              </label>
            )}
            <button
              type="button"
              className="mg-download"
              disabled={!ready || exporting}
              onClick={() => void downloadScene()}
            >
              {exporting || (!ready && previewState.status !== "error") ? (
                <LoaderCircle
                  size={17}
                  className="mg-spin"
                  aria-hidden="true"
                />
              ) : (
                <Download size={17} aria-hidden="true" />
              )}
              <span>
                {exporting
                  ? "Görsel hazırlanıyor…"
                  : !ready
                    ? previewState.key === renderKey &&
                      previewState.status === "error"
                      ? "Önizleme açılamadı"
                      : "Önizleme hazırlanıyor…"
                    : "PNG indir"}
              </span>
            </button>
          </div>
          {exportError && (
            <p className="mg-export-error" role="alert">
              {exportError}
            </p>
          )}
        </footer>
      </dialog>
    </section>
  );
});

MockupGallery.displayName = "MockupGallery";
