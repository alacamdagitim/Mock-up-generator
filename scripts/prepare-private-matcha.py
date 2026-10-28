#!/usr/bin/env python3
"""Prepare this specific 600×800 Matcha PSD as a private, approximate scene.

This is not a general PSD/Photoshop warp importer. It reads the original PSD,
calibrates its existing Smart Object cache, and never launches Photoshop or
writes the input. Source artwork and layer assets must remain private unless
their owner has separately obtained the necessary redistribution rights.

Install the optional tooling in a virtual environment:
    pip install -r scripts/requirements-private-mockup.txt
Run:
    python scripts/prepare-private-matcha.py --psd /private/Matcha.psd \
        --output /tmp/private-matcha
"""

import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from scipy.optimize import least_squares


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def gray_on_white(image):
    rgba = np.array(image.convert("RGBA"))
    alpha = rgba[:, :, 3, None] / 255
    rgb = rgba[:, :, :3] * alpha + 255 * (1 - alpha)
    return cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)


def read_source(path):
    psd = PSDImage.open(path)
    if psd.size != (600, 800) or psd.depth != 8:
        raise ValueError("Bu hazırlayıcı yalnızca 600×800, RGB/8 Matcha PSD içindir.")
    layers = list(psd.descendants())
    objects = [layer for layer in layers if layer.kind == "smartobject"]
    if len(objects) != 1 or objects[0].name.strip() != "Project":
        raise ValueError("Beklenen tek gömülü Project Smart Object bulunamadı.")
    project = objects[0]
    if project.smart_object.kind != "data":
        raise ValueError("Harici bağlantılı Smart Object dosyaları okunmaz.")
    embedded = PSDImage.open(BytesIO(project.smart_object.data))
    if embedded.size != (1050, 1000) or project.bbox != (206, 338, 402, 637):
        raise ValueError("Şablonun kaynak ölçüsü/yerleşimi bu hazırlayıcıyla uyuşmuyor.")
    if project.smart_object.warp[b"warpStyle"].enum != b"warpCylinder":
        raise ValueError("Beklenen silindir kıvrımı bulunamadı.")
    design = project.parent
    if design.name != "Design" or design.mask.bbox != (86, 182, 514, 704):
        raise ValueError("Beklenen Design maske alanı bulunamadı.")
    shadows = next(layer for layer in design if layer.name == "Shadows")
    highlights = next(layer for layer in design if layer.name == "Highlights")
    for layer, expected_blend in [(shadows, "LINEAR_BURN"), (highlights, "SCREEN")]:
        if layer.bbox != (86, 182, 514, 704) or layer.blend_mode.name != expected_blend:
            raise ValueError("Şablonun ışık/gölge katmanları beklenen yapıda değil.")
        if layer.opacity != 255 or not layer.clipping:
            raise ValueError("Beklenmeyen katman saydamlığı veya kırpma davranışı.")
    return psd, project, embedded, design, shadows, highlights


def feature_matches(source, cached, offset):
    sift = cv2.SIFT_create(nfeatures=3000, contrastThreshold=0.012)
    source_points, source_descriptors = sift.detectAndCompute(gray_on_white(source), None)
    cached_points, cached_descriptors = sift.detectAndCompute(gray_on_white(cached), None)
    if source_descriptors is None or cached_descriptors is None:
        raise ValueError("Kalibrasyon için yeterli kaynak baskı ayrıntısı yok.")
    pairs = cv2.BFMatcher().knnMatch(source_descriptors, cached_descriptors, k=2)
    matches = [first for first, second in pairs if first.distance < 0.75 * second.distance]
    src = np.float64([source_points[match.queryIdx].pt for match in matches])
    dst = np.float64([cached_points[match.trainIdx].pt for match in matches]) + offset
    if len(src) < 40:
        raise ValueError("Kalibrasyon için yeterli güvenilir özellik eşleşmesi yok.")
    _, inlier = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    if inlier is None:
        raise ValueError("Kaynak ve önizleme arasında sağlam eşleme bulunamadı.")
    src, dst = src[inlier[:, 0].astype(bool)], dst[inlier[:, 0].astype(bool)]
    # Multiple SIFT orientations at the same point must not leak across holdout.
    src, indices = np.unique(np.round(src, 2), return_index=True, axis=0)
    dst = dst[indices]
    if len(src) < 80:
        raise ValueError("Kalibrasyon için en az 80 bağımsız kontrol noktası gerekli.")
    return src, dst


