import math
def clamp(x,a,b): return max(a,min(b,x))
def smoothstep(e0,e1,x):
    t=clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def lst(e0,e1,x): return clamp((x-e0)/(e1-e0),0,1)
def mix(a,b,t): return a*(1-t)+b*t
sst=smoothstep
def circle(uv,c,r): return 1.0-smoothstep(r[0],r[1],math.dist(uv,c))
SHADOW_SCALE=1.0
def heatmapShadow(uv,t,contour):
    scaledUV=[uv[0],uv[1]]
    posY=mix(-1.0,2.0,t)
    scaledUV[1]-=0.5
    mcs=sst(0.0,0.8,posY)*lst(1.4,0.9,posY)
    scaledUV[1]*=(1.0+1.5*mcs); scaledUV[1]+=0.5
    innerR=0.4*SHADOW_SCALE
    outerR=(1.0-0.3*(sst(0.1,0.2,t)*(1.0-sst(0.2,0.5,t))))*SHADOW_SCALE
    s=circle(scaledUV,[0.5,posY-0.2],[innerR,outerR])
    s=pow(s,1.4)*1.2
    pos=posY-uv[1]; edge=1.2
    topF=lst(-0.4,0.0,pos)*(1.0-sst(0.0,edge,pos))
    topF=pow(topF,3.0)
    mixer=1.0-sst(0.0,0.3,pos)
    return clamp(0.0,1.0,mix(topF,s,mixer))
print("scale1.0:", heatmapShadow((0.1,0.1),0.4,0))
SHADOW_SCALE=0.2
print("scale0.2:", heatmapShadow((0.1,0.1),0.4,0))
