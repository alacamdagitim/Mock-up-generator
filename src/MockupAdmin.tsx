import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./mockup-admin.css";
type Job = {
  id: string;
  name: string;
  status: string;
  message: string;
  backgroundEditable: boolean;
};
const labels: Record<string, string> = {
  queued: "Sırada",
  processing: "Hazırlanıyor",
  ready: "Hazır",
  review: "İnceleme gerekli",
  error: "Hata",
};
function Admin() {
  const [api, setApi] = useState(
      localStorage.getItem("alacam:psd:api") ||
        (["localhost", "127.0.0.1"].includes(location.hostname)
          ? "/mockup-worker"
          : ""),
    ),
    [token, setToken] = useState(""),
    [product, setProduct] = useState(""),
    [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [connected, setConnected] = useState(false);
  const xhr = useRef<XMLHttpRequest | null>(null),
    input = useRef<HTMLInputElement>(null),
    mounted = useRef(true);
  const base = () => {
    if (!api.trim())
      throw Error(
        "PSD servis adresini tanımlayın. Bu panelin dosya işleyebilmesi için çalışan PSD servisi gerekli.",
      );
    const u = new URL(api.replace(/\/$/, "") + "/", location.href);
    if (
      (u.protocol !== "https:" && u.origin !== location.origin) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw Error("Servis HTTPS adresi veya yerel proxy yolu olmalı.");
    return u.href.replace(/\/$/, "");
  };
  const validProduct = () => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(product))
      throw Error(
        "Shopify ürün kimliğini girin. Yönetici ürün adresindeki son sayı.",
      );
    return product;
  };
  async function request(path: string, options: RequestInit = {}) {
    const r = await fetch(base() + path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
      credentials: "omit",
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      let m = "Servis yanıt vermedi.";
      try {
        m = (await r.json()).error || m;
      } catch {}
      throw Error(m);
    }
    return r.status === 204 ? null : r.json();
  }
  async function refresh() {
    try {
      const data = await request(
        `/admin/products/${encodeURIComponent(validProduct())}`,
      );
      if (mounted.current) {
        setJobs(data.jobs);
        setConnected(true);
        setError("");
        localStorage.setItem("alacam:psd:api", api);
      }
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setConnected(false);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      xhr.current?.abort();
    };
  }, []);
  useEffect(() => {
    setConnected(false);
    setJobs([]);
    setError("");
  }, [api, token, product]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      void refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [connected, api, token, product]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = Array.from(files);
    if (list.length > 10) {
      setError("Bir seferde en fazla 10 PSD seçin.");
      return;
    }
    if (
      list.some(
        (f) =>
          !f.name.toLowerCase().endsWith(".psd") ||
          f.size > 256 * 1024 * 1024 ||
          f.size < 26,
      )
    ) {
      setError("Her dosya .psd olmalı ve 256 MB sınırını aşmamalı.");
      return;
    }
    try {
      validProduct();
      base();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        await new Promise<void>((resolve, reject) => {
          const r = new XMLHttpRequest();
          xhr.current = r;
          r.open(
            "POST",
            `${base()}/admin/products/${encodeURIComponent(product)}/import?name=${encodeURIComponent(f.name)}`,
          );
          r.timeout = 600000;
          r.setRequestHeader("Content-Type", "application/octet-stream");
          r.setRequestHeader("Authorization", `Bearer ${token}`);
          r.upload.onprogress = (e) => {
            if (mounted.current)
              setProgress(
                `${i + 1}/${list.length} · ${f.name} · %${e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : 0}`,
              );
          };
          r.onload = () => {
            if (r.status >= 200 && r.status < 300) resolve();
            else {
              let m = "Yükleme tamamlanamadı.";
              try {
                m = JSON.parse(r.responseText).error || m;
              } catch {}
              reject(Error(m));
            }
          };
          r.onerror = () => reject(Error("Yükleme bağlantısı kesildi."));
          r.ontimeout = () => reject(Error("Yükleme süresi doldu."));
          r.onabort = () => reject(Error("Yükleme iptal edildi."));
          r.send(f);
        });
        await refresh();
      }
      setProgress("Dosyalar alındı. İşleme durumları aşağıda güncellenir.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      xhr.current = null;
      if (input.current) input.current.value = "";
    }
  }
  async function remove(job: Job) {
    try {
      await request(`/admin/jobs/${job.id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function preview() {
    try {
      const b = base();
      validProduct();
      const url = new URL("/psd-product-demo.html", location.href);
      url.searchParams.set("api", b);
      url.searchParams.set("product", product);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="psd-admin">
      <header>
        <span className="psd-logo">A</span>
        <div>
          <h1>Mockup yönetimi</h1>
          <p>
            Ürünü seç, PSD’leri yükle. Hazırlanan sahneler editörde otomatik
            görünür.
          </p>
        </div>
      </header>
      <section className="psd-connection">
        <h2>Ürün ve servis bağlantısı</h2>
        <div className="psd-fields">
          <label>
            PSD servis adresi
            <input
              value={api}
              onChange={(e) => setApi(e.target.value)}
              disabled={busy}
              placeholder="https://mockup-servisi.example.com"
            />
          </label>
          <label>
            Yönetici anahtarı
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
            <small>Bu oturumda kullanılır; tarayıcıya kaydedilmez.</small>
          </label>
          <label>
            Shopify ürün kimliği
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value.trim())}
              disabled={busy}
              placeholder="10215813808434"
            />
            <small>Shopify yönetici ürün adresinin sonundaki sayı.</small>
          </label>
        </div>
        <button
          disabled={busy || !token || !product}
          onClick={() => void refresh()}
        >
          Ürünü aç
        </button>
        {connected && (
          <span className="psd-connected">Ürün bağlantısı hazır</span>
        )}
      </section>
      <section className="psd-upload">
        <div>
          <h2>PSD dosyalarını ekle</h2>
          <p>Bir seferde 10 dosya · Dosya başına en fazla 256 MB</p>
          <p>
            Kaynak PSD’ler müşteriye gönderilmez. Uyumlu katmanlar ve baskı
            alanları sunucuda bir kez hazırlanır.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".psd"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
        <button
          disabled={busy || !connected}
          onClick={() => input.current?.click()}
        >
          PSD’leri seç ve yükle
        </button>
        {busy && (
          <button className="secondary" onClick={() => xhr.current?.abort()}>
            Yüklemeyi iptal et
          </button>
        )}
        <p role="status">{progress}</p>
      </section>
      {error && (
        <p role="alert" className="psd-error">
          {error}
        </p>
      )}
      <section>
        <div className="psd-section-head">
          <h2>
            Ürün mockupları{" "}
            <small>
              {jobs.filter((j) => j.status === "ready").length} hazır /{" "}
              {jobs.length} dosya
            </small>
          </h2>
          <button
            className="secondary"
            disabled={!jobs.some((j) => j.status === "ready")}
            onClick={() => void preview()}
          >
            Editörde dene ↗
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="psd-empty">
            Henüz mockup yok. Ürünü açıp PSD dosyalarını ekleyin.
          </div>
        ) : (
          <ul className="psd-jobs">
            {jobs.map((j) => (
              <li key={j.id}>
                <div>
                  <strong>{j.name}</strong>
                  <p>{j.message}</p>
                  {j.status === "ready" && (
                    <small>
                      {j.backgroundEditable
                        ? "Arka plan rengi düzenlenebilir"
                        : "Arka plan kaynak görselde sabit"}
                    </small>
                  )}
                </div>
                <span data-status={j.status}>
                  {labels[j.status] || j.status}
                </span>
                <button
                  className="secondary"
                  aria-label={`${j.name} kaldır`}
                  disabled={busy || ["queued", "processing"].includes(j.status)}
                  onClick={() => void remove(j)}
                >
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer>
        İlk otomatik sürüm: RGB/8 bit, gömülü Smart Object,
        perspektif/Bézier/quilt eşleme ve temel karışım modları. Karmaşık
        gruplar ve desteklenmeyen efektler “İnceleme gerekli” olarak
        işaretlenir. Hazır mockup bir sunum görselidir.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("mockup-admin")!).render(<Admin />);
