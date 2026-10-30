# Alaçam · Ürün Tasarım Stüdyosu

Shopify ürün sayfasından açılan, ürünün kendi dosyalarıyla çalışan React + TypeScript editörü. Müşteri tasarımını 2D bıçak izi üzerinde düzenler, hazırlanmış fotoğraf mockuplarında veya ürünün GLB modelinde görür; seçtiği varyantı normal Shopify ürünü olarak sepete ekler.

Örnek ürün, uydurma varyant/fiyat, demo sayfası ve PSD yükleme yönetim paneli yoktur. Kök adres ürün seçmez; editör Shopify ürün sayfasındaki **Online tasarla** düğmesinden açılır. Müşteriye PSD indirilmez.

## Ürün dosyaları

| Shopify ürün metafield | Tür | Kullanım |
| --- | --- | --- |
| `custom.mockup_gorselleri` | Dosya listesi → Görseller | Yerleşimler panelindeki baskısız fotoğraflar ve sıraları. |
| `custom.mockup_sahneleri` | JSON | Ürünün bütün mockupları için tek hazırlanmış katalog. |
| `custom.3b_glb_dosyasi` | Dosya | Ürünün isteğe bağlı GLB modeli. |
| `custom.bicak_i_zi` | Dosya | Ölçülü üretici şablonu; 2D için SVG. |

On mockup, aynı ürün JSON’unun `scenes` listesinde on sahnedir. PSD’ler bir kez hazırlanır; maske, yüzey eşlemesi ve ışık dosyaları JSON’un işaret ettiği web paketinde tutulur. Ham JPG tek başına baskı eşlemesi oluşturmaz. [Hazırlama yöntemi](docs/MOCKUP-HAZIRLAMA.md).

## Kurulum ve yayın

Node.js 22 kullanın.

```sh
npm ci
npm run dev
npm run build
```

Derleme `dist/` ve tema varlıklarını `shopify/assets/` altında üretir. Vercel ayarları: **Vite**, Root Directory `./`, Build Command `npm run build`, Output Directory `dist`.

Shopify’da ürün şablonuna bir **Özel Liquid** bloğu ekleyin ve [online-design-vercel.liquid](shopify/custom-liquid/online-design-vercel.liquid) dosyasının tamamını yapıştırın. JavaScript Vercel’den yüklenir. Ürünün kimliği, dosyaları, seçenekleri, satışa açıklığı, fiyatları ve seçili varyantı mevcut üründen gelir; ürün kodda tanımlanmaz. [Shopify kurulumu](docs/SHOPIFY-KURULUM.md).

**Bu sürüm ek depolama, Blob veya PSD sunucusu gerektirmez.** Taslak yalnız müşterinin cihazında tutulur. PNG/JPG ve düzenlenebilir JSON indirilebilir. Tasarım sunucuya kaydedilmez ve siparişe bağlanmaz.

## Satın alma ve fiyat hesabı

Sağdaki panel gerçek Shopify seçeneklerini kullanır. **Varyant fiyatı seçilen paketin/adet seçeneğinin toplamıdır.** Örneğin `Adet = 1000`, varyant fiyatı 3000 TL ise bir paket 3000 TL, adet başı 3 TL’dir. Sepet miktarı 2 seçilirse iki paket, 2000 adet ve 6000 TL hesaplanır. Shopify’a gönderilen sepet miktarı `2` olur; `2000` gönderilmez.

Fiziksel adet, yalnız `Adet`, `Miktar`, `Quantity` veya `Sipariş adedi` gibi açık miktar seçeneklerinden ve kesin tam sayı değerlerinden okunur. Boyut, ürün adı ve belirsiz aralıklar adet sayılmaz. İsteğe bağlı tam sayı `custom.paket_ici_adet` alanı veya Shopify count ölçüsü varsa önceliklidir; yeni metafield zorunlu değildir.

**Sepete ekle**, gerçek varyantı ve paket sayısını Shopify sepetine ekler, müşteriyi mağazanın sepet sayfasına götürür. Tasarım dosyası veya kimliği gönderilmez. Nihai stok, fiyat, indirim, vergi ve ödeme Shopify tarafından belirlenir.

## Mevcut sınırlar

- Hazırlanmamış görsel tasarımlı mockup gibi gösterilmez. Dosya adını değiştirmek yeni görsel yüklemekle aynı değildir.
- GLB’de UV/baskı yüzü eşlemesi gerekir. Belirsiz modelde parça seçimi yapılır; eksik GLB yerine örnek ürün açılmaz.
- SVG bıçak izi düzenleyicide gösterilir. PDF/AI kaynakları indirilebilir; doğrudan 2D vektör düzenleyici olarak açılmaz.
- Önizleme PNG/JPG, üretim dosyası değildir. Ölçü, taşma/güvenli alan ve üretici baskı şartları doğrulanmadan baskıya hazır iddiası yoktur.
- Tarayıcı verileri silinirse yerel taslak kaybolabilir; JSON yedeği indirilebilir. Siparişe otomatik tasarım teslimi bu sürümün kapsamında değildir.

Fabric.js ve Three.js MIT, React MIT, Lucide ISC, DM Sans OFL lisanslıdır. Tam bildirim [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Pacdora API/SDK bağımlılığı yoktur. Ürün fotoğrafları ve PSD’ler kaynak lisanslarını korur.
