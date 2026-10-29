import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, ImageOff } from "lucide-react";
import { LAYOUTS } from "../shared/layouts.mjs";
import type { MockupScene } from "./mockups/types";
import type { Presentation } from "./types";

function MockupCard({
  scene,
  selected,
  onSelect,
}: {
  scene: MockupScene;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const imageUrl = scene.thumbnailUrl || scene.baseImageUrl;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);
  return (
    <button
      type="button"
      className="mockup-scene-card"
      aria-label={`${scene.title} mockup sahnesini seç`}
      aria-pressed={selected}
      disabled={!onSelect}
      onClick={() => onSelect?.(scene.id)}
    >
      <span className="mockup-scene-cover">
        {imageFailed ? (
          <span className="mockup-scene-no-image">
            <ImageOff size={22} aria-hidden="true" />
            Önizleme açılamadı
          </span>
        ) : (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        )}
        {selected && (
          <span className="mockup-scene-selected" aria-hidden="true">
            <Check size={14} />
          </span>
        )}
        <span className="mockup-scene-apply">Sahneyi aç</span>
      </span>
      <span className="mockup-scene-title">{scene.title}</span>
      <span className="mockup-scene-size">
        {scene.width} × {scene.height} px
      </span>
    </button>
  );
}

export function LayoutPanel({
  layout,
  spacing,
  onSelect,
  onSpacing,
  getCovers,
  revision,
  mockupScenes = [],
  mockupSceneId,
  onMockupSelect,
  activeMode = "3d",
}: {
  layout: NonNullable<Presentation["layout"]>;
  spacing: number;
  onSelect: (layout: NonNullable<Presentation["layout"]>) => void;
  onSpacing: (spacing: number) => void;
  getCovers: (signal: AbortSignal) => Promise<Record<string, string>>;
  revision: unknown;
  mockupScenes?: MockupScene[];
  mockupSceneId?: string;
  onMockupSelect?: (id: string) => void;
  activeMode?: "3d" | "mockup";
}) {
  const hasMockups = mockupScenes.length > 0;
  const [threeExpanded, setThreeExpanded] = useState(false);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const threeContentId = useId();
  const showThreeLayouts = !hasMockups || threeExpanded;
  const canRenderCovers = showThreeLayouts && activeMode === "3d";
  useEffect(() => {
    if (!canRenderCovers) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("Ürününüzün yerleşimleri hazırlanıyor…");
      const coversWhenReady = async () => {
        const started = performance.now();
        while (!controller.signal.aborted) {
          try {
            return await getCovers(controller.signal);
          } catch (error) {
            if (controller.signal.aborted) throw error;
            const waitingForModel =
              error instanceof Error &&
              error.message === "3B model henüz hazır değil.";
            if (!waitingForModel || performance.now() - started > 15_000)
              throw error;
            // A mockup does not mount a WebGL model. Let an explicit 3D switch
            // finish loading before treating a missing preview as a failure.
            await new Promise<void>((resolve, reject) => {
              const onAbort = () => {
                clearTimeout(wait);
                reject(new DOMException("İşlem iptal edildi.", "AbortError"));
              };
              const wait = setTimeout(() => {
                controller.signal.removeEventListener("abort", onAbort);
                resolve();
              }, 250);
              controller.signal.addEventListener("abort", onAbort, {
                once: true,
              });
            });
          }
        }
        throw new DOMException("İşlem iptal edildi.", "AbortError");
      };
      coversWhenReady()
        .then((value) => {
          if (!controller.signal.aborted) {
            setCovers(value);
            setStatus("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setStatus(
              "Kart önizlemeleri hazırlanamadı. Yerleşimleri seçerek 3B alanda görebilirsiniz.",
            );
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision, spacing, getCovers, canRenderCovers]);
  return (
    <div className={`layout-panel${hasMockups ? " has-mockup-scenes" : ""}`}>
      {hasMockups && (
        <section className="mockup-scene-section" aria-label="Hazır mockuplar">
          <div className="mockup-scene-heading">
            <h3>Hazır mockuplar</h3>
            <span>{mockupScenes.length} sahne</span>
          </div>
          <p className="mockup-scene-intro">
            Tasarımınızı hazır ışık ve gölgelerle görün. Ayrı render gerekmez.
          </p>
          <div className="mockup-scene-grid">
            {mockupScenes.map((scene) => (
              <MockupCard
                key={scene.id}
                scene={scene}
                selected={activeMode === "mockup" && mockupSceneId === scene.id}
                onSelect={onMockupSelect}
              />
            ))}
          </div>
          <p className="mockup-scene-caption">
            Kartlar sahne örnekleridir. Tasarımınız seçtiğiniz sahneye
            uygulanır. Kamera açısı sabittir.
          </p>
        </section>
      )}
      {hasMockups && (
        <button
          type="button"
          className="layout-three-toggle"
          aria-expanded={threeExpanded}
          aria-controls={threeContentId}
          onClick={() => setThreeExpanded((value) => !value)}
        >
          <span>3B yerleşimleri</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
      {showThreeLayouts && (
        <div id={threeContentId} className="layout-three-content">
          {canRenderCovers && status && (
            <p className="panel-note" role="status">
              {status}
            </p>
          )}
          {activeMode === "mockup" && (
            <p className="panel-note">
              Döndürülebilen ürüne geçmek için bir 3B yerleşim seçin.
            </p>
          )}
          <div className="layout-grid">
            {LAYOUTS.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-label={`${item.name} yerleşimini uygula`}
                title={item.name}
                aria-pressed={activeMode === "3d" && layout === item.id}
                onClick={() =>
                  onSelect(item.id as NonNullable<Presentation["layout"]>)
                }
              >
                <div className="layout-cover">
                  {covers[item.id] && (
                    <img src={covers[item.id]} alt="" draggable={false} />
                  )}
                  {hasMockups && !covers[item.id] && (
                    <span className="layout-cover-label">{item.name}</span>
                  )}
                  <span className="layout-apply">Uygula</span>
                </div>
                <span className="layout-name">
                  {item.name}
                  {activeMode === "3d" && layout === item.id && (
                    <Check size={13} />
                  )}
                </span>
              </button>
            ))}
          </div>
          {activeMode === "3d" && (
            <label className="layout-spacing">
              <span>
                Ürün aralığı<output>{Math.round(spacing * 100)}%</output>
              </span>
              <input
                aria-label="Yerleşim aralığı"
                type="range"
                min="0.8"
                max="1.6"
                step="0.05"
                value={spacing}
                disabled={layout === "single"}
                onChange={(event) => onSpacing(Number(event.target.value))}
              />
            </label>
          )}
          {activeMode === "3d" && (
            <p className="panel-note">
              Kartlar seçili ürününüzü ve tasarımınızı gösterir. Kopyalar aynı
              tasarımı kullanır; yerleşim sipariş adedini değiştirmez.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
