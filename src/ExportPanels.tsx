import { useEffect, useRef, useState } from "react";
import { Download, FileJson, FileText, Image, Loader2 } from "lucide-react";
import type { Design, Face } from "./types";
import {
  artworkDimensions,
  createArtworkExport,
  createArtworkSvg,
  downloadEditableDesign,
  downloadExport,
  exportFilename,
  readExportTemplate,
} from "./exportArtwork";
import type { ArtworkExportFormat, ArtworkExportKind } from "./exportArtwork";

function useArtworkPreview(
  design: Design,
  face: Face,
  template: string | null,
  kind: ArtworkExportKind,
) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    let objectUrl = "";
    setLoading(true);
    setError("");
    setUrl("");
    void createArtworkSvg({ design, face, template, kind, longestEdge: 1400 })
      .then((svg) => {
        if (!current) return;
        objectUrl = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" }),
        );
        setUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (current)
          setError(
            cause instanceof Error ? cause.message : "Önizleme oluşturulamadı.",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [design, face, template, kind]);
  return { url, loading, error };
}

function safeRemoteUrl(value?: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value, location.href);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function JsonDownload({ design }: { design: Design }) {
  return (
    <button
      type="button"
      className="export-panel-secondary"
      onClick={() => downloadEditableDesign(design)}
    >
      <FileJson size={18} aria-hidden="true" /> Düzenlenebilir JSON’u indir
    </button>
  );
}

