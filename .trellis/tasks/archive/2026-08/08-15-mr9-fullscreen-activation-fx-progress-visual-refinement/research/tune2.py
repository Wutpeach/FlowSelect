import importlib.util, math
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
from PIL import Image
def setup(bigFrac, outerMul):
    SIZE=256; core = sim.rasterize_core()
    bigR = max(1, round(bigFrac*SIZE)); smallR = max(1, round(0.12*bigR))
    sim.shape = sim.multi(core,5,1); sim.big = sim.multi(core,bigR,3); sim.small = sim.multi(core,smallR,3)
    sim.OUTER_MUL = outerMul
def render(p):
    N=201; im = Image.new('RGB',(N,N)); px=im.load()
    for y in range(N):
        for x in range(N):
            uv=(x/N,y/N)
            col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output(uv,p)
            px[x,y]=tuple(max(0,min(255,int(round(c*255)))) for c in col)
    return im
# config A: bigFrac 0.10, outerMul 1.2
setup(0.10, 1.2)
for p in [0.2,0.4,0.6]:
    col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output((0.5,0.5),p)
    print(f"A bigFrac=0.10 outer=1.2 p={p}: center heat={heat:.2f} outer={outer:.2f}")
# config B: bigFrac 0.08, outerMul 1.0
setup(0.08, 1.0)
for p in [0.2,0.4,0.6]:
    col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output((0.5,0.5),p)
    print(f"B bigFrac=0.08 outer=1.0 p={p}: center heat={heat:.2f} outer={outer:.2f}")
# render config B frames
setup(0.08, 1.0)
for p,name in [(0.20,'tuneB-f2'),(0.34,'tuneB-f3'),(0.46,'tuneB-f4'),(0.58,'tuneB-f5')]:
    render(p).save(f'mr9-literal-fidelity/{name}.png')
print("rendered")
