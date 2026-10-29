import { useEffect, useState } from "react";
import App from "./OnlineDesigner";
import type { EditorConfig } from "./types";
import { parseMockupScenes } from "../shared/mockup-scenes.mjs";
export function RemoteMockupEditor({
  config,
  onClose,
  onReady,
}: {
  config: EditorConfig;
  onClose?: () => void;
  onReady?: () => void;
}) {
  const [ready, setReady] = useState<EditorConfig | null>(
      config.mockupApiBase ? null : config,
    ),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!config.mockupApiBase) {
      setReady(config);
      return;
    }
    const abort = new AbortController();
    let active = true;
    const timer = setTimeout(() => abort.abort(), 20000);
    setReady(null);
    setError("");
    async function load() {
      const base = new URL(
        config.mockupApiBase!.replace(/\/$/, "") + "/",
        location.href,
      );
      const local = base.origin === location.origin;
      if (
        (base.protocol !== "https:" && !local) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
      )
        throw Error("PSD katalog servisi HTTPS adresi olmalı.");
      if (!config.productId)
        throw Error("PSD kataloğu için ürün kimliği gerekli.");
      const response = await fetch(
        new URL(`catalog/${encodeURIComponent(config.productId)}`, base),
        { signal: abort.signal, credentials: "omit", mode: "cors" },
      );
      if (!response.ok)
        throw Error(
          "Ürün mockupları yüklenemedi. PSD servis bağlantısını kontrol edin.",
        );
      const raw = await response.text();
      if (raw.length > 2_000_000) throw Error("Mockup kataloğu çok büyük.");
      const catalog = parseMockupScenes(JSON.parse(raw));
      if (!catalog) throw Error("Mockup kataloğu boş yanıt verdi.");
      if (!catalog.scenes.length)
        throw Error(
          "Bu üründe henüz hazır mockup yok. Yönetim panelinden PSD işleme durumunu kontrol edin.",
        );
      if (active)
        setReady({
          ...config,
          products: config.products?.map((p) =>
            String(p.id) === String(config.productId)
              ? { ...p, mockupImages: undefined, mockupScenes: catalog }
              : p,
          ),
          productMockupImages: undefined,
          productMockupScenes: catalog,
        });
    }
    load()
      .catch((e) => {
        if (active)
          setError(
            e.name === "AbortError"
              ? "PSD servisi zamanında yanıt vermedi."
              : e.message || "Mockup kataloğu okunamadı.",
          );
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [config, attempt]);
  useEffect(() => {
    if (ready || error) onReady?.();
  }, [ready, error, onReady]);
  if (ready) return <App config={ready} onClose={onClose} />;
  return (
    <div
      style={{
        padding: 32,
        fontFamily: "Alacam UI, sans-serif",
        color: "#111",
        background: "#f2f3f4",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Editörü kapat"
        style={{ float: "right" }}
      >
        ×
      </button>
      <div
        role={error ? "alert" : "status"}
        style={{ maxWidth: 480, margin: "15vh auto", textAlign: "center" }}
      >
        <h2>
          {error ? "Mockuplar yüklenemedi" : "Ürün mockupları yükleniyor…"}
        </h2>
        <p>{error || "Hazırlanan PSD sahneleri ürününüze göre getiriliyor."}</p>
        {error && (
          <button onClick={() => setAttempt((x) => x + 1)}>Yeniden dene</button>
        )}
      </div>
    </div>
  );
}
