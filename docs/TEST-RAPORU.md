# Güncel doğrulama · 28 Ekim 2026

## Otomatik testler

`npm test`: **24/24 başarılı**. Tasarım şeması, PNG/SVG/JSON sınırları ve referanslar, GLB/UV eşlemesi, yerleşim/mesafe sınırları, JSON kalıcılığı ve API kayıt/doğrulama testleri geçti.

`npm run test:workspace`: izole Chromium içinde **1440 × 1000**, **982 × 1034**, **390 × 844** görünümleriyle başarılı.

- Altı araç ve 11 yerleşim kartı; her yerleşimi uygulama, ön/arka düzende karşıt yüzler, mesafe, 2D'de tek ürün gösterip 3D'de düzeni geri getirme.
- Mesafenin yerel taslakta saklanması; yenilemeden sonra yerleşim ve mesafenin geri yüklenmesi.
- Mobilde Yerleşim paneline erişme, seçim sonrası panelin kapanması ve dört ürünlük katalog görünümü.
- SVG yükleme, metin, dönüş, geri al/yinele, zoom/pan, bağımsız yüzler ve temel renk.
- Cihaz kaydı, JSON indirme, yenileme, geçersiz PNG, kapatma/yeniden açma ve yatay taşma kontrolü.
- Sunucu taklidiyle JSON+PNG kaydı, kapsayıcıya `scope=server` olayı ve yalnız kimlik/referans taşıyan test sepeti.
- Sunucu 503 hatasında açık kalan editör ve hata bildirimi. Sunucu yokken cihaz kaydı etiketi ve kapalı sepet.
- Sekiz şeklin eklenip yenilemede doğru türle geri yüklenmesi; desen ve ambalaj sembolünün güvenli SVG yoluyla eklenmesi.
- Kalın/italik/altı çizili, saydamlık, iki yönde çevirme ve çoğaltmanın JSON ve yenilemede korunması.
- Kilitli metin çift tıklama/yazma, sürükleme ve silmeye karşı korunur; kilit yenilemede saklanır, katman listesinden seçilip açılır.
- Tek WebGL canvas korunur; test sırasında JavaScript sayfa hatası görülmedi.

`npm run release`: TypeScript/Vite derlemesi, lisans bildirimi, Shopify WebP/WOFF2 dosyaları ve iki ZIP başarıyla üretildi. Büyük bundle uyarısı devam eder. WebP/font adresleri JavaScript'in kendi CDN adresine göre çözülür; tema paketine birlikte kopyalanır.

## Görsel kayıt ve sınırlar

Güncel arayüz görselleri `docs/screenshots/` altındadır. Diğer test görüntüleri `test-results/screenshots/` içinde geçicidir ve teslim paketine girmez.

Gerçek mağazaya sipariş verilmedi; sepet ve sunucu testleri yerel taklitlerle yapıldı. Fiziksel telefon performansı ve üretici onaylı baskı/kesim dosyası ayrıca doğrulanmalıdır. Doypack ve şablonlar yaklaşık/örnektir, üretim onayı değildir.

## Temizlik

Önceki temizlikte bağımlılıklar hariç proje dosyaları yaklaşık 31.3 MB → 6.3 MB, releases klasörü 23.8 MB → 0.91 MB olmuştu. Yeni font ve editör özellikleri bu sürüme eklenmiştir. Eski kopyalar/ZIP takma adları, tarihsel görüntüler, iki boş yeniden dışa aktarma modülü ve geçici test çıktıları silindi. Çalışan kaynak, GLB/SVG/WebP, node_modules, lisanslar ve kullanıcı tasarım verileri korunur.

## Yeni karşılaştırma kontrolleri

`npm run test:interactions`: **başarılı**. Kalıcı senaryolar wheel/pinch odak noktası, Shift/Space/orta tuş pan, gerçek iki-touch olayları, 90° sığdırma, odağa bağlı kısayollar, Config iptal/uygula/yenileme, yedi finishing/malzeme/baskı render farkı ve 982×1034 container ölçülerini doğruladı. Kaynak artwork aynı kaldı. Kamera Back yönünün resize ve büyük 3D geçişinde korunması da izole kamera gözlem testiyle doğrulandı; üretim koduna debug nesnesi eklenmedi.

