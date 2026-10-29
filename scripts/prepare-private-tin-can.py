#!/usr/bin/env python3
"""Prepare the supplied 6000x4500 Tin Can PSD without editing its source.

Extracts the original masks and lighting, evaluates its Bezier/quilt control
meshes, and validates against cached Smart Object pixels. Source pixels and
prepared passes stay in git-ignored data/ or a private directory. Not a general
Photoshop importer; this adapter checks this template's exact structure.
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


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def flatten_white(image):
    background = Image.new("RGBA", image.size, (255, 255, 255, 255))
    background.alpha_composite(image.convert("RGBA"))
    return background.convert("RGB")


def warp_setup(layer):
    config = layer.smart_object._config.data
    warp = config.get(b"quiltWarp") or config[b"warp"]
    envelope = warp[b"customEnvelopeWarp"]
    mesh_points = envelope[b"meshPoints"]
    cols, rows = int(warp.get(b"deformNumCols", 4)), int(warp.get(b"deformNumRows", 4))
    if cols < 4 or rows < 4 or (cols - 1) % 3 or (rows - 1) % 3:
        raise ValueError("Unsupported Bezier patch grid")
    mesh = np.stack([mesh_points[b"Hrzn"].values, mesh_points[b"Vrtc"].values], axis=-1).reshape(rows, cols, 2)
    axes = []
    for key, end, count in [(b"quiltSliceX", b"Rght", cols), (b"quiltSliceY", b"Btom", rows)]:
        values = np.array(envelope[key][key].values) if key in envelope else np.array([0, float(warp[b"bounds"][end])])
        if len(values) != (count - 1) // 3 + 1 or not np.isfinite(values).all() or not (np.diff(values) > 0).all():
            raise ValueError("Inconsistent quilt boundaries")
        axes.append((values - values[0]) / (values[-1] - values[0]))
    xs, ys = axes
    lo, hi = mesh.reshape(-1, 2).min(0), mesh.reshape(-1, 2).max(0)
    if not np.isfinite(mesh).all() or (hi <= lo).any():
        raise ValueError("Invalid warp controls")
    frame = np.array([lo, [hi[0], lo[1]], hi, [lo[0], hi[1]]], np.float32)
    transform = cv2.getPerspectiveTransform(frame, np.array(layer.smart_object.transform_box, np.float32).reshape(4, 2))

    def predict(uv):
        us = np.clip(np.searchsorted(xs, uv[:, 0], side="right") - 1, 0, len(xs) - 2)
        vs = np.clip(np.searchsorted(ys, uv[:, 1], side="right") - 1, 0, len(ys) - 2)
        u = (uv[:, 0] - xs[us]) / (xs[us + 1] - xs[us])
        v = (uv[:, 1] - ys[vs]) / (ys[vs + 1] - ys[vs])
        def basis(t):
            return np.array([(1-t)**3, 3*t*(1-t)**2, 3*t*t*(1-t), t**3]).T
        bu, bv = basis(u), basis(v)
        output = np.zeros((len(uv), 2))
        for j in range(4):
            for i in range(4):
                output += mesh[vs*3+j, us*3+i] * (bu[:, i] * bv[:, j])[:, None]
        return cv2.perspectiveTransform(output.reshape(-1, 1, 2), transform).reshape(-1, 2)
    return predict


def inverse_mapping(layer, predict):
    w, h = layer.width, layer.height
    xx, yy = np.meshgrid(np.arange(w)+layer.left+.5, np.arange(h)+layer.top+.5)
    destinations = np.stack([xx.ravel(), yy.ravel()], axis=1)
    frame = np.array(layer.smart_object.transform_box).reshape(4, 2)
    lo, hi = frame.min(0), frame.max(0)
    uv = np.zeros_like(destinations)
    for start in range(0, len(destinations), 180000):
        target = destinations[start:start+180000]
        value = np.clip((target-lo)/(hi-lo), .009, .991)
        for _ in range(12):
            position = predict(value)
            du = (predict(value+[1e-4, 0])-position)/1e-4
            dv = (predict(value+[0, 1e-4])-position)/1e-4
            error = position-target
            determinant = du[:, 0]*dv[:, 1]-du[:, 1]*dv[:, 0]
            safe = np.abs(determinant) > 1e-5
            su = np.divide(error[:, 0]*dv[:, 1]-error[:, 1]*dv[:, 0], determinant, out=np.zeros(len(target)), where=safe)
            sv = np.divide(error[:, 1]*du[:, 0]-error[:, 0]*du[:, 1], determinant, out=np.zeros(len(target)), where=safe)
            value -= np.clip(np.stack([su, sv], axis=1), -.12, .12)
            value = np.clip(value, [-.01, -.2], [1.01, 1.2])
        uv[start:start+len(target)] = value
    residual = np.linalg.norm(predict(uv)-destinations, axis=1)
    valid = ((uv >= 0) & (uv <= 1)).all(1) & (residual < .15)
    return uv.reshape(h, w, 2).astype("float32"), valid.reshape(h, w)


def mask_for(layer):
    mask = Image.new("L", (layer.width, layer.height), 0)
    mask.paste(layer.mask.topil().convert("L"), (layer.mask.left-layer.left, layer.mask.top-layer.top))
    alpha = np.array(layer.topil().convert("RGBA"))[:, :, 3]
    return (np.array(mask).astype(np.float32)*alpha/255).astype("uint8")


def remap(artwork, uv, valid):
    rgba = np.array(artwork.convert("RGBA"))
    # Premultiplied interpolation avoids dark halos around transparent logos.
    alpha = rgba[:, :, 3:4].astype("float32")/255
    premultiplied = np.concatenate([rgba[:, :, :3]*alpha, rgba[:, :, 3:4]], axis=2).astype("float32")
    h, w = rgba.shape[:2]
    result = cv2.remap(premultiplied, (uv[:, :, 0]*w-.5).astype("float32"), (uv[:, :, 1]*h-.5).astype("float32"), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    a = result[:, :, 3:4]/255
    result[:, :, :3] = np.divide(result[:, :, :3], a, out=np.zeros_like(result[:, :, :3]), where=a > 1e-6)
    result[:, :, 3] *= valid
    return np.clip(np.rint(result), 0, 255).astype("uint8")


def effect(output, layer, blend):
    x, y = layer.left, layer.top
    pixels = np.array(layer.topil().convert("RGBA")).astype("float32")
    crop = np.array(output.crop(layer.bbox)).astype("float32")
    a = pixels[:, :, 3:4]/255*(layer.opacity/255)
    if blend == "multiply":
        result = crop[:, :, :3]*pixels[:, :, :3]/255
    else:
        result = 255-(255-crop[:, :, :3])*(255-pixels[:, :, :3])/255
    crop[:, :, :3] = crop[:, :, :3]*(1-a)+result*a
    output.paste(Image.fromarray(np.clip(np.rint(crop), 0, 255).astype("uint8")), (x, y))


def composite(base, surfaces, artworks, shadow, reflection):
    output = base.copy()
    for spec, art in zip(surfaces, artworks):
        mapped = remap(art, spec["uv"], spec["valid"])
        mapped[:, :, 3] = np.rint(mapped[:, :, 3].astype(float)*spec["coverage"]/255).astype("uint8")
        output.alpha_composite(Image.fromarray(mapped), (spec["layer"].left, spec["layer"].top))
    effect(output, shadow, "multiply")
    effect(output, reflection, "screen")
    return output


def prepare(source, output, web_edge=4096):
    source = source.resolve(strict=True)
    output = output.resolve()
    repo = Path(__file__).resolve().parent.parent
    if output == repo or (repo in output.parents and repo/"data" not in output.parents):
        raise ValueError("Prepared third-party assets must stay in private data/ or outside the repository")
    output.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    psd = PSDImage.open(source)
    if psd.size != (6000, 4500) or psd.depth != 8 or len(psd) != 6:
        raise ValueError("This adapter only supports the inspected RGB/8 6000x4500 Tin Can template")
    background, color, lid, body, shadow, reflection = list(psd)
    if lid.kind != "smartobject" or body.kind != "smartobject" or shadow.blend_mode.name != "MULTIPLY" or reflection.blend_mode.name != "SCREEN":
        raise ValueError("Unexpected template structure")
    if lid.bbox != (2397, 1234, 3735, 1787) or body.bbox != (2371, 1855, 3765, 3738):
        raise ValueError("Template geometry changed; recalibration required")
    base = Image.new("RGBA", psd.size, (0, 0, 0, 0))
    base.alpha_composite(background.topil().convert("RGBA"), (background.left, background.top))
    fill = Image.new("RGBA", (color.width, color.height), (255, 255, 255, 255))
    fill.putalpha(color.mask.topil().convert("L"))
    base.alpha_composite(fill, (color.left, color.top))
    surfaces, reports = [], []
    for name, layer in [("lid", lid), ("body", body)]:
        if layer.smart_object.kind != "data":
            raise ValueError("External linked objects are not opened")
        embedded = PSDImage.open(BytesIO(layer.smart_object.data))
        source_art = embedded.topil() or embedded.composite(force=True)
        source_art = source_art.convert("RGBA")
        predict = warp_setup(layer)
        cache = output/f"map-{2 if name == 'lid' else 3}.npz"
        # Cached inverse maps are accepted only for this exact source hash.
        inspection = output/"inspection.json"
        can_reuse = cache.exists() and inspection.exists() and json.loads(inspection.read_text()).get("sha256") == digest
        if can_reuse:
            packed = np.load(cache)
            uv, valid = packed["uv"], packed["valid"]
            if uv.shape != (layer.height, layer.width, 2) or valid.shape != uv.shape[:2]:
                raise ValueError("Cached map dimensions do not match the source")
        else:
            uv, valid = inverse_mapping(layer, predict)
        coverage = mask_for(layer)
        recreated = remap(source_art, uv, valid)
        cached = np.array(layer.topil().convert("RGBA"))
        inside = (cached[:, :, 3] == 255) & (recreated[:, :, 3] == 255)
        error = np.abs(cached[:, :, :3].astype(float)-recreated[:, :, :3].astype(float)).mean(2)[inside]
        if not len(error) or np.mean(error) > 4 or np.mean(error > 16) > .05:
            raise ValueError(f"{name}: cached Smart Object validation failed")
        reports.append({"surface":name,"sourceSize":source_art.size,"controlMesh":"quiltWarp" if b"quiltWarp" in layer.smart_object._config.data else "warpCustom","cachedMeanChannelError":float(error.mean()),"cachedFractionOver16":float(np.mean(error > 16)),"independentPhotoshopRerender":False})
        surfaces.append({"name":name,"layer":layer,"uv":uv,"valid":valid,"coverage":coverage,"size":source_art.size,"original":source_art})
    native = output/"native"; web = output/"web"
    native.mkdir(exist_ok=True); web.mkdir(exist_ok=True)
    blank = composite(base, [], [], shadow, reflection)
    blank.save(native/"blank.png")
    base.save(native/"base.png")
    original_proof = composite(base, surfaces, [s["original"] for s in surfaces], shadow, reflection)
    original_proof.save(native/"reconstructed-original.png")
    original = np.array(psd.topil().convert("RGBA"))
    rebuilt = np.array(original_proof)
    delta = np.abs(original[:, :, :3].astype(np.int16)-rebuilt[:, :, :3].astype(np.int16))
    reports.append({"compositeMeanChannelError":float(delta.mean()),"sourceReadOnly":True})
    scale = min(1, web_edge/psd.width)
    size = (round(psd.width*scale), round(psd.height*scale))
    base.resize(size, Image.Resampling.LANCZOS).save(web/"base.png")
    blank.resize(size, Image.Resampling.LANCZOS).save(web/"blank.png")
    flatten_white(blank.resize((480,360),Image.Resampling.LANCZOS)).save(web/"thumbnail.jpg",quality=90)
    for name, layer in [("shadow", shadow), ("reflection", reflection)]:
        canvas=Image.new("RGBA",psd.size,(0,0,0,0)); canvas.paste(layer.topil().convert("RGBA"),(layer.left,layer.top))
        canvas.resize(size,Image.Resampling.LANCZOS).save(web/f"{name}.png")
    scene_surfaces=[]
    # Body is front; lid uses back. The source layout is disclosed in the preview.
    for s in surfaces:
        l=s["layer"]; name=s["name"]
        mask=Image.new("L",psd.size,0)
        coverage=np.where(s["valid"],s["coverage"],0).astype("uint8")
        mask.paste(Image.fromarray(coverage),(l.left,l.top))
        mask.resize(size,Image.Resampling.LANCZOS).save(web/f"{name}-mask.png")
        # Bake only native surface crop, then resample coordinates at web pixel centres.
        yy,xx=np.indices((size[1],size[0]),dtype="float32")
        sx=(xx+.5)/scale-l.left-.5; sy=(yy+.5)/scale-l.top-.5
        sampled=cv2.remap(s["uv"],sx,sy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
        sw,sh=s["size"]
        sampled[:,:,0]=(sampled[:,:,0]*sw-.5)/(sw-1)
        sampled[:,:,1]=(sampled[:,:,1]*sh-.5)/(sh-1)
        encoded=np.rint(np.clip(sampled,0,1)*65535).astype('<u2')
        # Zero unused coordinates for compression and deterministic validation.
        encoded[np.array(mask.resize(size,Image.Resampling.LANCZOS))==0]=0
        (web/f"{name}.uv.bin").write_bytes(encoded.tobytes())
        np.savez_compressed(native/f"{name}-map.npz",uv=s["uv"],valid=s["valid"],coverage=s["coverage"])
        scene_surfaces.append({"id":f"tin-{name}","face":"front" if name=="body" else "back","backgroundMode":"design","mapping":{"type":"uv-rg16le","url":f"/assets/{name}.uv.bin"},"maskUrl":f"/assets/{name}-mask.png","blend":"source-over"})
    scene={"id":"tin-can-r1","title":"Teneke kutu · Elde kapaklı","width":size[0],"height":size[1],"baseImageUrl":"/assets/base.png","plainThumbnailUrl":"/assets/thumbnail.jpg","distribution":"public-web","license":"User-supplied PSD. Local preparation/review only; not a declaration of permission to distribute source passes publicly.","surfaces":scene_surfaces,"layers":[{"imageUrl":"/assets/shadow.png","blend":"multiply"},{"imageUrl":"/assets/reflection.png","blend":"screen"}]}
    write_json(web/"catalog.local.json",{"schemaVersion":1,"scenes":[scene]})
    write_json(output/"preparation.json",{"source":str(source),"sourceSha256":digest,"nativeSize":psd.size,"webSize":size,"sourceArtboards":{"front":[1472,1179],"back":[853,853]},"surfaceLabels":{"front":"Gövde","back":"Kapak"},"approximate":True,"method":"PSD Bezier/quilt geometry + inverse lookup + original pixel masks and lighting passes","validation":reports,"published":False})
    if hashlib.sha256(source.read_bytes()).hexdigest()!=digest:
        raise RuntimeError("Source PSD integrity changed")
    print(json.dumps({"output":str(output),"nativeSize":psd.size,"webSize":size,"validation":reports},ensure_ascii=False,indent=2))


def render_proof(source, output, body_artwork, lid_artwork):
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    report=json.loads((output/"preparation.json").read_text())
    if digest!=report["sourceSha256"]:
        raise ValueError("Source PSD differs from prepared package")
    psd=PSDImage.open(source)
    surfaces=[]
    for name,index in [("lid",2),("body",3)]:
        data=np.load(output/"native"/f"{name}-map.npz")
        surfaces.append({"layer":psd[index],"uv":data["uv"],"valid":data["valid"],"coverage":data["coverage"]})
    result=composite(Image.open(output/"native/base.png").convert("RGBA"),surfaces,[Image.open(lid_artwork),Image.open(body_artwork)],psd[4],psd[5])
    result.save(output/"tin-can-alacam-6k.png")
    flatten_white(result).save(output/"tin-can-alacam-6k.jpg",quality=96,subsampling=0)
    result.resize(tuple(report["webSize"]),Image.Resampling.LANCZOS).save(output/"web/tin-can-alacam.png")
    flatten_white(result.resize((1600,1200),Image.Resampling.LANCZOS)).save(output/"tin-can-alacam-preview.jpg",quality=93)
    if hashlib.sha256(source.read_bytes()).hexdigest()!=digest:
        raise RuntimeError("Source integrity changed")
    print(json.dumps({"nativeOutput":[6000,4500],"sourceUnchanged":True}))


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psd",required=True,type=Path);parser.add_argument("--output",required=True,type=Path)
    parser.add_argument("--web-edge",type=int,default=4096)
    parser.add_argument("--proof-only",action="store_true")
    parser.add_argument("--body-artwork",type=Path);parser.add_argument("--lid-artwork",type=Path)
    args=parser.parse_args()
    if not 256<=args.web_edge<=4096:parser.error("--web-edge must be 256–4096")
    if bool(args.body_artwork) != bool(args.lid_artwork):parser.error("Both artwork files are required for a proof")
    if args.proof_only and not args.body_artwork:parser.error("--proof-only requires body and lid artwork")
    if not args.proof_only:
        prepare(args.psd,args.output,args.web_edge)
    if args.body_artwork and args.lid_artwork:
        render_proof(args.psd,args.output,args.body_artwork,args.lid_artwork)
