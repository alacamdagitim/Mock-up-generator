"""Create two compact delivery ZIPs using Python's standard library only."""
from pathlib import Path
import os
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "releases"
DEST.mkdir(exist_ok=True)


def package(name, files):
    temporary = DEST / f".{name}.tmp"
    target = DEST / f"{name}.zip"
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
        for source, relative in sorted(files):
            archive.write(source, Path(name) / relative)
    with zipfile.ZipFile(temporary) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"Geçersiz arşiv: {bad}")
    os.replace(temporary, target)
    print(f"{target.name}: {target.stat().st_size:,} bayt")


source_files = []
for directory in ["src", "shared", "server", "scripts", "tests", "public"]:
    for file in (ROOT / directory).rglob("*"):
        if file.is_file() and file.name != ".DS_Store" and "__pycache__" not in file.parts:
            source_files.append((file, file.relative_to(ROOT)))
for directory in ["shopify/sections", "shopify/templates", "shopify/snippets", "shopify/custom-liquid"]:
    for file in (ROOT / directory).rglob("*"):
        if file.is_file():
            source_files.append((file, file.relative_to(ROOT)))
for file in (ROOT / "docs").glob("*.md"):
    source_files.append((file, file.relative_to(ROOT)))
for name in ["README.md", "THIRD_PARTY_NOTICES.md", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "index.html", "launcher-demo.html", ".env.example", ".gitignore"]:
    source_files.append((ROOT / name, Path(name)))
package("alacam-online-design-kaynak", source_files)

shopify_files = [(file, file.relative_to(ROOT / "shopify")) for file in (ROOT / "shopify").rglob("*") if file.is_file() and file.name != ".DS_Store"]
if not any(relative.as_posix() == "assets/alacam-editor.js" for _, relative in shopify_files):
    raise RuntimeError("Önce npm run build çalıştırın.")
package("alacam-online-design-shopify", shopify_files)
