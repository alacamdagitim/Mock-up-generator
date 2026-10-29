# Shopify ürününe hazır mockup sahneleri bağlama

Müşteri bıçak izi üzerinde tasarlar. Seçilen hazır mockup sahnesinin fotoğrafı, ışığı ve gölgeleri korunur; tasarım, hazırlanan baskı eşlemesi üzerinden sahneye uygulanır. Yerleşimler bölümünde ürünün sahneleri seçilir. Bu akışta ayrı bir 3B render hesaplaması yapılmaz. Ürünün GLB dosyası varsa 3B görünüm ayrıca kullanılabilir. Mockup bağlı ürünlerde kayıt ve görsel indirme, 3B inceleme açıkken de seçili hazır mockupı kullanır; böylece siparişe bağlanan sunum değişmez.

## Meta alanı oluşturma

Shopify yönetiminde **Ayarlar → Özel veriler → Ürünler → Tanım ekle** yolunu açın:

- Ad: **Mockup sahneleri**
- Ad alanı ve anahtar: **`custom.mockup_sahneleri`**
- Tür: **JSON**

Shopify’ın [meta alan veri türleri belgesi](https://shopify.dev/docs/apps/build/metafields/list-of-data-types) JSON ve dosya referanslarını ayrı türler olarak tanımlar.

Ürünün meta alanına aşağıdaki sözleşmeye uygun JSON kaydedin. Bu bir görsel listesi veya PSD dosya alanı değildir. Görseller Shopify Dosyalar'a veya izinli bir CDN'e yüklenir; JSON bu dosyaların adreslerini ve baskı eşlemelerini birlikte taşır.

Mevcut **`custom.3b_glb_dosyasi`** ve **`custom.bicak_i_zi`** alanları korunur. Mockup alanı boşsa mevcut 2B/3B akış devam eder. Mockup tanımlı olup GLB bulunmuyorsa 3B sekmesi modelin bağlı olmadığını açıkça belirtir; örnek doypack ürününüz yerine gösterilmez.

**Liquid kodunu güncelleyin.** Daha önce eklediğiniz Özel Liquid bloğu bu yeni alanı otomatik okumaz. Vercel sürümü için `shopify/custom-liquid/online-design-vercel.liquid` dosyasının güncel tamamını kullanın. Tema içinde barındırılan kurulumlarda güncel snippet/section ve aynı derlemenin dosyalarını yükleyin. Dört giriş de `custom.mockup_sahneleri.value` değerini `productMockupScenes` adıyla editöre aktarır.

## Hazırlanmış bir sahnede gerekenler

Tek bir JPG/PNG fotoğraf, müşterinin tasarımının nereye ve hangi kavisle yerleşeceğini anlatmaz. Her sahne için hazırlık gerekir:

1. Baskısız veya tasarımın değiştirileceği bölgesi temizlenmiş **temel görsel**.
2. Tasarımın uygulanacağı bölge için **köşe eşlemesi** veya **UV haritası**.
3. Baskı alanını sınırlayan **maske**; UV RG16LE eşlemesinde zorunludur.
4. Gerekiyorsa gölge, doku, yansıma ve parlama katmanları.
5. Sabit ve doğru kaynak piksel ölçüleri.

Düz bir kutu yüzünde dört köşe eşlemesi yeterli olabilir. Bardak gibi kavisli yüzlerde UV haritası daha uygundur. PSD/PSB bir hazırlık kaynağıdır; tarayıcıya ham PSD yüklenmez ve Photoshop Smart Object efektlerinin otomatik aktarılacağı varsayılmaz. Hazırlanan sahne önce gerçek bir tasarımla kontrol edilmelidir.

### Dağıtım hakları

`distribution: "public-web"`, bu sahnedeki tüm dosyaları müşterinin tarayıcısına sunma hakkına sahip olduğunuzu belirten açık bir beyandır. Lisans kontrolünü sistem sizin adınıza yapmış olmaz. Tarayıcıda kullanılan temel fotoğraf, maske, UV ve ışık katmanlarının adreslerine müşteri de erişebilir.

Lisans yalnız birleşik son görsel üretimine izin veriyor, kaynak katmanların web üzerinden dağıtımına izin vermiyorsa bu dosyaları Shopify Dosyalar'a yüklemeyin. Bu tür bir sahne için kaynakları gizli tutan ayrı bir sunucu birleştirme hattı gerekir; mevcut `public-web` akışına bu yetkiyi varmış gibi eklemeyin. Özel Matcha PSD'si ve ondan çıkarılmış katmanlar projeye veya genel örneğe dahil değildir.

## Çalışan özgün örnek

`/mockup-demo.html`, projeyle üretilmiş özgün örnek bardağı kullanır. Kaynak ölçüsü **1024 × 1365 px**'tir. Bu örnek izinli bir deneme sahnesidir; gerçek ürününüzün fiziksel doğruluğunu veya baskı onayını temsil etmez.

Aşağıdaki JSON bu özgün sahneyi Shopify ürününde denemek içindir. Alan adlarını ve yapıyı değiştirmeden yapıştırın. Kendi yayınız farklıysa Vercel kök adresini değiştirin.

```json
{
  "schemaVersion": 1,
  "scenes": [
    {
      "id": "original-cup-studio-r1",
      "title": "Örnek bardak · Stüdyo",
      "width": 1024,
      "height": 1365,
      "baseImageUrl": "https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/original-cup/base.png",
      "thumbnailUrl": "https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/original-cup/thumbnail.jpg",
      "distribution": "public-web",
      "license": "Özgün prosedürel örnek · CC0-1.0",
      "surfaces": [
        {
          "id": "front",
          "face": "front",
          "backgroundMode": "design",
          "sourceRect": { "x": 0, "y": 0, "width": 1, "height": 1 },
          "mapping": {
            "type": "uv-rg16le",
            "url": "https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/original-cup/front.uv.bin"
          },
          "maskUrl": "https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/original-cup/front-mask.png",
          "blend": "multiply"
        }
      ],
      "layers": [
        {
          "imageUrl": "https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/original-cup/highlights.png",
          "blend": "screen",
          "opacity": 1
        }
      ]
    }
  ]
}
```

## Sözleşme ve eşleme

Katalog `schemaVersion: 1` içerir. En fazla **8 sahne**, sahne başına en fazla **8 baskı yüzeyi** ve **16 üst katman** tanımlanır. Her kenar en fazla 8192 px, toplam alan en fazla 16.777.216 pikseldir. Bu üst sınırlar kaynak kalitesini yükseltmez; büyük sahnelerde yükleme ve hafıza maliyeti artar.

| Alan              | Anlamı                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`              | Değişmeyen sahne kimliği. Tasarımla birlikte `presentation.mockupSceneId` olarak kaydedilir.               |
| `title`           | Yerleşimler kartında gösterilen ad.                                                                        |
| `width`, `height` | Temel görselin gerçek kaynak piksel ölçüsü.                                                                |
| `baseImageUrl`    | Baskısız temel PNG, JPG veya WebP.                                                                         |
| `thumbnailUrl`    | İsteğe bağlı hızlı kart görseli; yoksa temel görsel kullanılır.                                            |
| `distribution`    | Bu istemci akışında zorunlu değer: `public-web`.                                                           |
| `license`         | İsteğe bağlı lisans/kaynak notu; lisansın yerine geçmez.                                                   |
| `surfaces`        | Baskı yüzleri, kaynak bölgeler, eşleme ve maskeler.                                                        |
| `layers`          | Sıralı yansıma/gölge katmanları. `source-over`, `multiply`, `screen`, `overlay`, `soft-light` desteklenir. |

Dosya adresleri HTTPS olmalıdır. `/` ile başlayan adresler de desteklenir ancak **Shopify sayfasının kaynağına göre** çözülür; Vercel'deki sahne için tam HTTPS adresi tercih edin. CDN'in CORS erişimine izin vermesi gerekir. Çalıştırılabilir adresler, kimlik bilgisi içeren URL'ler, SVG ve PSD kabul edilmez. Sorgu parametreli dosya sürümleri korunur.

Yüzeyde `face`, `front` veya `back` olabilir. Her ürün için hangi tasarım yüzünün hangi fotoğraf bölgesine bağlandığı hazırlık sırasında belirlenir. Bıçak izi çizgilerinden otomatik semantik panel çıkarımı yapılmaz.

`sourceRect`, tasarım yüzünün hangi bölümünün alınacağını **0–1 aralığında** anlatır. `{x:0,y:0,width:1,height:1}` tüm artboard'u kullanır. Örneğin `{x:0.25,y:0,width:0.5,height:1}`, artboard'un ortadaki yarısını kullanır. Bölge sınır dışına çıkamaz. Ön yüz panelinin net içindeki konumu üreticinin bıçak izine göre tanımlanır; yanlış kırpma gerçek üründe yanlış baskı yeri oluşturur.

`backgroundMode: "design"` müşterinin yüzey rengini kullanır ve varsayılandır. `"transparent"` yalnız tasarım öğelerini taşır; fotoğrafın mevcut ürün dokusunu koruyan baskı senaryolarında kullanılır. `blend`, yüzey için `source-over` veya `multiply` olabilir; `opacity` 0–1 aralığındadır.

### Dört köşe

`mapping: {"type":"quad","points":[[100,100],[900,100],[850,1200],[150,1200]]}` temel görselin **piksel koordinatlarını** kullanır. Sıra sol üst, sağ üst, sağ alt, sol alttır. Köşeler sahne içinde ve dışbükey olmalıdır. Bu bir düzlemsel yerleştirmedir; bardak kavisini kendiliğinden oluşturmaz.

### UV haritaları

- `uv-rg16le`: sahneyle aynı genişlik/yükseklikte, piksel başına 4 bayt. İlk iki bayt küçük sıralı `uint16 U`, sonraki iki bayt `uint16 V`; her değer 0–65535. `U=0` sol, `V=0` üsttür. Dosya uzunluğu tam olarak `width × height × 4` olmalıdır. Alfa içermediği için `maskUrl` gerekir.
- `uv-rg8`: PNG'nin kırmızısı U, yeşili V, alfası kapsama değeridir; mavi kullanılmaz. 8 bit koordinat hassasiyeti daha düşüktür. İnce yazılar ve büyük kaynaklar için RG16LE tercih edin.

Maske ve gölge dosyaları hazırlanan sahnenin ölçüleriyle uyumlu olmalıdır. Birden fazla ürünün bulunduğu sahnede her baskı bölgesi ayrı bir `surface` olarak aynı tasarım yüzüne bağlanabilir.

## Kimlik ve dosya sürümleri

Sahne sıralaması kaydedilmiş tasarımın referansını değiştirmez; seçim **liste sırasıyla değil `id` ile** saklanır. Kimlikleri sonradan başka bir kamera açısı veya farklı ürün için yeniden kullanmayın. Baskı eşlemesi veya kaynak dosyalar değiştiğinde `cup-front-r2` gibi yeni kimlik ve yeni dosya/sürüm adresleri kullanın. Eski tasarımların dayandığı sürümü erişilebilir tutun.

Kayıtlı kimlik artık ürünün sahne listesinde yoksa kullanıcı yeni sahne seçmelidir. Sistem farklı bir sahneyi sessizce kaydedilmiş sahneymiş gibi dışa aktarmaz.

## Önizleme, indirme ve kayıt

Mobil düzenleme sırasında en çok 960, masaüstünde 1440 px uzun kenarlı çalışma önizlemesi oluşturulur. Tasarım dokusu önizlemede mobilde 1024/masaüstünde 2048, indirmede mobilde 2048/masaüstünde 4096 px uzun kenarla sınırlandırılır. Mobilde yüksek çözünürlüklü çok katmanlı sahneler daha fazla bellek kullanır; 2–4 megapiksellik sahnelerle başlayın. **Görsel indir**, seçilen sahnenin gerçek kaynak ölçüsünde PNG/JPG üretir; örnek sahne 1024 × 1365 px olarak iner. Kaynak 1024 px ise 4K/8K diye büyütülmez. Ürün fotoğrafının ve yüklenen tasarımın kalitesi sonuç için belirleyicidir.

Yerel kütüphane küçük görseli, sunucuya gönderilen önizleme ve görsel indirme aynı seçili sunumu kullanır. Kaynak yüklenemez veya eşleme başarısız olursa hata gösterilir; başka bir 3B/2B görsel başarılı mockup kaydı gibi sunulmaz. Kalıcı sunucu depolaması ayrıca yapılandırılmalıdır; meta alanını eklemek depolama servisi kurmaz.

Bıçak izi/üretim çıktısı ile mockup görseli ayrı dosyalardır. Bu sahne görselleştirme içindir; üreticinin onaylı ölçü, kesim yolu ve baskı şartları olmadan baskıya hazır sayılmaz.

## Kontrol adımları

1. Güncel Liquid'i ekleyin ve ürünün JSON meta alanını kaydedin.
2. Ürün sayfasındaki **Online tasarla** düğmesini açın; 2B bıçak izi ve küçük canlı mockup görünmelidir.
3. Renk, yazı ve logo değiştirin; baskı alanında anında güncellendiğini kontrol edin.
4. **Layout / Yerleşimler** içinden sahne seçin ve JSON dışa aktarımında `mockupSceneId` değerini kontrol edin.
5. PNG/JPG indirin; gerçek piksel ölçülerini ve tasarımın kavis/maske sınırlarını kontrol edin.
6. Kaydedip sayfayı yenileyin; sahne seçimi ve tasarım korunmalıdır.
7. Hatalı bir dosya adresiyle açık hata çıktığını, yanlış görselin kaydedilmediğini doğrulayın.

Yerel Vite sunucusu açıkken `npm run test:mockup` çalıştırın. İlk kurulumda `npx playwright install chromium` gerekebilir. Özel tarayıcı yolu için `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tam/yol/chromium` kullanılabilir. Testler API çağrılarını kendi tarayıcılarında taklit eder; gerçek mağazaya veya depolamaya yazmaz.
