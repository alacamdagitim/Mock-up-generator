/** Pixel budgets, not CSS breakpoints alone, bound GPU memory on HiDPI screens. */
export function previewBuffer(
  width,
  height,
  dpr = 1,
  mobile = false,
  detail = false,
) {
  const pixelBudget = mobile ? 1_500_000 : detail ? 5_000_000 : 3_000_000;
  const desired = Math.min(Math.max(1, dpr), mobile ? 2 : 2.5);
  const ratio = Math.min(
    desired,
    Math.sqrt(pixelBudget / Math.max(1, width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
  };
}

/** Match the artwork atlas to the output, independent of path sample count. */
export function renderTextureSize(resolution, mobile = false) {
  return Math.min(mobile ? 2048 : 4096, Math.max(1024, resolution));
}

export function artworkMultiplier(width, height, longEdge = 2048) {
  return Math.max(1, Math.min(4, longEdge / Math.max(width, height)));
}
