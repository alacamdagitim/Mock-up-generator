import { forwardRef, useEffect, useState } from "react";
import type * as THREE from "three";
import { Preview, type PreviewHandle } from "./Preview";
import {
  createImportedAsset,
  disposeModel,
  loadProductModel,
} from "./productModel";
import type { Presentation } from "./types";

type Loaded = { root: THREE.Group; claimed: boolean; url: string };
export const ProductPreview = forwardRef<
  PreviewHandle,
  {
    modelUrl?: string | null;
    onFaces?: (faces: string[]) => void;
    textures: Record<"front" | "back", HTMLCanvasElement | null>;
    settings: Presentation;
  }
>(({ modelUrl, textures, settings, onFaces }, ref) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [mapping, setMapping] = useState<string[]>([]);
  useEffect(() => {
    setLoaded(null);
    setError("");
    setMapping([]);
    if (!modelUrl) return;
    const controller = new AbortController();
    let active = true,
      owned: Loaded | null = null;
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    loadProductModel(modelUrl, controller.signal)
      .then((root) => {
        if (!active) {
          disposeModel(root);
          return;
        }
        owned = { root, claimed: false, url: modelUrl };
        setLoaded(owned);
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error && error.name !== "AbortError"
              ? error.message
              : "GLB yükleme süresi doldu. Dosya adresini ve CDN erişimini kontrol edin.",
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
      if (owned && !owned.claimed) disposeModel(owned.root);
    };
  }, [modelUrl, retry]);
  if (!modelUrl)
    return <Preview ref={ref} textures={textures} settings={settings} />;
  if (!loaded || loaded.url !== modelUrl)
    return (
      <div
        className="preview-render product-model-state"
        aria-label="Ürünün 3B model önizlemesi"
      >
        {error ? (
          <div role="alert">
            <strong>Ürünün GLB dosyası açılamadı</strong>
            <p>{error}</p>
            <button onClick={() => setRetry((value) => value + 1)}>
              Yeniden dene
            </button>
            <a href={modelUrl} target="_blank" rel="noopener noreferrer">
              Dosyayı aç
            </a>
          </div>
        ) : (
          <div className="render-loading" role="status">
            Ürünün 3B modeli yükleniyor…
          </div>
        )}
      </div>
    );
  return (
    <>
      <Preview
        key={`${modelUrl}:${retry}`}
        ref={ref}
        textures={textures}
        settings={settings}
        assetFactory={(renderer) => {
          loaded.claimed = true;
          const asset = createImportedAsset(loaded.root, renderer);
          // Defer the UI notification until the child effect has completed.
          queueMicrotask(() => {
            setMapping(asset.mappedFaces || []);
            onFaces?.(asset.mappedFaces || []);
          });
          return asset;
        }}
      />
      <div className="product-model-note" role="status">
        {mapping.length
          ? `Ürün GLB’si · Baskı yüzleri: ${mapping.join(", ")}`
          : "Ürün GLB’si · Baskı yüzü eşlemesi gerekli; modelin özgün görünümü gösteriliyor."}
      </div>
    </>
  );
});
