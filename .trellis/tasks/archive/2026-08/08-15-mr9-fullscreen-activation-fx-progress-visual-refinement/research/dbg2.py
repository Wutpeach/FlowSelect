import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
sim.SHADOW_SCALE = 0.2
p=0.4
pts=[(0.1,0.1),(0.9,0.9),(0.5,0.5),(0.5,0.8),(0.2,0.7)]
for pt in pts:
    sh = sim.heatmapShadow(pt,p,0)
    sc = sim.heatmapShadow(pt,sim.fract(p+1/3),0)
    sc2= sim.heatmapShadow(pt,sim.fract(p+2/3),0)
    print(pt, "sh", round(sh,3), "sc", round(sc,3), "sc2", round(sc2,3), "prod", round(sh*sc*sc2,3))
# also count coverage quickly
tot=0; erased=0
for y in range(0,201,3):
    for x in range(0,201,3):
        uv=(x/201,y/201)
        prod = sim.heatmapShadow(uv,p,0)*sim.heatmapShadow(uv,sim.fract(p+1/3),0)*sim.heatmapShadow(uv,sim.fract(p+2/3),0)
        tot+=1
        if prod>=0.99: erased+=1
print("erased/tot:", erased, "/", tot)
