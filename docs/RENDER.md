# Stüdyo render

Üst çubuktaki **Render al**, mevcut ürünün, tasarımın ve yerleşimin önizlemesiyle geniş bir pencere açar. Görsel solda; format, çözünürlük, ışık ve gölge ayarları sağdadır. **Render oluştur** ile ayrı bir sabit görüntü işi başlar; gerçek ışık örneği sayısı ve geçen süre gösterilir. Tamamlanan görüntü seçilen PNG veya JPG biçiminde indirilir. İptal veya hata tamamlanmış çıktı sayılmaz.

## Görüntü üretimi

- Three.js 0.180 ile uyumlu `three-gpu-pathtracer` 0.0.24 ve `three-mesh-bvh` 0.9.1 kullanılır. Motor tarayıcıda WebGL2 ile çalışır; ücretli API, render sunucusu veya gizli anahtar gerekmez.
- 1K/2K/4K/8K (1024/2048/4096/8192 px) uzun kenar; kare/dikey/yatay oran. Masaüstünde varsayılan 2K, mobilde üst sınır 1K. 8K, bilinen cihaz belleği 4 GB altında olduğunda kapatılır; tarayıcının çıktı tuvali ve GPU desteği ayrıca denetlenir.
- 4K/8K görüntü, kameranın `setViewOffset` pencereleriyle gerçek piksel ölçüsünde hesaplanır. 1024 px parça içleri ve her kenarda 12 px filtre payı, GPU float tamponunun uzun kenarını en fazla 1048 px tutar. Parçalar ölçeklenmeden çıktı tuvaline birleştirilir. Her parça tam 64/256 örneğini hesaplar; ilerleme bütün işin ağırlıklı toplamıdır. Son PNG/JPG gerçek seçilen ölçüdedir. 8K kare çıktı tuvali tek başına yaklaşık 256 MiB RAM gerektirir; işlem süresi ve cihaz belleği sınırları devam eder.
- Standart 64, Yüksek 256 ışık örneği hesaplar. GPU gücü, ürün sayısı ve çözünürlük süreyi etkiler. Başlangıçtaki shader derlemesi de zaman alabilir.
- Yumuşak stüdyo, gün ışığı ve kontrast ışık seçenekleri; alan ışıkları, kodla üretilmiş HDR çevre ve kesintisiz kavisli fiziksel stüdyo zemini kullanılır. Gölge ışık yollarıyla hesaplanır.
- Son aşamada gerçek render dokusuna, aynı modelin baskı rengi / normal / derinlik rehberlerini kullanan cross-bilateral gürültü azaltma uygulanır. HDR örnekler ACES ile sıkıştırıldıktan sonra filtrelenir; yazı ve siluet kenarları rehberlerle korunur. Yüksek kalite daha fazla ışık örneğiyle ince yansımalardaki gürültüyü azaltır; filtre eksik model ayrıntısı veya görsel çözünürlüğü üretmez.
- Beyaz ve sıcak arka planda **Zemin gölgesini dahil et** seçeneği vardır. **Şeffaf · gölgesiz**, PNG alfa çıktısı verir. JPG alfa taşıyamadığı için şeffaf seçimde beyaz fona döner; şeffaflık düğmesi PNG seçilince kullanılabilir.
- Render tasarım, geometri, malzeme ve dokuların bağımsız kopyasını kullanır. Metin ve şekiller çıktı boyutuna göre en çok 4096 px yüz dokularına yeniden çizilir. Doku atlası gerçek kaynak boyutu, doku sayısı ve mobil 32 MiB / masaüstü 128 MiB hedef bütçesine göre sınırlandırılır. 8K çıktı kaynak görsellerin ayrıntısını artırmaz; baskı dokusu en çok 4K olur. Standart kalitede de 2K çıktı gereksiz yere 1K baskı atlasına düşürülmez.
- Render mevcut normal haritalarını korur; rastgele film normal dokusu eklemez. Bump haritasının raster önizleme mikro dokusu offline çıktıya otomatik çevrilmez; gerçek mikro ayrıntı için modelin normal haritası sağlanmalıdır. Ürünün ön/arka UV eşlemesi korunur; render kopyasının kenar kapatmaları ışık sızıntısını azaltır.
- İş bittiğinde veya iptal edildiğinde render GPU kaynakları bırakılır. İptal edilen işin kendi GPU bağlamı bırakılır; shader hazırlığı ve GPU bekleme döngüleri durdurulur. Yeni denemede yeni canvas/WebGL bağlamı açılır. Canlı editör renderer'ı ve tasarım JSON'u değiştirilmez.

