# Shopify’da çalıştırma

## 1. Vercel yayını

GitHub deposunu Vercel’e bağlayın. Application Preset **Vite**, Root Directory `./`, Build Command `npm run build`, Output Directory `dist`, Node.js **22** seçin.

Bu sürüm Shopify ürün verileriyle tarayıcıda çalışır. Blob, veritabanı, kayıt API’si veya PSD sunucusu kurulmaz; gizli anahtar gerekmez. Taslak müşterinin cihazında kalır ve tasarım dosyası siparişe bağlanmaz.

GitHub’a gönderilen kod Vercel tarafından yeniden derlenir. Temaya daha önce yapıştırılan Liquid kendiliğinden güncellenmez; aşağıdaki dosya ayrıca değiştirilmelidir.

## 2. Ürünün dört meta alanı

Shopify **Ayarlar → Özel veriler → Ürünler** bölümündeki mevcut tanımları kullanın:

| Ad | Anahtar | Tür |
| --- | --- | --- |
| Mockup görselleri | `custom.mockup_gorselleri` | Dosya listesi, yalnız Görseller |
| Mockup sahneleri | `custom.mockup_sahneleri` | JSON |
| 3B GLB Dosyası | `custom.3b_glb_dosyasi` | Dosya |
| Bıçak izi | `custom.bicak_i_zi` | Dosya |

On sahne için tek JSON katalog kullanılır. `mockup_sahneleri` alanına verilen JSON metninin tamamı yapıştırılır; JSON dosyası bir Dosya alanına yüklenmez. Maske, UV ve ışık dosyalarının katalogdaki URL’leri erişilebilir HTTPS/CDN adresleri olmalıdır. Bunlar için yeni ürün alanları açılmaz.

`mockup_gorselleri` listesini doldurursanız her fotoğraf, katalogdaki sahnenin `shopifyImageId` alanına sabit Shopify dosya kimliğiyle bağlanır. İsim/başlık/sıra kimlik değildir; yeni yükleme yeni kimliktir. Liste boşsa katalogdaki hazırlanmış kartlar kullanılır. Hazırlanmamış veya çelişen görsel kullanılabilir tasarımlı mockup gibi gösterilmez.

GLB isteğe bağlıdır; UV ve baskı yüzü eşlemesi bulunmalıdır. Bıçak izi için SVG kullanın: ölçüsü ve en/boy oranı korunarak 2D kılavuzda görünür. PDF/AI indirilebilir kaynak olarak kalır; SVG’ye dönüştürme ve üretim ölçüsü hazırlık aşamasıdır.

PSD kaynakları bir kez hazırlanır. Müşteriye PSD yerine hazırlanmış web varlıkları gider. [PSD hazırlama](MOCKUP-HAZIRLAMA.md).

## 3. Varyant toplamı, fiziksel adet ve paket sayısı

**Shopify varyant fiyatı, seçilen adet/paket seçeneğinin toplam fiyatıdır.** Örneğin:

| Shopify verisi | Değer |
| --- | --- |
| Adet seçeneği | 1000 |
| Varyant fiyatı | 3000 TL |
| Paket sayısı | 1 |
| Gösterilen toplam adet | 1000 |
| Gösterilen adet başı fiyat | 3 TL |
| Shopify’a gönderilen sepet miktarı | 1 |

Paket sayısı 2 ise 2000 adet ve 6000 TL görünür; Shopify’a aynı varyant için miktar `2` gönderilir. Varyant fiyatı ayrıca 1000 ile çarpılmaz.

Adet, yalnız yapısal miktar seçeneklerinden okunur: `Adet`, `Miktar`, `Quantity`, `Sipariş adedi` ve eşdeğer açık isimler. `1000`, `1.000 adet`, `1,000 pcs` gibi tam sayılar ve düzenli binlik grupları kabul edilir. `250 ml`, `5x5`, `1000–2000`, `1,5` veya ürün adındaki sayılar fiziksel adet sayılmaz. Belirsiz değerde parça fiyatı tahmin edilmez.

