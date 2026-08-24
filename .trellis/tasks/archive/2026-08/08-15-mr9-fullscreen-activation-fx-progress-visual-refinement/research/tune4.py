import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
from PIL import Image
def setup(bigFrac, outerMul, sScale):
    SIZE=256; core = sim.rasterize_core()
    bigR = max(1, round(bigFrac*SIZE)); smallR = max(1, round(0.12*bigR))
    sim.shape = sim.multi(core,5,1); sim.big = sim.multi(core,bigR,3); sim.small = sim.multi(core,smallR,3)
    sim.OUTER_MUL = outerMul
    sim.SHADOW_SCALE = sScale
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
            if r>0.5 and r>g*0.9: warm+=1  # yellow-orange-red counts
            tot+=1
    return round(warm/tot,3)
for sScale in [0.7, 0.8, 0.9]:
    setup(0.10, 1.6, sScale)
    fracs=[warmfrac(p) for p in [0.2,0.3,0.4,0.5,0.6]]
    print(f"shadowScale={sScale} warmfrac:", fracs)
# render best candidate
setup(0.10, 1.6, 0.8)
for p,name in [(0.18,'tuneC-f2'),(0.30,'tuneC-f3'),(0.44,'tuneC-f4'),(0.58,'tuneC-f5')]:
    render(p).save(f'mr9-literal-fidelity/{name}.png')
print("rendered C (shadowScale 0.8)")
