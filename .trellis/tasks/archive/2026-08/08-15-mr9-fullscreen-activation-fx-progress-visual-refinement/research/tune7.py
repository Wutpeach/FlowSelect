import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
def inner_at(uv,p):
    sh = sim.heatmapShadow(uv,p,0)
    sc = sim.heatmapShadow(uv,sim.fract(p+1/3),0)
    sc2= sim.heatmapShadow(uv,sim.fract(p+2/3),0)
    inner = 0.8
    inner = sim.mix(inner,0.0,sh)
    inner = sim.mix(inner,0.0,sc)
    inner = sim.mix(inner,0.0,sc2)
    return inner, sh, sc, sc2
# check inner at a few points and phases
for p in [0.1,0.3,0.5]:
    for pt in [(0.5,0.2),(0.5,0.5),(0.5,0.8),(0.25,0.5),(0.75,0.5)]:
        inner,sh,sc,sc2 = inner_at(pt,p)
        print(f"p={p} pt={pt} inner={inner:.3f} sh={sh:.3f} sc={sc:.3f} sc2={sc2:.3f}")