Son kadraj kontrolünde 1440, 982 ve 820 px genişliklerde Katalog ve Beşli seri ürün silüetleri %160 aralıkta çalışma alanının içinde kaldı; bütün kenarlarda en az 38 px pay vardı ve sol Layout paneliyle kesişme yoktu. 280×280 mini önizlemede tek ürünün silüet yüksekliği yaklaşık %58 oldu. Kamera çubuğunun Save düğmesi ve sol panelle çakışmadığı 1440, 1250, 1249, 982, 976, 975, 820 ve 701 px genişliklerde ayrıca doğrulandı.

## Mod geçişi ve alt çubuk düzeltmeleri

`npm run test:shell`: **başarılı**. 982/1456/1720 px seçici boyutları, başlık ortalaması, 300 ms gösterge geçişi, aktif moda tekrar tıklama, 2D zoom/pan korunması, 280 px minimum ve sağ/üst köşesi sabit kare önizleme boyutlandırması, klavye sınırları ve JSON değişmezliği doğrulandı. 982/1440 px araç çubuğu–Save çakışması yok. Inflate 0/100 farklı PNG verdi; kayıt/yenileme değeri korudu. Aynı yatay hareketle (40,4) ve (40,0) sürüklemeleri aynı PNG'yi üretti; küçük dikey bileşen ürünü ikinci eksende döndürmedi.

`test:workspace` ve `test:interactions` yeni yüzde/göz menüleriyle tekrar geçti. Üretim dosyasının baskıya hazır olduğu veya gerçek Shopify siparişi verildiği anlamına gelmez.

## Stüdyo render

`npm test`: render eklemesinden sonra **24/24 başarılı**. `npm run build`: TypeScript, üretim derlemesi ve lisans/Shopify dosyaları başarılı. Ana girişe ek olarak iki içerik hash'li render JavaScript parçası üretilir; 15 üretilmiş dosyanın Shopify kopyaları bayt düzeyinde karşılaştırıldı. Pathtracer, BVH ve gömülü BSD-2-Clause denoise bildirimi dağıtımda bulunuyor.

`npm run test:render`: **başarılı**. Motor/progress/çıktı taklit edilmeden gerçek 1024×1024, 64 ışık örnekli PNG indirildi. Yazılımsal Chromium GPU ile bu sahne 189,55 saniye sürdü; fiziksel GPU için süre tahmini değildir. Beyaz fon, tasarım renkleri ve piksel çeşitliliği doğrulandı. İptal → yeniden deneme, yeni WebGL canvas, GPU kaynak temizliği, sonuç Blob'unun serbest bırakılması, Close/Tab odağı, çalışan işi Escape ile kapatma, değişmeyen tasarım JSON'u, mobil 1024 sınırı ve gerçek lazy import hatası geçti. Sayfa veya GPU hatası kaydedilmedi.

In-app tarayıcıda gerçek kullanıcı kompozisyonu 1024×1024 / 256 örnekle ayrıca 48,2 saniyede renderlandı. Bunlar donanım ve sahneye bağlı tekil ölçümlerdir. Mevcut yaklaşık modelin üreticiyle fiziksel eşleşmesini veya baskı doğruluğunu kanıtlamaz. 2048 px seçeneği arayüzde kontrol edildi; fiziksel telefonda veya 2048 px tam hesaplamada süre/bellek testi yapılmadı.

Son filtre iyileştirmesinden sonra özgün Botanik örneği gerçek 1024×1024 / 256 örnekle **44,7 saniyede** yeniden renderlandı ve PNG indirildi. Yeni baskı rengi/normal/derinlik rehberli filtreyle gren belirgin azaldı; yazı kenarları görsel olarak kontrol edildi. Nihai PNG `docs/screenshots/studio-render-256.png`, tamamlanan arayüz `docs/screenshots/studio-render-complete.png` içinde tutulur. Bu örnek ayrı localhost taslağında üretildi; kullanıcının 127.0.0.1 taslağına yazılmadı.

