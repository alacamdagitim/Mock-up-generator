# PSD’den ürün mockup paketi hazırlama

Kaynak PSD bir kez işlenir. Sonuç müşteriye gönderilen PSD değil; baskısız fotoğraf, maske, yüzey eşlemesi, ışık katmanları ve tek ürün kataloğudur. Ürünün bütün fotoğrafları `schemaVersion: 1` kataloğunun `scenes` listesinde tutulur.

## Kaynak teslimi

Katmanları birleştirilmemiş PSD ve örnek JPG/PNG önizleme tercih edilir. Baskı Smart Object’leri, orijinal perspektif/kavis, piksel maskeleri ve gölge/parlama katmanları korunmalıdır. Dosyanın başlığını değiştirmek geometriyi değiştirmez; fotoğrafın kadrajı, boyutu veya baskı yüzeyi değişirse yeni sahne sürümü gerekir.

Her sahne farklı düz renk, kontrol ızgarası, yazı ve logo ile görsel olarak incelenir. Gövde/kapak veya ön/arka gibi farklı yüzler ayrı eşlenir. El, kapak ve baskısız alanlar korunur. Arka plan rengi yalnız ayrı ve desteklenen bir arka plan katmanı hazırlanmışsa değiştirilebilir; fotoğrafa gömülü renk evrensel bir düzenlenebilir alan değildir.

## Yerel hazırlama araçları

Bu araçlar mağazanın çalışması için bir sunucu değildir; teslim paketini hazırlayan operatör içindir. Python 3.11 ve aşağıdaki isteğe bağlı bağımlılıklar kullanılır:

```sh
python3.11 -m venv /tmp/alacam-psd-venv
/tmp/alacam-psd-venv/bin/pip install -r scripts/requirements-private-mockup.txt
/tmp/alacam-psd-venv/bin/python worker/import_psd.py \
  --source /dosyalar/urun-mockup.psd \
  --output data/prepared-mockups/urun-sahne-r1 \
  --edge 4096
```

`worker/import_psd.py` yerel RGB/8 PSD hazırlayıcıdır; Photoshop motoru değildir. Gömülü Smart Object’ler, doğrulanabilen perspektif/Bezier yüzeyler, piksel maskeleri ve desteklenen katman karışımları işlenir. En fazla iki bağımsız artwork grubu ön/arka olarak eşlenir. Desteklenmeyen efekt/filtre, vektör/grup maskesi veya uyumsuz birleşik önizleme `review` sonucuyla durur; hazır sahne diye yayımlanmaz. Her PSD’nin otomatik ve Photoshop’la birebir uyumu garanti edilmez.

Üretilen `scene.json` içindeki dosya adları hazırlık dizinine göredir. Yayın öncesinde görsel, maske, UV ve ışık bağlantıları gerçek HTTPS CDN adresleriyle değiştirilir; bütün sahneler tek `{"schemaVersion":1,"scenes":[...]}` kataloğunda birleştirilir. `validation.json` yerel hazırlık kaydıdır ve ürün alanına yapıştırılmaz. Kaynak PSD ve özel önbellekler `data/` içinde Git dışında kalır.

Belirli teslimler için mevcut araçlar:

- `scripts/prepare-private-tin-can.py`: gövde/kapak yüzleri ve orijinal ışık katmanlarıyla teneke kaynak dosyasının hazırlığı; genel PSD yorumlayıcısı değildir.
- `scripts/prepare-private-matcha.py`: daha önce verilen Matcha kaynağının yerel katman çıkarımı.
- `scripts/prepare-cup-photo-mapping.py`: operatörün fotoğraf üzerinde kalibre ettiği geometriden UV ve kapsam maskesi çıkarımı; otomatik fotoğraf rötuşu yapmaz.

## Yayın paketi

Web varlıklarını sürümlenmiş `public/product-assets/mockup-scenes/<sahne-kimliği>/` dizininde veya uygun HTTPS CDN’de yayımlayın. Ürün JSON’undaki adreslerin tamamını buna göre düzenleyin. Fotoğrafların doğal boyutu korunur; web çıktısı bütçeye göre en çok 4K uzun kenara hazırlanır, düşük çözünürlüklü kaynak büyütülmez. Katalogda en fazla 64 sahne bulunabilir; yüksek çözünürlüklü kaynaklar seçilen sahne için yüklenir.

RG16LE UV dosyaları Brotli sıkıştırılmış `.bin.br` olarak sunuluyorsa sunucu `Content-Encoding: br` ve `Content-Type: application/octet-stream` vermelidir. Farklı origin’deki görsel/UV dosyaları için mağaza origin’ine uygun CORS gerekir. Teneke paketinin mevcut Vercel başlıkları `vercel.json` içinde korunmuştur.

Mevcut ürün JSON’larının referansları bozulmasın diye iki hazırlanmış paket korunur:

- `shopify/metafields/hand-cup-r1.json` → `public/product-assets/mockup-scenes/hand-cup-r1/`
- `shopify/metafields/tin-can-r1.json` → `public/product-assets/mockup-scenes/tin-can-r1/`

Bu paketler açılışta herhangi bir ürüne otomatik atanmaz. Ürün hangi kataloğu verirse yalnız o katalog kullanılır. Kaynak fotoğraf/PSD hakları sahiplerinde kalır; paketler CC0 ilan edilmez. Hazırlanmış web katmanları müşteriye gönderileceğinden bu kullanım için kaynak sahibinin izni bulunmalıdır.

## Shopify’a teslim

Baskısız görseller ve tek ürün JSON’u teslim edilir. Görsel listesi kullanılıyorsa sahneler Shopify’ın sabit dosya kimliğiyle eşlenir; görselin adı ve sırası eşleme anahtarı olmaz. Görseller yeniden yüklenirse yeni kimlikler JSON’a işlenir. Maske/UV/ışık dosyaları için ek metafield açılmaz.

GLB ve SVG bıçak izi aynı ürünün kendi varlıklarıdır; PSD hazırlama bunları otomatik üretmez. Mockup bir sunum görüntüsüdür; kesim şablonu ve üretim baskı dosyası ayrı tutulur. [Mağaza kurulumu](SHOPIFY-KURULUM.md).