## Çıktının anlamı

PNG/JPG, ürün sunumu içindir; CMYK/ICC kontrollü baskı dosyası veya üretici onaylı bıçak izi değildir. Kaynak doypack hâlâ özgün yaklaşık modeldir. Gerçekçi render motoru fiziksel modelde bulunmayan kaynak, körük veya baskı toleransını doğrulayamaz. Nihai ürün doğruluğu için gerçek ölçü ve onaylı üretici modeli gerekir.

WebGL2/float render desteği veya yeterli GPU belleği yoksa hata açıkça gösterilir. Daha küçük çıktı/Standart kaliteyle tekrar denenebilir; normal önizleme dosyası kaliteli render tamamlanmış gibi sunulmaz.

## Shopify dağıtımı

`npm run release` sonrasında Shopify paketindeki **bütün** `assets/alacam-*` dosyalarını yükleyin. Ana giriş `alacam-editor.js` olarak kalır; render motoru ilk kullanımda içerik hash'li JavaScript parçalarından yüklenir. Bu parçalar ana dosyayla aynı Shopify CDN klasöründe bulunmalıdır. Eski üretilmiş yerel parçalar paket hazırlanırken temizlenir. Yeni dosyalar için ek Liquid ayarı veya ortam değişkeni yoktur.

Lisanslar [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) ve derlenen `alacam-licenses.txt` içindedir. Stüdyo çevresi ve örnek model proje içinde üretilir. Ürün dosyası bağlıysa kullanıcının GLB modeli kullanılır.


## Çözünürlük ve yerleşim iyileştirmeleri

Canlı görüntü CSS ölçüsü ile piksel tamponunu ayrı yönetir. Küçük Retina önizleme 2× çözünürlüğe çıkabilir; toplam tampon mobilde 1,5 MP, dengeli masaüstünde 3 MP, ayrıntılı masaüstünde 5 MP ile sınırlıdır. Doku bütçesi mobilde 1536 px, masaüstünde 2048 px uzun kenardır. Baskı önizlemesinde mipmap ve cihazın desteklediği anisotropic filtering kullanılır. Güvenli SVG logoları, kendi dosyasındaki küçük artboard ölçüsüne takılmadan 2400 px uzun kenarda rasterize edilir; daha önce PNG'ye dönüştürülmüş eski SVG yüklemeleri için yeniden yükleme gerekir.

Yerleşimler ürünün gerçek 3B sınırlarından hesaplanır. Eğik modellerin tabanı zemine oturtulur; çakışan ürünlerin yatay aralığı boyuta göre açılır. Kamera sekiz sınır köşesini hesaba katar. Yeni yerleşim kadraja sığdırılır; aralık değişikliğinde kullanıcının yakınlaştırma ve kaydırması korunur. Kademeli/katalog/yelpaze düzenlerinde yükseklik farkları kompozisyonun parçasıdır.

Yerleşim paneli açıldığında on bir kart seçili modelin ve tasarımın gerçek 3B görüntüsünden oluşturulur. Ayrı WebGL bağlamları açılmaz: mevcut renderer, geçici 384×256 MSAA render hedefini kullanır. Kartlar kareler arasına dağıtılır ve panel kapanınca işlem iptal edilir. Kartlar ekran görüntüsü kadar kaynak kaliteye sahiptir; müşterinin GLB'sindeki geometri ayrıntısını artırmaz.

