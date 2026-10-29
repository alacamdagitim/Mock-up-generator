# Teneke kutu PSD hazırlığı

Gönderilen `Tin Can Mockup.psd` için çalışan, iki tasarım yüzeyli sahne hazırlandı. Kaynak PSD 6000 × 4500 RGB/8; gövde Smart Object'i 1472 × 1179, kapak 853 × 853 pikseldir. Gövde Photoshop `quiltWarp` kontrol ağı, kapak 4 × 4 Bézier ağı kullanır. Orijinal piksel maskeleri, Multiply gölgesi ve Screen yansıması korunur. Kaynak dosya değiştirilmez; işlem öncesi/sonrası SHA256 denetlenir.

## Sonuçlar

Özel dosyalar `data/prepared-mockups/tin-can-r1/` altında, Git dışında kalır:

- `tin-can-alacam-6k.png` ve `.jpg`: 6000 × 4500 örnek tasarım çıktısı; büyütülmüş görüntü değildir.
- `tin-can-alacam-preview.jpg`: küçük sunum önizlemesi.
- `artwork-body.svg/.png` ve `artwork-lid.svg/.png`: bu proje için hazırlanmış örnek Alaçam tasarımları.
- `web/`: 4096 × 3072 taban, iki maske, iki RG16LE eşleme, gölge/yansıma ve baskısız kart görseli.
- `web/catalog.local.json`: iki yüzeyi aynı sahnede tanımlayan yerel katalog.
- `native/`: özgün boyutta kontrol ve yeniden üretim dosyaları.
- `preparation.json`: kaynak özeti, çözünürlük ve karşılaştırma ölçümleri.

Kaynak PSD, çıkarılmış orijinal tasarımlar ve 6K hazırlık önbelleği Git dışında tutulur. Tarayıcı için hazırlanmış 4K taban, maskeler, eşlemeler, ışık katmanları ve özgün Alaçam örnek tasarımları `public/product-assets/mockup-scenes/tin-can-r1/` altında yayımlanır. Kaynak dosyanın hakları sahibine aittir; bu sahne CC0 değildir. Kullanım, mağaza sahibinin bildirdiği web editörü iznine dayanır.

## Shopify ürününe bağlama

1. Ürün meta alanı **`custom.mockup_sahneleri`**, türü **JSON** olmalı.
2. [Hazır katalog](../shopify/metafields/tin-can-r1.json) dosyasının **tam içeriğini** bu alana yapıştırın. JSON dosyasını dosya referansı olarak yüklemeyin.
3. Bu sahne için **`custom.mockup_gorselleri` alanını boş bırakın**. Katalog, baskısız küçük görseli zaten içerir. Eski bir görsel listesi doluysa sadece o listeyle eşleşen sahneler gösterilir.
4. Mevcut güncel `online-design-vercel.liquid` düğmesi JSON'u üründen otomatik okur. Yeni Liquid değişikliği veya PSD yükleme gerekmez.
5. Üründeki “Tasarla” düğmesinden açın. Yerleşimler'de teneke kutu kartı; tasarımda **Gövde / Kapak** seçenekleri görünür. PNG/JPG indirme 4096 × 3072 pikseldir.