def fit_mapping(src, dst):
    degree = 3
    powers = [(i, j) for j in range(degree + 1) for i in range(degree + 1 - j)]

    def basis(points):
        normalized = (points - [524.5, 499.5]) / [524.5, 499.5]
        return np.stack([normalized[:, 0] ** i * normalized[:, 1] ** j for i, j in powers], axis=1)

    matrix = basis(src)
    permutation = np.random.default_rng(7).permutation(len(src))
    train, holdout = np.split(permutation, [int(len(src) * 0.8)])
    initial = np.linalg.lstsq(matrix[train], dst[train], rcond=None)[0]
    result = least_squares(
        lambda values: (matrix[train] @ values.reshape(initial.shape) - dst[train]).ravel(),
        initial.ravel(), loss="soft_l1", f_scale=0.5,
    )
    fitted = result.x.reshape(initial.shape)

    def predict(points):
        return basis(points) @ fitted

    errors = np.linalg.norm(predict(src) - dst, axis=1)
    # The original cache only constrains a central label. Do not extrapolate to
    # the full cup wrap, where an unconstrained cubic can fold over itself.
    gx, gy = np.meshgrid(np.linspace(210, 839, 100), np.linspace(0, 999, 100))
    points = np.c_[gx.ravel(), gy.ravel()]
    position = predict(points)
    du = (predict(points + [0.01, 0]) - position) / 0.01
    dv = (predict(points + [0, 0.01]) - position) / 0.01
    determinant = du[:, 0] * dv[:, 1] - dv[:, 0] * du[:, 1]
    if determinant.min() <= 0 or np.percentile(errors[holdout], 90) > 1:
        raise ValueError("Eşleme kontrolü başarısız: katlanma veya yüksek doğrulama hatası.")
    report = {
        "method": "SIFT + cached Smart Object pixels + robust degree-3 polynomial",
        "approximate": True, "nativePhotoshopBake": False,
        "featurePairs": len(src), "holdoutCount": len(holdout),
        "trainMedianPx": float(np.median(errors[train])),
        "holdoutMedianPx": float(np.median(errors[holdout])),
        "holdoutP90Px": float(np.percentile(errors[holdout], 90)),
        "holdoutMaxPx": float(errors[holdout].max()),
        "jacobianMin": float(determinant.min()), "jacobianMax": float(determinant.max()),
        "validSourceBounds": [210, 0, 839, 999],
        "supportedSourceBounds": [src.min(0).tolist(), src.max(0).tolist()],
        "polynomialDegree": degree, "polynomialPowers": powers,
        "polynomialMatrix": fitted.tolist(),
        "limitation": "Approximate central-label mapping; outside source feature bounds is extrapolated. Not a native Photoshop warp-cylinder implementation.",
    }
    return predict, report


