# İsteğe bağlı geliştirici aracı: PSD yükleme ve otomatik mockup hazırlama

**Mağazanın varsayılan iş akışı hazır görseller + tek ürün JSON'udur.** Mağaza sahibi PSD'leri hazırlık için iletir; katmanlar, baskı bölgeleri ve örnek tasarımın sonucu kontrol edilir. Hazırlanan görseller, maskeler, UV ve ışık dosyaları Vercel/CDN'de yayımlanır. Ürünün bütün sahnelerini içeren tek katalog `custom.mockup_sahneleri` alanına konur; 10 mockup için 10 ayrı ürün JSON'u gerekmez. Baskısız kart listesi `custom.mockup_gorselleri`, isteğe bağlı model `custom.3b_glb_dosyasi`, şablon `custom.bicak_i_zi` alanındadır. [Varsayılan Shopify kurulumu](SHOPIFY-MOCKUP-SAHNELERI.md).

Bu belge, hazırlık işlemini yerelde otomatikleştiren geliştirici aracını ve isteğe bağlı uzak servis seçeneğini anlatır. Hazır katalog kullanmak için worker'ın sürekli açık olması gerekmez. Müşteri kaynak PSD'yi indirmez.

Araçta geliştirici ürünü seçer, bir seferde en fazla 10 PSD yükler. Servis katmanları ve Smart Object eğriliğini okur, kayıtlı Photoshop önizlemesiyle doğrular, baskısız kartları ve sahne kataloğunu üretir. Üretilen dosyaların yayımlanması ve örnek tasarımla kalite kontrolü hazırlık tesliminin parçasıdır.

## Mevcut durum

- Çalışan yükleme paneli: `/mockup-admin.html`.
- Kalıcı kuyruk, tek işlemci, dosya imzası/boyutu kontrolü, aynı dosyanın ürün içinde tekrar kullanımını SHA256 ile belirleme.
- Ürüne özel katalog; yeniden adlandırılan aynı PSD yeniden işlenmez. Kaynak PSD, iş kayıtları ve doğrulama raporu müşteriye servis edilmez.
- Hazırlanan sahneler, mevcut 2D / 3D / mockup editörüne bağlanır. Sahne fotoğrafı için ek 3D render işi oluşturulmaz.
- Ayrı tam sayfa RGB düz renk katmanı uygun yapıdaysa arka plan rengi canlı değişir; ışık ve gölgeler korunur. Renk, düzenlenebilir tasarım JSON'una kaydedilir; önizleme ve indirme aynı seçimi kullanır.
- **İsteğe bağlı canlı PSD yükleme için ayrıca worker sunucusu kurulmalı.** Hazır JSON'lu müşteri akışı buna bağlı değildir. Vercel'de yayımlanan yönetim paneli tek başına PSD işlemez. Bu ortamda servis yerelde çalıştırıldı; uzak worker hesabı/alan adı yapılandırılmadı.

PSD, her müşteriye indirilen ve Photoshop gibi çalıştırılan bir belge değildir. Sunucu yükleme sırasında desteklenen katmanları bir defa çözümler; web editörü bu verileri kullanır. Bu nedenle kaynağın düzenlenebilir öğeleri aktarılabilir ve müşteri cihazının kaynak PSD'yi açması gerekmez.

## Desteklenen ve inceleme isteyen dosyalar

İlk otomatik içe aktarıcı şu alt kümeyi destekler:

- PSD, RGB, 8 bit; en fazla 36 megapiksel, 12000 px kenar, 256 MB kaynak dosya.
- 1–8 görünür gömülü Smart Object; en fazla iki bağımsız tasarım içeriği. Aynı Smart Object'in sahnede birkaç kez görünmesi desteklenir.
- Perspektif dörtgen, özel 4 × 4 Bézier ve parça sınırları tanımlı quilt warp.
- Piksel maskesi; Normal, Multiply ve Screen temel karışım modları; kayıtlı piksel önizlemesi olan sabit yazı katmanları.
- Maskesiz, opak, güvenli Normal/Pass Through grupları. İzole grupların çocuk karışım modları uygun değilse inceleme gerekir.
- En büyük kaynak tasarımı “Ana tasarım”, ikinci bağımsız içerik “İkinci tasarım” olur. Sistem dosya adından bunun kapak/gövde olduğuna kesin karar verdiğini iddia etmez.

Harici bağlı nesneler, ayar katmanları, akıllı filtreler, vektör maskeleri, grup maskeleri, desteklenmeyen efektler, ikiden fazla bağımsız yüz veya doğrulanamayan eğrilik **İnceleme gerekli** olur. Hatalı dosya kartı müşteri kataloğuna eklenmez. Bütün PSD'lerin Photoshop ile birebir çalıştığı iddia edilmez. Photoshop'un özgün yeniden render motoru kullanılmaz. Yeni yapıdaki dosyalarda ayrıca destek geliştirmek gerekebilir.

