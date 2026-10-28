# Online Design istemci analizi

28 Ekim 2026 tarihinde kullanıcının istediği **Online design** akışı, açık demo sayfasında ve tarayıcıya gönderilen herkese açık istemci dosyalarında incelendi. Aşağıdaki değerler bu tarihte sunulan sürümün davranışlarıdır; bir API uyumluluk garantisi değildir.

## İncelenen kaynaklar ve sınır

- [Demo ürün sayfası](https://apidemo.pacdora.com/detail.html?modelId=100010&lang=en)
- [editor-entry.js](https://apidemo.pacdora.com/js/editor-entry.js): editörü açma, yüklenme ve hata durumları.
- [editor-entry.css](https://apidemo.pacdora.com/css/editor-entry.css): açılış düğmesinin stilleri.
- [preview-layout.js](https://apidemo.pacdora.com/js/preview-layout.js): ürün sayfasının önizleme yüksekliği.
- [detail.js](https://apidemo.pacdora.com/js/detail.js): ürün sayfasının görünüm ve miktar kontrolleri.
- [Pacdora-v2.0.0.js](https://cdn.pacdora.com/Pacdora-v2.0.0.js): editörün yayımlanmış istemci paketi; incelenen yanıt **4.985.829 bayt**, yaklaşık 5 MB.

Analiz için alınan dosyalar geçici klasörde tutuldu. SDK, kod parçaları, ikon fontu, modeller, kapak görselleri ve diğer vendor varlıkları proje kaynaklarına veya dağıtım paketlerine aktarılmadı. Buradaki ölçüler ve davranışlar kendi React/Fabric/Three uygulamamızı yazmak için kullanılır. Sunucu uygulamasına, yayımlanmamış kaynaklara, özel depolamaya veya erişim gerektiren hizmetlerin iç işleyişine erişilmedi. Görünür bir düğmenin bulunması, ilgili sunucu hizmetinin yeniden oluşturulduğu anlamına gelmez.

## Mod geçişi ve oranlar

| Ekran genişliği | 3D / 2D kapsayıcı | Aktif alan |
| --------------- | ----------------- | ---------- |
| ≤ 1279 px       | 114 × 28 px       | 54 × 22 px |
| 1280–1679 px    | 130 × 36 px       | 62 × 30 px |
| ≥ 1680 px       | 150 × 40 px       | 72 × 34 px |

Başlık içindeki mod seçici **1285 px ve üzerinde** mutlak konumla yatay ortalanır. Aktif alanın hareketi `left` üzerinden **0,3 saniye** sürer. 2D çalışma alanının görünürlüğü de **0,3 saniyelik opacity** geçişi kullanır. Aktif alanın köşe yarıçapı 6 px'tir.

Demo aynı 3D görünümü büyük sahne ile mini önizleme kapsayıcısı arasında taşır ve boyutunu yeniden hesaplar. Mod değişiminde katlanma değeri 100'e döner. 3D'ye girerken 2D seçim kaldırılır ve düzenleme kilitlenir; 2D'ye dönerken açılır. Değişen tasarımı kaydetme adımı demo hizmetlerine bağlıdır.

## Mini 3D ve yeniden boyutlandırma

Başlangıç boyutu **280 × 280 px**; zemin `#d6d6d6`, yarıçap 16 px, alt boşluk 16 px ve gölge `0 4px 8px #0000000d`. Sağ üstteki 28 px **3D işareti bir düğme değildir**: yalnızca “Drag to view the model” ipucunu gösterir.

Sol alttaki yeniden boyutlandırma tutamacı 28 × 28 px ve `nesw-resize` imleci kullanır. Sürükleme başındaki dikdörtgenin sağ üst noktası sabittir. Başlangıç genişliği/yüksekliği `w₀/h₀`, sağ kenarı `r₀`, üstü `t₀`, imleç `x/y`, editör kök yüksekliği `H` ise davranış şu şekilde özetlenir:

```text
ölçek = min((r₀ − x) / w₀, (y − t₀) / h₀)
boyut = min(max(280, round(h₀ × ölçek)), H − 322)
genişlik = yükseklik = boyut
yatay öteleme = 280 − boyut
```

Önizleme kare kalır ve sağa sabitlenir. Her harekette renderer yeniden boyutlanır; kamera otomatik ayarı sürükleme sırasında kapatılır, bitince açılır. Tutamaç ipucu “Drag to resize window”; üst sınırda “The current window is maximized” olur. İpucu sürükleme sırasında gizlenir.

## 2D alt araç çubuğu

Sıra: **Select · Hand · ayırıcı · Undo · Redo · ayırıcı · − · yüzde · + · ayırıcı · 90° dönüş · View**. Çubuk 48 px yüksekliğinde, yatay iç boşluğu 14 px ve yarıçapı 8 px'tir. Kontroller 32 × 32 px, aralarındaki yatay marj 3 px; ayırıcı 1 × 18 px ve yan marjları 8 px'tir.

- Zoom gösterimi **%25–%200** aralığındadır. Artırma 100'ün altında 25, 100 ve üzerinde 50; azaltma 100 ve altında 25, üstünde 50 puandır.
- Yüzdeye basınca yukarıda **50% / 100% / 200% / Fit** menüsü açılır. Seçili değerde onay işareti vardır. Fit, gösterimi 100'e getirir; bu, editörün kendi ölçek aralığına eşlenen değerdir.
- Ölçek girişleri 100 ms debounce kullanır; görünüm ara adımlarla 30 ms aralıklarla güncellenir. Dönüş 0° / 90° / 180° / 270° döngüsüdür.
- View menüsü yukarı-sağa açılır ve 230 px genişliğindedir: **Show dimension**, **Show material**, **Show bleedline**, **Cut bleedline**, **Move bleedline to topmost**. Varsayılanlar sırasıyla açık, açık, açık, kapalı, açık; bleedline bulunmayan üründe ilgili görünüm kapalı başlar. Tercihler yerel olarak saklanır.
- V/H araç kısayollarıdır. Tuval kapsayıcısı odaktayken Space, basılı tutulduğu sürece Hand'e geçer; bırakılınca önceki araç geri gelir.

## 3D gesture ve ürüne göre araçlar

Varsayılan sürükleme **ürünü döndürür**; kamera orbit'i değildir. Her eksenin açısal değişimi `2π × piksel hareketi / tuval yüksekliği` ile hesaplanır. Her render'da yalnız baskın eksen uygulanır: yatay hareket baskınsa ürünün Y ekseni, değilse dünya X ekseni. Katsayı 1 olduğundan bırakıldıktan sonra atalet devam etmez. Ürün döndürücü sol tuşu kullanır; imlecin alandan çıkması hareketi bitirir. İki parmakla dokunma ürün dönüşünü durdurur ve kamera yakınlaştırma kontrollerine alan bırakır.

3D zoom düğmeleri kamera–hedef mesafesini **5 dünya birimi** değiştirir. Temel kamera sınırları 5 ve 240, kutup açısı üst sınırı π/2'dir; ürüne odaklama mesafe sınırlarını yeniden hesaplayabildiğinden bunlar her sahnenin nihai değerleri değildir.

- Katlanabilir, basit sert ambalajda **Open 0 / Close 100** sürgüsü vardır. Cetvel/ölçü görünümü tam kapalı değerde kullanılabilir; ürün döndürülürken geçici gizlenir ve uygun durumda bırakınca geri gelir.
- Yumuşak ambalajda kutu katlama yerine **Inflate 0–100** bulunur. Değer güncellemeleri 200 ms aralıkla sınırlandırılır. Sert kutu cetveli bu ürünlerde gösterilmez.
- Mini önizlemedeki katlama kontrolü yalnız uygun sert modellerde bulunur: 230 × 24 px, 12 px yarıçap, alttan 20 px.

## Kendi uygulamamızdaki kapsam

Bağımsız uygulamada bu kapsayıcı ölçülerini, mod geçişlerini, mini önizleme hareketini, araç menülerini ve gesture davranışını eşlemek hedeflenir. Layout seçimi ürünün gerçek geometrisine uygulanır; yumuşak ambalajın Inflate davranışı, sert kutunun katlanmasıyla aynı özellik olarak sunulmaz. Her kontrol kendi modelimiz ve veri yapımız üzerinde çalışmalıdır.

Bu rapor bütün SDK özelliklerinin tamamlandığı iddiası değildir. Gelişmiş baskı/görsel efektleri, AI/PDF dönüştürme, hesap/proje hizmetleri, fiyatlandırma ve gerçek kutu katlama altyapısı ayrıca geliştirilmesi veya yapılandırılması gereken alanlardır. Gerçek ürün ölçüleri ve üretici bıçak izi olmadan üretim doğruluğu ya da baskıya hazır çıktı iddiası yoktur.
