export type PixelLevel = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Filter colors in premultiplied alpha, so transparent logo edges stay clean. */
export function sampleBilinear(
  { data, width, height }: PixelLevel,
  x: number,
  y: number,
  out: Float64Array,
) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const left = Math.floor(x),
    top = Math.floor(y),
    right = Math.min(width - 1, left + 1),
    bottom = Math.min(height - 1, top + 1),
    a = (top * width + left) * 4,
    b = (top * width + right) * 4,
    c = (bottom * width + left) * 4,
    d = (bottom * width + right) * 4,
    tx = x - left,
    ty = y - top;
  const alpha = mix(
    mix(data[a + 3], data[b + 3], tx),
    mix(data[c + 3], data[d + 3], tx),
    ty,
  );
  out[3] = alpha;
  for (let channel = 0; channel < 3; channel++)
    out[channel] = alpha
      ? mix(
          mix(
            data[a + channel] * data[a + 3],
            data[b + channel] * data[b + 3],
            tx,
          ),
          mix(
            data[c + channel] * data[c + 3],
            data[d + channel] * data[d + 3],
            tx,
          ),
          ty,
        ) / alpha
      : 0;
}

/** A UV map is a continuous field; nearest native texels produce visible steps. */
export function sampleUv16(
  view: DataView,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Float64Array,
) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const left = Math.floor(x),
    top = Math.floor(y),
    right = Math.min(width - 1, left + 1),
    bottom = Math.min(height - 1, top + 1),
    a = (top * width + left) * 4,
    b = (top * width + right) * 4,
    c = (bottom * width + left) * 4,
    d = (bottom * width + right) * 4,
    tx = x - left,
    ty = y - top;
  for (let channel = 0; channel < 2; channel++) {
    const offset = channel * 2;
    out[channel] =
      mix(
        mix(
          view.getUint16(a + offset, true),
          view.getUint16(b + offset, true),
          tx,
        ),
        mix(
          view.getUint16(c + offset, true),
          view.getUint16(d + offset, true),
          tx,
        ),
        ty,
      ) / 65535;
  }
}

/** Trilinear minification removes shimmer/stair steps without blurring magnified art. */
export function sampleMinified(
  levels: PixelLevel[],
  u: number,
  v: number,
  footprint: number,
  out: Float64Array,
  scratch: Float64Array,
) {
  const lod = Math.min(
      levels.length - 1,
      Math.max(0, Math.log2(Math.max(1, footprint))),
    ),
    low = Math.floor(lod),
    high = Math.min(levels.length - 1, low + 1),
    blend = lod - low,
    first = levels[low];
  sampleBilinear(first, u * (first.width - 1), v * (first.height - 1), out);
  if (!blend || high === low) return;
  const second = levels[high];
  sampleBilinear(
    second,
    u * (second.width - 1),
    v * (second.height - 1),
    scratch,
  );
  const alpha = mix(out[3], scratch[3], blend);
  for (let channel = 0; channel < 3; channel++)
    out[channel] = alpha
      ? mix(out[channel] * out[3], scratch[channel] * scratch[3], blend) / alpha
      : 0;
  out[3] = alpha;
}

/** Match the displayed photo and Retina density, with bounded temporary canvases. */
export function previewResolution(
  sceneWidth: number,
  sceneHeight: number,
  hostWidth: number,
  hostHeight: number,
  devicePixelRatio: number,
  mobile: boolean,
) {
  if (hostWidth < 1 || hostHeight < 1) return null;
  const sceneEdge = Math.max(sceneWidth, sceneHeight),
    fit = Math.min(hostWidth / sceneWidth, hostHeight / sceneHeight),
    density = Math.max(1, Math.min(2, devicePixelRatio || 1)),
    outputBudget = mobile ? 1_572_864 : 4_194_304,
    workingBudget = mobile ? 2_359_296 : 6_291_456,
    aspectArea = (sceneWidth * sceneHeight) / (sceneEdge * sceneEdge),
    targetEdge = Math.max(
      1,
      Math.min(
        sceneEdge,
        Math.ceil(sceneEdge * fit * density),
        Math.floor(Math.sqrt(outputBudget / aspectArea)),
      ),
    ),
    // The high-resolution mapping is reduced once, rather than enlarged in CSS.
    renderEdge = Math.max(
      targetEdge,
      Math.min(
        sceneEdge,
        targetEdge * 2,
        Math.floor(Math.sqrt(workingBudget / aspectArea)),
      ),
    );
  return { targetEdge, renderEdge };
}
