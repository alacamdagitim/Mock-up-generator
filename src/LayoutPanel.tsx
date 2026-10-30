import { useEffect, useState } from "react";
import { Check, ImageOff } from "lucide-react";

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
  mockupCards = [],
  mockupSceneId,
  onMockupSelect,
}: {
  mockupCards?: MockupLayoutCard[];
  mockupSceneId?: string;
  onMockupSelect?: (id: string) => void;
}) {
  return (
    <section
      className="layout-panel has-mockup-scenes mockup-scene-section"
      aria-label="Yerleşimler"
    >
      <div className="mockup-scene-heading">
        <h3>Ürün mockupları</h3>
        <span>{mockupCards.length} mockup</span>
      </div>
      {mockupCards.length ? (
        <>
          <p className="mockup-scene-intro">
            Bir mockup seçin. Tasarımınız seçtiğiniz görsele otomatik uygulanır.
          </p>
          <div className="mockup-scene-grid">
            {mockupCards.map((card) => (
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
          <p className="mockup-scene-caption">
            Kartlarda ürünün baskısız görünümü gösterilir.
          </p>
        </>
      ) : (
        <div className="mockup-scene-empty" role="status">
          <ImageOff size={24} />
          <p>Bu ürünün mockup dosyaları henüz hazırlanmadı.</p>
        </div>
      )}
    </section>
  );
}