[Canlı örnek](https://mock-up-generator-y265.vercel.app/tin-can-demo.html), örnek Alaçam tasarımıyla açılır; ürün ataması yapmaz. [Yayımlanan sahne tanımı](https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/tin-can-r1/scene.json) tek sahnedir; meta alana bunun yerine yukarıdaki katalog dosyasını yapıştırın.

Yeni ve boş taslak 1472 × 1179 piksellik gövde çalışma alanıyla başlar. Kapak da aynı çalışma alanından kare yüzeye aktarılır; kapak tasarımını 3D yerine fotoğrafta kontrol edin. Eski taslaklar korunur. Üründe SVG bıçak izi varsa onun çalışma alanı önceliklidir; bu sahne gerçek üretici şablonunun uyumunu kendiliğinden doğrulamaz.

Gövde ve kapağın toplam 96 MiB ham UV verisi yaklaşık 2,8 MiB Brotli dosyası olarak saklanır. `vercel.json`, `Content-Encoding: br` başlığını tanımlar; Vite geliştirme/önizleme sunucusu da aynı başlığı uygular. Başka barındırmaya taşınırsa `.uv.bin.br` dosyaları bu başlıkla sunulmalıdır. Tarayıcı açtıktan sonra bellek boyutu sıkıştırılmış indirme boyutundan büyüktür; düşük bellekli gerçek telefonlarda ayrıca ölçüm gerekir.

`web/catalog.local.json` içindeki `/assets/` yolları yalnız aşağıdaki yerel inceleme sunucusunda çalışır; Shopify'a yapıştırılacak dosya değildir.

## Tekrar hazırlama

Aşağıdaki Python bağımlılıkları yalnız çevrimdışı hazırlık içindir. Vercel build'ine eklenmez.

```sh
python3 -m venv /tmp/alacam-psd-tools
/tmp/alacam-psd-tools/bin/pip install -r scripts/requirements-private-mockup.txt
/tmp/alacam-psd-tools/bin/python scripts/prepare-private-tin-can.py \
  --psd '/özel/klasör/Tin Can Mockup.psd' \
  --output data/prepared-mockups/tin-can-r1
```

Hazırlayıcı bu doğrulanmış PSD'nin ölçü ve katman yapısını kontrol eder; her PSD'yi kendiliğinden dönüştüren genel bir içe aktarıcı değildir. Dışarıdan bağlı Smart Object açmaz. Photoshop'un kendi yeniden render'ı çalıştırılmamıştır; görüntü, PSD kontrol ağı ve kayıtlı Smart Object pikselleriyle doğrulanmış bir aktarım kullanır.

Özgün tasarım yeniden kurulduğunda Smart Object katmanları içindeki ortalama kanal farkı gövdede 0,63/255, kapakta 1,44/255 oldu. Bu, bütün PSD efektlerinin Photoshop ile birebir uyumlu olduğu iddiası değildir. Kontrol ağı değerlendirmesi için [Adobe 4 × 4 warp](https://developer.adobe.com/photoshop/uxp/2021/ps_reference/interfaces/customwarp4x4/) ve [PhotoshopAPI warp yapısı](https://photoshopapi.readthedocs.io/en/latest/code/geometry/smartobjectwarp.html) açıklamaları kullanıldı.

## Canlı yerel inceleme

Önce normal Vite geliştirme sunucusu açık olmalı:

```sh
npm run dev
node scripts/serve-prepared-mockup.mjs \
  --assets data/prepared-mockups/tin-can-r1 \
  --port 5189
```

`http://127.0.0.1:5189/` sayfası gerçek üretim `src/mockups/compositor.ts` motorunu kullanır. Gövde/kapak PNG, JPG veya WebP yüklenerek değiştirilebilir. Örnek ve baskısız görünüm düğmeleri, PNG/JPG indirme bulunur. Önizleme masaüstünde 1536, mobilde 768 px uzun kenarla çizilir; indirme 4096 × 3072'dir. 6K çıktı ayrı hazırlık aracında üretilir; bu sayfanın 6K indirme yaptığı iddia edilmez.

Sunucu yalnız loopback üzerinden, manifestteki dosyaları sunar; PSD veya kaynak klasördeki diğer dosyalar açılmaz. Kaynak efektlerin hazırlanmış 4K sürümü belleğe yüklendiğinden fiziksel düşük bellekli telefonlarda ek ölçüm gerekir. Bu yerel inceleme aracı üretim barındırma hizmeti değildir.

6K örnek çıktıyı yeniden oluşturma:

```sh
/tmp/alacam-psd-tools/bin/python scripts/prepare-private-tin-can.py \
  --psd '/özel/klasör/Tin Can Mockup.psd' \
  --output data/prepared-mockups/tin-can-r1 --proof-only \
  --body-artwork data/prepared-mockups/tin-can-r1/artwork-body.png \
  --lid-artwork data/prepared-mockups/tin-can-r1/artwork-lid.png
```

## Doğrulama

```sh
/tmp/alacam-psd-tools/bin/python tests/psd-quilt-warp.test.py
npm run test:tin-can
node tests/tin-can-public.browser.mjs
```

Özel Chromium yolu `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, inceleme adresi `ALACAM_TIN_REVIEW_URL` ile seçilebilir. Özel hazırlık testi gerçek kaynak dosyaları ve yerel inceleme sunucusu gerektirir. `tin-can-public.browser.mjs` ise yayıma hazır dosyalarla Vite üzerindeki tam editörü, sıkıştırılmış eşlemeleri, Gövde/Kapak seçimini, 4K indirmeyi ve mobil görünümü sınar; `ALACAM_TEST_URL` ile üretim adresinde de çalışır.

Altı sayısal test kontrol noktalarını, nonuniform quilt sınırlarını, yama sürekliliğini ve bozuk geometri reddini doğrular. Altı tarayıcı kontrolü gerçek kompoziti, PNG/JPG indirmeyi, yüzey bağımsızlığını, örneğe dönüşü, 390 px mobil görünümü ve yerel kaynak sınırını doğruladı. İki maske dışındaki 11.497.447 piksel tasarım değiştiğinde aynen kaldı; gövde değişikliği kapağa, kapak değişikliği gövdeye taşmadı. Dış ağ isteği ve tarayıcı hatası oluşmadı.

Mockup sabit kamera açılı bir sunum görselidir. Bıçak izi, fiziksel ölçü, CMYK/ICC ve üretici onayı bulunmadığından baskıya hazır çıktı değildir.