İsteğe bağlı `custom.paket_ici_adet`, **Tam sayı**, ürün veya varyant düzeyinde bu bilgiyi açıkça tanımlayabilir. Varyant değeri ürün değerine üstün gelir. Shopify’ın ölçüm türü `count` olan birim ölçüsü de kullanılır. Bunlar miktar seçeneğinden önce gelir; beşinci bir metafield oluşturmak zorunlu değildir.

Sağdaki seçenekler gerçek varyant kombinasyonlarına çözülür. Diğer seçenekleri aynı olan açık adet varyantları, gerçek toplamları ve adet başı fiyatlarıyla satırlar halinde gösterilir. Adet indirimi uydurulmaz; varsa Shopify’ın mevcut miktar kuralları ve fiyat eşikleri kullanılır.

Minimum, artış ve maksimum kuralları Shopify’dan gelir. Nihai stok, indirim, vergi ve kargo Shopify sepetinde/ödemede belirlenir. Zorunlu abonelik planı gerektiren ürünler bu tek seferlik satın alma akışına uygun değildir.

## 4. Online tasarla düğmesi

1. Shopify **Online Mağaza → Temalar → Özelleştir** bölümünde ürün şablonunu açın.
2. Ürün bilgisi bölümüne **Özel Liquid** bloğu ekleyin.
3. `shopify/custom-liquid/online-design-vercel.liquid` dosyasının tamamını yapıştırın ve kaydedin.

Düğme mevcut ürün sayfasında tam ekran editör açar. Kimlik, başlık, dosyalar, fiyatlar ve varyantlar mevcut `product` üzerinden aktarılır. Ürün formunun o anda seçili varyantı ve paket miktarı açılışta yeniden okunur. X/Escape ürün sayfasına döndürür; yerel taslak korunur.

Aynı sayfada çelişen birden fazla ürün formu varsa düğmenin `data-alacam-product-form` özelliğine ilgili formun CSS seçicisini verin. Farklı Vercel alan adı kullanılıyorsa dosyanın JavaScript adreslerini güncelleyin.

Tema dosyalarını Shopify’da barındırmayı tercih ederseniz derleme sonrası `shopify/assets/` içindeki bütün `alacam-*` dosyalarını tema `assets/` klasörüne kopyalayın. Ardından `shopify/custom-liquid/online-design-button.liquid` veya `shopify/snippets/alacam-online-design-button.liquid` kullanın. Gömülü sayfa section’ı `shopify/sections/alacam-tasarim-editoru.liquid` dosyasıdır; section ayarında ürün seçilir. JavaScript parçaları ve fontlar da yüklenmelidir.

## 5. Normal Shopify satın alma

1. Müşteri gerçek ürün seçeneklerini ve paket sayısını belirler.
2. **Sepete ekle**, seçili varyantı ve sepet miktarını Shopify’ın yerelleştirilmiş Ajax Cart API’sine gönderir.
3. Shopify eklemeyi kabul ederse müşteri mağazanın sepet sayfasına yönlendirilir.
4. Ödeme Shopify’da tamamlanır.

Bu normal ürün siparişidir. Tasarım dosyası, tasarım kimliği, JSON/base64 veya önizleme bağlantısı siparişe eklenmez. Tasarım yalnız tarayıcı taslağında kalır; kullanıcı PNG/JPG veya JSON indirebilir. Siparişin tasarım içerdiği veya dosyanın mağazaya teslim edildiği söylenmez.

Ürün eklenemezse Shopify’ın hata mesajı gösterilir. Güncel fiyat ve satışa açıklık mağazadan doğrulanır; müşterinin tarayıcıda gösterilen toplamı değiştirmesi Shopify fiyatını değiştirmez.

## Üretim dosyası ayrımı

Mockup PNG/JPG ve 3B görüntü sunum içindir. Düzenlenebilir JSON proje verisidir. Üreticinin onaylı ölçüleri, taşma/güvenli alanı ve baskı şartları tanımlanmadan baskıya hazır dosya değildir. Farklı fiziksel ölçüdeki varyant uygun GLB/şablon hazırlığı gerektirir; varyant seçmek yeni geometri üretmez.