Arka plan değişimi yalnız ayrı, tam boy, opak ve maskesiz RGB düz renk katmanı bulunduğunda açılır. Fotoğrafın içine gömülü fon rengi değiştirilmez. Gönderilen teneke kutunun pembe fonu bu nedenle sabittir. Photoshop'ta ayrı katmanı olmayan bölgeyi otomatik ayrıştırma bu sürümün kapsamı değildir.

## Yerel kurulum

Node 20.11+ ve Python 3.9–3.12 kullanın. Python bağımlılıkları Vercel ön yüz derlemesine dahil değildir.

```sh
npm ci
python3 -m venv /tmp/alacam-psd-runtime
/tmp/alacam-psd-runtime/bin/pip install -r scripts/requirements-private-mockup.txt
cp worker/.env.example worker/.env
```

`worker/.env` içinde:

```dotenv
PSD_ADMIN_TOKEN=BURAYA_EN_AZ_32_KARAKTER_RASTGELE_GIZLI_ANAHTAR
PSD_PYTHON=/tmp/alacam-psd-runtime/bin/python
PSD_DATA_DIR=data/psd-service
PSD_PUBLIC_BASE=/mockup-worker
PSD_ALLOWED_ORIGINS=http://127.0.0.1:5184,http://localhost:5184
```

Anahtar üretmek için `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` kullanılabilir. Anahtarı yalnız worker ortamında ve yönetim panelinin anahtar alanında kullanın. Liquid'e, `VITE_` değişkenine veya müşteri JS koduna koymayın. Panel anahtarı bellekte tutar; yerel depolamaya yazmaz.

Ayrı terminallerde:

```sh
npm run psd:worker
npm run dev
```

`http://127.0.0.1:5184/mockup-admin.html` sayfasında servis `/mockup-worker`, yönetici anahtarı ve Shopify ürün kimliğini girin. Ürün kimliği, Shopify yönetimindeki ürün URL'sinin sonundaki sayıdır. **Ürünü aç → PSD'leri seç ve yükle → Hazır → Editörde dene** akışını kullanın.

Bu makinede Node Rosetta altında, Python paketleri ARM kurulmuşsa aynı mimarideki Python kullanılmalı; `PSD_PYTHON` tam yolu buna göre belirlenir. `worker/.env` Git dışında tutulur.

## İsteğe bağlı kalıcı uzak servis / Docker

1. Kalıcı disk ve HTTPS adresi olan tek bir worker örneği kurun. Compose dosyası 4 GB bellek ve 2 CPU sınırı tanımlar. Docker imajı bu ortamda build edilmedi; yerel Node/Python servisi test edildi.
2. `worker/.env` içinde `PSD_PUBLIC_BASE=https://mockup-api.magazaniz.com` yazın. `PSD_ALLOWED_ORIGINS` içine Vercel adresini ve mağazanın origin'ini ekleyin.
3. Proje kökünden:

```sh
docker compose -f worker/compose.yaml up -d --build
```

4. HTTPS reverse proxy'yi `127.0.0.1:3002` adresine yönlendirin. Yükleme gövde sınırı en az 256 MB, yükleme zaman aşımı 10 dakika olmalı. Worker internete açıkken yönetici anahtarı zorunludur. Ücretsiz bir uzak işlem hizmeti veya otomatik sağlanmış bulut hesabı varsayılmaz.
5. `psd-data` volume'unu yedekleyin. Varsayılan kota kaynak ve hazırlanmış dosyalar toplamında 8 GiB'dir. Bir ürün en fazla 64 dosya içerir; aynı anda 64 bekleyen iş, iki yükleme ve tek PSD çözümlemesi kabul edilir. Bir worker örneği kullanın; paylaşılan disk üzerinde birden fazla işlemciyle çalıştırma bu sürümde desteklenmez.
6. Vercel'deki `/mockup-admin.html` sayfasında uzak HTTPS servis adresini ve anahtarı girin. PSD doğrudan bu servise gider; Vercel fonksiyon gövdesi üzerinden taşınmaz.

## İsteğe bağlı uzak katalog bağlantısı

Güncel `shopify/custom-liquid/online-design-vercel.liquid` dosyası, isteğe bağlı `mockupApiBase` bilgisini geçirir. Kurulumda bu dosyanın başına bir kez ekleyin:

```liquid
{% assign mockup_api_base = 'https://mockup-api.magazaniz.com' %}
```

