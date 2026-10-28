# Shopify: Online design düğmesi

Ürün sayfasındaki **Online design** düğmesi editörü aynı sayfa üzerinde tam ekran açar. Sayfa yönlendirilmez. Editör ilk tıklamada yüklenir; açılışta yüklenme durumu, hata halinde tekrar deneme gösterilir. X ile kapatınca ürün sayfasına dönülür ve odak düğmeye geri gelir. Taslak aynı ürün için yeniden açılışta korunur. **Save** kayıt yapar; editörü kapatmaz.

## Vercel yayınıyla hazır Custom Liquid

Mevcut yayın: `https://mock-up-generator-y265.vercel.app`.
`shopify/custom-liquid/online-design-vercel.liquid` dosyasının tamamını ürün şablonundaki **Özel Liquid / Custom Liquid** bloğuna yapıştırıp kaydedin ve ürün sayfasını yenileyin. Bu yöntemde editör dosyaları Vercel'den yüklenir. Ürün JSON'u Liquid'den, tıklama anındaki seçili varyant ürün formundan alınır. Editör aynı Shopify belgesinde açıldığı için sepet oturumu korunur. Aşağıdaki tema-assets yükleme adımları bu yöntem için gerekli değildir.

Bu dağıtımda `/api/health` henüz 404 döndürüyor: **Save cihaz kaydıdır; tasarımla sepete ekleme kapalı kalır.** Kalıcı kayıt API'si ayrıca kurulmalıdır. GLB meta alanının otomatik yüklenmesi bu düğme koduyla eklenmez.

Vercel adresi değişirse dosyadaki launcher, editor ve API adreslerini birlikte güncelleyin. JS/font dosyalarında mağazadan yüklemeye izin veren CORS başlıkları bulunmalı; yayın kullanıcı girişi gerektirmeden açılmalıdır. Mevcut yayındaki iki JS girişi 200 ve `Access-Control-Allow-Origin: *` döndürüyor.

## 1. Derlenmiş dosyaları yükleyin

```sh
npm ci
npm run release
```

`releases/alacam-online-design-shopify.zip` içindeki **bütün `assets/alacam-*` dosyalarını** Shopify temasının `assets/` dizinine aynı adlarla yükleyin. Buna küçük `alacam-launcher.js`, ana `alacam-editor.js`, içerik hash'li JavaScript parçaları, fontlar, WebP görseller ve `alacam-licenses.txt` dahildir. Render parçalarını atlamayın. Tek derlemenin dosyalarını birlikte dağıtın.

Hazır Liquid, `data-alacam-editor-src` ile Shopify'ın `asset_url` sürüm parametresini editör girişine de taşır. Bu niteliği koruyun; güncellemede eski giriş dosyasının tarayıcı/CDN önbelleğinden gelmesini önler. Hash'li parçalar aynı derlemenin dosyaları olmalıdır.

Düğme için iki kurulum yolundan birini seçin. Normal sayfa içerik/metin alanı JavaScript çalıştırmak için uygun değildir; burada kullanılan alan temanın **Custom liquid / Özel Liquid** bloğudur.

## 2A. Custom Liquid bloğuna doğrudan yapıştırın

1. Shopify → Online Store → Themes → Customize → kullanılacak **ürün şablonunu** açın.
2. Ürün bilgileri alanına **Custom liquid / Özel Liquid** bloğu ekleyin.
3. `shopify/custom-liquid/online-design-button.liquid` dosyasının **tamamını** bu bloğa yapıştırın ve kaydedin.
4. API ayrı bir sunucudaysa dosyanın başına aşağıdaki satırı ekleyin. `/api` yalnız mağaza alan adında bu yolu sunan bir proxy/servis gerçekten kuruluysa çalışır.

```liquid
{% assign api_base = 'https://design-api.magazaniz.com/api' %}
```

Bu kod mevcut `product` bağlamını kullanır. Bir ürün olmayan sayfaya eklenirse eksik ürün hakkında görünür kurulum mesajı verir; sahte ürün veya varyant oluşturmaz. Aynı ürün şablonundaki farklı Custom Liquid section'ları aynı ürün taslağını paylaşır.

## 2B. Tema snippet'i olarak kullanın

`shopify/snippets/alacam-online-design-button.liquid` dosyasını temanın `snippets/` dizinine kopyalayın. Ürün section'ına veya Custom Liquid bloğuna şunu ekleyin:

```liquid
{% render 'alacam-online-design-button',
  editor_product: product,
  api_base: 'https://design-api.magazaniz.com/api'
%}
```

Bir section içinde aynı ürüne ait birden çok düğme kullanıyorsanız her render için benzersiz `instance_id` verin:

```liquid
{% render 'alacam-online-design-button', editor_product: product, instance_id: 'main' %}
{% render 'alacam-online-design-button', editor_product: product, instance_id: 'sticky' %}
```

Düğmeli tam ekran akışı için mevcut **Alaçam Tasarım Editörü** section'ını eklemek gerekmez. Bu section, editörü sayfada doğrudan göstermek isteyenler için ayrı seçenek olarak durur.

## Seçili varyant ve ürün formu

Liquid ilk açılış için `selected_or_first_available_variant` kimliğini gönderir. Açılışta başlatıcı temanın ilgili ürün formundaki güncel `name="id"` değerini okuyarak müşterinin o anda seçtiği varyantı kullanır. Kimlik mevcut ürünün varyant listesinde olmalıdır; satışa kapalı varyant sepete eklenmez.

Sayfada birden fazla ürün formu varsa düğmeye **tam olarak bu ürüne ait formu** gösteren CSS seçicisi ekleyin. Örnekteki kimliği temanızdaki gerçek form kimliğiyle değiştirin:

```html
data-alacam-product-form="#product-form-main-product"
```

Bu satır `<button ...>` etiketinin diğer özellikleri arasına yazılır. `type="button"` sayesinde editör düğmesi ürün formunu göndermez. Otomatik form eşleştirme ve seçili varyant geçişi canlı tema üzerinde test edilmelidir.

## Başlatıcı sözleşmesi

Bağımsız bir tema bileşeni yazılacaksa düğmenin `data-alacam-open` değeri, aynı belgedeki `type="application/json"` ayar script'inin kimliğidir. Kod örneği ürün başlıklarındaki `<` karakterlerini `\u003c` olarak yazar; JSON'u HTML olarak yorumlatmayın veya ham ürün metinlerini JavaScript içine birleştirmeyin. Birden fazla düğme olsa da tek başlatıcı kullanılır.

Başlatıcı yüklendikten sonra programatik açılış/kapanış:

```js
window.AlacamEditor.open({ config, trigger: document.querySelector('[data-alacam-open]') });
window.AlacamEditor.close();
```

`config`, örnek Liquid dosyasındaki ürün/varyant ayarlarıdır. `trigger` odak geri dönüşünde kullanılır. Global API mevcut olmadan çağrı yapmayın; standart `data-alacam-open` düğmesi bu yükleme sırasını yönetir.

Tema olayları:

```js
document.addEventListener('alacam:design-saved', (event) => {
  // scope: 'server' ise tasarım kimliği/URL'leri kalıcı sunucu kaydıdır.
  // scope: 'device' yalnız bu tarayıcıya kayıttır. Bu olay editörü kapatmaz.
  console.log(event.detail);
});
document.addEventListener('alacam:close', (event) => {
  // Başlatıcı editör katmanını kapatır ve ürün sayfasını geri getirir.
  console.log(event.detail.productId);
});
```

## Sunucu, model ve bıçak izi

- Düğme için Pacdora SDK/API anahtarı veya ücretli SDK gerekmez. Tarayıcıya Admin API, depolama sırrı veya gizli anahtar yazılmaz.
- `api_base` herkese erişilebilir API adresidir. Kalıcı depolama ve uçlar [README](../README.md#sunucu-ve-ortam-değişkenleri) içinde açıklanır. Sunucu yapılandırılmadan yerel düzenleme, JSON, PNG ve render kullanılabilir; **Save yalnız cihaz kaydıdır** ve tasarımla sepete ekleme için sunucu gerekir.
- Ürünün adı, görseli, kimliği ve varyantları Liquid'den aktarılır. Ürün meta alanı `custom.alacam_dieline` (Dosya) üreticinin bıçak izi bağlantısını geçirir; dosyayı otomatik UV veya baskı şablonuna dönüştürmez.
- Canlı 3B hâlâ projedeki özgün yaklaşık doypack modelidir. Ürüne herhangi bir GLB yüklemek bu sürümde modeli otomatik değiştirmez. Genel GLB yükleme/UV eşleştirme henüz bağlı değildir. Gerçek ölçü ve üretici gereksinimleri olmadan baskıya hazır dosya iddiası yoktur.
- Bu kurulum için `.env` tarayıcıya yüklenmez. Sunucunun `DESIGN_STORAGE_DIR`, `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS` ve gerekirse `PORT` ayarları sunucuda tutulur.

## Canlı mağaza kontrolü

Yerel düğme örneği: Vite çalışırken `http://127.0.0.1:5184/launcher-demo.html`. `npm run test:launcher` izole mağaza sayfasında açılış/kapanış, güncel varyant, yerel kayıt, mobil ve hata durumlarını doğrular. Derlenmiş dosyalarla test için önce `npm run build`, ardından başka terminalde `npm run preview -- --port 5185 --strictPort` ve `npm run test:launcher:build` çalıştırın. Bu test gerçekten derlenmiş JS parçalarını yükler; yalnız sunucu sağlık yanıtı yapılandırılmamış olarak taklit edilir.

1. Ürün sayfası açıldığında editör kapalı ve düğme görünür olmalı. Tıklayınca sayfa değişmeden editör açılmalı; ilk yüklemede bekleme, hatada tekrar deneme görünmeli.
2. Varyantı değiştirin, editörü açın ve ürün kartındaki seçili varyantı karşılaştırın. Satışa kapalı varyantta sepet işleminin engellendiğini kontrol edin.
3. Logo ekleyip düzenleyin, 2D/3D ve renderı deneyin. Save → X → yeniden aç akışında taslağın geldiğini kontrol edin.
4. X ve Escape ile kapanışı; klavye odağının düğmeye dönüşünü; ürün sayfasında kaydırmanın yeniden çalışmasını kontrol edin. Telefonda ekran boyutu ve yön değişimini deneyin.
5. API bağlıyken kaydın kalıcı tasarım kimliği döndürdüğünü ve Shopify sepetinde yalnız tasarım referansları bulunduğunu doğrulayın. API kapalıyken kayıtlı gibi gösterilmemeli.
6. Tema düzenleyicisinde bloğu silip yeniden ekleyin; sayfada iki düğme olsa da çift editör açılmamalı. Eski JavaScript parçaları CDN'de kalıyorsa tüm dosyaları aynı derleme paketinden yeniden yükleyin.

Yerel tarayıcı testleri gerçek Shopify tema kodu, CDN yüklemesi ve sipariş yerine geçmez. Mağazaya dağıtım ve gerçek sipariş testi bu yerel teslimat kapsamında otomatik yapılmaz.
