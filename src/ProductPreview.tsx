import { forwardRef, useEffect, useState } from "react";
import type * as THREE from "three";
import { Preview, type PreviewHandle } from "./Preview";
import {
  createImportedAsset,
  disposeModel,
  loadProductModel,
} from "./productModel";
import type { ModelBinding, Presentation } from "./types";
import type { PrintSurfaceOption } from "./productModel";
import { ModelMappingDialog } from "./ModelMappingDialog";

type Loaded = {
  root: THREE.Group;
  claimed: boolean;
  active: boolean;
  url: string;
  key: string;
};
export const ProductPreview = forwardRef<
  PreviewHandle,
  {
    modelUrl?: string | null;
    onFaces?: (faces: string[]) => void;
    binding?: ModelBinding;
    onBindingChange?: (binding?: ModelBinding) => void;
    textures: Record<"front" | "back", HTMLCanvasElement | null>;
    settings: Presentation;
  }
>(
  (
    { modelUrl, textures, settings, onFaces, binding, onBindingChange },
    ref,
  ) => {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [mapping, setMapping] = useState<string[]>([]);
    const [options, setOptions] = useState<PrintSurfaceOption[]>([]);
    const [selected, setSelected] = useState<string>();
    const [mappingOpen, setMappingOpen] = useState(false);
    const [dialogContainer, setDialogContainer] = useState<HTMLElement | null>(
      null,
    );
    const [warning, setWarning] = useState("");
    const [profile, setProfile] = useState("");
    const effectiveBinding =
      modelUrl && binding?.modelUrl === new URL(modelUrl, location.href).href
        ? binding
        : undefined;
    const bindingKey = JSON.stringify(effectiveBinding || null);
    const requestKey = `${modelUrl}:${retry}:${bindingKey}`;
    useEffect(() => {
      setLoaded(null);
      setError("");
      setMapping([]);
      setOptions([]);
      setWarning("");
      setProfile("");
      onFaces?.([]);
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
          owned = {
            root,
            claimed: false,
            active: true,
            url: modelUrl,
            key: requestKey,
          };
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
        if (owned) owned.active = false;
        if (owned && !owned.claimed) disposeModel(owned.root);
      };
    }, [modelUrl, retry, bindingKey]);
    if (!modelUrl)
      return <Preview ref={ref} textures={textures} settings={settings} />;
    if (!loaded || loaded.key !== requestKey)
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
          key={requestKey}
          ref={ref}
          textures={textures}
          settings={settings}
          assetFactory={(renderer) => {
            loaded.claimed = true;
            const asset = createImportedAsset(
              loaded.root,
              renderer,
              effectiveBinding,
            );
            // Defer the UI notification until the child effect has completed.
            queueMicrotask(() => {
              if (!loaded.active) return;
              setMapping(asset.mappedFaces || []);
              setOptions(asset.surfaceOptions || []);
              setSelected(asset.selectedSurface);
              setWarning(asset.mappingWarning || "");
              setProfile(asset.materialProfile || "");
              onFaces?.(asset.mappedFaces || []);
            });
            return asset;
          }}
        />
        <div className="product-model-note" role="status">
          <span>
            {mapping.length
              ? `Canlı 3B · ${mapping.length === 1 ? "Sarım yüzeyi bağlı" : "Ön ve arka yüz bağlı"}`
              : "Baskı yüzeyi henüz bağlı değil. Etiket veya gövde yüzeyini seç."}
          </span>
          {profile === "metal-can" && (
            <small>GLB’de malzeme yok · Metal kutu önizleme profili</small>
          )}
          {warning && <small>{warning}</small>}
          {onBindingChange && (
            <button
              type="button"
              className="model-mapping-trigger"
              onClick={(event) => {
                const owner = event.currentTarget.getRootNode();
                setDialogContainer(
                  (owner instanceof ShadowRoot
                    ? owner
                    : document
                  ).querySelector<HTMLElement>(".online-app") || document.body,
                );
                setMappingOpen(true);
              }}
            >
              {mapping.length
                ? "Baskı yüzeyini değiştir"
                : "Baskı yüzeyini seç"}
            </button>
          )}
        </div>
        {mappingOpen && dialogContainer && onBindingChange && (
          <ModelMappingDialog
            container={dialogContainer}
            modelUrl={modelUrl}
            options={options}
            selected={selected}
            binding={effectiveBinding}
            onClose={() => setMappingOpen(false)}
            onApply={(value) => {
              setMappingOpen(false);
              onBindingChange(value);
            }}
          />
        )}
      </>
    );
  },
);
