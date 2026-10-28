# Hazır PSD mockup: ilk yerel deneme

Matcha_Cup_Mockup.psd ile Alaçam tasarımı uygulanmış, çalışan bir sabit açılı deneme hazırlandı. Bu çalışma mevcut Shopify/Vercel editöründeki Yerleşimler paneline henüz eklenmedi. Üretim React/Fabric/Three.js akışı değişmedi; ayrı, yerel bir kalite karşılaştırmasıdır.

## Gerçek dosyada bulunanlar

- PSD: 600 × 800 px, RGB/8; yanındaki JPEG: 1200 × 1600 px. Büyük JPEG, değiştirilebilir PSD'nin kaynak ayrıntısını artırmaz.
- Gömülü Smart Object: 1050 × 1000 px. Tasarım, Photoshop `warpCylinder` dönüşümüyle ön baskı alanına yerleşir.
- Ayrı fotoğraf tabanı, kap/buz/içecek görüntüsü, maskeler, Linear Burn gölge ve Screen parlama katmanları vardır. Yeni tasarıma bu gerçek efekt katmanları uygulanır.
- Bu bir merkez etiket/baskı denemesidir. Bardak modeli, içecek veya kamera açısı serbestçe değişmez; 360° görünüm sağlamaz.

Bu bilgisayardaki Photoshop dışa aktarması lisans yenileme kısıtı nedeniyle kullanılamadı. Filigranlı uygulama görüntüsü işlenmedi veya çıktı olarak kullanılmadı. Bağımsız açık kaynak hazırlayıcı, verilen PSD'nin gömülü kaynak tasarımıyla önceden kaydedilmiş baskı piksellerini eşleştirerek yaklaşık bir UV alanı kalibre eder. Bu, Photoshop'un silindir dönüşümünün birebir uygulaması değildir.

Kalibrasyon 191 bağımsız özellik eşleşmesini kullanır; eğitimden ayrı 39 doğrulama noktasında medyan hata 0,192 px, yüzde 90 hata 0,343 px, en yüksek hata 0,519 px oldu. Bu ölçüm kaynak tasarımdaki eşleşme noktalarına aittir; bütün yüzey için doğruluk garantisi değildir. Eşleme, kaynak tasarımın x=210–839 px merkez bölgesine sınırlandırılır. Kullanılan bölgede pozitif Jacobian ve ters çözüm hatası denetlenir; tam sarım veya bu alan dışında tasarım desteği iddia edilmez.

## Kaynak dosyaların gizliliği ve lisans

Dosyanın kaynağı mockups-design.com olarak doğrulandı. [Resmi lisans](https://mockups-design.com/license/), tasarım eklenmiş düzleştirilmiş son görsellerin ticari kullanımına izin verir; açık PSD/TIF mockup dosyalarının dağıtımını yasaklar. [FAQ](https://mockups-design.com/faq/) değiştirilmiş kaynak şablonların da paylaşılmaması gerektiğini belirtir.

Bu yüzden PSD, gömülü PSB, fotoğraf tabanı, maske, gölge/parlama katmanları ve UV haritası `public/`, `src/`, `dist/`, Shopify assets veya GitHub'a eklenmez. Hazırlayıcı ve yerel CLI, kaynak paketini proje dışında tutmayı zorunlu kılar. Kullanıcıya yalnız birleşik PNG/JPG sunulur. Bu son görsel izni, herkese açık bir mockup editöründe yeniden kullanılabilir kaynak katmanları dağıtma izni olarak yorumlanmaz. Gelecekteki web entegrasyonu için kaynak hakları ve yalnız son görüntü döndüren özel işleme mimarisi ayrıca değerlendirilmelidir.

## Yerel hazırlama

Python 3.9+ ve bir sanal ortam kullanın. Bunlar yalnız çevrimdışı hazırlık araçlarıdır; üretim tarayıcı paketine veya Vercel derlemesine eklenmez.

```sh
python3 -m venv /tmp/alacam-mockup-tools
/tmp/alacam-mockup-tools/bin/python -m pip install -r scripts/requirements-private-mockup.txt
/tmp/alacam-mockup-tools/bin/python scripts/prepare-private-matcha.py \
  --psd /ozel/klasor/Matcha_Cup_Mockup.psd \
  --output /tmp/alacam-private-matcha
```

Hazırlayıcı yalnız doğrulanan bu Matcha şablonunun boyut, katman ve Smart Object düzenini destekler. Genel PSD içe aktarıcısı değildir. Harici bağlı Smart Object açmaz; giriş PSD'sine yazmaz ve işlemden önce/sonra SHA256 bütünlüğünü denetler. Hazırlanan özel klasörde taban/efekt PNG'leri, RG16LE eşleme, kapsam maskesi, manifest ve kalibrasyon raporu bulunur. Bu klasörü web varlığı olarak dağıtmayın.

## Tasarım uygulama ve indirme

Şeffaf PNG tasarım kullanıldığında bardağın hazır fotoğrafı görünmeye devam eder. Tasarım 1050 × 1000 kaynak alana oranı korunarak ortalanır; baskı alanı dışında kırpılır. Pilotun Alaçam tasarımı mevcut Fabric `renderFace` işleviyle üretildi.

```sh
npm ci
npx playwright install chromium
npm run mockup:preview -- \
  --assets /tmp/alacam-private-matcha \
  --artwork /ozel/klasor/tasarim.png \
  --output /tmp/alacam-matcha-sonuc
```

Çıktı `alacam-mockup.png` ve `alacam-mockup.jpg` dosyalarıdır; doğal boyut 600 × 800 px. `--max-edge 600` yalnız küçültür; büyük bir değer kaynak görüntüyü büyütmez. `--ui` ayrı yerel Chromium penceresinde tasarım seçme ve PNG/JPG indirmeyi açar. Belirli bir Chromium kurulumu için `PLAYWRIGHT_CHROMIUM_EXECUTABLE` kullanılabilir; arayüz açılacaksa headless-shell yerine tam Chromium gerekir.

CLI gerçek HTTP sunucusu açmaz. Kaynaklar Node tarafından yalnız izole Playwright bağlamının bellekteki isteklerine verilir; dış ağ, POST ve kaynak klasörü dışına çıkış engellenir. Bu yerel önizleme adresi başka tarayıcıda veya Shopify'da açılabilen bir sunucu adresi değildir.

## Kontroller

```sh
npm run test:private-mockup

ALACAM_PRIVATE_MOCKUP_ASSETS=/tmp/alacam-private-matcha \
ALACAM_PRIVATE_MOCKUP_ARTWORK=/ozel/klasor/tasarim.png \
ALACAM_PRIVATE_MOCKUP_GRID=/ozel/klasor/kontrol-deseni.png \
npm run test:private-mockup:fixture
```

Sentetik verilerle 8 yerel UI/aktarım ve 10 gerçek kompozit motoru kontrolü geçti: RG16 yönü, bilinear örnekleme, premultiplied alfa, kapsam maskesi, dört karışım modu, boyut sınırları, iptal, ağ/klasör sınırları ve mobil görünüm. Gerçek özel Matcha paketiyle 7 ek kontrol geçti: 600×800 PNG/JPG, PNG byte eşitliği, tasarım değiştirme, geri dönüşte aynı SHA256, yaklaşık eşleme bilgisinin görünmesi ve 390 px mobil sınırları. Dış istek ve tarayıcı hatası yok.

PNG/JPG bir sunum görselidir. Kesim şablonu, ölçülü üretim çıktısı veya baskıya hazır dosya değildir. 4K kaynak PSD sağlanmadığı için 4K ayrıntı iddia edilmez.
