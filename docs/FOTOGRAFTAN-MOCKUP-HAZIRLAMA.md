# Fotoğraftan özel mockup sahnesi hazırlama

Düz bir JPG/PNG, baskı alanı ve kavis bilgisi içermez. Bu hazırlık iş akışı mevcut fotoğrafı sabit kamera açılı bir mockup sahnesine dönüştürür. Her farklı fotoğraf için bir kez yüzey ve örtüşen nesne eşlemesi yapılır; sonraki müşteri tasarımları aynı sahneye otomatik uygulanır.

## Katmanlar

1. Fotoğrafın baskısız ve gerçekçi ışığı/dokusu korunmuş temiz tabanı.
2. Görünen ürün yüzeyinin eğimini ve kıvrımını tanımlayan sayısal geometri.
3. El, parmaklar, kapak ve ağız gibi baskı dışında kalacak bölgelerin kapsam maskesi.
4. RG16LE UV haritası ve yerel özel sahne manifesti.
5. En az bir yazılı örnek tasarım ve kontrol ızgarasıyla görsel doğrulama.

Temizleme için kullanılan görsel düzenleme yöntemi, üretim promptu, gerçek çıktı boyutu ve dosya özeti özel pakette saklanır. Görsel üretim aracı kaynak boyutunu veya geometriyi birebir korumayabilir; UV eşlemesi son seçilen tabana göre kontrol edilir. Bu işlem PSD Smart Object'in yerel Photoshop dönüşümünü veya üretim doğruluğunu otomatik olarak sağlamaz.

## Yerel özel klasör

Üçüncü taraf kaynak fotoğrafı, temiz taban, maskeler, UV, kalibrasyon koordinatları ve oluşturulan örnekler `data/prepared-mockups/<sahne-kimliği>/` altında tutulur. `data/` Git dışında bırakılmıştır. Kaynak hakları doğrulanmadan bunlar `public/`, Shopify Dosyalar, Vercel veya GitHub'a konulmaz.

Sahne kimliği dosya adına bağlı değildir. Aynı sahnenin başlığı değişebilir; fotoğraf geometrisi veya baskı eşlemesi değişiyorsa yeni bir sürüm kimliği kullanılmalıdır.

## Sayısal harita üretimi

`prepare-cup-photo-mapping.py` fotoğraf açmaz veya rötuşlamaz; operatörün belirlediği JSON geometrisinden UV ve kapsam maskesi üretir. NumPy ve Pillow gerekir; mevcut `scripts/requirements-private-mockup.txt` bunları içerir.

```sh
python3 scripts/prepare-cup-photo-mapping.py \
  --config data/prepared-mockups/hand-cup-r1/geometry.json \
  --out data/prepared-mockups/hand-cup-r1
```

Üst/alt eğriler, görünür çevre aralığı, dışarıda kalacak örtüşme yolları ve doğrulama noktaları operatör tarafından kalibre edilir. Çıktı yaklaşık konik bardak projeksiyonudur. Bir fotoğrafın boyutu, kadrajı veya ürün konumu değiştiğinde eski harita doğrudan yeniden kullanılmamalıdır.

## Yerel önizleme

```sh
npm ci
node scripts/serve-private-mockup.mjs \
  --assets data/prepared-mockups/hand-cup-r1 \
  --artwork data/prepared-mockups/hand-cup-r1/artwork-alacam.png \
  --port 5188
```

`http://127.0.0.1:5188/` sayfasında tasarım değiştirilebilir; PNG/JPG gerçek taban boyutunda indirilir. Sunucu yalnız loopback üzerinden çalışır ve yalnız manifestte listelenen geçerli dosyaları sunar. Üretim Shopify uygulamasından ve kalıcı tasarım depolama API'sinden bağımsızdır. Kapatmak için Ctrl+C kullanın.

## Doğrulama

```sh
node tests/private-mockup-server.browser.mjs
ALACAM_PRIVATE_MOCKUP_ASSETS=data/prepared-mockups/hand-cup-r1 \
ALACAM_PRIVATE_MOCKUP_ARTWORK=data/prepared-mockups/hand-cup-r1/artwork-alacam.png \
node tests/private-mockup-scene.browser.mjs
```

Tarayıcı yolu için `PLAYWRIGHT_CHROMIUM_EXECUTABLE` kullanılabilir. İkinci test, özel sahne paketi mevcutsa çalıştırılır. El/fon/ağız gibi sıfır kapsamlı piksellerin tabanla aynı kaldığı, baskı piksellerinin değiştiği, tasarım değiştirmenin tekrar hesaplanabildiği ve çıktının doğal boyutta olduğu kontrol edilir.

## Shopify'a geçiş

Mevcut `custom.mockup_sahneleri` istemci sözleşmesi, kaynak katmanların tarayıcıya dağıtımına izin veren sahneler içindir. Bir mockupın yalnız son birleştirilmiş görselini kullanma izni, kaynak paketini müşteriye dağıtma izni anlamına gelmez. Kaynakları paylaşmaya izin verilmeyen sahneler için, gerekli kullanım izniyle birlikte yalnız son görüntüyü döndüren özel sunucu işleme hattı gerekir; yerel önizleme aracı böyle bir üretim servisi değildir.

Gönderilen elde bardak görseli için olası kaynak [LS.graphics Paper Coffee Cup Mockup in Hand](https://www.ls.graphics/assets/ppaper-cup-mockupp), ilgili koşullar [LS.graphics lisansı](https://www.ls.graphics/terms-of-service) bölüm 4'tür. Bu kaynak sahne yerel hazırlanmıştır; standart kaynak dağıtım kısıtları nedeniyle otomatik Shopify/Vercel yayını yapılmaz. Kullanıcıya sunulan örnek bardak ölçüleri gerçek üretici bıçak izi olarak değerlendirilmez.
