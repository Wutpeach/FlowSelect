import importlib.util
spec = importlib.util.spec_from_file_location("sim", "sim_literal.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
print("global SHADOW_SCALE before:", sim.SHADOW_SCALE)
sim.SHADOW_SCALE = 0.2
print("global SHADOW_SCALE after:", sim.SHADOW_SCALE)
import types
# wrap to spy the closure globals
print("heatmapShadow globals:", sim.heatmapShadow.__globals__.get('SHADOW_SCALE'))
print("result with scale 0.2:", sim.heatmapShadow((0.1,0.1),0.4,0))
# now try scale 1.0 explicitly
sim.SHADOW_SCALE = 1.0
print("result with scale 1.0:", sim.heatmapShadow((0.1,0.1),0.4,0))
