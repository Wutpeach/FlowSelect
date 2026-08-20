import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
sim.SHADOW_SCALE = 0.2
import math
def shadow_detail(uv,t):
    # replicate with prints
    scaledUV = [uv[0], uv[1]]
    posY = sim.mix(-1.0, 2.0, t)
    scaledUV[1] -= 0.5
    mainCircleScale = sim.sst(0.0,0.8,posY)*sim.lst(1.4,0.9,posY)
    scaledUV[0]*=1.0; scaledUV[1]*=(1.0+1.5*mainCircleScale); scaledUV[1]+=0.5
    innerR=0.4*0.2; outerR=(1.0-0.3*(sim.sst(0.1,0.2,t)*(1.0-sim.sst(0.2,0.5,t))))*0.2
    s = sim.circle(scaledUV,[0.5,posY-0.2],[innerR,outerR])
    s = math.pow(s,1.4)*1.2
    pos = posY - uv[1]
    edge=1.2
    topF = sim.lst(-0.4,0.0,pos)*(1.0-sim.sst(0.0,edge,pos))
    topF = math.pow(topF,3.0)
    mixer = 1.0-sim.sst(0.0,0.3,pos)
    s2 = sim.mix(topF,s,mixer)
    return s, s2, posY, mainCircleScale, topF, mixer, innerR, outerR
# check a point far from any blob at scale 0.2
for pt in [(0.1,0.1),(0.9,0.9),(0.5,0.5),(0.1,0.5)]:
    for t in [0.2,0.4,0.6]:
        s,s2,posY,mcs,topF,mixer,ir,orr = shadow_detail(pt,t)
        print(f"pt={pt} t={t}: raw={s:.3f} final={s2:.3f} posY={posY:.2f} mcs={mcs:.2f} topF={topF:.3f} mixer={mixer:.3f} innerR={ir:.3f} outerR={orr:.3f}")
