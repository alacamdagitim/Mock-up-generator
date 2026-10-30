import { z } from "zod";
import { createHash } from "node:crypto";
import { designSchema } from "../shared/schema.mjs";

export const MAX_INLINE_BYTES = 4_000_000;
export const MAX_DESIGN_BYTES = 20_000_000;
export const MAX_PREVIEW_BYTES = 16_000_000;
export const UPLOAD_TTL_MS = 15 * 60_000;
export const DESIGN_ID = /^[a-f0-9]{48}$/;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

// This is the customer's displayed quote. Shopify remains authoritative for
// the price, availability, discounts, and quantity accepted by the cart.
export const commerceSnapshotSchema = z
  .object({
    quantity: integer.positive().max(1_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    unitPrice: integer,
    totalPrice: integer,
    unitsPerItem: integer.positive().max(1_000_000),
    variantTitle: z.string().max(500),
  })
  .strict();

export const orderBindingSchema = z
  .object({
    productId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    variantId: z.string().regex(/^\d+$/).max(30).nullable(),
    commerce: commerceSnapshotSchema.optional(),
  })
  .strict();

export const prepareDesignSchema = orderBindingSchema
  .extend({
    designBytes: integer.positive().max(MAX_DESIGN_BYTES),
    previewBytes: integer.positive().max(MAX_PREVIEW_BYTES),
    designSha256: hash,
    previewSha256: hash,
  })
  .strict();

export const inlineDesignSchema = orderBindingSchema
  .extend({
    design: designSchema,
    preview: z
      .string()
      .max(Math.ceil((MAX_PREVIEW_BYTES * 4) / 3) + 30)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export class DesignApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "DesignApiError";
    this.status = status;
  }
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

// Validate the PNG container before persisting it or serving it as an image.
// Pixel decompression is deliberately left to image decoders in the editor.
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function validatePng(
  data,
  { maxBytes = MAX_PREVIEW_BYTES, maxPixels = 16_777_216 } = {},
) {
  const invalid = () => {
    throw new DesignApiError(
      400,
      "PNG görseli geçersiz veya desteklenen boyutları aşıyor.",
    );
  };
  if (
    !Buffer.isBuffer(data) ||
    data.length < 45 ||
    data.length > maxBytes ||
    !data.subarray(0, 8).equals(PNG)
  )
    invalid();
  let offset = 8,
    width = 0,
    height = 0,
    imageData = false,
    ended = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    if (length > data.length - offset - 12) invalid();
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunk = data.subarray(offset + 4, offset + 8 + length);
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      crc32(chunk) !== data.readUInt32BE(offset + 8 + length)
    )
      invalid();
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) invalid();
      width = data.readUInt32BE(offset + 8);
      height = data.readUInt32BE(offset + 12);
      const depth = data[offset + 16],
        color = data[offset + 17];
      const depths = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !width ||
        !height ||
        width > 16000 ||
        height > 16000 ||
        width * height > maxPixels ||
        !depths[color]?.includes(depth) ||
        data[offset + 18] !== 0 ||
        data[offset + 19] !== 0 ||
        data[offset + 20] > 1
      )
        invalid();
    } else if (type === "IHDR") invalid();
    if (type === "IDAT" && length) imageData = true;
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0 || offset !== data.length) invalid();
      ended = true;
      break;
    }
  }
  if (!ended || !imageData) invalid();
  return { width, height };
}

export function decodePngDataUrl(value, options) {
  if (
    typeof value !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new DesignApiError(400, "PNG görseli geçersiz.");
  const encoded = value.slice(22);
  const data = Buffer.from(encoded, "base64");
  if (data.toString("base64") !== encoded)
    throw new DesignApiError(400, "PNG görseli geçersiz.");
  validatePng(data, options);
  return data;
}

export function validateDesignDocument(value, expectedProductId) {
  const parsed = designSchema.safeParse(value);
  if (!parsed.success)
    throw new DesignApiError(400, "Geçersiz veya desteklenmeyen tasarım.");
  if (
    expectedProductId !== undefined &&
    parsed.data.productId !== expectedProductId
  )
    throw new DesignApiError(
      400,
      "Tasarım seçilen ürüne ait değil. Ürünü yeniden açıp kaydı tekrar deneyin.",
    );
  for (const elements of Object.values(parsed.data.faces)) {
    for (const element of elements) {
      if (element.kind !== "image") continue;
      const image = decodePngDataUrl(element.src, {
        maxBytes: 6_000_000,
        maxPixels: 40_000_000,
      });
      const dimensions = {
        width: image.readUInt32BE(16),
        height: image.readUInt32BE(20),
      };
      if (
        dimensions.width !== element.pixelWidth ||
        dimensions.height !== element.pixelHeight
      )
        throw new DesignApiError(
          400,
          "Tasarım görselinin piksel ölçüleri dosyayla eşleşmiyor.",
        );
    }
  }
  return parsed.data;
}
