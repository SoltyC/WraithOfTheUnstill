# A row of a piece set's LOD0 meshes, each at its own size (docs/hifi-models.md): every piece, side by side, lit low.
#   blender -b --factory-startup --python tools/models/preview_row.py -- <glb> <png>
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=src)
obs = sorted([o for o in bpy.data.objects if o.type == 'MESH' and o.data.name.endswith('lod0')], key=lambda o: o.data.name)
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o not in obs]: bpy.data.objects.remove(o)
mat = bpy.data.materials.new('stone'); mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Base Color'].default_value = (0.5, 0.48, 0.46, 1); bsdf.inputs['Roughness'].default_value = 0.85
for k, o in enumerate(obs):
    o.location = (k * 2.3 - (len(obs) - 1) * 1.15, 0, 0); o.rotation_euler = (math.radians(-90), 0, math.radians(25)); o.data.materials.clear(); o.data.materials.append(mat)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1800, 700
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); sun.data.energy = 4
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.42, 0.55, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -10.5, 0.2); cam.rotation_euler = (math.radians(90), 0, 0); cam.data.lens = 26
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
print('DONE')