Son arayüzle `test:shell` ve render UI kontrolleri tekrar geçti. 1280×720 ekranda önizleme gövde içinde kaldı; sağ ayarlar gerçek wheel girdisiyle kaydırılırken önizlemenin konumu/boyutu ve gövdenin scrollTop değeri değişmedi. Mobil sınır ve gerçek import hatası kontrolü de temiz geçti.

`npm run test:denoise`: **başarılı**. Gerçek WebGL shader'ı ayrı, açıkça sentetik gürültü fixture'ında Standard/Fine modlarında denendi. Düz bölgenin standart sapması 20,31 → 2,95 / 3,52 oldu; 3 px çizgi parlaklığı korundu, kısmi alfa hatası en fazla 0,5/255 (8 bit yuvarlama), materyal/arka plan restorasyonu doğru. Bu sayılar ürün renderı için genel kalite veya hız ölçümü değildir; filtre regresyon kontrolüdür.

## Shopify düğmesinden tam ekran açılış

Referans API demosunda Online design düğmesinin aynı URL üzerinde, tüm ekranı kaplayan editör açtığı tarayıcıdan doğrulandı. Buradaki uygulama native dialog/top layer ve Shadow DOM kullanır; ürün sayfasının konumunu saklar. Küçük `alacam-launcher.js` sayfada kalır, React/Fabric/Three editör parçaları ilk tıklamada yüklenir. X/Escape editörü kaldırır, son yerel taslağı senkron yazar, sayfa kaydırmasını ve düğme odağını geri getirir. İç Render penceresinde Escape yalnız o pencereyi kapatır. Save editörü açık tutar.

`npm run test:launcher`: **13 akış başarılı**, JavaScript hatası yok. 1456×1034 masaüstü ve 390×844 mobil; ilk yüklemede ağır dosyaların gelmemesi, tam ekran/2D açılış, URL değişmemesi, güncel ürün formu varyantı, kayıt, 650 ms gecikme dolmadan kapatma ve taslak korunması, tekrar açma, iki ürünün ayrılması, çift tıklama, bozuk JSON, geçersiz varyant, section yükleme/çıkarma, programatik API ve gerçek modül yükleme hatasından tekrar deneme doğrulandı.

`npm run test:launcher:build`: derlenmiş dosyalarla yerel preview sunucusunda **4 kontrol grubu başarılı**. Gerçek `alacam-launcher.js` → `alacam-editor.js` → hash'li ana parça yüklemesi, seçili 10002 örnek varyantı, tam ekran 2D, Kaydet/X/yeniden açma/Escape geçti. Eksik dosya, ağ veya JavaScript hatası görülmedi. Yalnız API sağlık yanıtı yapılandırılmamış olarak taklit edildi; editör dosyaları ve UI taklit edilmedi.

Shopify önbelleği için `data-alacam-editor-src` sürüm aktarımı ayrıca test edildi: gerçek üretim isteği `/alacam-editor.js?v=compiled-smoke` oldu; sürümsüz giriş isteği yapılmadı. Hazır Liquid bu adresi Shopify `asset_url` filtresinden üretir.

`npm test`: bu değişikliklerden sonra **24/24 başarılı**. Native tarayıcıda da ürün düğmesi → editör → X → aynı sayfa akışı kontrol edildi. Görseller `docs/screenshots/shopify-online-design-button.png` ve `shopify-online-design-open.png` içinde. Canlı Shopify temasına dağıtım ve gerçek sipariş henüz yapılmadı. Custom Liquid örneği gerçek ürün kimliklerini Liquid'den alır; `launcher-demo.html` içindeki kimlikler yalnız demo içindir.

## 3B görüntüleme ve kullanım ince ayarı

