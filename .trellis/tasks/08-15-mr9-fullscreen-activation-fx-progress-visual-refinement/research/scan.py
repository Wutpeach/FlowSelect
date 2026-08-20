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
setup(0.12, 0.9, 1.0)
for p in [0.06,0.10,0.14,0.18,0.22,0.26,0.30,0.34,0.38,0.42,0.46,0.50,0.54,0.58]:
    render(p).save(f'mr9-literal-fidelity/scan{int(p*100):02d}.png')
print("scanned E phases")
