import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { RenderOptions, RenderSnapshot } from "./render/types";

type RenderDialogProps = {
  open: boolean;
  onClose: () => void;
  source: (options: RenderOptions) => RenderSnapshot | Promise<RenderSnapshot>;
  /** Captured from the current product, camera, layout and artwork. */
  previewUrl?: string | null;
  /** Prepared photo mockups export directly without a separate 3D render. */
  allowStudio?: boolean;
  imageLabel?: string;
  /** Each panel supplies its own preview section and settings aside. */
  panels?: { dieline?: ReactNode; share?: ReactNode };
};

type RenderProgress = {
  stage: "preparing" | "rendering" | "encoding";
  samples: number;
  total: number;
  percent: number;
  elapsedMs: number;
};

type CompletedRender = {
  url: string;
  width: number;
  height: number;
  samples: number;
  seconds: number;
  background: RenderOptions["background"];
  aspect: RenderOptions["aspect"];
  format: "png" | "jpeg";
  optionsKey: string;
};

type ExportTab = "mockup" | "dieline" | "share";
type ImageMode = "live" | "studio";

function initialOptions(): RenderOptions {
  return {
    resolution: matchMedia("(max-width: 700px)").matches ? 1024 : 2048,
    quality: "standard",
    studio: "softbox",
    background: "white",
    aspect: "square",
    format: "png",
    floorShadow: true,
  };
}

function supportedResolution() {
  // High-resolution output is assembled from small GPU tiles. Test the 2D
  // output's long edge, rather than incorrectly gating it on GPU texture size.
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const maximum = memory !== undefined && memory < 4 ? 4096 : 8192;
  const element = document.createElement("canvas");
  element.width = maximum;
  element.height = 1;
  const context = element.getContext("2d");
  if (!context) return 2048;
  try {
    context.fillStyle = "#ffffff";
    context.fillRect(maximum - 1, 0, 1, 1);
    return context.getImageData(maximum - 1, 0, 1, 1).data[3] === 255
      ? maximum
      : 2048;
  } catch {
    return 2048;
  } finally {
    element.width = element.height = 1;
  }
}

