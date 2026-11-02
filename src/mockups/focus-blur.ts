/** Blur a warped RGBA layer in premultiplied space, before blending with its photo. */
export async function blurMockupLayer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number,
  signal?: AbortSignal,
) {
  const check = () => {
    if (signal?.aborted)
      throw new DOMException("Mockup işlemi iptal edildi.", "AbortError");
  };
  check();
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 8)
    throw new Error("Mockup odak bulanıklığı geçersiz.");
  if (data.length !== width * height * 4)
    throw new Error("Mockup katmanının piksel ölçüleri uyuşmuyor.");
  if (sigma < 0.05) return;
  const radius = Math.ceil(sigma * 3);
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < left) return;
  // Work only around visible coverage. Empty image margins need no float buffers.
  left = Math.max(0, left - radius);
  right = Math.min(width - 1, right + radius);
  top = Math.max(0, top - radius);
  bottom = Math.min(height - 1, bottom + radius);
  const w = right - left + 1,
    h = bottom - top + 1;
  const source = new Float32Array(w * h * 4),
    temporary = new Float32Array(source.length);
  const weights = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) {
    const value = Math.exp(-(k * k) / (2 * sigma * sigma));
    weights[k + radius] = value;
    total += value;
  }
  for (let k = 0; k < weights.length; k++) weights[k] /= total;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const src = ((y + top) * width + x + left) * 4,
        dst = (y * w + x) * 4;
      const alpha = data[src + 3] / 255;
      source[dst] = data[src] * alpha;
      source[dst + 1] = data[src + 1] * alpha;
      source[dst + 2] = data[src + 2] * alpha;
      source[dst + 3] = alpha;
    }
  for (let axis = 0; axis < 2; axis++) {
    const input = axis === 0 ? source : temporary,
      output = axis === 0 ? temporary : source;
    for (let y = 0; y < h; y++) {
      if (y % 32 === 0) {
        check();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        check();
      }
      for (let x = 0; x < w; x++) {
        const offset = (y * w + x) * 4;
        let r = 0,
          g = 0,
          b = 0,
          a = 0;
        for (let k = -radius; k <= radius; k++) {
          let sx = x + (axis === 0 ? k : 0),
            sy = y + (axis === 1 ? k : 0);
          // A photo crop is not a physical paper edge. Extend only at the real
          // canvas border; the padded interior of a coverage ROI stays transparent.
          if (sx < 0 && left === 0) sx = 0;
          if (sx >= w && right === width - 1) sx = w - 1;
          if (sy < 0 && top === 0) sy = 0;
          if (sy >= h && bottom === height - 1) sy = h - 1;
          if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
          const sample = (sy * w + sx) * 4,
            weight = weights[k + radius];
          r += input[sample] * weight;
          g += input[sample + 1] * weight;
          b += input[sample + 2] * weight;
          a += input[sample + 3] * weight;
        }
        output[offset] = r;
        output[offset + 1] = g;
        output[offset + 2] = b;
        output[offset + 3] = a;
      }
    }
  }
  check();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4,
        dst = ((y + top) * width + x + left) * 4;
      const alpha = source[src + 3];
      data[dst] = alpha > 1e-8 ? source[src] / alpha : 0;
      data[dst + 1] = alpha > 1e-8 ? source[src + 1] / alpha : 0;
      data[dst + 2] = alpha > 1e-8 ? source[src + 2] / alpha : 0;
      data[dst + 3] = alpha * 255;
    }
}
