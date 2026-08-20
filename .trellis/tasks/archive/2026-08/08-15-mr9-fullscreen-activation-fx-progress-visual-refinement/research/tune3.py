import importlib.util
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
def warmfrac(p):
    N=201; tot=0; warm=0
    for y in range(10,N-10,2):
        for x in range(10,N-10,2):
            uv=(x/N,y/N)
            col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output(uv,p)
            r,g,b=col
            if r>0.5 and r>g*1.2: warm+=1
            tot+=1
    return round(warm/tot,3)
setup(0.10, 1.2)
for p in [0.2,0.3,0.4,0.5,0.6]:
    print(f"A outer=1.2 p={p} warmfrac={warmfrac(p)}")
setup(0.10, 1.6)
for p in [0.2,0.3,0.4,0.5,0.6]:
    print(f"A2 outer=1.6 p={p} warmfrac={warmfrac(p)}")
setup(0.10, 1.6)
for p,name in [(0.2,'tuneA2-f2'),(0.34,'tuneA2-f3'),(0.46,'tuneA2-f4'),(0.58,'tuneA2-f5')]:
    render(p).save(f'mr9-literal-fidelity/{name}.png')
print("rendered A2")
