import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
print("initial SHADOW_SCALE:", sim.SHADOW_SCALE)
sim.SHADOW_SCALE = 0.2
print("set SHADOW_SCALE:", sim.SHADOW_SCALE)
uv=(0.1,0.1); t=0.4
s = sim.heatmapShadow(uv,t,0)
print("shadow at (0.1,0.1) t=0.4 scale0.2:", s)
# manually compute circle piece
scaledUV=[uv[0],uv[1]]
posY=sim.mix(-1.0,2.0,t)
scaledUV[1]-=0.5
mcs=sim.sst(0.0,0.8,posY)*sim.lst(1.4,0.9,posY)
scaledUV[1]*=(1.0+1.5*mcs); scaledUV[1]+=0.5
innerR=0.4*0.2; outerR=(1.0-0.3*(sim.sst(0.1,0.2,t)*(1.0-sim.sst(0.2,0.5,t))))*0.2
c=sim.circle(scaledUV,[0.5,posY-0.2],[innerR,outerR])
print("circle:", c, "scaledUV:", scaledUV, "center:", [0.5,posY-0.2], "r:", innerR, outerR)
