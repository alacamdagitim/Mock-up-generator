#!/usr/bin/env python3
"""Automatic, validated PSD -> browser scene compiler (RGB/8 supported subset).
No Photoshop execution, scripts, external linked objects or source publication.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import struct
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from psd_tools import PSDImage

# Reuse the verified Bezier/quilt evaluator; no Tin Can layer names/bounds used.
spec = importlib.util.spec_from_file_location("warp_core", Path(__file__).resolve().parents[1]/"scripts/prepare-private-tin-can.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
BLENDS = {"NORMAL": "source-over", "MULTIPLY": "multiply", "SCREEN": "screen"}

class NeedsReview(ValueError):
    pass

def check_header(data, embedded=False):
    if len(data) < 26 or data[:4] != b"8BPS" or struct.unpack(">H", data[4:6])[0] not in ([1,2] if embedded else [1]):
        raise NeedsReview("Geçerli bir PSD dosyası gerekli; PSB desteklenmiyor.")
    channels, height, width, depth, mode = struct.unpack(">HIIHH", data[12:26])
    if depth != 8 or mode != 3 or not 3 <= channels <= 4:
        raise NeedsReview("İlk otomatik içe aktarıcı RGB / 8 bit PSD destekliyor.")
    if not width or not height or width > 12000 or height > 12000 or width*height > 36_000_000:
        raise NeedsReview("PSD en fazla 36 megapiksel ve 12000 px kenarlı olmalı.")

def color_of(layer):
    try:
        d = layer._data[b"Clr "]
        return tuple(round(float(d[key])) for key in [b"Rd  ", b"Grn ", b"Bl  "])
    except (KeyError, TypeError, AttributeError):
        raise NeedsReview(f"{layer.name}: RGB düz renk katmanı okunamadı.")

def pixels(layer, override=None):
    if layer.kind == "solidcolorfill":
        image = Image.new("RGBA", (layer.width, layer.height), override or color_of(layer))
    else:
        image = layer.topil()
        if image is None:
            raise NeedsReview(f"{layer.name}: kayıtlı piksel önizlemesi yok.")
        image = image.convert("RGBA")
    a = np.array(image.getchannel("A"), dtype=np.float32)
    if layer.has_mask():
        if layer.mask.background_color != 0:
            mask = Image.new("L", image.size, layer.mask.background_color)
        else:
            mask = Image.new("L", image.size, 0)
        mask.paste(layer.mask.topil().convert("L"), (layer.mask.left-layer.left, layer.mask.top-layer.top))
        a *= np.array(mask)/255
    image.putalpha(Image.fromarray(np.rint(a*layer.opacity/255).astype("uint8")))
    return image

def blend(target, layer, image):
    box = layer.bbox
    if box[0] < 0 or box[1] < 0 or box[2] > target.width or box[3] > target.height:
        # Crop through a full-canvas plate for layers that extend beyond PSD bounds.
        plate=Image.new("RGBA",target.size); plate.paste(image,(layer.left,layer.top))
        image=plate; box=(0,0,target.width,target.height)
    mode=BLENDS[layer.blend_mode.name]
    if mode == "source-over":
        target.alpha_composite(image, (box[0],box[1])); return
    a=np.array(image,dtype="float32"); b=np.array(target.crop(box),dtype="float32")
    alpha=a[:,:,3:4]/255
    rgb=b[:,:,:3]*a[:,:,:3]/255 if mode=="multiply" else 255-(255-b[:,:,:3])*(255-a[:,:,:3])/255
    b[:,:,:3]=b[:,:,:3]*(1-alpha)+rgb*alpha
    target.paste(Image.fromarray(np.clip(np.rint(b),0,255).astype("uint8")),(box[0],box[1]))

def base_plate(psd, layers, control=None, replacement=None):
    result=Image.new("RGBA",psd.size,(255,255,255,255))
    for layer in layers:
        blend(result,layer,pixels(layer,replacement if layer is control else None))
    return result

def predictor(layer):
    config=layer.smart_object._config.data
    warp=config.get(b"quiltWarp") or config.get(b"warp")
    if warp is not None and b"customEnvelopeWarp" in warp:
        return core.warp_setup(layer)
    if warp is not None and str(warp.get(b"warpStyle", "")).lower().find("none") < 0:
        # Enumerated warpNone is b'warpNone' in psd-tools; other parametric warps
        # need an explicit implementation and must never silently use a quad.
        style=warp.get(b"warpStyle")
        if getattr(style,"enum",None) != b"warpNone":
            raise NeedsReview(f"{layer.name}: bu parametrik eğrilik henüz desteklenmiyor.")
    matrix=cv2.getPerspectiveTransform(np.array([[0,0],[1,0],[1,1],[0,1]],np.float32),np.array(layer.smart_object.transform_box,np.float32).reshape(4,2))
    return lambda uv:cv2.perspectiveTransform(np.asarray(uv,np.float64).reshape(-1,1,2),matrix).reshape(-1,2)

def supported_layers(container):
    result=[]
    for layer in container:
        if not layer.is_visible(): continue
        if layer.is_group():
            children=[child for child in layer if child.is_visible()]
            isolated_safe=layer.blend_mode.name=="NORMAL" and all(child.blend_mode.name=="NORMAL" for child in children)
            if layer.opacity!=255 or layer.has_mask() or layer.has_vector_mask() or layer.clipping or len(layer.effects) or (layer.blend_mode.name!="PASS_THROUGH" and not isolated_safe):
                raise NeedsReview(f"{layer.name}: grup maskesi, opaklığı veya efektleri için inceleme gerekli.")
            result.extend(supported_layers(layer))
        elif layer.width and layer.height:
            result.append(layer)
        if len(result)>128: raise NeedsReview("En fazla 128 görünür katman destekleniyor.")
    return result

def prepare(source, output, edge=4096):
    raw=source.read_bytes(); check_header(raw)
    digest=hashlib.sha256(raw).hexdigest()
    psd=PSDImage.open(BytesIO(raw)); del raw
    if len(psd)>64: raise NeedsReview("Bir PSD en fazla 64 üst düzey katman içerebilir.")
    layers=supported_layers(psd)
    for layer in layers:
        if layer.blend_mode.name not in BLENDS or layer.clipping:
            raise NeedsReview(f"{layer.name}: karışım modu veya kırpma grubu desteklenmiyor.")
        if layer.has_vector_mask() or (layer.effects and len(layer.effects)):
            raise NeedsReview(f"{layer.name}: vektör maskesi/katman efekti için inceleme gerekli.")
        if layer.kind not in ["pixel","smartobject","solidcolorfill","type"]:
            raise NeedsReview(f"{layer.name}: {layer.kind} katmanı desteklenmiyor.")
    objects=[layer for layer in layers if layer.kind=="smartobject"]
    if not objects or len(objects)>8:
        raise NeedsReview("1–8 görünür gömülü Smart Object gerekli.")
    first,last=layers.index(objects[0]),layers.index(objects[-1])
    if any(l.kind!="smartobject" for l in layers[first:last+1]):
        raise NeedsReview("Baskı nesneleri arasındaki katman sırası için inceleme gerekli.")
    prefix,suffix=layers[:first],layers[last+1:]
    if any(l.blend_mode.name!="NORMAL" for l in objects):
        raise NeedsReview("Smart Object için Normal karışım modu gerekli.")
    output.mkdir(parents=True,exist_ok=True)
    # Fit the existing browser decoder's 64M pixel / 160MB byte budgets.
    # Higher resolution is kept when layer count permits it; never upscale.
    has_control=any(l.kind=="solidcolorfill" and l.bbox==(0,0,*psd.size) and l.opacity==255 and not l.has_mask() for l in prefix)
    rasters=1+len(objects)+len(suffix)+(2 if has_control else 0)
    area=psd.width*psd.height
    scale=min(1,edge/max(psd.size),math.sqrt(63_000_000/(area*rasters)),math.sqrt(120_000_000/(area*4*len(objects))))
    size=tuple(max(1,round(n*scale)) for n in psd.size)
    resize=lambda image:image.resize(size,Image.Resampling.LANCZOS)
    base=base_plate(psd,prefix)
    resize(base).save(output/"base.webp",lossless=True)
    controls=[l for l in prefix if l.kind=="solidcolorfill" and l.bbox==(0,0,*psd.size) and l.opacity==255 and not l.has_mask()]
    background=None
    if controls:
        control=controls[0]
        black=base_plate(psd,prefix,control,(0,0,0)); white=base_plate(psd,prefix,control,(255,255,255))
        transmission=np.clip(np.array(white,dtype=np.int16)[:,:,:3]-np.array(black,dtype=np.int16)[:,:,:3],0,255).astype("uint8")
        if transmission.max()>0:
            resize(black).save(output/"background-black.png")
            resize(Image.fromarray(transmission)).save(output/"background-transmission.png")
            background={"label":"Arka plan rengi","color":"#%02x%02x%02x"%color_of(control),"blackUrl":"background-black.png","transmissionUrl":"background-transmission.png"}
    groups={}; reports=[]; specs=[]
    for index,layer in enumerate(objects):
        if layer.smart_object.kind!="data": raise NeedsReview(f"{layer.name}: harici bağlı Smart Object desteklenmiyor.")
        embedded_raw=layer.smart_object.data
        if len(embedded_raw)>64_000_000: raise NeedsReview(f"{layer.name}: gömülü nesne 64 MB sınırını aşıyor.")
        check_header(embedded_raw, embedded=True)
        identifier=hashlib.sha256(embedded_raw).hexdigest()
        embedded=PSDImage.open(BytesIO(embedded_raw)); del embedded_raw
        if embedded.width*embedded.height>16_777_216:
            raise NeedsReview(f"{layer.name}: gömülü tasarım 16 megapiksel sınırını aşıyor.")
        art=embedded.topil()
        if art is None: art=embedded.composite(force=True)
        if art is None: raise NeedsReview(f"{layer.name}: gömülü tasarımın kayıtlı önizlemesi yok.")
        art=art.convert("RGBA")
        uv,valid=core.inverse_mapping(layer,predictor(layer))
        coverage=np.array(pixels(layer).getchannel("A"))
        mapped=core.remap(art,uv,valid)
        cached=np.array(layer.topil().convert("RGBA"))
        inside=(cached[:,:,3]>240)&(mapped[:,:,3]>240)&(coverage>240)
        if not inside.any(): raise NeedsReview(f"{layer.name}: karşılaştırılabilir opak tasarım bölgesi yok.")
        error=np.abs(cached[:,:,:3].astype(float)-mapped[:,:,:3].astype(float)).mean(2)[inside]
        if error.mean()>4 or np.mean(error>16)>.05:
            raise NeedsReview(f"{layer.name}: eşleme doğrulanamadı (ortalama fark {error.mean():.2f}/255).")
        reports.append({"layer":layer.name,"meanError":float(error.mean()),"fractionOver16":float(np.mean(error>16))})
        groups.setdefault(identifier,[]).append(index)
        specs.append({"layer":layer,"uv":uv,"valid":valid,"coverage":coverage,"art":art,"hash":identifier})
    if len(groups)>2: raise NeedsReview("İkiden fazla bağımsız tasarım yüzeyi bulundu; yüzey seçimi için inceleme gerekli.")
    ranked=sorted(groups,key=lambda k:max(specs[i]["art"].width*specs[i]["art"].height for i in groups[k]),reverse=True)
    scene_surfaces=[]; proof=base.copy(); blank=base.copy()
    for index,s in enumerate(specs):
        layer=s["layer"]; name=f"surface-{index}"
        mapped=core.remap(s["art"],s["uv"],s["valid"])
        mapped[:,:,3]=np.rint(mapped[:,:,3].astype(float)*s["coverage"]/255).astype("uint8")
        proof.alpha_composite(Image.fromarray(mapped),(layer.left,layer.top))
        white=Image.new("RGBA",(layer.width,layer.height),(255,255,255,255)); white.putalpha(Image.fromarray(np.where(s["valid"],s["coverage"],0).astype("uint8")))
        blank.alpha_composite(white,(layer.left,layer.top))
        mask=Image.new("L",psd.size,0); mask.paste(white.getchannel("A"),(layer.left,layer.top))
        mask=resize(mask); mask.save(output/f"{name}-mask.png")
        yy,xx=np.indices((size[1],size[0]),dtype="float32")
        uv=cv2.remap(s["uv"],(xx+.5)/scale-layer.left-.5,(yy+.5)/scale-layer.top-.5,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
        sw,sh=s["art"].size
        uv[:,:,0]=(uv[:,:,0]*sw-.5)/max(1,sw-1);uv[:,:,1]=(uv[:,:,1]*sh-.5)/max(1,sh-1)
        encoded=np.rint(np.clip(uv,0,1)*65535).astype('<u2');encoded[np.array(mask)==0]=0
        (output/f"{name}.uv.bin").write_bytes(encoded.tobytes())
        face="front" if s["hash"]==ranked[0] else "back"
        scene_surfaces.append({"id":name,"title":"Ana tasarım" if face=="front" else "İkinci tasarım","face":face,"backgroundMode":"design","mapping":{"type":"uv-rg16le","url":f"{name}.uv.bin"},"maskUrl":f"{name}-mask.png","blend":"source-over"})
    effects=[]
    for index,layer in enumerate(suffix):
        blend(proof,layer,pixels(layer));blend(blank,layer,pixels(layer))
        plate=Image.new("RGBA",psd.size);plate.paste(pixels(layer),(layer.left,layer.top))
        name=f"effect-{index}.png";resize(plate).save(output/name)
        effects.append({"imageUrl":name,"blend":BLENDS[layer.blend_mode.name]})
    reference=psd.topil()
    if reference is None: raise NeedsReview("PSD'nin birleşik kayıtlı önizlemesi yok.")
    delta=np.abs(np.array(reference.convert("RGB"),dtype=np.int16)-np.array(proof.convert("RGB"),dtype=np.int16)).mean(2)
    if delta.mean()>3 or np.mean(delta>16)>.03:
        raise NeedsReview(f"PSD bütünlüğü doğrulanamadı: Photoshop önizlemesiyle fark {delta.mean():.2f}/255.")
    thumb=core.flatten_white(blank);thumb.thumbnail((480,480));thumb.save(output/"thumbnail.jpg",quality=90)
    primary=specs[groups[ranked[0]][0]]["art"]
    ratio=min(1,2400/max(primary.size)); artboard={"canvasWidth":max(60,round(primary.width*ratio)),"canvasHeight":max(60,round(primary.height*ratio))}
    scene={"id":"psd-"+digest[:24],"title":source.stem[:120],"width":size[0],"height":size[1],"artboard":artboard,"baseImageUrl":"base.webp","plainThumbnailUrl":"thumbnail.jpg","distribution":"public-web","license":"Mağaza sahibinin yüklediği PSD'den otomatik hazırlandı; kaynak hakları sahibine aittir. Sunum görselidir.","surfaces":scene_surfaces,"layers":effects}
    if background:scene["backgroundControl"]=background
    (output/"scene.json").write_text(json.dumps(scene,ensure_ascii=False))
    (output/"validation.json").write_text(json.dumps({"sourceSha256":digest,"sourceSize":psd.size,"outputSize":size,"surfaces":reports,"compositeMeanError":float(delta.mean()),"backgroundEditable":bool(background),"photoshopParity":False},ensure_ascii=False))
    return scene

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--source",type=Path,required=True);p.add_argument("--output",type=Path,required=True);p.add_argument("--edge",type=int,default=4096)
    a=p.parse_args()
    try:
        if not 256<=a.edge<=4096:raise NeedsReview("Çıktı uzun kenarı 256–4096 olmalı.")
        scene=prepare(a.source,a.output,a.edge)
        print(json.dumps({"status":"ready","sceneId":scene["id"]},ensure_ascii=False))
    except NeedsReview as e:
        print(json.dumps({"status":"review","message":str(e)},ensure_ascii=False));raise SystemExit(2)
    except (ValueError, KeyError, TypeError, AttributeError, ZeroDivisionError):
        print(json.dumps({"status":"review","message":"PSD katman veya eğrilik yapısı bu içe aktarıcıyla doğrulanamadı; inceleme gerekli."},ensure_ascii=False));raise SystemExit(2)
