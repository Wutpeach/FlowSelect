import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
from PIL import Image
def setup(bigFrac, outerMul, sScale):
    SIZE=256; core = sim.rasterize_core()
    bigR = max(1, round(bigFrac*SIZE)); smallR = max(1, round(0.12*bigR))
    sim.shape = sim.multi(core,5,1); sim.big = sim.multi(core,bigR,3); sim.small = sim.multi(core,smallR,3)
    sim.OUTER_MUL = outerMul; sim.SHADOW_SCALE = sScale
def render(p):
    N=201; im = Image.new('RGB',(N,N)); px=im.load()
    for y in range(N):
        for x in range(N):
            uv=(x/N,y/N)
            col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output(uv,p)
            px[x,y]=tuple(max(0,min(255,int(round(c*255)))) for c in col)
    return im
# Config E: shadowScale=1.0, bigFrac=0.12, OUTER_MUL=0.9
setup(0.12, 0.9, 1.0)
for p,name in [(0.16,'tuneE-f2'),(0.28,'tuneE-f3'),(0.40,'tuneE-f4'),(0.52,'tuneE-f5')]:
    render(p).save(f'mr9-literal-fidelity/{name}.png')
# Config F: shadowScale=1.0, bigFrac=0.12, OUTER_MUL=1.3
setup(0.12, 1.3, 1.0)
for p,name in [(0.16,'tuneF-f2'),(0.28,'tuneF-f3'),(0.40,'tuneF-f4'),(0.52,'tuneF-f5')]:
    render(p).save(f'mr9-literal-fidelity/{name}.png')
print("rendered E and F")
