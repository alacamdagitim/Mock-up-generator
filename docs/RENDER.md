# Stüdyo render

Üst çubuktaki **Render al**, canlı 3D görünümünden bağımsız bir sabit görüntü işi açar. **Render oluştur** ile işlem başlar; gerçek ışık örneği sayısı ve geçen süre gösterilir. Tamamlanan görüntü **PNG indir** ile alınır. İptal veya hata tamamlanmış çıktı sayılmaz.

## Görüntü üretimi

- Three.js 0.180 ile uyumlu `three-gpu-pathtracer` 0.0.24 ve `three-mesh-bvh` 0.9.1 kullanılır. Motor tarayıcıda WebGL2 ile çalışır; ücretli API, render sunucusu veya gizli anahtar gerekmez.
- 1024/2048 px uzun kenar; kare/dikey/yatay oran. Mobilde uzun kenar 1024 px ile sınırlandırılır.
- Standart 64, Yüksek 256 ışık örneği hesaplar. GPU gücü, ürün sayısı ve çözünürlük süreyi etkiler. Başlangıçtaki shader derlemesi de zaman alabilir.
- Yumuşak stüdyo, gün ışığı ve kontrast ışık seçenekleri; alan ışıkları, kodla üretilmiş HDR çevre ve kesintisiz kavisli fiziksel stüdyo zemini kullanılır. Gölge ışık yollarıyla hesaplanır.
- Son aşamada gerçek render dokusuna, aynı modelin baskı rengi / normal / derinlik rehberlerini kullanan cross-bilateral gürültü azaltma uygulanır. HDR örnekler ACES ile sıkıştırıldıktan sonra filtrelenir; yazı ve siluet kenarları rehberlerle korunur. Yüksek kalite daha fazla ışık örneğiyle ince yansımalardaki gürültüyü azaltır; filtre eksik model ayrıntısı veya görsel çözünürlüğü üretmez.
- Beyaz ve sıcak arka plan zeminin gölgelerini içerir. **Şeffaf · gölgesiz**, zeminsiz alfa çıktısı verir.
- Render tasarım, geometri, malzeme ve dokuların bağımsız kopyasını kullanır. Metin ve şekiller seçilen 1024/2048 px çıktı boyutuna uygun yüz dokularına yeniden çizilir; Standart kalitede de 2048 px çıktı 1024 px baskı atlasına düşürülmez; düşük çözünürlüklü yükleme görselinde yeni ayrıntı uydurulmaz.
- Render mevcut normal haritalarını korur; rastgele film normal dokusu eklemez. Bump haritasının raster önizleme mikro dokusu offline çıktıya otomatik çevrilmez; gerçek mikro ayrıntı için modelin normal haritası sağlanmalıdır. Ürünün ön/arka UV eşlemesi korunur; render kopyasının kenar kapatmaları ışık sızıntısını azaltır.
- İş bittiğinde veya iptal edildiğinde render GPU kaynakları bırakılır. İptal edilen işin kendi GPU bağlamı bırakılır; shader hazırlığı ve GPU bekleme döngüleri durdurulur. Yeni denemede yeni canvas/WebGL bağlamı açılır. Canlı editör renderer'ı ve tasarım JSON'u değiştirilmez.

## Çıktının anlamı

PNG, ürün sunumu içindir; CMYK/ICC kontrollü baskı dosyası veya üretici onaylı bıçak izi değildir. Kaynak doypack hâlâ özgün yaklaşık modeldir. Gerçekçi render motoru fiziksel modelde bulunmayan kaynak, körük veya baskı toleransını doğrulayamaz. Nihai ürün doğruluğu için gerçek ölçü ve onaylı üretici modeli gerekir.

WebGL2/float render desteği veya yeterli GPU belleği yoksa hata açıkça gösterilir. Daha küçük çıktı/Standart kaliteyle tekrar denenebilir; normal önizleme dosyası kaliteli render tamamlanmış gibi sunulmaz.

## Shopify dağıtımı

`npm run release` sonrasında Shopify paketindeki **bütün** `assets/alacam-*` dosyalarını yükleyin. Ana giriş `alacam-editor.js` olarak kalır; render motoru ilk kullanımda içerik hash'li JavaScript parçalarından yüklenir. Bu parçalar ana dosyayla aynı Shopify CDN klasöründe bulunmalıdır. Eski üretilmiş yerel parçalar paket hazırlanırken temizlenir. Yeni dosyalar için ek Liquid ayarı veya ortam değişkeni yoktur.

Lisanslar [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) ve derlenen `alacam-licenses.txt` içindedir. Stüdyo çevresi, normal dokusu ve model proje içinde üretilir.


