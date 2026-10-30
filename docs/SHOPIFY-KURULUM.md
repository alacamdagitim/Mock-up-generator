# Shopify’da çalıştırma

## 1. Vercel projesi

GitHub deposunu Vercel’e bağlayın. Application Preset **Vite**, Root Directory `./`, Build Command `npm run build`, Output Directory `dist`, Node.js **22** seçin. Vercel ön yüzü ve depodaki `api/` sunucu uçlarını aynı projede yayımlar.

GitHub’a gönderilen kod Vercel tarafından yeniden derlenir. Shopify temasına daha önce yapıştırılan Liquid kendiliğinden güncellenmez; aşağıdaki dosya ayrıca değiştirilmelidir.

## 2. Kalıcı tasarım depolaması

Vercel projesinde **Storage → Blob** üzerinden erişimi **Private** olan bir store oluşturup projeye bağlayın. Production ortamına `BLOB_READ_WRITE_TOKEN` eklendiğini kontrol edin ve yeniden dağıtın.

| Sunucu ortam değişkeni | Gerekli mi? | İçerik |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Kalıcı kayıt için evet | Vercel Private Blob bağlantısının verdiği gizli token. |
| `PUBLIC_BASE_URL` | İsteğe bağlı | API’nin HTTPS origin’i; örneğin `https://mock-up-generator-y265.vercel.app`. Sonuna `/api` eklemeyin. Vercel’de varsayılan proje adresi otomatik kullanılır. |
| `ALLOWED_ORIGINS` | Başka mağaza/domain için | Virgülle ayrılmış tam origin’ler. `https://alacamdagitim.com`, `https://www.alacamdagitim.com` ve mevcut Vercel alan adı varsayılan olarak izinlidir. |

Gizli token `VITE_` değişkenine, Liquid’e, tasarım JSON’una veya tarayıcı koduna yazılmaz.

`GET /api/health`, depolama erişimini kontrol eder. `storageConfigured: false` ise siparişe tasarım bağlanamaz. Kullanıcı düzenleyebilir, görsel/JSON indirebilir ve yerel taslağını tutabilir; sunucuya kaydedildi mesajı verilmez.

Depolama henüz hesaba bağlanmadıysa bu adım tamamlanmış değildir. Kaynak kodun yayına çıkması tek başına Blob store oluşturmaz.

## 3. Ürün meta alanları

Shopify **Ayarlar → Özel veriler → Ürünler** bölümündeki mevcut tanımları kullanın:

| Ad | Anahtar | Tür |
| --- | --- | --- |
| Mockup görselleri | `custom.mockup_gorselleri` | Dosya listesi, yalnız Görseller |
| Mockup sahneleri | `custom.mockup_sahneleri` | JSON |
| 3B GLB Dosyası | `custom.3b_glb_dosyasi` | Dosya |
| Bıçak izi | `custom.bicak_i_zi` | Dosya |

PSD kaynakları hazırlıkta kullanılır. Müşteri tarafına PSD yerine hazırlanmış görseller, maskeler ve eşleme dosyaları gider. On sahne için on farklı ürün JSON’u gerekmez; hepsi tek katalogdadır.

`mockup_sahneleri` alanına dosya yüklemek yerine verilen JSON metninin tamamını yapıştırın. Teknik dosya URL’leri müşterinin erişebildiği HTTPS/CDN adresleri olmalıdır. Kaynak PSD, çalışma önbelleği veya yerel bilgisayar adresi yazılmaz.

`mockup_gorselleri` listesini doldurursanız her fotoğraf, katalogdaki sahnenin `shopifyImageId` alanına sabit Shopify dosya kimliğiyle bağlanır. Dosya adı/başlık/sıra kimlik değildir; yeni yükleme yeni kimliktir. Liste boşsa katalogdaki hazırlanmış kartlar kullanılır. Hazırlanmamış/çelişen görseller açık açıklamayla kullanılamaz olarak görünür.

GLB isteğe bağlıdır. Bıçak izi için SVG tercih edin: ölçü ve en/boy oranı okunur, kılavuz editörde gösterilir. PDF/AI dosyası indirilebilir kaynak olarak kalır; SVG’ye dönüştürme ve üretim ölçüsü hazırlık aşamasıdır.

## 4. Ürün fiyatları ve miktarlar

Editör ürünün seçenek adlarını ve her varyantın seçenek değerlerini Shopify’dan alır. Örneğin **Boyut / Baskı / Miktar** Shopify’da nasıl tanımlandıysa aynı seçenekler görünür. Seçim gerçek bir varyant kombinasyonuna çözülür; var olmayan kombinasyon başka varyant diye eklenmez.

Fiyatlar mevcut müşterinin Shopify para biriminde gelir. Shopify’ın minimum/artış/maksimum miktar kuralı ve varsa miktara göre fiyat eşikleri kullanılır. Paketler için **sepet miktarı** ile **fiziksel adet** ayrıdır: 1000 parçalık bir paket Shopify’da bir sepet kalemi olabilir.