def inverse_lookup(src, dst, predict, mask):
    homography, _ = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    yy, xx = np.indices((800, 600), dtype=np.float64)
    destinations = np.c_[xx.ravel(), yy.ravel()]
    points = cv2.perspectiveTransform(destinations.reshape(-1, 1, 2), np.linalg.inv(homography)).reshape(-1, 2)
    for _ in range(10):
        position = predict(points)
        du = (predict(points + [0.01, 0]) - position) / 0.01
        dv = (predict(points + [0, 0.01]) - position) / 0.01
        dx, dy = (position - destinations).T
        determinant = du[:, 0] * dv[:, 1] - dv[:, 0] * du[:, 1]
        safe = np.abs(determinant) > 1e-5
        su = np.divide(dx * dv[:, 1] - dy * dv[:, 0], determinant, out=np.zeros_like(dx), where=safe)
        sv = np.divide(dy * du[:, 0] - dx * du[:, 1], determinant, out=np.zeros_like(dy), where=safe)
        points -= np.clip(np.c_[su, sv], -100, 100)
    uu, vv = points[:, 0].reshape(800, 600), points[:, 1].reshape(800, 600)
    residual = np.linalg.norm(predict(points) - destinations, axis=1).reshape(800, 600)
    valid = (uu >= 210) & (uu <= 839) & (vv >= 0) & (vv <= 999) & (residual < 0.25)
    coverage = np.where(valid, mask, 0).astype(np.uint8)
    lookup = np.stack([np.rint(np.clip(uu / 1049, 0, 1) * 65535), np.rint(np.clip(vv / 999, 0, 1) * 65535)], axis=-1)
    return lookup.astype("<u2"), coverage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psd", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    source, output = args.psd.resolve(strict=True), args.output.resolve()
    repo = Path(__file__).resolve().parent.parent
    if output == repo or repo in output.parents:
        raise ValueError("Özel PSD katmanları proje klasörünün dışında tutulmalı; örneğin /tmp/private-matcha.")
    if source == output or source in output.parents:
        raise ValueError("Kaynak dosyanın üzerine yazılamaz.")
    before_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    psd, project, embedded, design, shadows, highlights = read_source(source)
    artwork, cached = embedded.composite().convert("RGBA"), project.topil().convert("RGBA")
    src, dst = feature_matches(artwork, cached, [206, 338])
    predict, report = fit_mapping(src, dst)
    mask = np.zeros((800, 600), np.uint8)
    mask[182:704, 86:514] = np.array(design.mask.topil().convert("L"))
    lookup, coverage = inverse_lookup(src, dst, predict, mask)
    output.mkdir(parents=True, exist_ok=True)
    psd.composite(layer_filter=lambda layer: layer is not project, force=True).save(output / "base.png")
    shadows.topil().save(output / "shadow.png")
    highlights.topil().save(output / "highlight.png")
    Image.fromarray(coverage).save(output / "coverage.png")
    (output / "uv-rg16.bin").write_bytes(lookup.tobytes())
    report["sourceSha256"] = before_hash
    write_json(output / "calibration.json", report)
    manifest = {
        "schemaVersion": 1, "name": "Matcha bardak — yaklaşık özel sahne",
        "width": 600, "height": 800, "sourceWidth": 1050, "sourceHeight": 1000,
        "base": "base.png", "lookup": {"file": "uv-rg16.bin", "format": "rg16le", "coverage": "coverage.png"},
        "layers": [
            {"file": "shadow.png", "x": 86, "y": 182, "width": 428, "height": 522, "blend": "linear-burn", "opacity": 1},
            {"file": "highlight.png", "x": 86, "y": 182, "width": 428, "height": 522, "blend": "screen", "opacity": 1},
        ],
        "approximate": True, "calibration": {"file": "calibration.json", "nativePhotoshopBake": False},
        "notes": [
            "Özel yerel sahne; kaynak PSD katmanlarının web dağıtımı için ayrıca lisans gerekir.",
            "Baskı yüzeyi, kaynak Smart Object önizlemesinden yaklaşık kalibre edildi.",
            "Doğal çözünürlük 600×800 pikseldir; 4K ayrıntı içermez.",
            "Yalnız merkez etiket bölgesi: kaynak x=210–839 px; tam sarım değildir.",
        ],
    }
    write_json(output / "manifest.json", manifest)
    if hashlib.sha256(source.read_bytes()).hexdigest() != before_hash:
        raise RuntimeError("Kaynak dosyanın bütünlüğü değişti.")
    print(json.dumps({"output": str(output), "calibration": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
