"""Own synthetic PSDs: color background, embedded label, and overlay lighting."""
from io import BytesIO
from pathlib import Path
import sys
from PIL import Image, ImageDraw
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group
from psd_tools.psd.descriptor import DescriptorBlock, DescriptorBlock2, Descriptor, String, Double
from psd_tools.psd.linked_layer import LinkedLayers, LinkedLayer
from psd_tools.constants import Tag, LinkedLayerType, BlendMode, Compression

root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
art=Image.new('RGB',(160,120),'#5a6ccd');d=ImageDraw.Draw(art);d.rectangle((30,20,100,80),fill='#e9d690');d.text((50,95),'ALACAM',fill='white')
embedded=PSDImage.frompil(art);buf=BytesIO();embedded.save(buf)
for i in range(10):
 p=PSDImage.new('RGB',(320,240),color=(220,170,180))
 bg=PixelLayer.frompil(Image.new('RGB',(320,240),(220,170,180)),p,'Background color')
 color=Descriptor(classID=b'RGBC',items=[(k,Double(v)) for k,v in zip([b'Rd  ',b'Grn ',b'Bl  '],[220,170,180])])
 bg.tagged_blocks.set_data(Tag.SOLID_COLOR_SHEET_SETTING,items=[(b'Clr ',color)])
 p.append(bg)
 label=PixelLayer.frompil(art,p,'Your design',top=60,left=80)
 identifier=f'00000000-0000-0000-0000-{i:012d}'
 label.tagged_blocks.set_data(Tag.SMART_OBJECT_LAYER_DATA1,version=4,data=DescriptorBlock(items=[(b'Idnt',String(identifier))]))
 label.tagged_blocks.set_data(Tag.PLACED_LAYER1,uuid=identifier.encode(),transform=(80.,60.,240.,60.,240.,180.,80.,180.),warp=DescriptorBlock2())
 p.append(label)
 p.tagged_blocks.set_data(Tag.LINKED_LAYER1,[LinkedLayer(kind=LinkedLayerType.DATA,uuid=identifier,filename='Own artwork.psd',filetype=b'8BPS',creator=b'8BIM',data=buf.getvalue())])
 shadow=Image.new('RGBA',(320,240),(0,0,0,0));ImageDraw.Draw(shadow).ellipse((70,165,255,196),fill=(70,70,70,90))
 record,channels=PixelLayer._build_layer_record_and_channels(shadow,'Floor shadow',0,0,Compression.RLE)
 l=PixelLayer(p,record,channels);l.blend_mode=BlendMode.MULTIPLY;p.append(l)
 p.save(root/f'Own mockup {i+1}.psd')
invalid=PSDImage.new('RGB',(100,100));invalid.append(Group.new(invalid,'Unsupported group'));invalid.save(root/'Grouped.psd')
print(root)
# Optional large canvas verifies adaptive 4K output without external imagery.
if '--large' in sys.argv:
 original=PSDImage.open(root/'Own mockup 1.psd')
 large=PSDImage.new('RGB',(6000,4500),color=(255,255,255))
 for layer in list(original): large.append(layer)
 large.tagged_blocks.update(original.tagged_blocks)
 large.save(root/'Large original mockup.psd')
