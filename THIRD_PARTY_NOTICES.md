# Açık kaynak ve varlıklar

Bu projede Pacdora kaynak kodu, API'si, marka kimliği, görseli veya modeli kullanılmaz. Doypack geometrisi `shared/pouch-geometry.mjs` ve `shared/pouch-structure.mjs` içinde özgün olarak üretilir. Tipografik örnekler `src/designPresets.ts` içinde bu proje için hazırlanmıştır. Stüdyo ışığı/çevresi ve film yüzey dokuları kodla üretilir; harici fotoğraf, HDRI veya lisanslı 3D varlık kullanılmaz. DM Sans açık lisanslı npm paketinden yerel sunulur; SVG yükleyen kullanıcı kendi varlıklarının kullanım hakkından sorumludur.

| Bağımlılık | Lisans | Kaynak |
| --- | --- | --- |
| React / React DOM | MIT | https://github.com/facebook/react |
| Fabric.js | MIT | https://github.com/fabricjs/fabric.js |
| Three.js | MIT | https://github.com/mrdoob/three.js |
| three-gpu-pathtracer 0.0.24 | MIT | https://github.com/gkjohnson/three-gpu-pathtracer/tree/v0.0.24 |
| three-mesh-bvh 0.9.1 | MIT | https://github.com/gkjohnson/three-mesh-bvh |
| glslSmartDeNoise (DenoiseMaterial içindeki filtre) | BSD-2-Clause | https://github.com/BrutPitt/glslSmartDeNoise |
| xatlas-web (pathtracer eş bağımlılığı) | MIT | https://github.com/mozillareality/xatlas-web |
| Lucide React | ISC | https://github.com/lucide-icons/lucide |
| DOMPurify | Apache-2.0 OR MPL-2.0 | https://github.com/cure53/DOMPurify |
| Zod | MIT | https://github.com/colinhacks/zod |
| Express | MIT | https://github.com/expressjs/express |
| CORS | MIT | https://github.com/expressjs/cors |
| Helmet | MIT | https://github.com/helmetjs/helmet |
| express-rate-limit | MIT | https://github.com/express-rate-limit/express-rate-limit |
| TypeScript / Playwright (geliştirme) | Apache-2.0 | https://github.com/microsoft |
| Prettier (geliştirme) | MIT | https://github.com/prettier/prettier |
| Vite / Vite React plugin (geliştirme) | MIT | https://github.com/vitejs/vite |

Tüm bu doğrudan bağımlılıklar ticari kullanıma uygun ücretsiz açık kaynaktır. Dağıtımda ilgili telif ve lisans bildirimleri korunmalıdır. `npm run licenses` komutu kurulmuş doğrudan ve transitif bağımlılıkların lisans metinlerini `dist/THIRD_PARTY_LICENSES.txt` dosyasında birleştirir; Shopify paketine de kopyalanır. Kesin sürümler package-lock.json ile sabitlenir.

Render son işlemindeki glslSmartDeNoise filtresinin Michele Morrone telif bildirimi ve BSD-2-Clause metni `scripts/licenses/glslSmartDeNoise.txt` içinde korunur ve aynı dağıtım bildiriminin içine eklenir.

## DM Sans

Arayüz ve isteğe bağlı metin fontu: `@fontsource-variable/dm-sans`, SIL Open Font License 1.1. Copyright 2014 The DM Sans Project Authors. Lisans metni derlenen THIRD_PARTY_LICENSES.txt ve Shopify alacam-licenses.txt dosyalarına dahil edilir. Fontlar Pacdora'dan alınmaz. Kaynak: https://github.com/google/fonts/tree/main/ofl/dmsans
