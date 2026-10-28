# Özgün model ve şablon dosyaları

İlk paket: `public/product-assets/doypack-v1-r1/`.

| Dosya | Kullanımı |
| --- | --- |
| `model.glb` | Beyaz doypack görselleştirmesi; özgün, yaklaşık geometri. |
| `front.svg` / `back.svg` | Tam 140 × 210 mm örnek yüz çalışma alanları; 600 × 900 viewBox. |
| `reference-guide.svg` | İki yüzü ve alanları açıklamalarıyla gösteren kılavuz. |
| `definition.json` | Model sürümü, yüz/malzeme adları, UV ve örnek baskı alanları. |
| `README.txt` | Paketten ayrılamayacak kullanım ve üretim durumu açıklaması. |

## Yeniden üretme

```sh
npm ci
npm run assets:generate
npm test
npm run build
```

Canlı editör ve GLB ihracı aynı `shared/pouch-geometry.mjs` ve `shared/pouch-structure.mjs` dosyalarını kullanır. GLB 2.0 standardındadır, birimi metredir. Örnek sınır kutusu 0,14 × 0,21 metredir; derinlik görselleştirme amaçlıdır, onaylı üretim ölçüsü değildir. Kaynak kapatma/körük detayları gerçek bir üretici modelini temsil etmez. Model katı CAD modeli veya kalıp üretim dosyası değildir.

## Yüz eşleştirme

### Dış ürün GLB'leri

Editör açık `printableFace`, `print_front/back` ve `artwork_front/back` tanımlarını öncelikli kullanır. Tek, tam 0–1 UV'li etiket/sarım parçasını da tanır (`label`, `sleeve`, `贴图` gibi adlar). Kapak ve diğer baskısız parçalar korunur. Birden çok olası etiket veya yalnızca gövde bulunduğunda **Baskı yüzeyini seç** ile mevcut UV'li parça ve dikey yön seçilir. Bu seçim modele özel `modelBinding` alanıyla tasarım JSON'una, yerel taslağa ve geçmişe girer. Yeni UV oluşturulmaz; atlaslı veya hatalı UV için model hazırlığı gerekir. Dosya URL'sinin sürümü değişirse eski seçim uygulanmaz.

Kaynak GLB'nin malzemeleri korunur. Malzemesi olmayan modele önizleme malzemesi atanır; tanınan metal kutuda yaklaşık alüminyum profili kullanıldığı arayüzde belirtilir. Bu dosyalar üretici kaplaması, baskı rengi veya fiziksel toleransları kendiliğinden tanımlamaz. Ayrıntılı sözleşme: [Shopify ürün dosyaları](SHOPIFY-BUTON.md#ürün-dosyası-meta-alanları).

### Projenin özgün doypack UV sözleşmesi

- Ön yüz: `print_front` mesh'i, `artwork_front` malzemesi.
- Arka yüz: `print_back` mesh'i, `artwork_back` malzemesi.
- Baskısız parçalar: `unprinted_seals` malzemesi. Bu parçalara artwork uygulamayın.
- Y ekseni yukarıdır; ön yüz +Z yönüne bakar. Arka yüzü görmek için modeli 180 derece döndürün.
- U soldan sağa 0–1, V alttan üste 0–1'dir. Üst kenar V=1'dir.
- Three.js `CanvasTexture` için `flipY=true`, `colorSpace=SRGBColorSpace` kullanın. Bu özel UV sözleşmesini JSON'dan okuyun; başka GLB'lerin varsayımları farklı olabilir.
- Doku tüm 600 × 900 tuvali kapsar. Görsel/yazı öğelerini önce `printRectPx` alanına kırpın; dışarısını ambalajın temel rengiyle doldurun. Yalnız baskı dikdörtgenini bütün yüzeye yaymayın.
- SVG içindeki `reference-guides` grubunu artwork dokusuna katmayın. Çizgiler ve uyarı etiketi yalnız kılavuzdur.

GLB boş beyaz PBR malzemeleri içerir. Canlı editörün ışık, zemin, temas gölgesi ve mikro yüzey dokusu GLB'ye gömülmez; görüntüleme ortamında kurulur.