export function DielineExportPanel({
  design,
  face,
  templateUrl,
  originalUrl,
}: {
  design: Design;
  face: Face;
  templateUrl?: string;
  originalUrl?: string | null;
}) {
  const [kind, setKind] = useState<ArtworkExportKind>("artwork");
  const [format, setFormat] = useState<ArtworkExportFormat>("svg");
  const [longestEdge, setLongestEdge] = useState(2048);
  const [template, setTemplate] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(Boolean(templateUrl));
  const [templateError, setTemplateError] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 700px)").matches,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const query = matchMedia("(max-width: 700px)");
    const resize = () => {
      setMobile(query.matches);
      if (query.matches) setLongestEdge(2048);
    };
    query.addEventListener("change", resize);
    return () => {
      mounted.current = false;
      query.removeEventListener("change", resize);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setTemplate(null);
    setTemplateError("");
    setTemplateLoading(Boolean(templateUrl));
    if (!templateUrl) {
      setKind("artwork");
      return () => controller.abort();
    }
    void readExportTemplate(templateUrl, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setTemplate(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setTemplateError(
            cause instanceof Error ? cause.message : "Bıçak izi okunamadı.",
          );
          setKind("artwork");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTemplateLoading(false);
      });
    return () => controller.abort();
  }, [templateUrl]);
  const preview = useArtworkPreview(design, face, template, kind);
  const { width, height, widthMm, heightMm } = artworkDimensions(design);
  const physical = widthMm && heightMm;
  const original = safeRemoteUrl(originalUrl);
  async function exportFile() {
    if (running || templateLoading) return;
    setRunning(true);
    setError("");
    setStatus("");
    try {
      const blob = await createArtworkExport({
        design,
        face,
        template,
        kind,
        format,
        longestEdge,
      });
      if (!mounted.current) return;
      downloadExport(
        blob,
        `${exportFilename(design.name)}-${face === "front" ? "on" : "arka"}-${kind === "dieline" ? "bicak-izi" : "tasarim"}.${format}`,
      );
      setStatus(
        `${format.toUpperCase()} dosyası indirildi. Üretim onayı verilmemiştir.`,
      );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Dosya oluşturulamadı. Yeniden deneyin.",
        );
    } finally {
      if (mounted.current) setRunning(false);
    }
  }
  return (
    <>
      <section
        className="studio-render-preview-column export-panel-stage export-panel-dieline-stage"
        aria-label="Bıçak izi önizlemesi"
      >
        <div className="export-panel-artwork-wrap">
          {preview.loading || templateLoading ? (
            <div className="export-panel-empty" role="status">
              <Loader2
                className="export-panel-spin"
                size={22}
                aria-hidden="true"
              />{" "}
              Önizleme hazırlanıyor
            </div>
          ) : preview.error ? (
            <div className="export-panel-empty" role="alert">
              {preview.error}
            </div>
          ) : (
            <img
              className="export-panel-artwork"
              src={preview.url}
              alt={`${face === "front" ? "Ön" : "Arka"} yüz · ${kind === "artwork" ? "tasarım ve bıçak izi" : "yalnız bıçak izi"}`}
            />
          )}
        </div>
        <div className="export-panel-stage-meta">
          <span>{face === "front" ? "Ön yüz" : "Arka yüz"}</span>
          <span>
            {physical
              ? `${Number(widthMm.toFixed(2))} × ${Number(heightMm.toFixed(2))} mm`
              : `${width} × ${height} tasarım birimi`}
          </span>
        </div>
      </section>
      <section
        className="studio-render-settings export-panel-settings"
        aria-label="Bıçak izi dışa aktarma ayarları"
      >
        <div className="export-panel-scroll">
          <fieldset className="export-panel-fieldset">
            <legend>Dosya içeriği</legend>
            <div className="export-panel-file-options">
              <button
                type="button"
                className={`export-panel-option-card ${kind === "artwork" ? "is-active" : ""}`}
                aria-pressed={kind === "artwork"}
                onClick={() => setKind("artwork")}
                disabled={running}
              >
                <strong>Tasarımlı şablon</strong>
                <span>Tasarımın ve varsa bıçak izi katmanı birlikte.</span>
              </button>
              <button
                type="button"
                className={`export-panel-option-card ${kind === "dieline" ? "is-active" : ""}`}
                aria-pressed={kind === "dieline"}
                onClick={() => setKind("dieline")}
                disabled={running || !template}
              >
                <strong>Yalnız bıçak izi</strong>
                <span>Tasarım eklenmeden ürünün SVG şablonu.</span>
              </button>
            </div>
            {templateError && (
              <p className="export-panel-note export-panel-error" role="alert">
                {templateError}
              </p>
            )}
            {!templateUrl && (
              <p className="export-panel-note">
                Bu ürün için SVG bıçak izi yüklenmedi. Tasarım görselini ve JSON
                dosyasını indirebilirsin.
              </p>
            )}
            {original && (
              <a
                className="export-panel-original-link"
                href={original}
                target="_blank"
                rel="noopener noreferrer"
              >
                Orijinal bıçak izini aç <span aria-hidden="true">↗</span>
              </a>
            )}
          </fieldset>
          <fieldset className="export-panel-fieldset">
            <legend>Renk modu</legend>
            <div className="export-panel-segment">
              <button type="button" className="is-active" aria-pressed="true">
                RGB
              </button>
              <button
                type="button"
                disabled
                title="Üretici ICC profili ile renk dönüşümü henüz bağlı değil."
              >
                CMYK
              </button>
            </div>
            <p className="export-panel-note">
              CMYK için üreticinin ICC profili ve baskı iş akışı gerekir.
            </p>
          </fieldset>
          <fieldset className="export-panel-fieldset">
            <legend>Dosya biçimi</legend>
            <div className="export-panel-segment">
              {(["svg", "pdf", "png"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={format === value ? "is-active" : ""}
                  aria-pressed={format === value}
                  onClick={() => setFormat(value)}
                  disabled={running}
                >
                  {value === "svg" ? (
                    <FileText size={17} aria-hidden="true" />
                  ) : value === "png" ? (
                    <Image size={17} aria-hidden="true" />
                  ) : (
                    <FileText size={17} aria-hidden="true" />
                  )}
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="export-panel-note">
              {format === "svg"
                ? "SVG’de tasarım gömülü PNG, bıçak izi ayrı SVG katmanıdır."
                : format === "pdf"
                  ? "PDF, yüksek çözünürlüklü RGB görsel içerir; düzenlenebilir vektör PDF değildir."
                  : "PNG, tasarımın düz görsel çıktısıdır."}{" "}
              AI biçimi desteklenmiyor.
            </p>
          </fieldset>
          <fieldset className="export-panel-fieldset">
            <legend>
              {format === "svg"
                ? "Gömülü görsel çözünürlüğü"
                : "Görsel çözünürlüğü"}
            </legend>
            <div className="export-panel-segment">
              {[2048, 4096].map((size) => (
                <button
                  type="button"
                  key={size}
                  className={longestEdge === size ? "is-active" : ""}
                  aria-pressed={longestEdge === size}
                  onClick={() => setLongestEdge(size)}
                  disabled={running || (mobile && size > 2048)}
                >
                  {size === 2048 ? "2K" : "4K"}
                </button>
              ))}
            </div>
            <p className="export-panel-note">
              Uzun kenar {longestEdge.toLocaleString("tr-TR")} px.{" "}
              {mobile
                ? "Mobilde bellek kullanımı için 2K sınırı uygulanır. "
                : ""}
              Düşük çözünürlüklü kaynak görsellerde yeni ayrıntı oluşturulmaz.
            </p>
          </fieldset>
          <div className="export-panel-approval-note">
            <strong>Üretim onayı yok</strong>
            <span>
              {physical
                ? "Şablonun tanımlı ölçüleri korunur. "
                : "Üreticiden doğrulanmış fiziksel ölçü bulunmuyor. "}
              Taşma payı, kesim çizgileri ve renkler üretici tarafından kontrol
              edilmelidir.
            </span>
          </div>
        </div>
        <div className="export-panel-footer">
          <div
            className="export-panel-status"
            role={error ? "alert" : "status"}
          >
            {error || status}
          </div>
          <button
            type="button"
            className="export-panel-primary"
            onClick={() => void exportFile()}
            disabled={running || templateLoading || Boolean(preview.error)}
          >
            {running ? (
              <Loader2
                size={19}
                className="export-panel-spin"
                aria-hidden="true"
              />
            ) : (
              <Download size={19} aria-hidden="true" />
            )}
            {running
              ? "Dosya hazırlanıyor…"
              : `${format.toUpperCase()} olarak indir`}
          </button>
          <JsonDownload design={design} />
        </div>
      </section>
    </>
  );
}
