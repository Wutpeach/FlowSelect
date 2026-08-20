import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
N=201
def coverage(p):
    tot=0; erased=0; partial=0; unerased=0
    for y in range(N):
        for x in range(N):
            uv=(x/N,y/N)
            sh = sim.heatmapShadow(uv,p,0)
            sc = sim.heatmapShadow(uv,sim.fract(p+1/3),0)
            sc2= sim.heatmapShadow(uv,sim.fract(p+2/3),0)
            prod = sh*sc*sc2
            tot+=1
            if prod>=0.99: erased+=1
            elif prod<=0.01: unerased+=1
            else: partial+=1
    return round(erased/tot,3), round(partial/tot,3), round(unerased/tot,3)
for p in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]:
    e,pa,u = coverage(p)
    print(f"p={p}: fully-erased {e} partial {pa} unerased {u}")
