# Alaçam · Online Tasarım Editörü

Bu sürüm yalnızca ürünün **Online Design / Online tasarla** eyleminden sonra açılan editörü uygular. Ürün kataloğu, ayrı mockup stüdyosu ve Kütüphane arayüzü yoktur. **Yerleşim**, bu editörün içinde 3D sunum düzenlerini açar. Eski sürüm kopyaları ve yinelenen arşivler temizlenmiştir. Referans: kullanıcının gösterdiği Pacdora API demosunun Online Design ekranının genel düzeni ve akışı. Pacdora SDK/API, kaynak kodu, marka, hazır tasarım veya lisanslı model kullanılmaz.

React + TypeScript, Fabric.js ve Three.js ile çalışır. İlk ürün özgün, yaklaşık beyaz doypack'tir. Referansta görülen kutu modeli, açma/kapama animasyonu ve gerçek kutu bıçak izi bu projeye alınmadı. Doypack ölçüsü 140 × 210 mm örnektir.

## Kurulum

Node 20.11+ ve WebGL destekli tarayıcı gerekir.

```sh
npm ci
npm run dev
```

Yerel adres: `http://127.0.0.1:5184/`. Doğrudan 2D editör açılır. Sunucu olmadan görsel/yazı düzenleme, 3D, örnek SVG, PNG, düzenlenebilir JSON ve yerel kayıt çalışır. Sepete ekleme için gerçek Shopify varyantı ve kalıcı sunucu depolaması gerekir.

Düğmeden açılışı denemek için `http://127.0.0.1:5184/launcher-demo.html` adresini açın. **Online design**, aynı sayfanın üzerinde tam ekran editör açar; X/Escape ürün sayfasına döner. Bu sayfadaki ürün/varyant kimlikleri yalnız demo içindir; Shopify için gerçek verileri hazır [Custom Liquid düğmesi](docs/SHOPIFY-BUTON.md) aktarır.

```sh
npm test
npm run build
```

Derleme `dist/alacam-editor.js` ve Shopify'a kopyalanacak `shopify/assets/` dosyalarını üretir. CSS JavaScript içinde Shadow DOM'a yüklenir; tema stilleriyle iki yönde yalıtılır. Büyük bundle uyarısı sürer; Three.js/Fabric ilk yükleme maliyeti vardır.

Tarayıcı akışlarını test etmek için Vite açıkken:

```sh
npx playwright install chromium
npm run test:workspace
npm run test:preview
npm run test:render
npm run test:exports
npm run test:high-resolution
npm run test:render-snapshot
npm run test:denoise
```

