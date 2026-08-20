import importlib.util, math
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
from PIL import Image

def render(p, outerMul, bigFrac):
    SIZE=256; CORE=0.30
    core = sim.rasterize_core()
    bigR = max(1, round(bigFrac*SIZE))
    smallR = max(1, round(0.12*bigR))
    sim.shape = sim.multi(core, 5, 1)
    sim.big = sim.multi(core, bigR, 3)
    sim.small = sim.multi(core, smallR, 3)
    N=201
    im = Image.new('RGB',(N,N)); px=im.load()
    for y in range(N):
        for x in range(N):
            uv=(x/N,y/N)
            col, heat, inner, outer, sh, sc, sc2, contour = sim.heatmap_output(uv,p)
            # apply outerMul override
            col, heat, inner, outer, sh, sc, sc2, contour = sim.heatmap_output(uv,p)
            # recompute with new outer mul via direct calc
            # (simplest: recompute outer by re-running inner part)
            col, heat, inner, outer, sh, sc, sc2, contour = sim.heatmap_output(uv,p)
            px[x,y]=tuple(max(0,min(255,int(round(c*255)))) for c in col)
    return im

# quick center probe with different params
def probe(outerMul, bigFrac):
    SIZE=256; CORE=0.30
    core = sim.rasterize_core()
    bigR = max(1, round(bigFrac*SIZE)); smallR = max(1, round(0.12*bigR))
    sim.shape = sim.multi(core,5,1); sim.big = sim.multi(core,bigR,3); sim.small = sim.multi(core,smallR,3)
    for p in [0.2,0.4,0.6]:
        col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output((0.5,0.5),p)
        print(f"outerMul={outerMul} bigFrac={bigFrac} p={p}: center heat={heat:.2f} inner={inner:.2f} outer={outer:.2f}")
probe(2.5, 0.15)
probe(1.2, 0.15)
probe(1.2, 0.10)
