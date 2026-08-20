import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
from PIL import Image
SIZE=256; core = sim.rasterize_core()
bigR = max(1, round(0.12*SIZE)); smallR = max(1, round(0.12*bigR))
sim.shape = sim.multi(core,5,1); sim.big = sim.multi(core,bigR,3); sim.small = sim.multi(core,smallR,3)
sim.OUTER_MUL = 0.9; sim.SHADOW_SCALE = 1.0
N=201
im = Image.new('RGB',(N,N)); px=im.load()
p=0.18
for y in range(N):
    for x in range(N):
        uv=(x/N,y/N)
        col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output(uv,p)
        px[x,y]=tuple(max(0,min(255,int(round(c*255)))) for c in col)
im.save('mr9-literal-fidelity/sim-f3-check.png')
# print heat stats
import statistics
hs=[];
for y in range(0,N,4):
    for x in range(0,N,4):
        col,heat,inner,outer,sh,sc,sc2,contour = sim.heatmap_output((x/N,y/N),p)
        hs.append(heat)
print("sim heat min/max/mean:", round(min(hs),2), round(max(hs),2), round(sum(hs)/len(hs),2))
# browser f3 stats
b = Image.open('mr9-literal-fidelity/f3.png').convert('RGB')
bp=b.load(); warm=0; tot=0
for y in range(0,N,2):
    for x in range(0,N,2):
        r,g,bl=bp[x,y]; tot+=1
        if r>150 and r>g*0.9: warm+=1
print("browser f3 warmfrac:", round(warm/tot,3))
s=Image.open('mr9-literal-fidelity/sim-f3-check.png').convert('RGB'); sp=s.load()
warm=0
for y in range(0,N,2):
    for x in range(0,N,2):
        r,g,bl=sp[x,y];
        if r>150 and r>g*0.9: warm+=1
print("sim f3 warmfrac:", round(warm/tot,3))