Özel Chromium yolu için `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, test sunucusu için `ALACAM_TEST_URL` kullanılabilir. Tarayıcı testleri izole yerel depolama ve API taklitleri kullanır; gerçek Shopify sepetine veya kullanıcının açık sekmelerine yazmaz. `test:render`, render motorunu taklit etmeden gerçek 1024 px PNG hesaplar; GPU'ya göre birkaç dakika sürebilir. Gerekirse `ALACAM_RENDER_TIMEOUT_MS=300000` ile süre sınırı artırılır.

## Editör akışı

- Üstte tasarım adı, **3D / 2D**, **Render al**, **Şablonu indir**, **Görsel yükle**, PNG/JSON menüsü ve kapatma düğmesi bulunur.
- **Render al**, büyük önizleme ve sağ ayarlar sütunuyla açılır. **Görsel / Bıçak izi / Paylaş** sekmeleri bulunur. Ayrı WebGL2 path tracing motoru PNG/JPG, 1K/2K/4K/8K, 64/256 ışık örneği, üç ışık düzeni, gölge seçimi ve kare/dikey/yatay oran sunar. Mobilde 1K sınırı vardır. 4K/8K gerçek kamera parçalarıyla hesaplanır; ilerleme, iptal, hata ve indirme gerçek işten gelir. Bıçak izi sekmesi SVG/PNG/RGB PDF ve düzenlenebilir JSON indirir. Paylaşım, yapılandırılmış sunucudan gelen gerçek dosya bağlantılarını kullanır. Ayrıntılar: [Stüdyo render](docs/RENDER.md).
- Solda API demosundaki İngilizce görünür etiketlerle **Inspirations / Uploads / Text / Background / Shapes / Layout** vardır. 16 örnek bu proje için özgün hazırlanmıştır; seçili yüzü değiştirir, geri alınabilir. Erişilebilirlik ve entegrasyon etiketleri Türkçe tutulur.
- 2D modunda merkezde ölçülü yüz, sağ üstte canlı 3D, altında ürün ayarları vardır. 3D modunda model ana alanı kaplar; sol içerik paneli kapanır, araçlardan tekrar açılabilir.
- **Yerleşim** panelinde Tek ürün, Ön ve yan, Ön ve arka, Eğik ikili, İkili, Üçlü seri, Yelpaze, Kademeli, Vitrin, Beşli seri ve Katalog vardır. Seçim gerçek 3D sahnesini değiştirir; mesafe ayarlanabilir. 2D modunda tek yüz gösterilir, seçili yerleşim korunur. Yerleşim ve mesafe JSON/yerel taslakta saklanır; geri alınabilir ve PNG önizlemeye yansır. Kompozisyondaki ürün kopyaları sipariş adedini değiştirmez.
- Ön ve arka yüzler bağımsızdır. **Yüzey rengi** seçicisi HSV, HEX, önerilen renkler ve desteklenen tarayıcılarda ekran renk seçicisiyle seçili yüzü değiştirir; tek sürükleme tek geri alma adımıdır. Yükleme PNG/JPG için 8 MB, SVG için 1 MB sınırındadır. SVG temizlenip yerel raster dokuya dönüştürülür; betik, harici görsel/bağlantı ve animasyon kabul edilmez. AI/PDF görsel içe aktarma yoktur.
- Öğeler taşınır, ölçeklenir, döndürülür ve silinir. Seçili öğe araçları tuval üzerinde açılır. Yazıda içerik, DM Sans ve dört sistem fontu, boyut, renk, hizalama, kalın/italik/altı çizili; öğelerde dönüş, ölçek, saydamlık, yatay/dikey çevirme, çoğaltma, kilitleme ve dört katman sırası işlemi vardır. Üç nokta menüsü ayrıntıları açar. Katman listesi sol panelin altında açılır.
- Tuval çubuğunda seçim, kaydırma, geri al/yinele, silme, zoom, ekrana sığdırma ve baskı/güvenli alan kılavuzları vardır. `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` ve Delete/Backspace desteklenir.
- Baskı alanı dışındaki öğeler dokuda kırpılır. Görsel çözünürlüğü örnek baskı ölçüsüne göre hesaplanır, 300 DPI altı uyarılır.
- Ambalajın temel rengi iki yüzü birlikte değiştirir. Mat/parlak ayarı yalnızca önizleme malzemesini değiştirir; satış ürününün gerçek malzemesini değiştirmez.
- **Save** editörü kapatmaz. Başarı/hata bildirir. Sunucu bağlı değilse düğmenin altında **Saves to this device only** yazar. X editörü kapatır; yerel taslağı silmez. Geri açmak için tek ürünün **Online tasarla** düğmesi görünür.
- Mobilde üstteki aynı 2D/3D geçişi kullanılır. Altı araç yataydır; içerik paneli açılır kapanır. Başlıktaki ayar düğmesi ürün/sipariş kartını açar. Mobilde 2D ve 3D aynı anda render alanı olarak gösterilmez.

Taslak 650 ms gecikmeyle localStorage'a yazılır; yenilemede desteklenen v1 JSON geri yüklenir. Kaydet ayrıca düzenlenebilir tasarımı ve küçük resmi IndexedDB'de saklar. Eski Kütüphane ekranı kaldırıldı; eski kayıtlar topluca silinmez. Kalıcı kişisel dosya kütüphanesi veya bulut proje listesi yoktur. Görsel galerisi mevcut tasarımdaki görselleri ve son 24 oturum yüklemesini gösterir. Tarayıcı verileri silinirse yerel kayıtlar kaybolur; JSON yedeği alınmalıdır.

## Shopify kurulumu

**Vercel yayını üzerinden düğmeyle açılış:** `shopify/custom-liquid/online-design-vercel.liquid` dosyasının tamamını ürün şablonundaki Custom Liquid bloğuna yapıştırın. Mevcut Vercel adresi dosyada hazırdır; editör varlıkları buradan yüklenir. Kalıcı kayıt API'si bu dağıtımda henüz kurulu değildir; Save yalnız cihaz kaydıdır. Ayrıntılar: [Vercel Custom Liquid](docs/SHOPIFY-BUTON.md#vercel-yayınıyla-hazır-custom-liquid).

**Ürün sayfasında düğmeyle tam ekran açılış:** [Custom Liquid / Online design kurulumu](docs/SHOPIFY-BUTON.md). `shopify/custom-liquid/online-design-button.liquid` dosyasının tamamını temanın Custom Liquid bloğuna yapıştırabilirsiniz; önce derlenmiş dosyalar tema `assets/` dizinine yüklenmelidir. Alternatif olarak aynı işlevi snippet ile çağırabilirsiniz.

**Sayfaya doğrudan editör ekleme:** Normal sayfanın içerik/metin kutusuna kod yapıştırılmaz. `npm run build` sonrası dosyaları tema kod düzenleyicisinden yerleştirin:

| Proje dosyası                                    | Shopify teması                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `shopify/assets/alacam-editor.js`                | `assets/alacam-editor.js`                                                             |
| `shopify/assets/alacam-launcher.js`              | `assets/alacam-launcher.js`; Online design düğmesini ve tam ekran açılışı yönetir. |
| `shopify/assets/alacam-*.js`                     | Diğer bütün JavaScript parçaları da aynı `assets/` klasörüne; render motoru ilk açılışta bunlardan yüklenir. |
| `shopify/assets/alacam-licenses.txt`             | `assets/alacam-licenses.txt`                                                          |
| `shopify/assets/alacam-dm-sans-*.woff2`          | Aynı adlarla `assets/` klasörü; fontlar yerel sunulur, harici font servisi çağrılmaz. |
| `shopify/assets/alacam-layout-*.webp`            | Aynı adlarla `assets/` klasörü; tüm üretilen WebP dosyalarını kopyalayın.             |
| `shopify/sections/alacam-tasarim-editoru.liquid` | `sections/alacam-tasarim-editoru.liquid`                                              |
| `shopify/templates/page.alacam-editor.json`      | `templates/page.alacam-editor.json`                                                   |

1. Shopify'da bir sayfa oluşturup `page.alacam-editor` şablonunu seçin veya uyumlu sayfa/ürün şablonuna **Alaçam Tasarım Editörü** section'ını ekleyin.
2. Section ayarında baskısız doypack ürününü seçin. Ürün şablonunda seçim yapılmazsa mevcut `product` kullanılır. Yalnızca seçili ürünün adı, kimliği ve varyantları editöre aktarılır; ürün listesi/katalog ayarı yoktur.
3. Herkese erişilebilir HTTPS API adresini section ayarına girin, örneğin `https://design-api.magazaniz.com/api`.
4. Gerçek üretici şablonunu bağlamak için ürün meta alanı `custom.alacam_dieline`, tür **Dosya**, tanımlayın. Üreticinin orijinal dosyasını seçin. Editör HTTPS dosya bağlantısını açar; PDF/SVG içeriğini otomatik olarak baskı alanına veya UV eşlemesine dönüştürmez.
5. Gerçek mağazada varyant, yerelleştirilmiş sepet kökü, API origin/CORS, kayıt ve sepet özelliklerini test edin. Bu teslimatta gerçek mağazaya dağıtım yapılmadı.

