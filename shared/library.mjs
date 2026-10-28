import { z } from "zod";
import { designSchema } from "./schema.mjs";
export const libraryDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    scope: z.string().min(1).max(400),
    productId: z.string().min(1).max(100),
    productTitle: z.string().min(1).max(300),
    design: designSchema,
    thumbnail: z
      .string()
      .max(700_000)
      .regex(/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/),
    updatedAt: z.string().datetime(),
    archived: z.boolean().default(false),
  })
  .strict();
export function libraryDocument(input) {
  return libraryDocumentSchema.parse(input);
}
export function librarySummary(record) {
  const { design, ...metadata } = libraryDocument(record);
  return { ...metadata, name: design.name };
}
