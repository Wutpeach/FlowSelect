import math
def clamp(x,a,b): return max(a,min(b,x))
def smoothstep(e0,e1,x):
    t=clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def lst(e0,e1,x): return clamp((x-e0)/(e1-e0),0,1)
def mix(a,b,t): return a*(1-t)+b*t
sst=smoothstep
topF=0.9421260310268339; s=0.0; mixer=0.7407407407407405
print("mix:", mix(topF,s,mixer))
print("clamp:", clamp(0.0,1.0,mix(topF,s,mixer)))
