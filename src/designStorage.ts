import type { Design, SavedDesign } from "./types";

export type OrderQuote = {
  quantity: number;
  currency: string;
  unitPrice: number;
  totalPrice: number;
  unitsPerItem: number;
  variantTitle: string;
};

async function digest(blob: Blob) {
  const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function request(api: string, body: unknown, action = "") {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 90000);
  try {
    const response = await fetch(
      `${api}/designs${action ? `?action=${action}` : ""}`,
      {
        method: "POST",
        credentials: "omit",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      },
    );
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        value?.error || "Tasarım kaydı tamamlanamadı. Yeniden deneyin.",
      );
    if (!value || typeof value !== "object")
      throw new Error("Kayıt sunucusunun yanıtı geçersiz.");
    return value;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error(
        "Tasarım kaydı zaman aşımına uğradı. Bağlantınızı kontrol edip yeniden deneyin.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** An order thumbnail is separate from the full-size customer mockup download. */
async function orderPreview(png: string) {
  const response = await fetch(png);
  const source = await response.blob();
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Sipariş önizlemesi oluşturulamadı.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Sipariş önizlemesi oluşturulamadı.")),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}

function record(
  value: Record<string, unknown>,
  api: string,
  productId: string,
  variantId: string | null,
): SavedDesign {
  if (
    typeof value.id !== "string" ||
    !/^[a-f0-9]{48}$/.test(value.id) ||
    value.productId !== productId ||
    value.variantId !== variantId
  )
    throw new Error(
      "Kaydedilen tasarımın ürün veya varyant bilgisi uyuşmuyor.",
    );
  const origin = new URL(api, location.href).origin;
  for (const key of ["designUrl", "previewUrl"]) {
    if (typeof value[key] !== "string")
      throw new Error("Kayıt bağlantısı eksik.");
    const url = new URL(value[key] as string, location.href);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith(
        `/designs/${value.id}/${key === "designUrl" ? "design.json" : "preview.png"}`,
      )
    )
      throw new Error(
        "Kayıt sunucusu geçersiz bir tasarım bağlantısı döndürdü.",
      );
  }
  return value as SavedDesign;
}

export async function saveDesignToServer(input: {
  api: string;
  uploadMode: string;
  design: Design;
  png: string;
  productId: string;
  variantId: string | null;
  commerce?: OrderQuote;
}): Promise<SavedDesign> {
  const { api, design, productId, variantId, commerce } = input;
  if (design.productId !== productId)
    throw new Error("Tasarım bu ürüne ait değil.");
  if (input.uploadMode !== "direct-blob") {
    const value = await request(api, {
      design,
      preview: input.png,
      productId,
      variantId,
      ...(commerce ? { commerce } : {}),
    });
    return record(value, api, productId, variantId);
  }
  const [designFile, previewFile] = [
    new Blob([JSON.stringify(design)], { type: "application/json" }),
    await orderPreview(input.png),
  ];
  if (designFile.size > 20_000_000 || previewFile.size > 16_000_000)
    throw new Error(
      "Sipariş dosyası sınırı aşıldı. Tasarım görsellerini küçültüp yeniden deneyin.",
    );
  const [designSha256, previewSha256] = await Promise.all([
    digest(designFile),
    digest(previewFile),
  ]);
  const prepared = await request(
    api,
    {
      productId,
      variantId,
      commerce,
      designBytes: designFile.size,
      previewBytes: previewFile.size,
      designSha256,
      previewSha256,
    },
    "prepare",
  );
  if (
    typeof prepared.session !== "string" ||
    !/^[a-f0-9]{48}$/.test(prepared.id) ||
    prepared.expiresAt <= Date.now() ||
    !prepared.uploads
  )
    throw new Error("Dosya yükleme izni alınamadı.");
  const { put } = await import("@vercel/blob/client");
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 240000);
  try {
    await Promise.all(
      (
        [
          ["design", designFile, "application/json"],
          ["preview", previewFile, "image/png"],
        ] as const
      ).map(async ([key, file, contentType]) => {
        const target = prepared.uploads[key];
        if (
          !target ||
          typeof target.pathname !== "string" ||
          !target.pathname.includes(prepared.id) ||
          typeof target.token !== "string" ||
          target.contentType !== contentType
        )
          throw new Error("Dosya yükleme adresi geçersiz.");
        await put(target.pathname, file, {
          access: "private",
          token: target.token,
          contentType,
          multipart: file.size > 4_500_000,
          abortSignal: abort.signal,
        });
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
  const value = await request(api, { session: prepared.session }, "finalize");
  return record(value, api, productId, variantId);
}