Standart kalite opak ürünlerde dört, geçirgen ürünlerde altı; Yüksek kalite on ışık sekmesi kullanır. Offline render dört parçayı bir örnek olarak işler; ekrana her parçada tekrar kopyalamaz. GPU fence, komut kuyruğunun sınırsız büyümesini önler. GPU bekleme, shader hatası, iptal ve kayıp bağlam açıkça ele alınır. Kullanılan WebGL motorunda ayrı vernik lobu bazı ince kabukları siyah üretebildiğinden, yalnız offline kopyada kaplama ve ana yüzey pürüzlülüğü tek GGX lobuna yaklaşık olarak birleştirilir. Bu yüzden çift katmanlı verniğin optiği birebir korunmaz; canlı görünüm ve asıl GLB değiştirilmez. Malzemesiz GLB için mat beyaz ve glTF varsayılan ön yüz yönü kullanılır.

Bu seçimler [Three.js responsive rendering rehberi](https://threejs.org/manual/pages/responsive.html), [renk yönetimi rehberi](https://threejs.org/manual/pages/color-management.html) ve kullanılan [three-gpu-pathtracer 0.0.24 dokümantasyonu](https://github.com/gkjohnson/three-gpu-pathtracer/tree/v0.0.24) temel alınarak uygulanmıştır. WebGPU sürümüne körlemesine geçilmemiştir; mevcut WebGL2, UV ve indirilebilir çıktı akışı korunur.

## Kalite doğrulaması

`npm test` piksel bütçelerini ve çıktı/doku çözünürlüğü ilişkisini de denetler. `npm run test:quality` gerçek WebGL görüntülerini, on bir ayrı yerleşim kartını, 66 geometri/kadraj durumunu, küçük SVG netliğini ve mobil taşmayı kontrol eder. `ALACAM_QUALITY_RENDER=1 npm run test:quality` gerçek 2048 px / 64 örnek işini tamamlar, PNG boyutunu ve tasarımın yeşil piksellerini doğrular; siyah siluet başarılı sayılmaz. `ALACAM_MODEL_FIXTURE=/mutlak/yol/model.glb` ile izinli üretici modeli kullanılabilir. macOS Metal ölçümü için `ALACAM_GPU_METAL=1` seçeneği vardır; diğer cihazlarda verilmez.

`test-results/render-quality/` kontrol görüntülerini ve süreleri içerir; bu dosyalar geliştirme kanıtıdır ve dağıtım paketine girmez. Render süresi donanım, model, örnek sayısı ve çözünürlüğe bağlıdır; tüm cihazlar için sabit bir hız veya fotoğraf gerçekçiliği garantisi yoktur.

## Yüzey rengi ve dışa aktarma penceresi

Tasarım alanındaki **Yüzey rengi**, seçili ön/arka yüzü değiştirir. Önerilen renkler, HSV alanı, ton sürgüsü, HEX ve desteklenen tarayıcılarda ekran renk seçicisi bulunur. Sürekli sürükleme tek geri alma adımıdır. Renkler sürüm 1 JSON içinde isteğe bağlı `surfaceColors.front/back` olarak saklanır; eski tasarımların `background` değeri uyumluluk için korunur. İçe aktarılan rastgele SVG'nin çok sayıdaki kesim paneli otomatik anlamlandırılmaz; kontrol tanımlı baskı yüzünün tamamına uygulanır.

**Görsel** sekmesi render üretir. **Bıçak izi** sekmesi mevcut SVG şablonunu ve seçili yüz tasarımını gösterir; tasarımlı şablon/yalnız şablon seçilebilir. SVG, ayrı bıçak izi vektör katmanı ve gömülü PNG tasarım içerir. PNG ve PDF, en çok 4K RGB görsel taşır (mobil 2K). PDF düzenlenebilir vektör veya ICC kontrollü CMYK değildir. Fiziksel ölçüler tanımlıysa SVG ve PDF sayfa ölçüsü bunları korur; bu ölçülerin üretici onayı ayrıca gerekir. Orijinal üretici dosyası ayrı bağlantıdan açılır. AI ve CMYK çıktısı henüz yoktur.

**Paylaş** sekmesi 3B görüntü/2B tasarım önizlemesi, JSON indirme ve yapılandırılmış sunucudan dönen gerçek görsel/JSON dosya bağlantılarını sunar. Döndürülebilen herkese açık 3B sayfa, kullanıcı daveti veya erişim yetkileri sunmaz. Sunucu depolaması bağlı değilse bağlantı üretme kapalıdır; cihaz kaydı uzaktan paylaşılmış gibi gösterilmez.

## Bu sürümün kontrolleri

- `npm test`: çıktı ölçüleri, parçaların tam kaplama/çakışmama koşulları, mobil sınır ve yüzey rengi/şema uyumluluğu.
- `npm run test:render`: gerçek 1K render, indirme, iptal/yeniden deneme, GPU ve Blob temizliği, masaüstü/mobil modal ve gerçek yükleme hatası.
- `npm run test:exports`: yüzey rengi, geri alma/yenileme, gerçek SVG/PNG/PDF indirme, paylaşım durumu ve mobil pencere.
- `npm run test:render-snapshot`: ön/arka malzeme adlarının gerçek 4K/2K piksel eşlemesi, kaynakların değişmezliği ve GPU bağlamını kapatma eklentisi yokken takılan shader'ın iptali.
- `npm run test:high-resolution`: özgün küçük iki renkli kalibrasyon sahnesiyle gerçek 8192×8192 JPG üretir; renk pikselleri, 64 örnek, en fazla 1048 px GPU parçası ve kaynak temizliği denetlenir. Bu bir ürün fotogerçekçilik testi değildir. `ALACAM_HIGH_RESOLUTION=4096 ALACAM_HIGH_FORMAT=png` ile 4K PNG denenebilir.
- `ALACAM_HIGH_RESOLUTION=4096 ALACAM_HIGH_FORMAT=png ALACAM_HIGH_SHADOW=1 npm run test:high-resolution`: fiziksel zeminli 4K PNG üretir ve düz arka planda 1024 px parça sınırlarının iki yanındaki ton farkını ölçer.

Tarayıcı testleri için önce `npm run dev` çalıştırılır. Farklı portta `ALACAM_TEST_URL` verilir. Yerel Chromium yolu gerekiyorsa `PLAYWRIGHT_CHROMIUM_EXECUTABLE` tanımlanır; `ALACAM_GPU_METAL=1` yalnız uygun macOS cihazlarda kullanılır. 8K kalibrasyon bu geliştirme cihazında yaklaşık 150 saniye sürdü; bu süre ürün ve donanıma göre değişir.

Parçalı kamera projeksiyonu [Three.js PerspectiveCamera belgesine](https://threejs.org/docs/pages/PerspectiveCamera.html#setViewOffset) dayanır. Projedeki sabit 0.0.24 WebGL motorunun API'si kullanılır; yeni WebGPU sürümleri mevcut Three.js sürümüyle birlikte ayrıca taşınıp test edilmeden eklenmez.

Render örnekleri tam görselin piksel koordinatlarına bağlanan scrambled Sobol dizisini kullanır. Böylece her kamera parçasında ayrı ortak ışık dizisi başlatmanın düz zeminde oluşturduğu ton blokları önlenir. Sürümü sabitlenmiş motorun shader kurulumu `src/render/sampling.ts` içinde doğrulanır; beklenen shader yapısı değişirse sessizce hatalı render üretmek yerine açık hata verir. Kamera parçası değişince örnek indeksi aynı başlangıca döner; global koordinat ve 12 px filtre payı sınır tutarlılığını korur.
