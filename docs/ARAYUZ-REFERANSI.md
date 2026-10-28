# API demo referansı ve kapsam

28 Ekim 2026 tarihinde kullanıcının açık sekmesindeki `https://apidemo.pacdora.com/detail.html?modelId=100010&lang=en` editörü, canlı tarayıcıda incelendi. Kapsam Online design sonrasında açılan editördür; ürün listeleme sitesi değildir.

## Görünüm

- Beyaz 64 px üst çubuk; 3D/2D, Download dieline, Upload design, kapatma.
- `#f2f3f5` çalışma zemini; siyah metin ve ana düğmeler. Beyaz, yuvarlatılmış paneller.
- Masaüstünde 70 px sol araç şeridi, 240 px içerik paneli ve 280 px sağ panel. Dar ekranlarda uyarlanır.
- İngilizce görünür ana etiketler: Inspirations / Uploads / Text / Background / Shapes. Önceki talep doğrultusunda Layout da korunur. Mevcut Türkçe erişilebilirlik ve kapsayıcı etiketleri korunur.
- Ölçülen 2D alt dock 419×48 px ve ekran merkezinde, Save 250×40 px; mini 3D 280×280, Config 280×497 px. Araç şeridi beş temel düğme için 70×365.5 px, Layout ayrı alt karttadır.
- Configure masaüstünde 900×865 px, ekran yüksekliğinden en az 160 px kısa; malzeme/baskı seçenekleri 100 px kart ve 96×96 görseller kullanır. Finishing seçenekleri 60 px yüksekliğinde düz metin pilleridir. Mobilde pencere ekran içine uyarlanır.
- Layout açıkken 3D çalışma alanı sol panelin sağından başlar; sağ Config kartı ayar düğmesiyle açılır. Çoklu ürün kadrajı bu görünür alana sığdırılır.
- Bağlamsal öğe çubuğu seçilen öğenin üstüne taşınır ve pan/zoom ile konumunu izler. Üç nokta menüsü dönüş, ölçek, saydamlık, çevirme ve nesne işlemlerini açar.

Referansın hesaplanan stili Gilroy kullanır. Bu font ve özel ikon fontu alınmadı. DM Sans (SIL OFL 1.1) yerel sunulur. Standart simgeler bağımsız SVG olarak çizildi. Marka Alaçam'dır.

## İşlevler

| Alan            | Bu sürüm                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspirations    | 16 özgün, düzenlenebilir örnek; mevcut yüzü değiştirir, geri alınır                                                                          |
| Uploads         | Güvenli PNG/JPG/SVG, sürükle-bırak, oturum görsel listesi                                                                                    |
| Text            | DM Sans ve dört sistem fontu, boyut/renk/hizalama, kalın/italik/altı çizili                                                                  |
| Background      | Temel renk ve 12 özgün desen; desen tüm yüzü kaplar ve en arkaya eklenir                                                                     |
| Shapes          | Sekiz temel şekil, 14 dolu siyah ambalaj sembolü, altı sosyal/iletişim simgesi                                                               |
| Nesne işlemleri | Taşıma, ölçek/dönüş, saydamlık, yatay/dikey çevirme, çoğaltma, silme, kilit, dört katman işlemi                                              |
| Tuval           | Seçim/kaydırma, geri al/yinele, zoom/sığdırma, 90° görünüm döndürme, kılavuzlar, ön/arka yüz                                                 |
| 3D / Layout     | Özgün yaklaşık doypack, anlık doku, döndürme/zoom, 11 düzen ve mesafe                                                                        |
| Configure       | White film/Kraft/Metallic, Color/Black/Blank ve Gloss/Matte/Blank; Apply kaydeder, Discard/Escape iptal eder; gerçek 3D malzeme/doku değişir |
| Save / export   | Yerel taslak, JSON içe/dışa aktarma, PNG önizleme; yapılandırıldığında sunucu ve Shopify                                                     |

## Açık kalan farklar

Bu sürümde demo sitesinin bütün yeteneklerinin tamamlandığı iddia edilmez. AI/PDF içe aktarma ve dönüştürme, gelişmiş görüntü/yazı efektleri ve gerçek kutu açılma/katlanma animasyonu yoktur. Doypack için kutu katlama sürgüsü gösterilmez. Demo fiyatları, teslim süreleri ve üretici ölçüleri uydurulmaz. Shopify varyantı ve depolama bağlantısı yapılandırılmalıdır.

Kaynak kod, Pacdora SDK/API, lisanslı modeller ve hazır tasarımlar alınmadı. Model, desenler, örnekler ve yerleşim kapakları proje içinde üretildi. Kesin üretim şablonu sağlanmadan baskıya hazır iddiası yoktur.

## Gesture doğrulaması

Canlı referansta normal dikey wheel hareketinin zoom yaptığı gözlendi ve bu davranış eşlendi. Uygulama ayrıca Ctrl/Meta zoom, Shift wheel/trackpad pan, Space/orta tuş ve iki-touch pinch/pan destekler. Kamera yönü resize sırasında korunur. Hareketler tasarım verisini kaydırmaz; yalnız görünüm koordinatları değişir.

Semboller kendi SVG çizimlerimizdir; CE/FSC gibi üçüncü taraf sertifika logoları aktarılmadı. Gerçek ürün geometrisi ve özel Gilroy fontu aynı olmadığı için piksel düzeyinde tam eşitlik iddia edilmez.

Son istemci kod incelemesinin ölçüleri ve erişim kapsamı [ISTEMCI-KOD-ANALIZI.md](ISTEMCI-KOD-ANALIZI.md) belgesindedir. Kaydırmalı 3D/2D göstergesi, kare mini önizleme tutamacı, yüzde/göz menüleri ve baskın eksen ürün döndürmesi bağımsız olarak uygulandı. Doypack alt çubuğu Inflate kullanır; bu yaklaşık modelin derinliğini değiştirir ve fiziksel dolum/katlama hesabı değildir.
