#!/usr/bin/env python3
"""Bake a numeric tapered-cylinder UV pass and an occlusion mask.

This utility never reads or retouches photograph pixels. An operator supplies
image-space geometry in a private JSON file. All raster outputs are generated
from that geometry alone. It is a fixed-view approximation, not a measured
manufacturer die line or an automatic photo-to-mockup converter.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def pair(value):
    result = np.asarray(value, dtype=np.float32)
    if result.shape != (2,) or not np.isfinite(result).all():
        raise ValueError("Geometry vectors must contain two finite numbers.")
    return result


def curve(config, location, s):
    edge = config[location]
    left, right, bulge = pair(edge["left"]), pair(edge["right"]), pair(edge["bulge"])
    center, radius = (left + right) / 2, (right - left) / 2
    return center + np.asarray(s)[..., None] * radius + (1 - np.asarray(s)[..., None] ** 2) * bulge


def forward(config, s, t):
    top, bottom = curve(config, "top", s), curve(config, "bottom", s)
    return top * (1 - np.asarray(t)[..., None]) + bottom * np.asarray(t)[..., None]


def inverse(config, width, height):
    # Solve the smooth ruled surface, then apply arcsin to undo the apparent
    # horizontal compression of a cylinder. UVs are little-endian 16 bit.
    yy, xx = np.mgrid[:height, :width].astype(np.float32)
    pixel = np.stack((xx + .5, yy + .5), axis=-1)
    tc = (pair(config["top"]["left"]) + pair(config["top"]["right"])) / 2
    bc = (pair(config["bottom"]["left"]) + pair(config["bottom"]["right"])) / 2
    radius = (pair(config["top"]["right"]) - pair(config["top"]["left"])) / 2
    axis = bc - tc
    basis = np.stack((radius, axis), axis=1)
    initial = (pixel - tc) @ np.linalg.inv(basis).T
    s, t = initial[:, :, 0].copy(), initial[:, :, 1].copy()
    rt = radius
    rb = (pair(config["bottom"]["right"]) - pair(config["bottom"]["left"])) / 2
    bt, bb = pair(config["top"]["bulge"]), pair(config["bottom"]["bulge"])
    for _ in range(9):
        top, bottom = curve(config, "top", s), curve(config, "bottom", s)
        error = top * (1 - t[..., None]) + bottom * t[..., None] - pixel
        ds = (rt - 2 * s[..., None] * bt) * (1 - t[..., None]) + (rb - 2 * s[..., None] * bb) * t[..., None]
        dt = bottom - top
        det = ds[..., 0] * dt[..., 1] - ds[..., 1] * dt[..., 0]
        det = np.where(np.abs(det) < 1e-5, 1e-5, det)
        step_s = (error[..., 0] * dt[..., 1] - error[..., 1] * dt[..., 0]) / det
        step_t = (ds[..., 0] * error[..., 1] - ds[..., 1] * error[..., 0]) / det
        s = np.clip(s - np.clip(step_s, -2, 2), -5, 5)
        t = np.clip(t - np.clip(step_t, -2, 2), -5, 5)
    uv_min, uv_max = config.get("visibleU", [.25, .75])
    u = uv_min + (np.arcsin(np.clip(s, -1, 1)) / math.pi + .5) * (uv_max - uv_min)
    lookup = np.stack((np.clip(u, 0, 1), np.clip(t, 0, 1)), axis=-1)
    return np.round(lookup * 65535).astype("<u2"), s, t


def bezier_path(commands):
    points = []
    current = None
    for command in commands:
        verb, *values = command
        if verb in ("M", "L"):
            current = np.asarray(values, dtype=np.float32)
            points.append(tuple(current))
        elif verb == "C":
            if current is None:
                raise ValueError("Cubic paths must start with M.")
            p0, p1, p2, p3 = current, np.asarray(values[:2]), np.asarray(values[2:4]), np.asarray(values[4:])
            for fraction in np.linspace(0, 1, 33)[1:]:
                p = (1-fraction)**3*p0 + 3*(1-fraction)**2*fraction*p1 + 3*(1-fraction)*fraction**2*p2 + fraction**3*p3
                points.append(tuple(p))
            current = p3
        else:
            raise ValueError(f"Unsupported geometric path command: {verb}")
    return points


def coverage(config, width, height):
    aa = 3
    image = Image.new("L", (width * aa, height * aa))
    draw = ImageDraw.Draw(image)
    spans = np.linspace(-1, 1, 513)
    polygon = np.concatenate((curve(config, "top", spans), curve(config, "bottom", spans[::-1])))
    draw.polygon([tuple(point * aa) for point in polygon], fill=255)
    for occluder in config.get("occluders", []):
        draw.polygon([(x * aa, y * aa) for x, y in bezier_path(occluder["path"])], fill=0)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def diagnostic_grid(config, mask):
    # Pure vector calibration graphic; no photograph is included.
    width, height = mask.size
    image = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(image)
    for u in np.linspace(.25, .75, 13):
        uv_min, uv_max = config.get("visibleU", [.25, .75])
        if not uv_min <= u <= uv_max:
            continue
        s = math.sin(((u - uv_min) / (uv_max - uv_min) - .5) * math.pi)
        points = forward(config, s, np.linspace(0, 1, 257))
        draw.line([tuple(p) for p in points], fill=(19, 88, 232, 230), width=2)
    for t in np.linspace(0, 1, 13):
        points = forward(config, np.linspace(-1, 1, 257), t)
        draw.line([tuple(p) for p in points], fill=(230, 26, 63, 230), width=2)
    rgba = np.asarray(image).copy()
    rgba[:, :, 3] = np.round(rgba[:, :, 3].astype(float) * np.asarray(mask) / 255).astype(np.uint8)
    return Image.fromarray(rgba)


def prepare(config_path, out):
    config = json.loads(config_path.read_text())
    width, height = config["width"], config["height"]
    if not (1 <= width <= 8192 and 1 <= height <= 8192 and width*height <= 16_777_216):
        raise ValueError("Canvas exceeds mockup engine pixel limits.")
    for position in ("top", "bottom"):
        for key in ("left", "right", "bulge"):
            pair(config[position][key])
    if not 0 <= config.get("visibleU", [.25, .75])[0] < config.get("visibleU", [.25, .75])[1] <= 1:
        raise ValueError("visibleU must be ordered normalized source coordinates.")
    out.mkdir(parents=True, exist_ok=True)
    lookup, s, t = inverse(config, width, height)
    mask = coverage(config, width, height)
    pixels = np.asarray(mask)
    # A narrow supersampling fringe is allowed; fully covered pixels must map
    # into the mathematical surface and all hand/background probes must be zero.
    inside = pixels > 250
    py, px = np.nonzero(inside)
    if not len(px):
        raise ValueError("Geometry has no covered print pixels.")
    mapped = forward(config, s[inside], t[inside])
    residual = np.sqrt((mapped[:, 0] - (px+.5))**2 + (mapped[:, 1] - (py+.5))**2)
    geometry_ok = (
        np.all(np.abs(s[inside]) < 1.015)
        and np.all(t[inside] > -.015)
        and np.all(t[inside] < 1.015)
        and np.isfinite(mapped).all()
        and float(residual.max()) < .03
    )
    probes = []
    for probe in config.get("probes", []):
        x, y = probe["pixel"]
        actual = int(pixels[y, x])
        ok = actual >= 250 if probe["inside"] else actual == 0
        probes.append({**probe, "coverage": actual, "passed": bool(ok)})
    if not geometry_ok or not all(probe["passed"] for probe in probes):
        raise ValueError(f"Geometry validation failed: {probes}")
    lookup.tofile(out / "front.uv.bin")
    # RGB coverage with opaque alpha matches the production compositor's red×A.
    mask.convert("RGB").save(out / "front-mask.png", optimize=True)
    diagnostic_grid(config, mask).save(out / "calibration-grid.png", optimize=True)
    (out / "geometry.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
    summary = {
        "width": width, "height": height,
        "uvFormat": "RG16 little-endian; interleaved uint16 U,V; normalized 0..65535",
        "uvBytes": width*height*4,
        "visibleU": config.get("visibleU", [.25, .75]),
        "coveragePixels": int(np.count_nonzero(pixels)),
        "maximumInverseResidualPixels": round(float(residual.max()), 6),
        "geometryChecksPassed": bool(geometry_ok), "probes": probes,
        "method": "Manually calibrated tapered-cylinder fixed-view approximation",
        "productionMeasurementsVerified": False,
        "sourcePhotoReadOrModified": False,
    }
    (out / "mapping-validation.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"directory": str(out), **summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.config, args.out)