function RenderDialogContent({
  onClose,
  source,
  previewUrl,
  panels,
  allowStudio = true,
  imageLabel = "Canlı görünüm",
}: Omit<RenderDialogProps, "open">) {
  const [options, setOptions] = useState<RenderOptions>(initialOptions);
  const [imageMode, setImageMode] = useState<ImageMode>("live");
  const [liveFormat, setLiveFormat] = useState<"png" | "jpeg">("png");
  const [liveSize, setLiveSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [liveDownloading, setLiveDownloading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveNotice, setLiveNotice] = useState("");
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 700px)").matches,
  );
  const [maximumResolution, setMaximumResolution] = useState(2048);
  const [tab, setTab] = useState<ExportTab>("mockup");
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [completed, setCompleted] = useState<CompletedRender | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<AbortController | null>(null);
  const resultUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const titleId = useId();
  const noteId = useId();
  const statusId = useId();
  const tabsId = useId();
  const isLive = !allowStudio || imageMode === "live";

  useEffect(() => {
    let current = true;
    setLiveSize(null);
    setLiveNotice("");
    setLiveError("");
    if (!previewUrl) {
      setLiveError(
        "Görsel henüz hazır değil. Pencereyi kapatıp tekrar deneyin.",
      );
      return;
    }
    const image = new Image();
    image.src = previewUrl;
    void image
      .decode()
      .then(() => {
        if (current)
          setLiveSize({
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
      })
      .catch(() => {
        if (current)
          setLiveError(
            `${imageLabel} okunamadı. Pencereyi kapatıp tekrar deneyin.`,
          );
      });
    return () => {
      current = false;
    };
  }, [previewUrl, imageLabel]);

  useEffect(() => {
    mounted.current = true;
    const root = dialog.current?.getRootNode();
    const previous = (
      root instanceof ShadowRoot ? root.activeElement : document.activeElement
    ) as HTMLElement | null;
    dialog.current
      ?.querySelector<HTMLButtonElement>(".studio-render-close")
      ?.focus();
    setMaximumResolution(supportedResolution());
    const query = matchMedia("(max-width: 700px)");
    const resize = () => {
      setMobile(query.matches);
      if (query.matches)
        setOptions((current) => ({ ...current, resolution: 1024 }));
    };
    query.addEventListener("change", resize);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      generation.current += 1;
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      query.removeEventListener("change", resize);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const effectiveOptions: RenderOptions = {
    ...options,
    resolution: mobile ? 1024 : options.resolution,
    floorShadow:
      options.background === "transparent" ? false : options.floorShadow,
  };
  const optionsChanged = Boolean(
    completed && completed.optionsKey !== JSON.stringify(effectiveOptions),
  );

  async function downloadLive() {
    if (!previewUrl || !liveSize || liveDownloading) return;
    const active = new AbortController();
    controller.current = active;
    const requestId = ++generation.current;
    setLiveDownloading(true);
    setLiveError("");
    setLiveNotice("");
    try {
      const response = await fetch(previewUrl, { signal: active.signal });
      if (!response.ok) throw new Error(`${imageLabel} okunamadı.`);
      let blob = await response.blob();
      if (liveFormat === "jpeg" || blob.type !== "image/png") {
        const image = new Image();
        image.src = previewUrl;
        await image.decode();
        if (active.signal.aborted) return;
        const output = document.createElement("canvas");
        output.width = image.naturalWidth;
        output.height = image.naturalHeight;
        try {
          const context = output.getContext("2d");
          if (!context) throw new Error("Bu cihazda görsel indirilemiyor.");
          if (liveFormat === "jpeg") {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, output.width, output.height);
          }
          context.drawImage(image, 0, 0);
          blob = await new Promise<Blob>((resolve, reject) =>
            output.toBlob(
              (value) =>
                value
                  ? resolve(value)
                  : reject(new Error("Görsel dosyası oluşturulamadı.")),
              liveFormat === "jpeg" ? "image/jpeg" : "image/png",
              0.96,
            ),
          );
        } finally {
          output.width = output.height = 1;
        }
      }
      if (
        !mounted.current ||
        active.signal.aborted ||
        generation.current !== requestId
      )
        return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `alacam-${allowStudio ? "canli-gorunum" : "mockup"}.${liveFormat === "jpeg" ? "jpg" : "png"}`;
      document.body.append(link);
      link.click();
      link.remove();
      // Keep the actual PNG bytes; JPG encoding preserves the source dimensions.
      // Safari can start reading a download after click() has returned.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setLiveNotice("Görsel indirildi.");
    } catch (cause) {
      if (
        mounted.current &&
        !active.signal.aborted &&
        generation.current === requestId
      )
        setLiveError(
          cause instanceof Error ? cause.message : "Görsel indirilemedi.",
        );
    } finally {
      if (mounted.current && generation.current === requestId) {
        setLiveDownloading(false);
        controller.current = null;
      }
    }
  }

  async function startRender() {
    if (!allowStudio || running || !canvas.current) return;
    dialog.current
      ?.querySelector<HTMLButtonElement>(".studio-render-close")
      ?.focus({ preventScroll: true });
    const active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    const requestId = ++generation.current;
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
    setCompleted(null);
    setError("");
    setCancelled(false);
    setCancelling(false);
    setProgress(null);
    setRunning(true);
    // Each job owns a WebGL context. A disposed/lost context cannot be reused.
    setCanvasVersion((version) => version + 1);
    let snapshot: RenderSnapshot | undefined;
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (active.signal.aborted)
        throw new DOMException("Render cancelled", "AbortError");
      snapshot = await source(effectiveOptions);
      if (active.signal.aborted)
        throw new DOMException("Render cancelled", "AbortError");
      const { renderStudio } = await import("./render/studioRender");
      if (active.signal.aborted)
        throw new DOMException("Render cancelled", "AbortError");
      const renderCanvas = canvas.current;
      if (!renderCanvas)
        throw new Error("Render önizleme alanı hazırlanamadı.");
      const result = await renderStudio(snapshot, effectiveOptions, {
        canvas: renderCanvas,
        signal: active.signal,
        onProgress: (value: RenderProgress) => {
          if (
            mounted.current &&
            generation.current === requestId &&
            !active.signal.aborted
          )
            setProgress(value);
        },
      });
      if (!mounted.current || generation.current !== requestId) return;
      if (active.signal.aborted) {
        setCancelled(true);
        setProgress(null);
        return;
      }
      const url = URL.createObjectURL(result.blob);
      resultUrl.current = url;
      setCompleted({
        url,
        width: result.width,
        height: result.height,
        samples: result.samples,
        seconds: result.seconds,
        background: effectiveOptions.background,
        aspect: effectiveOptions.aspect,
        format: result.blob.type === "image/jpeg" ? "jpeg" : "png",
        optionsKey: JSON.stringify(effectiveOptions),
      });
    } catch (cause) {
      if (!mounted.current || generation.current !== requestId) return;
      if (
        active.signal.aborted ||
        (cause instanceof DOMException && cause.name === "AbortError")
      ) {
        setCancelled(true);
        setProgress(null);
      } else {
        setProgress(null);
        setError(
          cause instanceof Error
            ? cause.message.slice(0, 280)
            : "Bu cihazda render başlatılamadı. Tekrar deneyin.",
        );
      }
    } finally {
      snapshot?.dispose();
      if (mounted.current && generation.current === requestId) {
        setRunning(false);
        setCancelling(false);
        controller.current = null;
      }
    }
  }

  function close() {
    controller.current?.abort();
    onClose();
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled), summary, [tabindex="0"]',
      ) ?? [],
    ).filter(
      (item) =>
        item.getClientRects().length > 0 &&
        (item.tabIndex >= 0 || item.matches("summary")),
    );
    const first = items[0];
    const last = items[items.length - 1];
    const root = dialog.current?.getRootNode();
    const focused =
      root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    if (
      event.shiftKey &&
      (focused === first || !dialog.current?.contains(focused))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (focused === last || !dialog.current?.contains(focused))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }

  const percent = Math.max(0, Math.min(100, progress?.percent || 0));
  const formatLabel =
    (completed?.format || options.format) === "jpeg" ? "JPG" : "PNG";
  const status = completed
    ? "Render hazır"
    : error
      ? "Render tamamlanamadı"
      : cancelled
        ? "Render iptal edildi"
        : progress
          ? progress.stage === "preparing"
            ? "Stüdyo hazırlanıyor"
            : progress.stage === "encoding"
              ? `${options.format === "jpeg" ? "JPG" : "PNG"} hazırlanıyor`
              : "Işık hesaplanıyor"
          : running
            ? "Render başlatılıyor"
            : "Mevcut ürün ve yerleşiminiz";
  const availableTabs: { value: ExportTab; label: string }[] = [
    { value: "mockup", label: "Görsel" },
    ...(panels?.dieline
      ? [{ value: "dieline" as const, label: "Bıçak izi" }]
      : []),
    ...(panels?.share ? [{ value: "share" as const, label: "Paylaş" }] : []),
  ];
  const showingCanvas = running && Boolean(progress && progress.samples > 0);

  return (
    <div
      className="studio-render-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="studio-render-dialog"
        data-image-mode={isLive ? "live" : "studio"}
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        onKeyDown={handleKeys}
      >
        <header className="studio-render-header">
          <h2 className="studio-render-visually-hidden" id={titleId}>
            {allowStudio ? "Stüdyo render" : "Görsel indir"}
          </h2>
          <nav
            className="studio-render-tabs"
            role="tablist"
            aria-label="Dışa aktarma seçenekleri"
          >
            {availableTabs.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                id={`${tabsId}-${item.value}`}
                aria-controls={`${tabsId}-${item.value}-panel`}
                aria-selected={tab === item.value}
                tabIndex={tab === item.value ? 0 : -1}
                disabled={running || liveDownloading}
                onClick={() => setTab(item.value)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const index = availableTabs.findIndex(
                    (entry) => entry.value === tab,
                  );
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? availableTabs.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            availableTabs.length) %
                          availableTabs.length;
                  setTab(availableTabs[next].value);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [next]?.focus();
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="studio-render-close"
            aria-label={
              allowStudio
                ? "Render penceresini kapat"
                : "Görsel penceresini kapat"
            }
            onClick={close}
          >
            <svg
              width="26"
              height="26"
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

        <div
          className="studio-render-body"
          id={`${tabsId}-mockup-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-mockup`}
          hidden={tab !== "mockup"}
        >
          <section
            className="studio-render-preview-column"
            aria-label={
              isLive
                ? allowStudio
                  ? "Canlı görsel önizlemesi"
                  : `${imageLabel} önizlemesi`
                : "Stüdyo render önizlemesi"
            }
          >
            <div
              className="studio-render-preview"
              data-background={
                isLive ? "live" : completed?.background || options.background
              }
              data-state={
                isLive
                  ? "live"
                  : completed
                    ? "complete"
                    : showingCanvas
                      ? "rendering"
                      : "empty"
              }
              data-aspect={isLive ? "source" : options.aspect}
            >
              <div
                className="studio-render-frame"
                data-aspect={
                  isLive ? "source" : completed?.aspect || options.aspect
                }
              >
                {(isLive || !completed) && previewUrl && (
                  <img
                    className="studio-render-source-image"
                    src={previewUrl}
                    alt="Seçili ürününüzün mevcut tasarımı ve yerleşimi"
                  />
                )}
                <canvas
                  key={canvasVersion}
                  className="studio-render-canvas"
                  style={isLive ? { display: "none" } : undefined}
                  ref={canvas}
                  aria-label="Hesaplanan stüdyo render görseli"
                />
                {!isLive && completed && (
                  <img
                    className="studio-render-image"
                    src={completed.url}
                    alt={`Tamamlanan ürün renderi, ${completed.width} × ${completed.height} piksel`}
                  />
                )}
                {(isLive || !completed) && !showingCanvas && !previewUrl && (
                  <div className="studio-render-empty">
                    {!liveError && (
                      <span
                        className="studio-render-spinner"
                        aria-hidden="true"
                      />
                    )}
                    <p>
                      {isLive && liveError
                        ? "Önizleme kullanılamıyor."
                        : "Ürün önizlemesi hazırlanıyor…"}
                    </p>
                  </div>
                )}
              </div>
              {isLive && liveSize && (
                <span className="studio-render-output-size">
                  {liveSize.width} × {liveSize.height} px ·{" "}
                  {liveFormat === "jpeg" ? "JPG" : "PNG"}
                </span>
              )}
              {!isLive && completed && (
                <span className="studio-render-output-size">
                  {completed.width} × {completed.height} px · {formatLabel}
                </span>
              )}
              {(isLive || !completed) && (
                <span className="studio-render-preview-label">
                  {isLive ? imageLabel : "Canlı sahne önizlemesi"}
                </span>
              )}
              {!isLive && (
                <fieldset
                  className="studio-render-preview-tools"
                  disabled={running}
                >
                  <label className="studio-render-ratio">
                    <span>Oran</span>
                    <select
                      aria-label="Render görsel oranı"
                      value={options.aspect}
                      onChange={(event) =>
                        setOptions((current) => ({
                          ...current,
                          aspect: event.target.value as RenderOptions["aspect"],
                        }))
                      }
                    >
                      <option value="square">1:1</option>
                      <option value="portrait">3:4</option>
                      <option value="landscape">4:3</option>
                    </select>
                  </label>
                  <div
                    className="studio-render-backgrounds"
                    role="group"
                    aria-label="Render arka planı"
                  >
                    {(
                      [
                        { value: "transparent", label: "Şeffaf · gölgesiz" },
                        { value: "white", label: "Beyaz" },
                        { value: "warm", label: "Sıcak" },
                      ] as const
                    ).map((background) => (
                      <button
                        type="button"
                        key={background.value}
                        aria-label={background.label}
                        title={
                          background.value === "transparent" &&
                          options.format === "jpeg"
                            ? "Şeffaf arka plan için PNG seçin"
                            : background.label
                        }
                        aria-pressed={options.background === background.value}
                        disabled={
                          background.value === "transparent" &&
                          options.format === "jpeg"
                        }
                        onClick={() =>
                          setOptions((current) => ({
                            ...current,
                            background: background.value,
                          }))
                        }
                      >
                        <i
                          data-background={background.value}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </section>

          <aside
            className="studio-render-settings"
            aria-label={isLive ? "Görsel ayarları" : "Render ayarları"}
          >
            {allowStudio && (
              <div
                className="studio-render-mode-switch"
                role="group"
                aria-label="Görsel oluşturma yöntemi"
              >
                {(
                  [
                    { value: "live", label: imageLabel },
                    { value: "studio", label: "Stüdyo render" },
                  ] as const
                ).map((mode) => (
                  <button
                    type="button"
                    key={mode.value}
                    aria-pressed={imageMode === mode.value}
                    disabled={running || liveDownloading}
                    onClick={() => setImageMode(mode.value)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
            {isLive ? (
              <>
                <div className="studio-render-live-content">
                  <div className="studio-render-intro studio-render-live-intro">
                    <span className="studio-render-live-ready">
                      {liveSize ? "Anında hazır" : imageLabel}
                    </span>
                    <h3>
                      {allowStudio
                        ? "Gördüğünüz görseli indirin"
                        : "Görsel indir"}
                    </h3>
                    <p>
                      {allowStudio
                        ? "Ürününüzün tasarımı, yerleşimi, kamera açısı ve ışığı ekranda gördüğünüz haliyle korunur."
                        : "Hazır sahnenin ışığı, gölgeleri ve tasarımınız ekranda gördüğünüz haliyle korunur."}
                    </p>
                  </div>
                  <div className="studio-render-live-size">
                    <span>Gerçek görsel boyutu</span>
                    <strong>
                      {liveSize
                        ? `${liveSize.width} × ${liveSize.height} px`
                        : "Görsel hazırlanıyor…"}
                    </strong>
                    <small>
                      Kaynak piksel boyutu korunur; görsel büyütülmez.
                    </small>
                  </div>
                  <fieldset
                    className="studio-render-controls"
                    disabled={liveDownloading}
                  >
                    <div className="studio-render-setting">
                      <h3>Dosya biçimi</h3>
                      <div
                        className="studio-render-formats"
                        role="group"
                        aria-label="Canlı görsel biçimi"
                      >
                        {(["jpeg", "png"] as const).map((format) => (
                          <button
                            type="button"
                            key={format}
                            aria-pressed={liveFormat === format}
                            onClick={() => {
                              setLiveFormat(format);
                              setLiveNotice("");
                            }}
                          >
                            {format === "jpeg" ? "JPG" : "PNG"}
                          </button>
                        ))}
                      </div>
                      <p className="studio-render-setting-note">
                        {liveFormat === "jpeg"
                          ? "JPG’de saydam alanlar beyaz zeminle kaydedilir."
                          : "PNG, mevcut saydam alanları ve görsel ayrıntılarını korur."}
                      </p>
                    </div>
                  </fieldset>
                </div>
                <div className="studio-render-actions studio-render-live-actions">
                  <p className="studio-render-live-status" role="status">
                    {liveNotice ||
                      (allowStudio
                        ? "Yeniden render hesaplaması beklemeden indirin."
                        : "Hazır mockup’ı kaynak boyutunda indirin.")}
                  </p>
                  {liveError && (
                    <div className="studio-render-error" role="alert">
                      <strong>Görsel indirilemedi</strong>
                      <p>{liveError}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    className="studio-render-start"
                    disabled={!liveSize || liveDownloading || !previewUrl}
                    onClick={() => void downloadLive()}
                  >
                    {liveDownloading ? "Görsel hazırlanıyor…" : "Görseli indir"}
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4" />
                    </svg>
                  </button>
                  {allowStudio && (
                    <p className="studio-render-setting-note">
                      Daha yüksek çözünürlük ve ayrı ışık hesaplaması için
                      Stüdyo render seçebilirsiniz.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="studio-render-intro">
                  <span
                    className="studio-render-quality-mark"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    >
                      <path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z" />
                    </svg>
                  </span>
                  <h3>Stüdyo görseli oluştur</h3>
                  <p>
                    Gerçek ışık, yansıma ve yumuşak gölgelerle yüksek
                    çözünürlüklü ürün görseli oluşturun.
                  </p>
                  <span className="studio-render-engine-label">
                    Fiziksel ışık hesaplaması · Cihazınızda işlenir
                  </span>
                </div>
                <fieldset className="studio-render-controls" disabled={running}>
                  <label className="studio-render-shadow-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(effectiveOptions.floorShadow)}
                      disabled={options.background === "transparent"}
                      onChange={(event) =>
                        setOptions((current) => ({
                          ...current,
                          floorShadow: event.target.checked,
                        }))
                      }
                    />
                    <span className="studio-render-switch" aria-hidden="true" />
                    <span>Zemin gölgesini dahil et</span>
                  </label>
                  <div className="studio-render-setting">
                    <h3>Format ve çözünürlük</h3>
                    <div
                      className="studio-render-formats"
                      role="group"
                      aria-label="Görsel formatı"
                    >
                      {(["jpeg", "png"] as const).map((format) => (
                        <button
                          type="button"
                          key={format}
                          aria-pressed={options.format === format}
                          onClick={() =>
                            setOptions((current) => ({
                              ...current,
                              format,
                              background:
                                format === "jpeg" &&
                                current.background === "transparent"
                                  ? "white"
                                  : current.background,
                            }))
                          }
                        >
                          {format === "jpeg" ? "JPG" : "PNG"}
                        </button>
                      ))}
                    </div>
                    <div
                      className="studio-render-segments"
                      role="group"
                      aria-label="Render çözünürlüğü"
                    >
                      {([1024, 2048, 4096, 8192] as const).map((resolution) => (
                        <button
                          type="button"
                          key={resolution}
                          aria-label={`${resolution} px`}
                          aria-pressed={
                            effectiveOptions.resolution === resolution
                          }
                          disabled={
                            (mobile && resolution > 1024) ||
                            maximumResolution < resolution
                          }
                          title={
                            mobile && resolution > 1024
                              ? "Mobil cihazlarda en fazla 1K"
                              : maximumResolution < resolution
                                ? "Bu cihazın kullanılabilir belleği veya tuval sınırı bu çözünürlük için yeterli değil"
                                : `${resolution} piksel uzun kenar`
                          }
                          onClick={() =>
                            setOptions((current) => ({
                              ...current,
                              resolution,
                            }))
                          }
                        >
                          {resolution / 1024}K
                        </button>
                      ))}
                    </div>
                    <p className="studio-render-setting-note">
                      {mobile
                        ? "Mobil cihazlarda çözünürlük 1024 px ile sınırlıdır."
                        : options.resolution === 8192
                          ? "8K gerçek piksel çıktısıdır. Yüksek bellek kullanır; render süresi belirgin biçimde uzar."
                          : options.resolution >= 4096
                            ? "Çok yüksek çözünürlük. Daha fazla bellek ve işlem süresi gerektirir."
                            : options.resolution === 2048
                              ? "Yüksek çözünürlük. Ürün sayfaları ve sunumlar için ideal."
                              : "Hızlı çıktı. Önizleme ve paylaşım için ideal."}
                    </p>
                  </div>
                  <details className="studio-render-advanced">
                    <summary>
                      Işık ve kalite ayarları
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path d="m4 6 4 4 4-4" />
                      </svg>
                    </summary>
                    <div className="studio-render-setting">
                      <h3>Görüntü kalitesi</h3>
                      <div
                        className="studio-render-quality"
                        role="group"
                        aria-label="Render kalitesi"
                      >
                        {(
                          [
                            {
                              value: "standard",
                              title: "Standart",
                              detail: "64 ışık örneği",
                            },
                            {
                              value: "fine",
                              title: "Yüksek",
                              detail: "256 ışık örneği",
                            },
                          ] as const
                        ).map((quality) => (
                          <button
                            type="button"
                            key={quality.value}
                            aria-pressed={options.quality === quality.value}
                            onClick={() =>
                              setOptions((current) => ({
                                ...current,
                                quality: quality.value,
                              }))
                            }
                          >
                            <strong>{quality.title}</strong>
                            <span>{quality.detail}</span>
                          </button>
                        ))}
                      </div>
                      <p className="studio-render-setting-note">
                        Yüksek kalite, ışık ve yansımalar için daha uzun
                        hesaplanır.
                      </p>
                    </div>
                    <div className="studio-render-setting">
                      <h3>Stüdyo ışığı</h3>
                      <div
                        className="studio-render-lights"
                        role="group"
                        aria-label="Stüdyo ışığı"
                      >
                        {(
                          [
                            { value: "softbox", label: "Yumuşak stüdyo" },
                            { value: "daylight", label: "Gün ışığı" },
                            { value: "dramatic", label: "Kontrast" },
                          ] as const
                        ).map((studio) => (
                          <button
                            type="button"
                            key={studio.value}
                            aria-pressed={options.studio === studio.value}
                            onClick={() =>
                              setOptions((current) => ({
                                ...current,
                                studio: studio.value,
                              }))
                            }
                          >
                            <span
                              className={`studio-render-light-swatch studio-render-light-${studio.value}`}
                              aria-hidden="true"
                            />
                            <span>{studio.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </details>
                </fieldset>
                <div className="studio-render-actions">
                  <div
                    className="studio-render-status"
                    aria-live="polite"
                    role="status"
                    id={statusId}
                  >
                    <div className="studio-render-status-heading">
                      <strong>{status}</strong>
                      {progress && running && (
                        <span>{Math.round(percent)}%</span>
                      )}
                      {completed && (
                        <span>{completed.seconds.toFixed(1)} sn</span>
                      )}
                    </div>
                    {running && (
                      <>
                        <progress
                          className="studio-render-progress"
                          max={100}
                          value={progress ? percent : undefined}
                          aria-label="Render ilerlemesi"
                        />
                        <div className="studio-render-progress-details">
                          <span>
                            {progress
                              ? `${Number(progress.samples.toFixed(1))} / ${progress.total} ışık örneği`
                              : "Render motoru yükleniyor"}
                          </span>
                          <span>
                            {progress
                              ? `${(progress.elapsedMs / 1000).toFixed(1)} sn`
                              : ""}
                          </span>
                        </div>
                      </>
                    )}
                    {completed && (
                      <p>
                        {completed.samples} ışık örneği işlendi. {formatLabel}{" "}
                        dosyanız indirilmeye hazır.
                      </p>
                    )}
                    {optionsChanged && (
                      <p className="studio-render-changed">
                        Yeni ayarlar için yeniden render oluşturun.
                      </p>
                    )}
                  </div>
                  {error && (
                    <div className="studio-render-error" role="alert">
                      <strong>Render oluşturulamadı</strong>
                      <p>{error}</p>
                      <span>Ayarları değiştirip tekrar deneyebilirsiniz.</span>
                    </div>
                  )}
                  {running ? (
                    <button
                      type="button"
                      className="studio-render-cancel"
                      disabled={cancelling}
                      onClick={() => {
                        dialog.current
                          ?.querySelector<HTMLButtonElement>(
                            ".studio-render-close",
                          )
                          ?.focus({ preventScroll: true });
                        setCancelling(true);
                        controller.current?.abort();
                      }}
                    >
                      {cancelling ? "İptal ediliyor…" : "Renderı iptal et"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="studio-render-start"
                      onClick={startRender}
                    >
                      Render oluştur
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4" />
                      </svg>
                    </button>
                  )}
                  {completed && (
                    <a
                      className="studio-render-download"
                      href={completed.url}
                      download={`alacam-studyo-render.${completed.format === "jpeg" ? "jpg" : "png"}`}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 2v9m-3-3 3 3 3-3M3 12v3h12v-3" />
                      </svg>
                      {formatLabel} indir
                    </a>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
        {panels?.dieline && (
          <div
            className="studio-render-body studio-render-supplied-panel"
            id={`${tabsId}-dieline-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-dieline`}
            hidden={tab !== "dieline"}
          >
            {panels.dieline}
          </div>
        )}
        {panels?.share && (
          <div
            className="studio-render-body studio-render-supplied-panel"
            id={`${tabsId}-share-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-share`}
            hidden={tab !== "share"}
          >
            {panels.share}
          </div>
        )}
        <footer className="studio-render-footer" id={noteId}>
          Görsel önizlemedir; baskı veya üretim dosyası değildir.
        </footer>
      </div>
    </div>
  );
}

export function RenderDialog({ open, ...props }: RenderDialogProps) {
  return open ? <RenderDialogContent {...props} /> : null;
}
