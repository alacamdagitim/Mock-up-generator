/** Validate the GLB container before GLTFLoader can request any external resources. */
export const MAX_MODEL_BYTES = 40 * 1024 * 1024;
export function inspectGlb(buffer) {
  if (buffer.byteLength < 20 || buffer.byteLength > MAX_MODEL_BYTES)
    throw new Error("GLB dosyası boş, geçersiz veya 40 MB sınırını aşıyor.");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error("Geçerli bir GLB 2.0 dosyası gerekli.");
  const length = view.getUint32(12, true);
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    20 + length > buffer.byteLength
  )
    throw new Error("GLB model tanımı okunamadı.");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
  );
  for (const item of [...(json.buffers || []), ...(json.images || [])])
    if (item.uri && !/^data:/i.test(item.uri))
      throw new Error(
        "GLB dokuları ve geometrisi tek dosyaya gömülmeli; harici dosya bağlantısı desteklenmiyor.",
      );
  if ((json.nodes?.length || 0) > 2000 || (json.materials?.length || 0) > 128)
    throw new Error("Model mobil önizleme için fazla karmaşık.");
  for (const accessor of json.accessors || [])
    if (accessor.count > 3_000_000)
      throw new Error("Model geometrisi önizleme sınırını aşıyor.");
  return json;
}
