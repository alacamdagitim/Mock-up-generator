import { useEffect, useState } from "react";
import { Check, ImageOff } from "lucide-react";
import { LAYOUTS } from "../shared/layouts.mjs";
import type { MockupScene } from "./mockups/types";
import type { Presentation } from "./types";

export type MockupLayoutCard = {
  id: string;
  title: string;
  imageUrl: string;
  sceneId?: string;
  pendingReason?: string;
};

function MockupCard({
  card,
  selected,
  onSelect,
}: {
  card: MockupLayoutCard;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [card.imageUrl]);
  const ready = Boolean(card.sceneId && onSelect);
  return (
    <button
      type="button"
      className="mockup-scene-card"
      aria-label={`${card.title} mockup sahnesini seç`}
      aria-pressed={selected}
      disabled={!ready}
      title={
        card.sceneId
          ? card.title
          : card.pendingReason || "Baskı eşlemesi bağlı değil"
      }
      onClick={() => card.sceneId && onSelect?.(card.sceneId)}
    >
      <span className="mockup-scene-cover">
        {imageFailed ? (
          <span className="mockup-scene-no-image">
            <ImageOff size={22} aria-hidden="true" />
            Görsel açılamadı
          </span>
        ) : (
          <img
            src={card.imageUrl}
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
        {ready && <span className="mockup-scene-apply">Seç</span>}
      </span>
      <span className="mockup-scene-title">{card.title}</span>
      {!card.sceneId && (
        <span className="mockup-scene-pending">
          {card.pendingReason || "Baskı eşlemesi bağlı değil"}
        </span>
      )}
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
  mockupCards,
  hasMockupWorkflow = false,
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
  mockupCards?: MockupLayoutCard[];
  hasMockupWorkflow?: boolean;
}) {
  const cards =
    mockupCards ??
    mockupScenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      imageUrl: scene.baseImageUrl,
      sceneId: scene.id,
    }));
  const isMockupWorkflow =
    hasMockupWorkflow || cards.length > 0 || mockupScenes.length > 0;
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  // Photo mockups have fixed, prepared views. Never render 3D layout covers for
  // this workflow, including products whose uploaded photos await mapping.
  const canRenderCovers = !isMockupWorkflow && activeMode === "3d";
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
    <div
      className={`layout-panel${isMockupWorkflow ? " has-mockup-scenes" : ""}`}
    >
      {isMockupWorkflow ? (
        <section className="mockup-scene-section" aria-label="Yerleşimler">
          <div className="mockup-scene-heading">
            <h3>Ürün mockupları</h3>
            <span>{cards.length} mockup</span>
          </div>
          <p className="mockup-scene-intro">
            Bir mockup seçin. Tasarımınız seçtiğiniz görsele otomatik uygulanır.
          </p>
          {cards.length > 0 ? (
            <div className="mockup-scene-grid">
              {cards.map((card) => (
                <MockupCard
                  key={card.id}
                  card={card}
                  selected={Boolean(
                    card.sceneId && mockupSceneId === card.sceneId,
                  )}
                  onSelect={onMockupSelect}
                />
              ))}
            </div>
          ) : (
            <div className="mockup-scene-empty" role="status">
              <ImageOff size={24} aria-hidden="true" />
              <p>Bu ürün için henüz mockup eklenmedi.</p>
            </div>
          )}
          {cards.length > 0 && (
            <p className="mockup-scene-caption">
              Kartlarda ürünün baskısız görünümü gösterilir.
            </p>
          )}
        </section>
      ) : (
        <div className="layout-three-content">
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