Yeni seçenek eklenmedi. Kamera, malzeme tepkileri, temas gölgesi, mini önizleme tutamacı, View menüsü ve GPU temizliği iyileştirildi. Mat/parlak/kraft profilleri ayrı yüzey değerleri kullanır. Gölge ürün sürüklenirken aynı karede güncellenir; yönlü ışıkların gölge kamerası sahnenin gerçek sınırlarına oturur. Yerleşim mesafesi değişip geri alındığında kullanıcının yakınlaştırma/kaydırma/yönü korunur.

Gerçek iki parmak girdisiyle bulunan Three.js kontrol hatası düzeltildi: tek parmakla ürün döndürmesini editör yürütürken OrbitControls'un tek parmak eşlemesi kapatılır; iki parmak pinch ve Hand modu korunur. Ctrl/Meta/Shift + sol sürüklemede kamera kaydırılırken ürünün de yanlışlıkla dönmesi engellendi.

İlk açılışta DM Sans yüklenmeden Fabric'in yedek font ölçülerini önbelleğe alması düzeltildi. Latin ve Latin-ext dosyaları yüklenmeden metin oluşturulmaz. Font değişiklikleri eski yüz/seçim/kapanış isteklerine uygulanmaz; yükleme hatası son geçerli fontu bozmaz.

`npm test`: **24/24 başarılı**. TypeScript/Vite üretim derlemesi, lisans bildirimi ve Shopify dosya kopyalama başarılı. Ana paket boyutu uyarısı devam ediyor.

Alt körüğün beyaz oval olarak dışarı taşması giderildi; özgün GLB ve 11 yerleşim kapağı yeniden üretildi. GLB testinde kapamanın alt kaynak kenarının derinliğini aşmaması ayrıca doğrulanır. Baskı yüzlerinin UV'leri ve örnek en/boy ölçüleri korunur.

`npm run test:preview`: son modelle **7 kontrol grubu başarılı**, JavaScript hatası yok. Yakın/uzak sınırında tekrarlanan +/− ve wheel girdileri kararlı. Sürüklerken ve bıraktıktan sonraki gölge çıktıları aynı; mesafe geri dönüşünde görüntü farkı sıfır. Gerçek pinch ardından tek parmak hareketi, aynı mesafedeki bağımsız fare hareketiyle aynı PNG'yi verdi. Ctrl/Meta/Shift hareketleri bağımsız Pan aracıyla eşleşti. WOFF2 yanıtı 900 ms geciktirildiğinde ilk baskı dokusu font yüklendikten sonra tekrar oluşturulan dokuyla aynı kaldı. Hızlı font/font boyutu değişiklikleri son seçimi korudu. Dört Shopify aç/kapat döngüsünde yaşayan WebGL bağlamı birikmedi.

`test:shell` ve `test:interactions` bu ince ayar turunda başarılı. Boyutlandırma, görünüm menüsü, mevcut 2D hareketler, yedi ayrı malzeme/baskı görüntüsü ve kaynak artwork'ün korunması doğrulandı. Son GLB sonrasında `test:interactions` tekrar geçti. Sonuç kaydı `test-results/preview-polish/summary.json` içinde.

Native tarayıcıda son model ve yeni Gloss profiliyle gerçek **1024 × 1024, 256 ışık örnekli** stüdyo render tamamlandı: bu bilgisayarda **44 saniye**. `docs/screenshots/preview-polish-render.png` sonucu gösterir. Bu süre başka cihazlara genellenmez; özgün yaklaşık model ve üretim dışı görsel sınırı değişmedi.

Son derlemeyle `test:launcher:build` **4 kontrol grubunu** tekrar geçti; JavaScript, eksik dosya ve başarısız ağ isteği yok. Kaynak ve Shopify ZIP'leri bu sürümden yenilendi. Güncel renkli 3B kontrol görüntüsü `docs/screenshots/preview-polish-gloss.png`; yerel açılış görüntüsü `preview-polish-live.png` içindedir. Geçici test PNG'leri teslim paketlerine alınmaz.

## Vercel'den yüklenen Shopify düğmesi