## Shopify'a yükleme ve mevcut sınır

Ürün yönetimi için önerilen alanlar:

| Alan | Tür | İçerik |
| --- | --- | --- |
| `custom.3b_glb_dosyasi` | Dosya | `model.glb` dosyası veya Shopify model kaynağı. |
| `custom.bicak_i_zi` | Dosya | Üreticinin **gerçek** kesim şablonu; şu an bu alana örnek SVG'yi üretici dosyası diye koymayın. |
| `custom.alacam_editor_template` | Dosya | Hazırlanmış editör yüz şablonu. İki yüzün dosyaları tanımda ayrıca adreslenir. |
| `custom.alacam_design_config` | JSON | Dosyalar yüklendikten sonra gerçek CDN adresleriyle uyarlanmış yüz eşlemeleri. |

GLB ve bıçak izi alan adları mağaza için kesinleştirilmiştir. Liquid bu iki alanın dosya URL'lerini editöre aktarır; GLB canlı 3B sahnede açılır; SVG bıçak izi kendi en/boy oranıyla 2D alanda kılavuz olarak gösterilir. Baskı yüzü eşleme sözleşmesi ve mevcut sınırlar `docs/SHOPIFY-BUTON.md` içinde açıklanır. Diğer alanlar gelecekteki model adaptörü için öneridir; şu anda okunmaz. Genel dosyada `.url`, kaynak listesi bulunan model nesnesinde GLB `.sources` kaydı kullanılır. Shopify alanı GLB seçimine izin vermiyorsa gerçek alan türü ve dosya bağlantısı ayrıca kontrol edilmelidir. Ayrıntılar: `docs/SHOPIFY-BUTON.md`, “Ürün dosyası meta alanları”.

Paket JSON'undaki göreli dosya adları Shopify'a yükleme sonrası kendiliğinden CDN adresine dönüşmez. Otomatik çözümleyici eklenene kadar bağlantıların entegrasyon katmanında eşleştirilmesi gerekir. Mevcut müşteri tasarım JSON'u içe aktarma düğmesi bu ürün tanımını kabul etmez.

Farklı ölçüdeki varyant için yeni, sürümlenmiş model–şablon eşleştirmesi hazırlanır. Sadece modelin ölçeğini değiştirmek üretim doğruluğu sağlamaz. Önceki siparişler aynı varlık sürümüne bağlı kalmalıdır; eski dosyalar üzerine yazılmamalıdır.

## Gerçek bıçak izine geçiş

Üreticiden ölçülü vektör dosya (PDF/AI/DXF/SVG), net ölçüler, kaynak/yapıştırma ve körük alanları, kesim/katlama ayrımı, taşma/güvenli alan gereksinimleri ve baskı şartları alınır. Bu kaynak korunur; ondan editör SVG'si ve UV eşlemesi hazırlanır. Özellikle bardak sarımı ve kutunun katlanan yüzleri için doypack'in ön/arka dikdörtgen şablonu kullanılamaz. Yeni model adaptörü ve gerekirse tasarım şeması sürümü gerekir.

Bu ilk paketin `productionReady=false` durumu dosyalara gömülüdür. Üretici onayı olmadan kaldırılmaz. Paket bir **görselleştirme ve entegrasyon referansıdır**; gerçek bıçak izi, baskıya hazır üretim çıktısı veya kesim makinesi girdisi değildir.

## Doğrulama

20 otomatik test geçti; üretim derlemesi başarılı. Yeni testler GLB'yi gerçek Three.js `GLTFLoader` ile yeniden açar, dosya başlığını, boyut bütçesini, örnek metre ölçeğini, yüz/malzeme adlarını, UV sınır ve yönlerini, SVG ölçeğiyle JSON tutarlılığını kontrol eder. `tests/product-assets-preview.html` yerel Vite sunucusunda boş/ön/arka modeli karşılaştırır. Tarayıcıda yazı yönü ve kontrol deseninin yerleşimi incelendi; sayfa JavaScript hatası üretmedi. Bu kontroller fiziksel ambalaj veya üretici onayı yerine geçmez.
