/** Legacy v1 designs use one color for both faces. New edits override one face. */
export function faceBackground(design, face) {
  return design.surfaceColors?.[face] || design.background;
}

/** Keep the old global color so changing one face never changes the other. */
export function withSurfaceColor(design, face, color) {
  return {
    ...design,
    surfaceColors: { ...design.surfaceColors, [face]: color },
  };
}

export function normalizeHex(value) {
  const text = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(text))
    return `#${[...text].map((letter) => letter + letter).join("")}`.toLowerCase();
  return /^[0-9a-f]{6}$/i.test(text) ? `#${text.toLowerCase()}` : null;
}

/** HSV values are degrees and percentages, independent of browser color inputs. */
export function hexToHsv(hex) {
  const value = normalizeHex(hex) || "#ffffff";
  const [r, g, b] = [1, 3, 5].map(
    (index) => parseInt(value.slice(index, index + 2), 16) / 255,
  );
  const maximum = Math.max(r, g, b),
    minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let h = 0;
  if (delta) {
    if (maximum === r) h = ((g - b) / delta) % 6;
    else if (maximum === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: maximum ? (delta / maximum) * 100 : 0, v: maximum * 100 };
}

export function hsvToHex({ h, s, v }) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const value = Math.max(0, Math.min(100, v)) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  const rgb =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${rgb
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function recommendedSurfaceColors(design, face) {
  const artwork = design.faces[face]
    .filter((element) => element.kind !== "image")
    .map((element) => element.fill);
  return [
    ...new Set(
      [
        faceBackground(design, face),
        "#ffffff",
        "#d8dbd7",
        ...artwork,
        "#a3c83e",
        "#000000",
      ]
        .map(normalizeHex)
        .filter(Boolean),
    ),
  ].slice(0, 6);
}