`shopify/custom-liquid/online-design-vercel.liquid` içindeki gerçek Vercel launcher/editor dosyaları, ayrı bir origin'de çalışan izole Shopify benzeri ürün formuyla denendi. Masaüstü 1456×1034 ve mobil 390×844 geçti: tam ekran, sayfa adresinin korunması, tıklama anındaki 10002/10001 örnek varyantı, X/Escape, tekrar açılış ve masaüstü cihaz kaydı doğrulandı; JavaScript hatası yok. Mobilde ürün ayarları açılarak varyant kontrol edildi. API sağlığı taklit edilmedi; gerçek `/api/health` 404 verdiğinden sepet düğmesi doğru biçimde kapalı kaldı. Sonuç `test-results/vercel-launcher/summary.json` içinde. Gerçek Shopify teması üzerindeki Liquid derlemesi ve ürün formu bağlantısı ayrıca doğrulanmalıdır.


## Ürün dosyası meta alanları · 28 Ekim 2026

Liquid girişleri `custom.3b_glb_dosyasi` ve `custom.bicak_i_zi` alanlarını okur; dosya URL'leri launcher doğrulamasından ürün ayarlarına taşınır. GLB bağlantısı ve bıçak izi indirme adresi sürüm sorgusunu korur. Bağlı GLB'nin henüz canlı önizlemeye eşlenmediği görünür şekilde belirtilir.

`npm test`: 27/27 başarılı. İlk sandbox çalışmasında iki API testi port açma izni nedeniyle EPERM verdi; izinli yerel çalışmada tümü geçti. `npm run build` başarılı; mevcut büyük paket uyarısı sürüyor. `test:launcher`: 14 tarayıcı kontrolü başarılı, sayfa JavaScript hatası yok; yeni kontrol iki gerçekçi CDN referansının ürün arayüzüne ulaştığını doğrular. Bunlar izole fixture testleridir; gerçek mağazadaki dosyalar, Liquid çıktısı ve UV eşlemesi dosyalar sağlanınca kontrol edilecek.


## Canlı ürün GLB ve SVG yüklemesi · 28 Ekim 2026

Canlı Waffle Kabartmalı Karton Bardak ürününün Liquid çıktısında her iki meta alanı adresi doğrulandı. Sağlanan GLB 666.236 bayt, SVG 456 bayt; iki CDN dosyası da erişilebilir. SVG 198 × 60 mm viewBox/ölçü bilgisi içeriyor. Modelin üç parçalı sarım yüzeyi UV eşlemesi incelendi; dosyalar depoya kopyalanmadı.

GLB artık ürün sahnesinde yükleniyor; SVG kendi yatay oranıyla tasarım alanına alınıyor. Portre doypack dokusundan yatay ürün dokusuna geçişte Three.js/WebGL2'nin değişmeyen doku depolama boyutları nedeniyle siyah yüzey üreten hata düzeltildi: boyut değiştiğinde GPU dokusu yeniden ayrılıyor.

`npm test`: 29/29 başarılı. GLB dış kaynaklarının parse öncesi reddi, geometri bütçeleri, artboard JSON ve DPI kontrolü eklendi. `test:launcher`: 14 kontrol başarılı. `test:workspace` başarılı; mevcut 2D/3D düzenleme, SVG, dönüşüm/geçmiş, tipografi, JSON, yenileme, hatalar, mobil görünüm ve izole sepet akışı korundu.

`test:product-files` varsayılan özgün GLB ve zararlı bağlantı/script içeren SVG fixture ile geçti; harici kaynak isteği ve sayfa/WebGL hatası oluşmadı. Sağlanan gerçek GLB/SVG dosyalarıyla masaüstü ve 390 × 844 mobil testlerde model/şablon yükleme, logonun UV dokusunda görünmesi, taslağın geri gelmesi, bozuk model hatası ve yeniden deneme geçti. Gerçek dosyalar için `ALACAM_MODEL_FIXTURE` ve `ALACAM_DIELINE_FIXTURE`, mobil için `ALACAM_TEST_MOBILE=1` kullanılır. Dosyalar yalnız yerel geçici dosyalardan test edilir.

