import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Italic,
  Lock,
  Unlock,
  MoreHorizontal,
  Trash2,
  Underline,
} from "lucide-react";
import type { Element } from "./types";
export function SelectionInspector({
  selected,
  update,
  remove,
  layer,
  duplicate,
}: {
  selected: Element;
  update: (values: Partial<Element>) => void;
  remove: () => void;
  layer: (direction: "up" | "down" | "front" | "back") => void;
  duplicate: () => void;
}) {
  const [more, setMore] = useState(false);
  return (
    <section className="selection-inspector" aria-label="Seçili öğe ayarları">
      <div className="selection-toolbar">
        {selected.kind === "text" && (
          <>
            <select
              aria-label="Yazı tipi"
              value={selected.fontFamily}
              onChange={(e) =>
                update({ fontFamily: e.target.value as Element["fontFamily"] })
              }
            >
              {["DM Sans", "Arial", "Georgia", "Verdana", "Courier New"].map(
                (font) => (
                  <option key={font}>{font}</option>
                ),
              )}
            </select>
            <input
              aria-label="Yazı boyutu"
              type="number"
              min={8}
              max={240}
              value={Math.round(selected.fontSize || 36)}
              onChange={(e) =>
                update({
                  fontSize: Math.max(8, Math.min(240, Number(e.target.value))),
                })
              }
            />
          </>
        )}
        {selected.kind !== "image" && (
          <input
            aria-label={selected.kind === "text" ? "Yazı rengi" : "Şekil rengi"}
            type="color"
            value={selected.fill}
            onChange={(e) => update({ fill: e.target.value })}
          />
        )}
        {selected.kind === "text" && (
          <>
            <button
              aria-label="Kalın"
              aria-pressed={selected.fontWeight === "bold"}
              onClick={() =>
                update({
                  fontWeight:
                    selected.fontWeight === "bold" ? "normal" : "bold",
                })
              }
            >
              <Bold size={17} />
            </button>
            <button
              aria-label="Eğik"
              aria-pressed={selected.fontStyle === "italic"}
              onClick={() =>
                update({
                  fontStyle:
                    selected.fontStyle === "italic" ? "normal" : "italic",
                })
              }
            >
              <Italic size={17} />
            </button>
            <button
              aria-label="Altı çizili"
              aria-pressed={!!selected.underline}
              onClick={() => update({ underline: !selected.underline })}
            >
              <Underline size={17} />
            </button>
            <button
              aria-label="Yazı hizalaması"
              onClick={() =>
                update({
                  textAlign:
                    selected.textAlign === "left"
                      ? "center"
                      : selected.textAlign === "center"
                        ? "right"
                        : "left",
                })
              }
            >
              {selected.textAlign === "left" ? (
                <AlignLeft size={17} />
              ) : selected.textAlign === "right" ? (
                <AlignRight size={17} />
              ) : (
                <AlignCenter size={17} />
              )}
            </button>
          </>
        )}
        <button
          aria-label="Diğer öğe araçları"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          <MoreHorizontal size={20} />
        </button>
        <button aria-label="Seçili öğeyi sil" onClick={remove}>
          <Trash2 size={17} />
        </button>
      </div>
      {more && (
        <div className="selection-more">
          {selected.kind === "text" && (
            <textarea
              aria-label="Yazı içeriği"
              value={selected.text}
              maxLength={2000}
              onChange={(e) => {
                if (e.target.value) update({ text: e.target.value });
              }}
            />
          )}
          <div className="inspector-row">
            <label>
              Döndürme
              <input
                aria-label="Döndürme"
                type="number"
                value={Math.round(selected.angle)}
                onChange={(e) =>
                  update({
                    angle: Math.max(
                      -36000,
                      Math.min(36000, Number(e.target.value)),
                    ),
                  })
                }
              />
            </label>
            <label>
              Ölçek (%)
              <input
                aria-label="Ölçek"
                type="number"
                min={1}
                max={10000}
                value={Math.round(selected.scaleX * 100)}
                onChange={(e) => {
                  const v = Math.max(
                    0.01,
                    Math.min(100, Number(e.target.value) / 100),
                  );
                  update({ scaleX: v, scaleY: v });
                }}
              />
            </label>
          </div>
          <label className="opacity-field">
            Opaklık{" "}
            <output>{Math.round((selected.opacity ?? 1) * 100)}%</output>
            <input
              aria-label="Opaklık"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selected.opacity ?? 1}
              onChange={(e) => update({ opacity: Number(e.target.value) })}
            />
          </label>
          <div className="inspector-layers">
            <button
              aria-label="Yatay çevir"
              aria-pressed={!!selected.flipX}
              onClick={() => update({ flipX: !selected.flipX })}
            >
              <FlipHorizontal2 size={17} />
            </button>
            <button
              aria-label="Dikey çevir"
              aria-pressed={!!selected.flipY}
              onClick={() => update({ flipY: !selected.flipY })}
            >
              <FlipVertical2 size={17} />
            </button>
          </div>
          <div className="object-actions">
            <button onClick={duplicate}>
              <Copy size={16} /> Çoğalt
            </button>
            <button onClick={remove} disabled={selected.locked}>
              <Trash2 size={16} /> Sil
            </button>
            <button
              aria-pressed={!!selected.locked}
              onClick={() => update({ locked: !selected.locked })}
            >
              {selected.locked ? <Unlock size={16} /> : <Lock size={16} />}{" "}
              {selected.locked ? "Kilidi aç" : "Kilitle"}
            </button>
            <hr />
            <button onClick={() => layer("front")}>
              <ArrowUp size={16} /> En öne getir
            </button>
            <button onClick={() => layer("up")}>
              <ArrowUp size={16} /> Bir katman öne getir
            </button>
            <button onClick={() => layer("down")}>
              <ArrowDown size={16} /> Bir katman arkaya gönder
            </button>
            <button onClick={() => layer("back")}>
              <ArrowDown size={16} /> En arkaya gönder
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
