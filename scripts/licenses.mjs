import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const sections = [];
const seen = new Set();
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const folder = path.join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      await scan(folder);
      continue;
    }
    if (!entry.isDirectory()) continue;
    try {
      const p = JSON.parse(
        await readFile(path.join(folder, "package.json"), "utf8"),
      );
      const key = `${p.name}@${p.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        const names = (await readdir(folder)).filter((n) =>
          /^(licen[cs]e|copying|notice)(\.|$)/i.test(n),
        );
        const texts = [];
        for (const n of names)
          try {
            texts.push(await readFile(path.join(folder, n), "utf8"));
          } catch {}
        sections.push(
          `${key}\nLicense: ${typeof p.license === "string" ? p.license : JSON.stringify(p.license)}\n${texts.join("\n")}`,
        );
      }
      try {
        await scan(path.join(folder, "node_modules"));
      } catch {}
    } catch {}
  }
}
await scan("node_modules");
// Embedded shaders have their own notice in addition to the package MIT license.
sections.push(await readFile("scripts/licenses/glslSmartDeNoise.txt", "utf8"));
sections.push(await readFile("scripts/licenses/meshoptimizer.txt", "utf8"));
await mkdir("dist", { recursive: true });
await writeFile(
  "dist/THIRD_PARTY_LICENSES.txt",
  sections.sort().join("\n\n" + "=".repeat(70) + "\n\n"),
);
console.log(`${sections.length} dependency license records written.`);