## Çözünürlük ve yerleşim iyileştirmeleri

Canlı görüntü CSS ölçüsü ile piksel tamponunu ayrı yönetir. Küçük Retina önizleme 2× çözünürlüğe çıkabilir; toplam tampon mobilde 1,5 MP, dengeli masaüstünde 3 MP, ayrıntılı masaüstünde 5 MP ile sınırlıdır. Doku bütçesi mobilde 1536 px, masaüstünde 2048 px uzun kenardır. Baskı önizlemesinde mipmap ve cihazın desteklediği anisotropic filtering kullanılır. Güvenli SVG logoları, kendi dosyasındaki küçük artboard ölçüsüne takılmadan 2400 px uzun kenarda rasterize edilir; daha önce PNG'ye dönüştürülmüş eski SVG yüklemeleri için yeniden yükleme gerekir.

Yerleşimler ürünün gerçek 3B sınırlarından hesaplanır. Eğik modellerin tabanı zemine oturtulur; çakışan ürünlerin yatay aralığı boyuta göre açılır. Kamera sekiz sınır köşesini hesaba katar. Yeni yerleşim kadraja sığdırılır; aralık değişikliğinde kullanıcının yakınlaştırma ve kaydırması korunur. Kademeli/katalog/yelpaze düzenlerinde yükseklik farkları kompozisyonun parçasıdır.

Yerleşim paneli açıldığında on bir kart seçili modelin ve tasarımın gerçek 3B görüntüsünden oluşturulur. Ayrı WebGL bağlamları açılmaz: mevcut renderer, geçici 384×256 MSAA render hedefini kullanır. Kartlar kareler arasına dağıtılır ve panel kapanınca işlem iptal edilir. Kartlar ekran görüntüsü kadar kaynak kaliteye sahiptir; müşterinin GLB'sindeki geometri ayrıntısını artırmaz.

Standart kalite opak ürünlerde dört, geçirgen ürünlerde altı; Yüksek kalite on ışık sekmesi kullanır. Offline render dört parçayı bir örnek olarak işler; ekrana her parçada tekrar kopyalamaz. GPU fence, komut kuyruğunun sınırsız büyümesini önler. GPU bekleme, shader hatası, iptal ve kayıp bağlam açıkça ele alınır. Kullanılan WebGL motorunda ayrı vernik lobu bazı ince kabukları siyah üretebildiğinden, yalnız offline kopyada kaplama ve ana yüzey pürüzlülüğü tek GGX lobuna yaklaşık olarak birleştirilir. Bu yüzden çift katmanlı verniğin optiği birebir korunmaz; canlı görünüm ve asıl GLB değiştirilmez. Malzemesiz GLB için mat beyaz ve glTF varsayılan ön yüz yönü kullanılır.

Bu seçimler [Three.js responsive rendering rehberi](https://threejs.org/manual/pages/responsive.html), [renk yönetimi rehberi](https://threejs.org/manual/pages/color-management.html) ve kullanılan [three-gpu-pathtracer 0.0.24 dokümantasyonu](https://github.com/gkjohnson/three-gpu-pathtracer/tree/v0.0.24) temel alınarak uygulanmıştır. WebGPU sürümüne körlemesine geçilmemiştir; mevcut WebGL2, UV ve indirilebilir çıktı akışı korunur.

## Kalite doğrulaması

`npm test` piksel bütçelerini ve çıktı/doku çözünürlüğü ilişkisini de denetler. `npm run test:quality` gerçek WebGL görüntülerini, on bir ayrı yerleşim kartını, 66 geometri/kadraj durumunu, küçük SVG netliğini ve mobil taşmayı kontrol eder. `ALACAM_QUALITY_RENDER=1 npm run test:quality` gerçek 2048 px / 64 örnek işini tamamlar, PNG boyutunu ve tasarımın yeşil piksellerini doğrular; siyah siluet başarılı sayılmaz. `ALACAM_MODEL_FIXTURE=/mutlak/yol/model.glb` ile izinli üretici modeli kullanılabilir. macOS Metal ölçümü için `ALACAM_GPU_METAL=1` seçeneği vardır; diğer cihazlarda verilmez.

`test-results/render-quality/` kontrol görüntülerini ve süreleri içerir; bu dosyalar geliştirme kanıtıdır ve dağıtım paketine girmez. Render süresi donanım, model, örnek sayısı ve çözünürlüğe bağlıdır; tüm cihazlar için sabit bir hız veya fotoğraf gerçekçiliği garantisi yoktur.
