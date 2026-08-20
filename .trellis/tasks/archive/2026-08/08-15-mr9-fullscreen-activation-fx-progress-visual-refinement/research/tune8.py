import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
def coverage(p, sScale):
    tot=0; erased=0; partial=0; unerased=0
    for y in range(201):
        for x in range(201):
            uv=(x/201,y/201)
            sh = sim.heatmapShadow(uv,p,0)
            sc = sim.heatmapShadow(uv,sim.fract(p+1/3),0)
            sc2= sim.heatmapShadow(uv,sim.fract(p+2/3),0)
            prod = sh*sc*sc2
            tot+=1
            if prod>=0.99: erased+=1
            elif prod<=0.01: unerased+=1
            else: partial+=1
    return round(erased/tot,3), round(partial/tot,3), round(unerased/tot,3)
for sScale in [0.4, 0.5, 0.57, 0.65]:
    sim.SHADOW_SCALE = sScale
    res = [coverage(p, sScale) for p in [0.2,0.4,0.6]]
    print(f"shadowScale={sScale} (erased,partial,unerased):", res)