Sepet akışı önce tasarım JSON'unu ve PNG'yi sunucuda kaydeder, sonra Shopify Ajax Cart API üzerinden seçili varyantı ekler. Line item properties yalnızca `_alacam_design_id`, `_alacam_design_url`, `_alacam_preview_url` ve görünür `Tasarım` referansını içerir. Artwork/JSON/base64 sepete yazılmaz. Fiyat veya teslim süresi uydurulmaz; mevcut kart bu değerleri göstermez. Tarayıcıda Admin API anahtarı veya depolama sırrı bulunmaz.

Tema içinde eyleme bağlamak için editör kökünden Shadow DOM dışına çıkan olaylar vardır:

```js
document.addEventListener("alacam:design-saved", (event) => {
  // scope === 'server': id, designUrl, previewUrl
  // scope === 'device': localId; sunucu kaydı olarak kullanmayın.
  console.log(event.detail);
});
document.addEventListener("alacam:close", (event) => {
  // Tema burada kendi editör kapsayıcısını kapatabilir.
  // detail.productId seçili Shopify ürünüdür.
});
```

Section doğrudan editörü gösterir. Düğmeden aynı sayfada tam ekran açılan akış için `alacam-launcher.js` ve [hazır Custom Liquid / snippet](docs/SHOPIFY-BUTON.md) kullanılır; ayrı bir Shopify uygulaması veya Pacdora SDK anahtarı gerekmez.

