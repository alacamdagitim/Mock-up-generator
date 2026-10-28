# Stüdyo render

Üst çubuktaki **Render al**, canlı 3D görünümünden bağımsız bir sabit görüntü işi açar. **Render oluştur** ile işlem başlar; gerçek ışık örneği sayısı ve geçen süre gösterilir. Tamamlanan görüntü **PNG indir** ile alınır. İptal veya hata tamamlanmış çıktı sayılmaz.

## Görüntü üretimi

- Three.js 0.180 ile uyumlu `three-gpu-pathtracer` 0.0.24 ve `three-mesh-bvh` 0.9.1 kullanılır. Motor tarayıcıda WebGL2 ile çalışır; ücretli API, render sunucusu veya gizli anahtar gerekmez.
- 1024/2048 px uzun kenar; kare/dikey/yatay oran. Mobilde uzun kenar 1024 px ile sınırlandırılır.
- Standart 64, Yüksek 256 ışık örneği hesaplar. GPU gücü, ürün sayısı ve çözünürlük süreyi etkiler. Başlangıçtaki shader derlemesi de zaman alabilir.
- Yumuşak stüdyo, gün ışığı ve kontrast ışık seçenekleri; alan ışıkları, kodla üretilmiş HDR çevre ve kesintisiz kavisli fiziksel stüdyo zemini kullanılır. Gölge ışık yollarıyla hesaplanır.
- Son aşamada gerçek render dokusuna, aynı modelin baskı rengi / normal / derinlik rehberlerini kullanan cross-bilateral gürültü azaltma uygulanır. HDR örnekler ACES ile sıkıştırıldıktan sonra filtrelenir; yazı ve siluet kenarları rehberlerle korunur. Yüksek kalite daha fazla ışık örneğiyle ince yansımalardaki gürültüyü azaltır; filtre eksik model ayrıntısı veya görsel çözünürlüğü üretmez.
- Beyaz ve sıcak arka plan zeminin gölgelerini içerir. **Şeffaf · gölgesiz**, zeminsiz alfa çıktısı verir.
- Render tasarım, geometri, malzeme ve dokuların bağımsız kopyasını kullanır. Metin ve şekiller render için yeniden 1200×1800 yüz dokularına çizilir; düşük çözünürlüklü yükleme görselinde yeni ayrıntı uydurulmaz.
- Film için özgün normal dokusu kullanılır. Ürünün ön/arka UV eşlemesi korunur; render kopyasının kenar kapatmaları ışık sızıntısını azaltır.
- İş bittiğinde veya iptal edildiğinde render GPU kaynakları bırakılır. Devam eden shader hazırlığı güvenle sonlanırken iptal durumu bir süre açık kalabilir; pencere yine kapatılabilir. Yeni denemede yeni canvas/WebGL bağlamı açılır. Canlı editör renderer'ı ve tasarım JSON'u değiştirilmez.

## Çıktının anlamı

PNG, ürün sunumu içindir; CMYK/ICC kontrollü baskı dosyası veya üretici onaylı bıçak izi değildir. Kaynak doypack hâlâ özgün yaklaşık modeldir. Gerçekçi render motoru fiziksel modelde bulunmayan kaynak, körük veya baskı toleransını doğrulayamaz. Nihai ürün doğruluğu için gerçek ölçü ve onaylı üretici modeli gerekir.

WebGL2/float render desteği veya yeterli GPU belleği yoksa hata açıkça gösterilir. Daha küçük çıktı/Standart kaliteyle tekrar denenebilir; normal önizleme dosyası kaliteli render tamamlanmış gibi sunulmaz.

## Shopify dağıtımı

`npm run release` sonrasında Shopify paketindeki **bütün** `assets/alacam-*` dosyalarını yükleyin. Ana giriş `alacam-editor.js` olarak kalır; render motoru ilk kullanımda içerik hash'li JavaScript parçalarından yüklenir. Bu parçalar ana dosyayla aynı Shopify CDN klasöründe bulunmalıdır. Eski üretilmiş yerel parçalar paket hazırlanırken temizlenir. Yeni dosyalar için ek Liquid ayarı veya ortam değişkeni yoktur.

Lisanslar [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) ve derlenen `alacam-licenses.txt` içindedir. Stüdyo çevresi, normal dokusu ve model proje içinde üretilir.
