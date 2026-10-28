import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { RenderOptions, RenderSnapshot } from "./render/types";

type RenderDialogProps = {
  open: boolean;
  onClose: () => void;
  source: () => RenderSnapshot | Promise<RenderSnapshot>;
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
  optionsKey: string;
};

const defaultOptions: RenderOptions = {
  resolution: 1024,
  quality: "standard",
  studio: "softbox",
  background: "white",
  aspect: "square",
};

const stageLabels: Record<RenderProgress["stage"], string> = {
  preparing: "Stüdyo hazırlanıyor",
  rendering: "Işık hesaplanıyor",
  encoding: "PNG hazırlanıyor",
};

function RenderDialogContent({
  onClose,
  source,
}: Omit<RenderDialogProps, "open">) {
  const [options, setOptions] = useState<RenderOptions>(defaultOptions);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 700px)").matches,
  );
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

  useEffect(() => {
    mounted.current = true;
    const root = dialog.current?.getRootNode();
    const previous = (
      root instanceof ShadowRoot ? root.activeElement : document.activeElement
    ) as HTMLElement | null;
    dialog.current
      ?.querySelector<HTMLButtonElement>(".studio-render-close")
      ?.focus();
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

  const effectiveOptions = {
    ...options,
    resolution: mobile ? 1024 : options.resolution,
  } as RenderOptions;
  const optionsChanged =
    completed && completed.optionsKey !== JSON.stringify(effectiveOptions);

  async function startRender() {
    if (running || !canvas.current) return;
    // Keep keyboard focus inside the modal when Start is replaced by Cancel.
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
      snapshot = await source();
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
        'button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ) ?? [],
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
  const status = completed
    ? "Render hazır"
    : error
      ? "Render tamamlanamadı"
      : cancelled
        ? "Render iptal edildi"
        : progress
          ? stageLabels[progress.stage]
          : running
            ? "Render başlatılıyor"
            : "Render oluşturulmaya hazır";
  return (
    <div
      className="studio-render-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="studio-render-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        onKeyDown={handleKeys}
      >
        <header className="studio-render-header">
          <div>
            <span className="studio-render-eyebrow">
              ALAÇAM TASARIM STÜDYOSU
            </span>
            <h2 id={titleId}>Stüdyo render</h2>
            <p>
              Tasarımınızı yüksek çözünürlüklü bir ürün görseline dönüştürün.
            </p>
          </div>
          <button
            type="button"
            className="studio-render-close"
            aria-label="Render penceresini kapat"
            onClick={close}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="studio-render-body">
          <section
            className="studio-render-preview-column"
            aria-label="Stüdyo render önizlemesi"
          >
            <div
              className="studio-render-preview"
              data-background={completed?.background || options.background}
              data-state={
                completed ? "complete" : progress ? "rendering" : "empty"
              }
            >
              <span className="studio-render-preview-label">
                Stüdyo önizlemesi
              </span>
              <canvas
                key={canvasVersion}
                className="studio-render-canvas"
                ref={canvas}
                aria-label="Hesaplanan stüdyo render görseli"
              />
              {completed && (
                <img
                  className="studio-render-image"
                  src={completed.url}
                  alt={`Tamamlanan ürün renderi, ${completed.width} × ${completed.height} piksel`}
                />
              )}
              {!completed && !progress && (
                <div className="studio-render-empty">
                  <svg
                    width="90"
                    height="100"
                    viewBox="0 0 90 100"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M24 12h42l-3 15c4 12 8 34 9 53-14 9-40 9-54 0 1-19 5-41 9-53l-3-15Z"
                      fill="white"
                      stroke="#c9cbd0"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M25 20h40M27 27h36M24 75c14 6 28 6 42 0"
                      stroke="#d5d7dc"
                      strokeWidth="1.2"
                    />
                    <rect
                      x="33"
                      y="40"
                      width="24"
                      height="23"
                      rx="4"
                      fill="#f0f1f3"
                    />
                    <path
                      d="m40 54 4-4 7 7m-10-11h.01"
                      stroke="#a8adb5"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <h3>
                    {running
                      ? "Stüdyo hazırlanıyor"
                      : "Görseliniz burada oluşacak"}
                  </h3>
                  <p>
                    Işığı ve çıktı boyutunu seçin, ardından render oluşturun.
                  </p>
                </div>
              )}
              {completed && (
                <span className="studio-render-output-size">
                  {completed.width} × {completed.height} px · PNG
                </span>
              )}
            </div>
            <div
              className="studio-render-status"
              aria-live="polite"
              role="status"
              id={statusId}
            >
              <div className="studio-render-status-heading">
                <strong>{status}</strong>
                {progress && running && <span>{Math.round(percent)}%</span>}
                {completed && <span>{completed.seconds.toFixed(1)} sn</span>}
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
                        ? `${progress.samples} / ${progress.total} ışık örneği`
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
                  {completed.samples} ışık örneği işlendi. PNG dosyanız
                  indirilmeye hazır.
                </p>
              )}
              {optionsChanged && (
                <p className="studio-render-changed">
                  Yeni ayarlar için yeniden render oluşturun.
                </p>
              )}
            </div>
          </section>

          <aside
            className="studio-render-settings"
            aria-label="Render ayarları"
          >
            <fieldset className="studio-render-controls" disabled={running}>
              <div className="studio-render-setting">
                <h3>Çıktı boyutu</h3>
                <div
                  className="studio-render-segments"
                  role="group"
                  aria-label="Render çözünürlüğü"
                >
                  {([1024, 2048] as const).map((resolution) => (
                    <button
                      type="button"
                      key={resolution}
                      aria-pressed={effectiveOptions.resolution === resolution}
                      disabled={mobile && resolution === 2048}
                      onClick={() =>
                        setOptions((current) => ({ ...current, resolution }))
                      }
                    >
                      {resolution} px
                    </button>
                  ))}
                </div>
                {mobile && (
                  <p className="studio-render-setting-note">
                    Mobil cihazlarda çözünürlük 1024 px ile sınırlıdır.
                  </p>
                )}
              </div>
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
                  Yüksek kalite, ışık ve yansımalar için daha uzun hesaplanır.
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
              <div className="studio-render-setting">
                <h3>Arka plan</h3>
                <div
                  className="studio-render-backgrounds"
                  role="group"
                  aria-label="Render arka planı"
                >
                  {(
                    [
                      { value: "white", label: "Beyaz" },
                      { value: "warm", label: "Sıcak" },
                      { value: "transparent", label: "Şeffaf · gölgesiz" },
                    ] as const
                  ).map((background) => (
                    <button
                      type="button"
                      key={background.value}
                      aria-pressed={options.background === background.value}
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
                      <span>{background.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="studio-render-setting studio-render-aspect-setting">
                <h3>Görsel oranı</h3>
                <div
                  className="studio-render-aspects"
                  role="group"
                  aria-label="Render görsel oranı"
                >
                  {(
                    [
                      { value: "square", label: "Kare" },
                      { value: "portrait", label: "Dikey" },
                      { value: "landscape", label: "Yatay" },
                    ] as const
                  ).map((aspect) => (
                    <button
                      type="button"
                      key={aspect.value}
                      aria-pressed={options.aspect === aspect.value}
                      onClick={() =>
                        setOptions((current) => ({
                          ...current,
                          aspect: aspect.value,
                        }))
                      }
                    >
                      <i
                        className={`studio-render-aspect-${aspect.value}`}
                        aria-hidden="true"
                      />
                      <span>{aspect.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>
            <div className="studio-render-actions">
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
                      ?.querySelector<HTMLButtonElement>(".studio-render-close")
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
                    <path d="M3 9h12m-5-5 5 5-5 5" />
                  </svg>
                </button>
              )}
              {completed && (
                <a
                  className="studio-render-download"
                  href={completed.url}
                  download="alacam-studyo-render.png"
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
                  PNG indir
                </a>
              )}
            </div>
          </aside>
        </div>
        <footer className="studio-render-footer" id={noteId}>
          Render tasarımınızı değiştirmez. Özgün yaklaşık model · Görsel
          önizlemedir; baskı veya üretim dosyası değildir.
        </footer>
      </div>
    </div>
  );
}

export function RenderDialog({ open, onClose, source }: RenderDialogProps) {
  return open ? (
    <RenderDialogContent onClose={onClose} source={source} />
  ) : null;
}