## Sunucu ve ortam değişkenleri

```sh
cp .env.example .env
npm run server
```

Örnek yerel yapılandırma:

```dotenv
PORT=3001
DESIGN_STORAGE_DIR=./data/designs
PUBLIC_BASE_URL=http://127.0.0.1:3001
ALLOWED_ORIGINS=http://127.0.0.1:5184
```

| Ayar                 | Açıklama                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `PORT`               | API portu, varsayılan 3001.                                             |
| `DESIGN_STORAGE_DIR` | Kalıcı, yazılabilir ve yedeklenen dizin. Boşsa sunucu kaydı devre dışı. |
| `PUBLIC_BASE_URL`    | API origin'i, sonunda `/api` olmaz. Üretimde HTTPS gerekir.             |
| `ALLOWED_ORIGINS`    | Tam mağaza origin'leri, virgülle ayrılır.                               |
| Section `api_base`   | İstemcinin eriştiği adres, sonunda `/api` olur. Gizli değildir.         |

Vite `/api` isteklerini yerel 3001 portuna yönlendirir. API uçları:

| Uç                                 | İşlev                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/health`                  | `storageConfigured` durumunu bildirir.                                                     |
| `POST /api/designs`                | Doğrulanmış tasarım JSON'u ve PNG önizlemeyi saklar; kimlik ve referans URL'leri döndürür. |
| `GET /api/designs/:id/design.json` | Düzenlenebilir tasarım.                                                                    |
| `GET /api/designs/:id/preview.png` | Ekran önizlemesi.                                                                          |

Sunucu ilk sürümde kalıcı dosya sistemi kullanır. Geçici container diski uygun değildir; çoklu instance için paylaşılan kalıcı depolama veya S3 uyumlu adapter gerekir. URL'ler rastgele kimliklidir, bağlantıya sahip olan dosyayı okuyabilir. CORS kimlik doğrulama değildir. Üretim erişim politikanıza göre imzalı bağlantı, oturum doğrulaması veya Shopify App Proxy doğrulaması ayrıca eklenmelidir. Var olmayan bir doğrulama uygulanmış gibi gösterilmez.

## Model, şablon ve üretim sınırı

Özgün yaklaşık GLB ve SVG paketi `public/product-assets/doypack-v1-r1/` altındadır. `npm run assets:generate` aynı kaynak geometriden yeniden üretir. Açıklama: `docs/MODEL-VE-SABLON-DOSYALARI.md`.

- Canlı editör `custom.3b_glb_dosyasi` doluysa ürün GLB’sini, `custom.bicak_i_zi` SVG ise ürün şablonunu yükler. Baskı yüzleri yukarıdaki ad/UV sözleşmesiyle eşlenir; bilinmeyen yüzlerde eşleme uyarısı görünür. Meta alanları boşken özgün örnek model kullanılır. PDF, üretim güvenli alanı ve keyfi kesim kırpması otomatik hazırlanmaz. Ayrıntılar: `docs/SHOPIFY-BUTON.md`.
- 140 × 210 mm örnektir. Üreticinin gerçek kesim/katlama/kaynak/körük ölçüleri, taşma ve güvenli alanı, baskı gereksinimleri ve renk profili sağlanmadan **baskıya hazır** çıktı yoktur.
- Üretici şablonu bağlantısı yoksa **Şablonu indir** yalnızca açıkça etiketli örnek SVG kılavuzu verir. Gerçek kesim makinesi dosyası değildir. `productionReady=false` korunur.
- İndirme menüsündeki PNG hızlı ekran önizlemesidir. **Render al** ile indirilen PNG/JPG, ışık yolları hesaplanmış stüdyo sunumudur. Bıçak izi sekmesindeki SVG, ayrı kesim katmanı ve gömülü raster tasarım taşır; PDF, tanımlı fiziksel ölçüde RGB görsel içerir. Bu çıktılar üretim onaylı değildir; CMYK/ICC, AI ve düzenlenebilir vektör PDF yoktur. JSON düzenlenebilir tasarımdır. `src/production.ts` gelecekteki onaylı üretim çıktısı için sözleşmedir, üretim exporter'ı kayıtlı değildir.
- Bardak, kutu, farklı ölçü ve yeni baskı yüzleri için uygun model/UV adaptörü ve açık şema sürümü gerekir. Pacdora'nın modelleri/şablonları alınmaz.
- 3D dokular yüz başına 600 × 900; mobil piksel oranı sınırlandırılmıştır. Fiziksel telefonlarda performans benchmark'ı yapılmadı. Işık, gölge ve malzeme bir WebGL önizlemesidir; fotoğraf doğruluğu veya baskı rengi garantisi yoktur.

## Doğrulama ve lisanslar

`npm test`: 24 test. `npm run test:workspace`: yerleşimler/mesafe/kalıcılık, 2D/3D, örnekler, SVG yükleme, metin/dönüş, undo/redo, zoom/pan, bağımsız yüzler, temel renk, cihaz/sunucu kaydı, JSON, yenileme, hatalı dosya, mobil/dar ekran, kapsayıcı olayları ve taklit Shopify sepeti. Gerçek mağaza siparişi veya üretim onayı bu testlerin kapsamı değildir.

Doğrudan bağımlılıklar ticari kullanıma uygun ücretsiz açık kaynaktır. React/Fabric/Three.js MIT, Lucide ISC, DOMPurify Apache-2.0 veya MPL-2.0. Tam liste `THIRD_PARTY_NOTICES.md`; `npm run licenses` dağıtıma lisans metinlerini ekler. Üçüncü taraf model veya lisanslı hazır görsel alınmadı; DM Sans font paketi açık OFL lisansıyla eklenmiştir.

## Küçük teslim paketi

`npm run release`, derlemeyi yapıp Python 3 standart kütüphanesiyle yalnızca iki ZIP üretir:

- `releases/alacam-online-design-kaynak.zip`: kaynak, GLB/SVG, özgün WebP kapaklar, testler ve belgeler. `node_modules`, derlenmiş dosyalar, ekran görüntüleri ve gizli `.env` dahil edilmez. Açtıktan sonra `npm ci` ve `npm run build` çalıştırın.
- `releases/alacam-online-design-shopify.zip`: temaya kopyalanacak derlenmiş dosyalar, WebP kapaklar, WOFF2 fontlar, section, şablon ve lisans bildirimi.

Eski ZIP takma adları ve açılmış proje kopyaları yoktur. Test ekran görüntüleri `test-results/screenshots/` altında geçici üretilir; teslim ZIP'lerine eklenmez. Geliştirme için gereken `node_modules` yerel bilgisayarda kalır; teslimin parçası değildir.

Yerleşim paneli açıldığında kapaklar seçili ürün ve güncel tasarımdan mevcut renderer ile hazırlanır; ayrı WebGL bağlamı açılmaz. Hazır özgün örnek kapaklar yükleme sırasında kullanılır. Bunları yeniden üretmek için Vite çalışırken `npm run assets:layouts` kullanılabilir (Playwright Chromium gerekir).

Arayüz fontu DM Sans (SIL OFL 1.1) yerel paketlenir. Pacdora'nın Gilroy fontu ve özel ikon fontu alınmadı; standart araç simgeleri bağımsız SVG olarak çizildi. Shapes panelinde sekiz temel şekil, 14 ambalaj sembolü ve altı sosyal/iletişim simgesi; Background panelinde 12 özgün desen vardır. Desen seçimi yüzü kaplayacak şekilde en arka katmana eklenir. Tuval 90° görünüm döndürmesi üretim koordinatlarını değiştirmez.

### Configure ve hareketler

Sağdaki **Config** düğmesi Apply/Discard penceresini açar. Material: White film/Kraft/Metallic; Print: Full Color/Black/Blank; Finishing: Gloss/Matte/Blank. Bu seçimler gerçek 3D malzeme/doku önizlemesini değiştirir ve sürüm 1 JSON'un isteğe bağlı `substrate`, `printMode`, `finishing` alanlarında tutulur. Kaynak artwork korunur. Seçimler satıcı varyantlarıyla eşlenmeden üretim seçeneği/sipariş fiyatı sayılmaz. Çalışan API, yeni ortak şemayı yüklemek için bu sürümle birlikte yeniden başlatılmalıdır.

2D tuvalde dikey wheel imleç merkezli zoom; Ctrl/Meta+wheel hızlı zoom; Shift+wheel ve yatay trackpad pan; Space+drag, orta fare tuşu ve Hand pan desteklenir. İki parmak pinch/pan artwork koordinatlarını değiştirmez. 90° görünümde sığdırma doğru en/boyu kullanır. Oklar 1, Shift+oklar 10 tasarım pikseli taşır; Cmd/Ctrl+D çoğaltır, Escape seçimi kapatır; Cmd/Ctrl+Y yineler. Kısayollar editör odağıyla sınırlıdır. 3D sürükleme, baskın eksene göre ürünü döndürür; bırakınca atalet sürmez. Wheel/touch zoom ve View menüsündeki Rotate/Pan ile Front/Back/Perspective görünümleri kullanılabilir. Yeniden boyutlandırma kamera yönünü korur.

`npm run test:interactions` gerçek wheel/Space/orta tuş/iki-touch girdilerini, kısayolları, Config Apply/Discard/Escape, yedi farklı render sonucu, kayıt/yenileme ve container ölçülerini izole Chromium'da test eder.

### Mod geçişi, mini önizleme ve alt çubuk

Üstteki 3D/2D seçicinin siyah göstergesi 300 ms kayar; genişliğe göre 114×28, 130×36 veya 150×40 px olur. Aynı moda tekrar basmak görünümü/panelleri sıfırlamaz. 2D tuvalin zoom/pan/dönüşü 3D'ye gidip dönünce korunur; 3D'de gizli 2D düzenleme kilitlenir.

Küçük 3D önizlemenin sol altındaki tutamacı sürükleyin. Pencere kare kalır ve sağ üst köşesi sabittir; başlangıcı 280 px, üst sınırı editör yüksekliğine bağlıdır. Klavyede oklar, Home ve End de çalışır. Sağ üstteki özgün 3D işareti, referanstaki gibi yalnız sürükleme ipucudur; büyük sahneye üstteki 3D seçiciden geçilir.

2D alt çubuktaki yüzde, 50/100/200/Fit menüsünü açar. +/- düğmeleri 25–200% aralığında 25/50 puanlık adımlar kullanır. Göz menüsü Show Dimension / Show material / Show bleedline / Cut bleedline / Move bleedline to topmost seçeneklerini açar. Bunlar yalnız çalışma görünümünü etkiler: 3D dokusu ve PNG her zaman gerçek tasarım rengiyle, baskı alanına kırpılarak ve kılavuz olmadan üretilir.

3D alt çubukta +/−, doypack için **Inflate** ve View menüsü bulunur. Inflate 0–100 değeri yaklaşık modelin derinliğini değiştirir; fiziksel dolum simülasyonu değildir. Değer v1 JSON'un isteğe bağlı `presentation.inflate` alanında saklanır ve geri alınabilir. Kutu katlama kontrolü yalnız böyle bir model ve mekanizma eklendiğinde sunulabilir.

`npm run test:shell` mod geçişi, oranlar, boyutlandırma, alt çubuk, Inflate kalıcılığı ve baskın eksen sürüklemesini doğrular. İstemci kaynaklarının ayrıntılı incelemesi için [kod analizi](docs/ISTEMCI-KOD-ANALIZI.md) belgesine bakın.

### 3B deneyim ince ayarı

Yerleşim ve mesafe değişiklikleri kamera yönünü, kaydırma konumunu ve göreli yakınlaştırmayı korur. Front/Back/Perspective bilinçli olarak görünümü yeniden kurar. Ürün döndürülürken temas gölgesi aynı karede güncellenir; kamera yakınlaştırması gölgeyi yeniden hesaplamaz. Boştaki önizleme sürekli render döngüsü çalıştırmaz. Işık ve gölge sınırları sahnedeki ürünlerin boyutundan hesaplanır.

Mat, parlak, kaplamasız, kraft ve metalik yüzeylerin pürüzlülük, kaplama ve mikro doku tepkileri ayrıştırılmıştır. Kaynak artwork, UV ve model ölçüleri değişmez. Bu ayarlar gerçek üretim malzemesinin ölçülmüş optik değerleri değildir.

Alt körük kapaması baskı yüzünün dışına beyaz bir oval olarak taşmayacak şekilde daraltılmıştır. Aynı düzeltme özgün GLB'ye ve 11 yerleşim küçük resmine de uygulanmıştır; baskı yüzlerinin UV'leri ve örnek ölçüleri korunur.

İki parmaktan tek parmağa geçiş döndürmeye kesintisiz devam eder. Mini önizleme tutamacı ilk sürüklemede sıçramaz. View menüsü ok/Home/End tuşlarıyla gezilir; Escape yalnız bu menüyü kapatır ve odağı düğmesine geri verir. Editör kapanınca WebGL bağlamı da serbest bırakılır.

DM Sans ve Türkçe karakter alt kümesi, Fabric metni ölçmeden önce yüklenir. Böylece ilk açılışta 2D yazısı veya 3D baskı dokusu geçici yedek fontla kalmaz. Font indirme hatası açıkça gösterilir; son geçerli font korunur. İşletim sistemi fontlarının bulunabilirliği cihaza bağlıdır.

`npm run test:preview` gerçek WebGL çıktısıyla zoom sınırlarını, basılı sürükleme sırasında gölgeyi, kamera konumunun korunmasını, iki parmaktan tek parmağa geçişi, modifier tuşuyla pan hareketini, geciken ilk font yüklemesini ve dört Shopify aç/kapat döngüsünden sonra GPU bağlamlarının serbest kalmasını doğrular.
