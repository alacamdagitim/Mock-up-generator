// Local QA only. Never deploy this fixture server to a storefront.
import express from "express";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../server/app.mjs";
const port = 5180;
const base = `http://127.0.0.1:${port}`;
const app = createApp({
  storageDir: "/private/tmp/alacam-browser-qa",
  publicBase: base,
  origins: [base],
});
let lastItem = null;
app.post("/qa/cart/add.js", (req, res) => {
  const item = req.body.items?.[0];
  if (
    ![10001, 10002].includes(item?.id) ||
    !item?.properties?._alacam_design_id
  )
    return res.status(422).json({ description: "Test sepeti doğrulanamadı." });
  lastItem = item;
  res.json({ items: [item] });
});
app.get("/qa/cart", (_req, res) =>
  res
    .type("html")
    .send(
      `<html lang="tr"><meta charset="utf-8"><title>Test sepeti</title><h1>Test sepetine eklendi</h1><p>Bu sayfa gerçek bir Shopify siparişi oluşturmaz.</p><pre>${JSON.stringify(lastItem, null, 2)}</pre><a href="/">Editöre dön</a></html>`,
    ),
);
app.get("/", async (_req, res) => {
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'",
  );
  let html = await readFile("dist/index.html", "utf8");
  const config = {
    apiBase: "/api",
    productId: "100",
    productTitle: "Test Doypack",
    variants: [{ id: 10001, title: "140 × 210 mm · Test", available: true }],
    products: [
      {
        id: "100",
        title: "Beyaz Doypack",
        category: "Doypack",
        subcategory: "Kilitli",
        modelId: "doypack-v1",
        variants: [{ id: 10001, title: "Beyaz · Test", available: true }],
      },
      {
        id: "101",
        title: "Kraft Doypack",
        category: "Doypack",
        subcategory: "Kraft",
        modelId: "doypack-v1",
        variants: [{ id: 10002, title: "Kraft · Test", available: true }],
      },
      {
        id: "102",
        title: "Karton Bardak · Test",
        category: "Bardak",
        subcategory: "Tek duvar",
        variants: [],
      },
      {
        id: "103",
        title: "Standart Doypack · Test",
        category: "Doypack",
        subcategory: "Kilitli",
        modelId: "doypack-v1",
        variants: [{ id: 10002, title: "Test", available: true }],
      },
      {
        id: "104",
        title: "Pencereli Doypack · Test",
        category: "Doypack",
        subcategory: "Pencereli",
        variants: [],
      },
      {
        id: "105",
        title: "Kutu · Test",
        category: "Kutular",
        subcategory: "Kargo kutusu",
        variants: [],
      },
      {
        id: "106",
        title: "Gıda Kutusu · Test",
        category: "Kutular",
        subcategory: "Gıda kutusu",
        variants: [],
      },
      {
        id: "107",
        title: "Çift Duvar Bardak · Test",
        category: "Bardak",
        subcategory: "Çift duvar",
        variants: [],
      },
      {
        id: "108",
        title: "Kâğıt Poşet · Test",
        category: "Poşet",
        subcategory: "Kraft",
        variants: [],
      },
    ],
    cartRoot: "/qa/",
    storageKey: "alacam:qa:v1",
  };
  html = html.replace(
    '<div id="alacam-editor"></div>',
    `<div id="alacam-editor" data-config='${JSON.stringify(config)}'></div>`,
  );
  res.type("html").send(html);
});
app.use(express.static(path.resolve("dist")));
app.listen(port, "127.0.0.1", () =>
  console.log(`Local QA: ${base} · temporary storage, simulated cart`),
);
