# Shopify ürününe hazır mockup sahneleri bağlama

Mockup, ürünün ana sunumudur. Müşteri 2B bıçak izi üzerinde tasarlar; Yerleşimler bölümündeki baskısız sahne kartlarından birini seçince aynı tasarım o sahneye uygulanır. Ürüne eklenen görsellerin sırası seçeneklerin sırasını belirler. Fotoğrafın ışığı, gölgeleri ve önde kalan bölgeleri hazırlanan eşleme ve maskelerle korunur. PNG/JPG indirmek için ayrıca 3B render beklenmez. GLB varsa 3B görünüm inceleme için kalır. Kayıt ve görsel indirme, 3B inceleme açıkken de seçili hazır mockupı kullanır.

## Son hazırlanan “Elde karton bardak” sahnesini hemen bağlama

1. Shopify yönetiminde **Ayarlar → Özel veriler → Ürünler → Tanım ekle** yolunu açın.
2. Adı **Mockup sahneleri**, ad alanı ve anahtarı **`custom.mockup_sahneleri`**, türü **JSON** olan ürün meta alanını oluşturun.
3. [Hazır ürün JSON'unun](../shopify/metafields/hand-cup-r1.json) tamamını kopyalayıp ilgili ürünün **Mockup sahneleri** alanına yapıştırın ve ürünü kaydedin.
4. Tema düzenleyicisinde ürün şablonunun **Özel Liquid** bloğundaki kodu, [güncel dosyanın](../shopify/custom-liquid/online-design-vercel.liquid) **tamamıyla** değiştirip kaydedin.
5. Ürün sayfasını yenileyip **Online tasarla** düğmesiyle açın. **Yerleşimler** içinde baskısız elde bardak kartını seçin; tasarımınız bu fotoğrafa uygulanır.

Bu sahne için ayrıca Shopify'a görsel yüklemek veya **Mockup görselleri** alanını doldurmak gerekmez. Hazır JSON; taban, maske ve UV eşlemesini Vercel'deki kalıcı HTTPS adreslerinden okur. Örneğin baskısız temel görsel:

`https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/hand-cup-r1/base.png`

Canlı deneme: [Elde bardak mockupı](https://mock-up-generator-y265.vercel.app/hand-cup-demo.html). Kaynak ve indirme boyutu **1448 × 1086 px**'tir. Web editöründe kullanım izni mağaza sahibi tarafından onaylanan bu sahne kamu malı/CC0 olarak sunulmaz. Sahne fotoğrafa göre hazırlanmış yaklaşık görsel eşlemedir; üreticinin onaylı bıçak izi veya baskı dosyası değildir.

## Ürünün görsel listesini yönetme — isteğe bağlı

Daha sonra ürün başına sahne kartlarını Shopify'dan sıralamak için ikinci bir ürün alanı oluşturabilirsiniz:

| Ad | Ad alanı ve anahtar | Tür | İçerik |
| --- | --- | --- | --- |
| **Mockup sahneleri** | **`custom.mockup_sahneleri`** | **JSON** | Hazırlanan baskı eşlemeleri, maskeler, ışık katmanları ve temel görsel adresleri. |
| **Mockup görselleri** | **`custom.mockup_gorselleri`** | **Dosya → Dosya listesi**, yalnız **Görseller** (`list.file_reference`) | İsteğe bağlı baskısız sahne kartları; dolu olduğunda gösterilecek seçenekleri ve sıralarını belirler. |

Shopify'ın [veri türleri belgesi](https://shopify.dev/docs/apps/build/metafields/list-of-data-types), `list.file_reference` alanında görsel türü doğrulamasını destekler. Dosya başlığı, kimliği ve kaynak adresi [Liquid image nesnesinden](https://shopify.dev/docs/api/liquid/objects/image) okunur.

**Liste boş veya tanımsızsa**, JSON içindeki hazırlanmış sahneler doğrudan görünür. **Listeye görsel eklerseniz**, görünmesini istediğiniz bütün mockup görsellerini bu listede seçin; liste ürünün galerisini belirler. Her dosya aynı fotoğraf için hazırlanmış bir JSON sahnesine bağlanmalıdır. Tercih edilen bağ, sahnenin isteğe bağlı **`shopifyImageId`** alanında dosyanın sabit Shopify medya kimliğini kullanmaktır. Bu alan yoksa tam temel görsel adresiyle eşleme yapılır. Görseli Shopify'a yeniden yüklemek yeni adres/kimlik oluşturur; farklı CDN adresini aynı fotoğraf sanarak otomatik eşleme yapılmaz.

Örneğin Shopify'daki dosya kimliği `123456789` ise, o fotoğrafın hazırlanmış sahnesine `"shopifyImageId": "123456789"` eklenir. Shopify kurulumunda Liquid çıktısındaki sayısal kimliği **aynı metin olarak** kullanın. `123456789` ile `gid://shopify/MediaImage/123456789` otomatik olarak eşit sayılmaz. Başlık, dosya adı veya listedeki konum kimlik yerine kullanılmaz. Sırf listede aynı sıraya denk geldi diye başka bir sahnenin UV eşlemesi uygulanmaz.

Görsel listesine **baskısız temel fotoğrafı** ekleyin; son müşterinin tasarımının basılmış olduğu PNG'yi, kalibrasyon ızgarasını veya UV dosyasını eklemeyin. Alt metin kart başlığı olarak kullanılır, ilk 120 karakteri alınır; boşsa “Mockup 1” gibi bir ad gösterilir. Başlık değişikliği eşlemeyi bozmaz.

**Yeni JPG tek başına baskı şablonu değildir.** Fotoğrafın kıvrımı, baskı bölgesi, maskesi ve gerekiyorsa gölge katmanları bir kez hazırlanıp JSON'a bağlanmalıdır. Eşlemesi olmayan görsel hazırlanması gereken seçenek olarak görünür; tasarım uygulanmış başarılı mockup gibi gösterilmez. Görseli başka açıyla veya başka ölçüde yeniden düzenlerseniz eşlemeyi yeniden hazırlayın.

### Liquid güncellemesi ve mevcut alanlar

Vercel sürümünde tema `assets/` klasörüne editör dosyası yüklemek gerekmez. Vercel güncellemesi, Shopify'a önceden yapıştırılmış Liquid kodunu kendiliğinden değiştirmez; yeni dosyanın tamamını **Özel Liquid** bloğuna yapıştırmalısınız.

Dört Liquid girişi de liste doluysa yalnız görsel dosyalarını `productMockupImages` olarak aktarır; liste boş/tanımsızsa **`null`** göndererek yalnız JSON kullanılan eski ürünlerin sahnelerini korur. Programatik yapılandırmada açık `productMockupImages: []` ise seçenekleri kaldırır. Görsellerin ham kaynak adresi `imageUrl` olarak korunur; kartlarda 480 px genişlikte ayrı `thumbnailUrl` kullanılır. Küçültülmüş kart görseli baskı tabanı veya eşleme kaynağı yerine geçirilmez. PDF/video önizlemeleri mockup görseli sayılmaz.

Mevcut **`custom.3b_glb_dosyasi`** ve **`custom.bicak_i_zi`** alanları korunur. Mockup alanları boşsa mevcut 2B/3B akış devam eder. GLB bulunmuyorsa 3B sekmesi bağlı model olmadığını açıkça belirtir; ürününüz yerine örnek doypack gösterilmez.

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

Katalog `schemaVersion: 1` içerir. Ürün başına en fazla **64 sahne** ve isteğe bağlı görsel listesinde **64 görsel**, sahne başına en fazla **8 baskı yüzeyi** ve **16 üst katman** tanımlanır. Her kenar en fazla 8192 px, toplam alan en fazla 16.777.216 pikseldir. Kart görselleri küçük ve tembel yüklenir; yüksek çözünürlüklü temel fotoğraf, UV ve maske yalnız seçilen sahne için yüklenir. Bu üst sınırlar kaynak kalitesini yükseltmez; büyük sahnelerde yükleme ve hafıza maliyeti artar.

| Alan              | Anlamı                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`              | Değişmeyen sahne kimliği. Tasarımla birlikte `presentation.mockupSceneId` olarak kaydedilir.               |
| `shopifyImageId`  | İsteğe bağlı Shopify dosya kimliği; dosya listesiyle sabit bağ kurar. |
| `title`           | Yerleşimler kartında gösterilen ad.                                                                        |
| `width`, `height` | Temel görselin gerçek kaynak piksel ölçüsü.                                                                |
| `baseImageUrl`    | Baskısız temel PNG, JPG veya WebP.                                                                         |
| `plainThumbnailUrl` | İsteğe bağlı küçük **baskısız** kart görseli; yoksa temel görsel kullanılır. |
| `thumbnailUrl`    | Eski sözleşme uyumluluğu için kabul edilir; baskılı örnek içerebileceğinden Yerleşimler kartında kullanılmaz.                                            |
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
2. Ürün sayfasındaki **Online tasarla** düğmesini açın; ana **Mockup** görünümü ve **Yerleşimler** panelindeki baskısız sahne kartları görünmelidir.
3. **Görsel yükle** veya **2D** ile bıçak izine geçin. Renk, yazı ve logo değiştirin; küçük canlı mockupın baskı alanında güncellendiğini kontrol edin.
4. **Mockup / Yerleşimler** içinden sahne seçin; tüm tasarımı tekrar eklemeden uygulandığını ve JSON dışa aktarımında `mockupSceneId` değerini kontrol edin.
5. PNG/JPG indirin; gerçek piksel ölçülerini ve tasarımın kavis/maske sınırlarını kontrol edin.
6. Kaydedip sayfayı yenileyin; sahne seçimi ve tasarım korunmalıdır.
7. Hatalı bir dosya adresiyle açık hata çıktığını, yanlış görselin kaydedilmediğini doğrulayın.

Yerel Vite sunucusu açıkken `npm run test:mockup` çalıştırın. İlk kurulumda `npx playwright install chromium` gerekebilir. Özel tarayıcı yolu için `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tam/yol/chromium` kullanılabilir. Testler API çağrılarını kendi tarayıcılarında taklit eder; gerçek mağazaya veya depolamaya yazmaz.
