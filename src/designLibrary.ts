/** Original lightweight SVG assets, generated locally and sanitized by the same upload path. */
export const BASIC_SHAPES = [
  { id: "line", name: "Line", path: "M18 50H82", width: 300, height: 4 },
  {
    id: "dashed",
    name: "Dashed line",
    path: "M18 50H82",
    width: 300,
    height: 4,
  },
  {
    id: "square",
    name: "Square",
    path: "M25 25H75V75H25Z",
    width: 180,
    height: 180,
  },
  {
    id: "rounded",
    name: "Rounded square",
    path: "M40 25H60Q76 25 76 41V60Q76 76 60 76H40Q25 76 25 60V41Q25 25 40 25Z",
    width: 180,
    height: 180,
  },
  {
    id: "pill",
    name: "Pill",
    path: "M37 33H63A17 17 0 0 1 63 67H37A17 17 0 0 1 37 33Z",
    width: 220,
    height: 110,
  },
  {
    id: "circle",
    name: "Circle",
    path: "M76 50A26 26 0 1 1 24 50A26 26 0 1 1 76 50Z",
    width: 180,
    height: 180,
  },
  {
    id: "triangle",
    name: "Triangle",
    path: "M50 24 78 76H22Z",
    width: 200,
    height: 180,
  },
  {
    id: "star",
    name: "Star",
    path: "m50 20 9 20 23 2-17 15 5 24-20-12-20 12 5-24-17-15 23-2Z",
    width: 200,
    height: 200,
  },
] as const;
export const SOCIAL_SYMBOLS = [
  {
    name: "Instagram",
    path: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm10 5h.01M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  },
  {
    name: "Facebook",
    path: "M14 22V12h4l1-4h-5V6c0-2 1-2 3-2h2V1h-4c-4 0-5 2-5 5v2H7v4h3v10",
  },
  {
    name: "YouTube",
    path: "M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm5 4 6 4-6 4V8Z",
  },
  {
    name: "Website",
    path: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c6 5 6 15 0 20-6-5-6-15 0-20Z",
  },
  { name: "Email", path: "M2 4h20v16H2V4Zm0 0 10 9L22 4" },
  { name: "Hashtag", path: "m9 2-4 20M19 2l-4 20M2 9h20M1 16h20" },
] as const;
export const PATTERNS = [
  { name: "Garden", color: "#f9f5e9", ink: "#809b70", kind: "leaves" },
  { name: "Dot grid", color: "#f7e9de", ink: "#c06e53", kind: "dots" },
  { name: "Gingham", color: "#f4d8d4", ink: "#a64045", kind: "grid" },
  { name: "Botanical", color: "#225e63", ink: "#d9bc80", kind: "leaves" },
  { name: "Confetti", color: "#faf0dc", ink: "#db7758", kind: "confetti" },
  { name: "Forest", color: "#244a3a", ink: "#d6cf9e", kind: "dots" },
  { name: "Midnight", color: "#171717", ink: "#ddcba2", kind: "grid" },
  { name: "Organic", color: "#f2ebdf", ink: "#a58c69", kind: "confetti" },
  { name: "Terracotta", color: "#eee3d0", ink: "#a74c33", kind: "grid" },
  { name: "Sand", color: "#eee6ce", ink: "#6c512f", kind: "grid" },
  { name: "Ocean", color: "#bce4ee", ink: "#357799", kind: "grid" },
  { name: "Mono", color: "#eeeae4", ink: "#544439", kind: "leaves" },
] as const;
export function patternSvg(
  p: (typeof PATTERNS)[number],
  width = 600,
  height = 900,
) {
  const motif =
    p.kind === "dots"
      ? '<circle cx="12" cy="12" r="3"/><circle cx="36" cy="36" r="3"/>'
      : p.kind === "grid"
        ? '<path d="M0 12h48M0 36h48M12 0v48M36 0v48" fill="none" stroke="currentColor" stroke-width="5" opacity=".55"/>'
        : p.kind === "leaves"
          ? '<path d="M10 6Q30 6 24 25Q7 27 10 6Zm22 24Q49 29 41 46Q26 47 32 30Z"/><path d="m10 6 17 23m5 7 12 12" stroke="currentColor"/>'
          : '<path d="m5 8 11-4 5 12-10 3Zm25 14q20-9 14 10t-14-10ZM6 36l8-6 7 14Z"/>';
  const tiles = Array.from({ length: Math.ceil(height / 48) }, (_, row) =>
    Array.from(
      { length: Math.ceil(width / 48) },
      (_, col) =>
        `<g transform="translate(${col * 48} ${row * 48})">${motif}</g>`,
    ).join(""),
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${p.color}"/><g fill="${p.ink}" color="${p.ink}">${tiles}</g></svg>`;
}
export function svgUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
