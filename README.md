# Alaçam · Ürün Tasarım Stüdyosu

Shopify ürün sayfasından açılan, ürünün kendi dosyalarıyla çalışan React + TypeScript editörü. Müşteri tasarımını 2D bıçak izi üzerinde düzenler, hazırlanmış fotoğraf mockuplarında veya ürünün GLB modelinde görür, tasarımıyla birlikte ürünü sepete ekler.

Bu depo gerçek ürün entegrasyonudur. Örnek ürün, uydurma varyant/fiyat, demo sayfası ve PSD yükleme yönetim paneli yoktur. Kök adres ürün seçmez; editör Shopify ürün sayfasındaki **Online tasarla** düğmesinden açılır. Müşteriye PSD indirilmez.

## Ürün dosyaları

| Shopify ürün metafield | Tür | Kullanım |
| --- | --- | --- |
| `custom.mockup_gorselleri` | Dosya listesi → Görseller | Yerleşimler panelindeki baskısız fotoğraflar ve sıraları. |
| `custom.mockup_sahneleri` | JSON | Ürünün bütün mockupları için tek hazırlanmış katalog. |
| `custom.3b_glb_dosyasi` | Dosya | Ürünün isteğe bağlı GLB modeli. |
| `custom.bicak_i_zi` | Dosya | Ölçülü üretici şablonu; 2D için SVG. |

On mockup, aynı ürün JSON’unun `scenes` listesinde on sahnedir. Ham JPG tek başına baskı eşlemesi oluşturmaz. PSD’ler bir kez hazırlanır; maske, yüzey eşlemesi ve ışık dosyaları JSON’un işaret ettiği web paketinde tutulur. [Hazırlama yöntemi](docs/MOCKUP-HAZIRLAMA.md).

## Kurulum ve yayın

Node.js 22 kullanın.

```sh
npm ci
npm run dev
npm run build
```

`npm run build`, `dist/` ve Shopify tema varlıklarını `shopify/assets/` altında üretir. Vercel ayarları: **Vite**, Root Directory `./`, Build Command `npm run build`, Output Directory `dist`.

Shopify’da ürün şablonuna bir **Özel Liquid** bloğu ekleyin ve [online-design-vercel.liquid](shopify/custom-liquid/online-design-vercel.liquid) dosyasının tamamını yapıştırın. Editör JavaScript dosyalarını Vercel’den yükler. Ürünün kimliği, dosyaları, seçenekleri, satışa açıklığı, fiyatları ve seçili varyantı Liquid’den gelir; ürün kodda tanımlanmaz.

**Siparişe bağlanabilen kalıcı tasarım kaydı için Vercel’de Private Blob depolaması bağlanmalıdır.** Bağlı değilse düzenleme/indirme kullanılabilir, sepete tasarımla ekleme kapalıdır; yerel taslak sunucu kaydı sayılmaz. [Adım adım Shopify ve depolama kurulumu](docs/SHOPIFY-KURULUM.md).

## Satın alma akışı

Sağdaki sipariş paneli gerçek Shopify seçeneklerini ve mevcut müşteri bağlamındaki fiyatı kullanır. Miktar, geçerli minimum/artış/maksimum kurallarına uyar. Yalnız Shopify’ın bildirdiği miktar fiyatları gösterilir; indirim üretilmez. Paket içindeki fiziksel parça sayısını göstermek için isteğe bağlı tam sayı `custom.paket_ici_adet` alanı kullanılır; varyant tanımı ürün tanımına üstün gelir. Bu bilgi yoksa paket fiyatı parça fiyatı olarak sunulmaz.

**Tasarımla sepete ekle:** JSON ve önizleme önce kalıcı depolamada doğrulanıp kaydedilir. Ardından seçili gerçek varyant ve Shopify sipariş miktarı mağazanın Ajax Cart API’siyle sepete eklenir ve müşteri sepete yönlendirilir. Sepette yalnız tasarım kimliği ve dosya referansları tutulur. Nihai stok, fiyat, indirim, vergi ve ödeme Shopify tarafından belirlenir.

## Mevcut sınırlar

- Mockup hazırlığı ürün başına yapılır; dosyanın adını değiştirmek yeniden yüklemekle aynı değildir. Hazırlanmamış görsel tasarımlı mockup gibi gösterilmez.
- GLB’de UV/baskı yüzü eşlemesi gerekir. Belirsiz modelde parça seçimi yapılır; eksik GLB yerine örnek ürün açılmaz.
- SVG bıçak izi düzenleyicide gösterilir. PDF/AI gibi üretici kaynakları indirilebilir; doğrudan 2D vektör düzenleyici olarak açılmaz.
- Önizleme PNG/JPG, üretim dosyası değildir. Ölçü, taşma/güvenli alan ve üretici baskı şartları doğrulanmadan baskıya hazır iddiası yoktur.
- Taslak tarayıcıya aittir; siparişe eklenmeden önce sunucu kaydı gerekir. Private Blob bağlantısı ve mağaza Liquid güncellemesi mağaza/Vercel hesabından yapılmalıdır.

Fabric.js ve Three.js MIT, React MIT, Lucide ISC, DM Sans OFL lisanslıdır. Tam bildirim [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Pacdora API/SDK bağımlılığı yoktur. Ürün fotoğrafları ve PSD’ler kendi kaynak lisanslarını korur.
