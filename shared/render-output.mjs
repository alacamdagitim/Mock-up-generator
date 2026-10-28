export function outputDimensions(
  resolution,
  aspect = "square",
  mobile = false,
) {
  if (![1024, 2048, 4096, 8192].includes(resolution))
    throw new Error("Desteklenmeyen çıktı boyutu.");
  const edge = mobile ? Math.min(resolution, 1024) : resolution;
  return {
    width: aspect === "portrait" ? Math.round(edge * 0.75) : edge,
    height: aspect === "landscape" ? Math.round(edge * 0.75) : edge,
  };
}

/** Overlapping camera windows let denoising see across exported tile boundaries. */
export function renderTiles(width, height, tileSize = 1024, margin = 12) {
  const tiles = [];
  for (let y = 0; y < height; y += tileSize)
    for (let x = 0; x < width; x += tileSize) {
      const w = Math.min(tileSize, width - x),
        h = Math.min(tileSize, height - y);
      const renderX = Math.max(0, x - margin),
        renderY = Math.max(0, y - margin);
      tiles.push({
        x,
        y,
        width: w,
        height: h,
        renderX,
        renderY,
        renderWidth: Math.min(width, x + w + margin) - renderX,
        renderHeight: Math.min(height, y + h + margin) - renderY,
      });
    }
  return tiles;
}
