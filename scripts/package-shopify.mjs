import { mkdir, copyFile, readdir, unlink } from "node:fs/promises";
await mkdir("shopify/assets", { recursive: true });
// Remove only this build's managed assets so obsolete hashed render chunks
// do not accumulate in each delivery. Merchant assets use their own names.
for (const file of await readdir("shopify/assets"))
  if (/^alacam-.*\.(js|css|webp|woff2)$/.test(file))
    await unlink(`shopify/assets/${file}`);
for (const file of await readdir("dist"))
  if (/^alacam-.*\.(js|css|webp|woff2)$/.test(file))
    await copyFile(`dist/${file}`, `shopify/assets/${file}`);
await copyFile(
  "dist/THIRD_PARTY_LICENSES.txt",
  "shopify/assets/alacam-licenses.txt",
);
console.log("Shopify assets hazır: shopify/assets/");