Parça başı fiyat ve toplam fiziksel adet göstermek istiyorsanız isteğe bağlı **Paket içi adet**, `custom.paket_ici_adet`, **Tam sayı** alanını ürün veya varyantta tanımlayın. Varyantta varsa o değer kullanılır. Örneğin 1000 parçalık varyantta `1000`; sepet miktarı `2` ise toplam 2000 parça. Shopify’ın ölçüm türü `count` olan birim ölçüsü de bu bilgiyi verebilir. Bilgi yoksa sistem başlıktaki sayıları tahmin etmez ve parça fiyatı iddiasında bulunmaz.

Miktar indirimi, compare-at fiyatı veya varyant etiketi üzerinden uydurulmaz. Nihai sepet/ödeme tutarı Shopify’ın stok, indirim, vergi ve kargo kurallarıyla hesaplanır. Zorunlu abonelik planı gerektiren ürünler bu tek seferlik satın alma akışına uygun değildir.

## 5. Online tasarla düğmesi

Önerilen kurulum:

1. Shopify **Online Mağaza → Temalar → Özelleştir** bölümünde ürün şablonunu açın.
2. Ürün bilgisi bölümüne **Özel Liquid** bloğu ekleyin.
3. `shopify/custom-liquid/online-design-vercel.liquid` dosyasının tamamını yapıştırın ve kaydedin.

Düğme editörü mevcut ürün sayfasında tam ekran açar. Kimlik, başlık, dosyalar, fiyatlar ve varyantlar mevcut `product` üzerinden aktarılır. Ürün formunun o anda seçili varyantı ve miktarı açılışta yeniden okunur. X/Escape ürün sayfasına döndürür; yerel taslak korunur.

Aynı sayfada çelişen birden fazla ürün formu varsa düğmenin `data-alacam-product-form` özelliğine ilgili formun CSS seçicisini verin. Kodun başındaki `api_base` ve JavaScript adresleri farklı Vercel alan adı kullanıyorsanız güncellenmelidir.

Tema varlıklarını Shopify’a yüklemeyi tercih ederseniz derlemeden sonra `shopify/assets/` içindeki bütün `alacam-*` dosyalarını tema `assets/` klasörüne kopyalayın; ardından `shopify/custom-liquid/online-design-button.liquid` veya `shopify/snippets/alacam-online-design-button.liquid` kullanın. Gömülü sayfa section’ı: `shopify/sections/alacam-tasarim-editoru.liquid`; section ayarında ürün seçilir. Sadece ana JavaScript dosyasını yüklemek yeterli değildir; parçalar ve fontlar da gereklidir.

## 6. Tasarımla sepete ekleme

1. Müşteri seçenek ve sipariş miktarını seçer, tasarımı düzenler.
2. Editör JSON ve PNG’yi Private Blob’a gönderir. API şema, dosya boyutu, PNG yapısı ve içerik özetlerini doğrular; tamamlanmış kayıt manifesti oluşturur.
3. Kaydedilmiş tasarım kimliği ve referanslar alınır.
4. Shopify’ın yerelleştirilmiş `cart/add.js` ucuna gerçek varyant kimliği, sepet miktarı ve tasarım referansları gönderilir.
5. Başarılı yanıt sonrası müşteri mağazanın sepet sayfasına yönlendirilir. Ödeme Shopify’da tamamlanır.

Sepet özellikleri: `_alacam_design_id`, `_alacam_design_url`, `_alacam_preview_url` ve görünür tasarım referansı. PSD, görsel/base64, tasarımın tamamı veya tarayıcıdan gönderilen fiyat sepet özelliği olarak tutulmaz. Tasarım kaydı başarısızsa ürün tasarımlı sipariş gibi eklenmez. Shopify sepet eklemeyi reddederse hata gösterilir; kaydedilmiş tasarım sipariş tamamlandı diye sunulmaz.

## Sunucu uçları

| Uç | İşlev |
| --- | --- |
| `GET /api/health` | Kalıcı depolama durumu. |
| `POST /api/designs?action=connect` | İlk bağlantıda küçük, kişisel veri içermeyen bir kayıtla Private depolamayı doğrulama. Editör gerektiğinde otomatik çağırır. |
| `POST /api/designs?action=prepare` | Süreli ve dosyaya bağlı özel yükleme izinleri. |
| `POST /api/designs?action=finalize` | Dosyaları doğrulama, kalıcı tasarım kaydını tamamlama. |
| `GET /api/designs/:id/design.json` | Tamamlanmış tasarım JSON’u. |
| `GET /api/designs/:id/preview.png` | Tamamlanmış önizleme. |

Dosyalar doğrudan Blob’a gönderilerek Vercel Function istek gövdesi sınırına takılmaz. Bir tasarımda en fazla 20 MB JSON ve 16 MB PNG kabul edilir. Hazırlanıp tamamlanmamış yüklemeler özel kalır; otomatik süreli dosya temizliği henüz yoktur. Tasarım bağlantısını bilen kişiler bu kaydın dosyalarını açabilir; müşteri hesabına bağlı dosya izin sistemi yoktur.

## Üretim dosyası ayrımı

Mockup PNG/JPG ve 3B görüntü sunum içindir. Düzenlenebilir JSON proje verisidir. Üreticinin onaylı ölçüleri, taşma/güvenli alanı ve baskı şartları tanımlanmadan bunlar baskıya hazır dosya değildir. Varyant değiştirmek yeni ambalaj geometrisi ya da bıçak izi üretmez; farklı fiziksel ölçü gerekiyorsa uygun varlık hazırlanıp ürüne bağlanmalıdır.