Sınırlar: SVG viewBox alanı dikdörtgen olarak kırpılır; keyfi kesim maskesi, güvenli/taşma alanı, üretim onayı ve PDF/AI/DXF'nin 2D içe aktarımı eklenmedi. Bilinmeyen GLB baskı yüzleri otomatik tahmin edilmez. Kaynak malzemeler korunur; dış GLB için doypack kaplama/dolgunluk kontrolleri uygulanmaz. Kalıcı API/Shopify sepeti yapılandırma durumu bu değişiklikle değişmez.


Gerçek GPU kullanan uygulama içi tarayıcıda, aynı CDN GLB/SVG dosyaları ve özgün Botanik tasarımıyla **1024 × 1024 / 64 örnek render 11,5 saniyede tamamlandı**; PNG indirme bağlantısı oluştu. Yerel kanıt `test-results/product-metafields/native-product-render.png`. Bu tek cihaz ölçümüdür. Headless Chromium'daki isteğe bağlı tam render testi 180 saniye sınırında, yazılım GPU'sunda 2,5/64 örnekte zaman aşımına uğradı; renderın tamamlanması bu ortamda doğrulanmadı. Canlı önizleme/şablon/logo/yenileme/hata kontrolleri masaüstü ve mobilde geçti; tamamlanan render ayrıca gerçek GPU'da doğrulandı.

## 28 Ekim 2026 — Render, Retina ve ürün yerleşimleri

- `npm test`: 31/31 geçti; piksel bütçesi ve 2K doku aktarımı kontrolleri dahil.
- `npm run build`: TypeScript, üretim derlemesi, lisans listesi ve Shopify paketleme geçti. Mevcut ana paket boyutu uyarısı sürüyor.
- `test:preview`: 7 akış geçti; tekerlek/araç çubuğu yakınlaştırması, hareket sırasında gölge, aralık/dolgunluk/boyutlandırma dönüşü, dokunmatik geçişler, kaydırma, soğuk font yükleme, dört Shopify aç/kapat ve bağlam bırakma. Eski yaşam döngüsü fixture'ının eksik GLB ağ yanıtı yerel izinli modelle tamamlandı.
- `test:render`: 7 akış geçti; gerçek iptal/tekrar deneme ve kaynak bırakma, 1024×1024/64 örnek PNG, gerçek kırmızı/mavi baskı pikselleri, JSON değişmezliği, modal boyutları, mobil sınır ve motor yükleme hatası. Test makinesinde 1K akışı yaklaşık 14,6 saniye.
- `test:quality`: 11 ayrı canlı ürün kartı, 66 geniş/merkezi kaymış model ve kadraj durumu, 32 px SVG'den 2400 px logo, 2× ekran tamponu bütçesi, mobil taşma ve gerçek üretici bardak GLB'siyle 2048×2048/64 örnek PNG geçti. Son 2K akışı yaklaşık 54,4 saniye, yeşil tasarım kontrolünde 512 px örneklemede 8877 piksel bulundu. Siyah siluet başarı kabul edilmedi.
- `test:denoise`: Standart/Yüksek gerçek shader kontrolleri geçti; sentetik gürültü standart sapması 20,31'den 2,95/3,52'ye indi; ince çizgi oranı yaklaşık 1,005, alfa hatası en fazla 0,5. Bu sentetik ölçüm fotoğraf gerçekçiliği ölçümü değildir.

Tarayıcı testleri yerel izole Vite sunucusunda, macOS Apple M2 Max / ANGLE Metal ile çalıştırıldı. Gerçek GLB yalnız yerel test girdisidir; dosya depoya kopyalanmadı. Süreler cihazlar arası garanti değildir. Offline vernik, WebGL motorundaki siyah yüzey sorununu önlemek için tek yüzey lobuna yaklaşık birleştirilir; gerçek çok katmanlı kaplama optiği ve üretim doğruluğu iddiası yoktur. Kanıtlar `test-results/render-quality/`, `test-results/studio-render/`, `test-results/preview-polish/` altında yerel tutulur.
