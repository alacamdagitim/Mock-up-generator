import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileJson,
  FileText,
  Image,
  Loader2,
  Link2,
} from "lucide-react";
import type { Design, Face, SavedDesign } from "./types";
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

function isSavedRecord(value: unknown): value is SavedDesign {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SavedDesign>;
  return Boolean(
    typeof record.id === "string" &&
    record.id &&
    typeof record.designUrl === "string" &&
    typeof record.previewUrl === "string" &&
    safeRemoteUrl(record.designUrl) &&
    safeRemoteUrl(record.previewUrl),
  );
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

export function ShareExportPanel({
  saved,
  storageConfigured,
  onSave,
  busy = false,
  previewUrl,
  design,
}: {
  saved: SavedDesign | null;
  storageConfigured: boolean;
  onSave: () => Promise<unknown>;
  busy?: boolean;
  previewUrl?: string;
  design: Design;
}) {
  const [record, setRecord] = useState<SavedDesign | null>(
    isSavedRecord(saved) ? saved : null,
  );
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [linkKind, setLinkKind] = useState<"preview" | "design">("preview");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setRecord(isSavedRecord(saved) ? saved : null);
    setCopied(false);
    setMessage("");
  }, [saved, design]);
  const artwork = useArtworkPreview(design, "front", null, "artwork");
  const imageUrl =
    previewUrl || (record ? safeRemoteUrl(record.previewUrl) : "");
  const selectedUrl = record
    ? safeRemoteUrl(
        linkKind === "preview" ? record.previewUrl : record.designUrl,
      )
    : "";
  async function save() {
    if (!storageConfigured || busy || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await onSave();
      if (!mounted.current) return;
      if (isSavedRecord(result)) {
        setRecord(result);
        setMessage("Sunucuya kaydedildi. Dosya bağlantısını paylaşabilirsin.");
      } else
        setError(
          "Paylaşım bağlantısı oluşturulamadı. Sunucu kaydının tamamlanması gerekiyor.",
        );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Sunucuya kaydedilemedi.",
        );
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  async function copy() {
    if (!selectedUrl) return;
    setError("");
    setMessage("");
    try {
      await navigator.clipboard.writeText(selectedUrl);
      if (mounted.current) {
        setCopied(true);
        setMessage("Dosya bağlantısı kopyalandı.");
      }
    } catch {
      if (mounted.current)
        setError(
          "Bağlantı otomatik kopyalanamadı. Bağlantı alanından seçip kopyalayabilirsin.",
        );
    }
  }
  return (
    <>
      <section
        className="studio-render-preview-column export-panel-stage export-panel-share-stage"
        aria-label="Paylaşım önizlemesi"
      >
        <div
          className="export-panel-view-switch"
          role="group"
          aria-label="Paylaşım önizleme görünümü"
        >
          <button
            type="button"
            className={view === "3d" ? "is-active" : ""}
            aria-pressed={view === "3d"}
            onClick={() => setView("3d")}
          >
            3B
          </button>
          <button
            type="button"
            className={view === "2d" ? "is-active" : ""}
            aria-pressed={view === "2d"}
            onClick={() => setView("2d")}
          >
            2B
          </button>
        </div>
        <div className="export-panel-artwork-wrap">
          {view === "3d" && imageUrl ? (
            <img
              className="export-panel-share-preview"
              src={imageUrl}
              alt="Tasarımın 3B önizleme görseli"
            />
          ) : view === "3d" ? (
            <div className="export-panel-empty">
              <Image size={27} aria-hidden="true" />
              <span>3B önizleme görseli henüz hazır değil.</span>
              <button
                type="button"
                className="export-panel-inline-button"
                onClick={() => setView("2d")}
              >
                2B tasarımı görüntüle
              </button>
            </div>
          ) : artwork.loading ? (
            <div className="export-panel-empty" role="status">
              <Loader2
                className="export-panel-spin"
                size={22}
                aria-hidden="true"
              />{" "}
              Tasarım hazırlanıyor
            </div>
          ) : artwork.error ? (
            <div className="export-panel-empty" role="alert">
              {artwork.error}
            </div>
          ) : (
            <img
              className="export-panel-artwork"
              src={artwork.url}
              alt="Tasarımın ön yüzü"
            />
          )}
        </div>
        <div className="export-panel-stage-meta">
          <span>
            {view === "3d" ? "3B önizleme görseli" : "2B tasarım · Ön yüz"}
          </span>
        </div>
      </section>
      <section
        className="studio-render-settings export-panel-settings"
        aria-label="Paylaşım ayarları"
      >
        <div className="export-panel-scroll">
          <h3 className="export-panel-heading">Tasarımını paylaş</h3>
          <p className="export-panel-intro">
            Kaydedilen tasarım dosyasını veya önizleme görselini bağlantıyla
            paylaşabilirsin.
          </p>
          {!storageConfigured && (
            <div className="export-panel-approval-note">
              <strong>Sunucu depolaması bağlı değil</strong>
              <span>
                Şu anda uzaktan erişilebilen paylaşım bağlantısı
                oluşturulamıyor. Tasarımını JSON olarak indirip gönderebilirsin.
                Cihazdaki kayıt bir paylaşım bağlantısı değildir.
              </span>
            </div>
          )}
          {storageConfigured && !record && (
            <div className="export-panel-approval-note">
              <strong>Önce sunucuya kaydet</strong>
              <span>
                Güncel tasarım kaydedildiğinde gerçek dosya bağlantıları burada
                görünür.
              </span>
            </div>
          )}
          {record && (
            <>
              <div className="export-panel-saved">
                <Check size={17} aria-hidden="true" /> Sunucuda kayıtlı{" "}
                <span>{record.id.slice(0, 12)}</span>
              </div>
              <fieldset className="export-panel-fieldset">
                <legend>Paylaşılacak dosya</legend>
                <div className="export-panel-file-options">
                  <button
                    type="button"
                    className={`export-panel-option-card ${linkKind === "preview" ? "is-active" : ""}`}
                    aria-pressed={linkKind === "preview"}
                    onClick={() => {
                      setLinkKind("preview");
                      setCopied(false);
                    }}
                  >
                    <strong>Önizleme görseli</strong>
                    <span>
                      Görüntü olarak açılır. Döndürülebilen 3B sayfa değildir.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`export-panel-option-card ${linkKind === "design" ? "is-active" : ""}`}
                    aria-pressed={linkKind === "design"}
                    onClick={() => {
                      setLinkKind("design");
                      setCopied(false);
                    }}
                  >
                    <strong>Düzenlenebilir tasarım</strong>
                    <span>JSON dosyası; editöre tekrar içe aktarılabilir.</span>
                  </button>
                </div>
              </fieldset>
              <label className="export-panel-link-label">
                Dosya bağlantısı
                <input
                  type="text"
                  value={selectedUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                  spellCheck={false}
                />
              </label>
              <p className="export-panel-note">
                Bağlantıya erişen kişiler dosyayı açabilir. Kişiye özel erişim
                ve davet sistemi henüz bağlı değil.
              </p>
            </>
          )}
        </div>
        <div className="export-panel-footer">
          <div
            className="export-panel-status"
            role={error ? "alert" : "status"}
          >
            {error || message}
          </div>
          {record ? (
            <button
              type="button"
              className="export-panel-primary"
              onClick={() => void copy()}
              disabled={!selectedUrl}
            >
              {copied ? (
                <Check size={19} aria-hidden="true" />
              ) : (
                <Copy size={19} aria-hidden="true" />
              )}
              {copied ? "Bağlantı kopyalandı" : "Bağlantıyı kopyala"}
            </button>
          ) : (
            <button
              type="button"
              className="export-panel-primary"
              onClick={() => void save()}
              disabled={!storageConfigured || busy || saving}
            >
              {saving || busy ? (
                <Loader2
                  size={19}
                  className="export-panel-spin"
                  aria-hidden="true"
                />
              ) : (
                <Link2 size={19} aria-hidden="true" />
              )}
              {saving || busy ? "Kaydediliyor…" : "Kaydet ve bağlantı oluştur"}
            </button>
          )}
          <JsonDownload design={design} />
        </div>
      </section>
    </>
  );
}