Dosyanın tamamını Shopify ürün şablonundaki Özel Liquid bloğunda kullanın. Bu açık tercihle bütün ürünlerde aynı servis adresi kullanılır; ürün kimliği Liquid'den otomatik gelir. Worker, yönetim panelinde o ürün kimliğine yüklenen hazır sahneleri döndürür. **Üründe `custom.mockup_sahneleri` JSON'u varsa hazır katalog önceliklidir.** Mağaza düzeyindeki eski `custom.mockup_servis_adresi` alanı artık kendiliğinden bağlantı açmaz. Normal hazır paket kurulumunda `mockup_api_base` tanımlamayın.

**PSD dosyalarını Shopify meta alanına yükleme zorunluluğu yoktur.** Shopify genel dosyalarda 20 MB sınırı uygular; örnek teneke PSD yaklaşık 146 MB'dir. Bu geliştirici aracı büyük PSD'leri özel yükleme paneline alır. Shopify Admin API anahtarı gerekmez; ürün listesi okuma veya ürün meta alanına otomatik yazma eklenmemiştir. Ürün numarası panelde seçilir/girilir. Yalnız açıkça tercih edilen uzak katalog akışında Vercel ve worker bağlantısından sonra katalog elle kopyalanmaz; varsayılan teslim akışı ürünün JSON meta alanını kullanır.

`custom.3b_glb_dosyasi` ve `custom.bicak_i_zi` mevcut 3D/2D işlevlerinde kullanılmaya devam eder. Gerçek üretici bıçak izi, tasarım çalışma alanında önceliklidir. Farklı PSD'lerin yüzey oranları aynı ürünün tasarımına uygun olmalıdır; içe aktarıcı fiziksel üretim uyumunu onaylamaz.

## Sunucu uçları

| Uç | Erişim | Davranış |
| --- | --- | --- |
| `GET /health` | Herkese açık | Servis sınırları, gizli anahtar içermez |
| `POST /admin/products/:productId/import?name=dosya.psd` | Bearer yönetici anahtarı | `application/octet-stream` PSD yükler; 202 iş, aynı dosyada 200 mevcut iş |
| `GET /admin/products/:productId` | Bearer | Kuyruk/hata durumları ve katalog |
| `DELETE /admin/jobs/:id` | Bearer | Tamamlanmış işi ve dosyalarını kaldırır; işlenirken 409 |
| `GET /catalog/:productId` | Herkese açık | Yalnız doğrulanmış hazır sahneler; `no-store` |
| `GET /assets/:jobId/:file` | Herkese açık | Yalnız izinli hazırlanmış PNG/WebP/JPG/Brotli UV dosyaları |

PSD, disk dizini, `scene.json`/`validation.json` raporu ve yönetim kayıtları varlık sunucusundan okunamaz. Görünen hazırlanmış görsellerin web kullanım hakları mağaza sahibine ait olmalıdır; kaynak lisansları korunur.

## Testler

```sh
npm test
/tmp/alacam-psd-runtime/bin/python tests/psd-quilt-warp.test.py
/tmp/alacam-psd-runtime/bin/python tests/create-psd-fixture.py data/psd-test-fixtures
npm run test:psd
npm run build
```

Tarayıcı testi Vite ve worker'ın açık olmasını, yerel `worker/.env` anahtarını ve sentetik dosyaları gerektirir. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` ile tarayıcı yolu seçilebilir. Test dosyaları bu proje için sıfırdan üretilir; kaynak müşteriye ait PSD'ler test paketine konmaz. Test ürünleri işlem bitince silinir.

Teneke kutu dosyası genel içe aktarıcıyla da elle konum bilgisi verilmeden doğrulandı. Gövde ve kapak ayrı bulundu; dosyanın kayıtlı birleşik Photoshop önizlemesiyle ortalama kanal farkı yaklaşık 0,20/255 oldu. Bu, bütün efektler için Photoshop eşdeğerliği iddiası değildir.

Web otomatik çıktısı en fazla **4096 px uzun kenarlı**dır; katman/yüzey sayısına göre mevcut tarayıcı motorunun 64 megapiksel toplam çözülmüş görsel ve 160 MB kaynak bütçesine sığacak şekilde küçültülür. Küçük kaynak büyütülmez. Eski elle hazırlanmış 4K sahneler çalışır. 6K/CMYK/ICC üretim çıktısı veya otomatik baskıya hazır PDF bu akışın parçası değildir.

## Kaynaklar ve bağımlılıklar

- [psd-tools özellikleri ve sınırlamaları](https://psd-tools.readthedocs.io/en/latest/) — MIT.
- NumPy ve SciPy — BSD-3-Clause; Pillow — HPND; OpenCV — Apache-2.0. Sürümler `scripts/requirements-private-mockup.txt` içinde sabittir. Bunlar worker bağımlılıklarıdır.
- [Shopify dosya sınırları](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/file-uploads).
- [Vercel fonksiyon sınırları](https://vercel.com/docs/functions/limitations) — büyük dosyalar doğrudan worker'a yüklenir.
