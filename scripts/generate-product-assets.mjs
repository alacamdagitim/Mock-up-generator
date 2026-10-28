import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  ASSET_REVISION,
  createReferencePouch,
  referenceAssetDefinition,
  referenceFaceSvg,
} from "../shared/product-assets.mjs";
import { referenceTemplateSvg } from "../shared/templates.mjs";

// Texture-free export needs only this browser FileReader operation under Node.
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((result) => {
          this.result = result;
          this.onloadend?.();
        })
        .catch((error) => this.onerror?.(error));
    }
  };
}
const directory = fileURLToPath(
  new URL(`../public/product-assets/${ASSET_REVISION}/`, import.meta.url),
);
await mkdir(directory, { recursive: true });
const model = createReferencePouch();
try {
  const glb = await new GLTFExporter().parseAsync(model, { binary: true });
  if (!(glb instanceof ArrayBuffer))
    throw new Error("GLB çıktısı oluşturulamadı");
  await writeFile(`${directory}/model.glb`, Buffer.from(glb));
  await writeFile(
    `${directory}/definition.json`,
    JSON.stringify(referenceAssetDefinition(), null, 2) + "\n",
  );
  for (const face of ["front", "back"])
    await writeFile(`${directory}/${face}.svg`, referenceFaceSvg(face));
  await writeFile(`${directory}/reference-guide.svg`, referenceTemplateSvg());
  await writeFile(
    `${directory}/README.txt`,
    `ALAÇAM — ÖZGÜN DOYPACK ÖRNEK VARLIK PAKETİ\nSürüm: ${ASSET_REVISION}\n\nmodel.glb: bağımsız glTF 2.0 modeli; metre birimi, Y yukarı, Z ön.\nÖrnek en/boy: 140 × 210 mm; gerçek üretim ölçüsü değildir.\nprint_front / artwork_front: ön yüz mesh/malzeme adı.\nprint_back / artwork_back: arka yüz mesh/malzeme adı.\nUV: U soldan sağa 0→1; V alttan üste 0→1.\nCanvasTexture uygulanırken flipY=true ve sRGB kullanın; hazır bir glTF modelinin genel texture varsayımlarını bu dosyaya körlemesine uygulamayın.\nModel boş beyaz malzemelidir; tasarım, ışık, gölge ve stüdyo arka planı dosyaya gömülmemiştir.\n\nfront.svg / back.svg: her biri tam 140 × 210 mm, 600 × 900 viewBox.\nreference-guide.svg: iki yüzü etiketleriyle gösteren ölçü kılavuzu.\nSVG reference-guides grubu üretim verisi değildir ve artwork dokusuna basılmamalıdır.\ndefinition.json: yüz/UV/alan eşleme bilgisi. Mevcut editörde bu JSON için otomatik içe alma henüz uygulanmadı.\n\nBu paket özgün proje geometrisinden üretilmiştir; Pacdora veya üçüncü taraf model/marka/görsel içermez. Üçüncü taraf yazılım lisansları proje THIRD_PARTY_NOTICES.md dosyasındadır.\n\nÜRETİM ONAYSIZ — KESİM MAKİNESİNE GÖNDERMEYİN.\nGerçek bıçak izi değildir. Kaynak, körük, kesim/katlama yolları, taşma payı ve baskı profili üretici tarafından sağlanıp onaylanmalıdır. productionReady=false olarak korunmuştur.\nShopify'a yüklemek GLB'yi otomatik olarak editöre bağlamaz; meta alan okuma ve model adaptörü bağlantısı ayrıca gerekir.\n`,
  );
  console.log(
    `Özgün örnek ürün paketi hazır: ${directory} (${glb.byteLength} bayt GLB)`,
  );
} finally {
  const materials = new Set();
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    materials.add(node.material);
  });
  materials.forEach((material) => material.dispose());
}
