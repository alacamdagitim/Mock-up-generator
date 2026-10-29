"""Synthetic geometry checks: no third-party PSD or pixels are embedded."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace as N
import unittest
import numpy as np
spec=importlib.util.spec_from_file_location('tin_adapter',Path(__file__).parents[1]/'scripts/prepare-private-tin-can.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def layer(quilt=False):
    x=np.array([0,100/12,100/6,25,50,75,100]) if quilt else np.linspace(0,100,4)
    xx,yy=np.meshgrid(x,np.linspace(0,200,4))
    envelope={b'meshPoints':{b'Hrzn':N(values=xx.ravel()),b'Vrtc':N(values=yy.ravel())}}
    warp={b'bounds':{b'Rght':100,b'Btom':200},b'customEnvelopeWarp':envelope}
    config={b'warp':warp}
    if quilt:
        envelope[b'quiltSliceX']={b'quiltSliceX':N(values=[0,25,100])}
        envelope[b'quiltSliceY']={b'quiltSliceY':N(values=[0,200])}
        warp.update({b'deformNumCols':7,b'deformNumRows':4})
        config={b'warp':{},b'quiltWarp':warp}
    return N(smart_object=N(_config=N(data=config),transform_box=[10,20,210,20,210,420,10,420])),warp
class Geometry(unittest.TestCase):
    def test_linear_patch_preserves_corners_and_interior(self):
        obj,_=layer();uv=np.array([[0.,0.],[.5,.5],[1.,1.],[.2,.8]])
        np.testing.assert_allclose(mod.warp_setup(obj)(uv),uv*[200,400]+[10,20],atol=1e-5)
    def test_quilt_takes_precedence_and_handles_nonuniform_slices(self):
        obj,_=layer(True);uv=np.array([[.1,.2],[.25,.7],[.7,.8]])
        np.testing.assert_allclose(mod.warp_setup(obj)(uv),uv*[200,400]+[10,20],atol=1e-5)
    def test_quilt_is_continuous_at_patch_boundary(self):
        obj,_=layer(True);p=mod.warp_setup(obj)(np.array([[.25-1e-7,.4],[.25+1e-7,.4]]))
        self.assertLess(np.linalg.norm(p[1]-p[0]),.001)
    def test_inconsistent_mesh_rejected(self):
        obj,w=layer(True);w[b'deformNumCols']=8
        with self.assertRaises(ValueError):mod.warp_setup(obj)
    def test_nonincreasing_boundaries_rejected(self):
        obj,w=layer(True);w[b'customEnvelopeWarp'][b'quiltSliceX'][b'quiltSliceX'].values=[0,100,25]
        with self.assertRaises(ValueError):mod.warp_setup(obj)
    def test_nonfinite_controls_rejected(self):
        obj,w=layer();w[b'customEnvelopeWarp'][b'meshPoints'][b'Hrzn'].values[1]=float('nan')
        with self.assertRaises(ValueError):mod.warp_setup(obj)
if __name__=='__main__':unittest.main()
