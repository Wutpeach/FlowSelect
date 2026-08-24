import importlib.util, inspect
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
print("=== module circle ===")
print(inspect.getsource(sim.circle))
print("=== module sst ===")
print(inspect.getsource(sim.sst))
print("=== module lst ===")
print(inspect.getsource(sim.lst))
print("=== module mix ===")
print(inspect.getsource(sim.mix))
sim.SHADOW_SCALE=0.2
# monkeypatch heatmapShadow with prints
orig = sim.heatmapShadow
def debug_shadow(uv, t, contour):
    scaledUV=[uv[0],uv[1]]
    posY=sim.mix(-1.0,2.0,t)
    scaledUV[1]-=0.5
    mcs=sim.sst(0.0,0.8,posY)*sim.lst(1.4,0.9,posY)
    scaledUV[1]*=(1.0+1.5*mcs); scaledUV[1]+=0.5
    innerR=0.4*sim.SHADOW_SCALE
    outerR=(1.0-0.3*(sim.sst(0.1,0.2,t)*(1.0-sim.sst(0.2,0.5,t))))*sim.SHADOW_SCALE
    s=sim.circle(scaledUV,[0.5,posY-0.2],[innerR,outerR])
    s=pow(s,1.4)*1.2
    pos=posY-uv[1]; edge=1.2
    topF=sim.lst(-0.4,0.0,pos)*(1.0-sim.sst(0.0,edge,pos))
    topF=pow(topF,3.0)
    mixer=1.0-sim.sst(0.0,0.3,pos)
    s2=sim.mix(topF,s,mixer)
    print(f"  t={t:.3f} posY={posY:.3f} mcs={mcs:.3f} circle={s:.3f} topF={topF:.3f} mixer={mixer:.3f} -> {s2:.3f}")
    return sim.clamp(0.0,1.0,s2)
sim.heatmapShadow = debug_shadow
print("call with debug:")
print("result:", sim.heatmapShadow((0.1,0.1),0.4,0))
