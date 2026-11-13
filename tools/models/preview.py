# Preview a piece set's meshes (docs/hifi-models.md): import a .glb, lay the LOD0 pieces out in a row,
# light them with a low sun, render one PNG.   blender -b --factory-startup --python tools/models/preview.py -- <glb> <png> [filter]
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]; flt = a[2] if len(a) > 2 else 'lod0'
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=src)
obs = sorted([o for o in bpy.data.objects if o.type == 'MESH' and o.data.name.endswith(flt)], key=lambda o: o.data.name)[:6]
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o not in obs]: bpy.data.objects.remove(o)
mat = bpy.data.materials.new('stone'); mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Base Color'].default_value = (0.55, 0.53, 0.5, 1); bsdf.inputs['Roughness'].default_value = 0.85
for k, o in enumerate(obs):
    o.location = ((k % 3) * 2.6 - 2.6, (k // 3) * 2.4, 0); o.data.materials.clear(); o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1400, 800
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(55), 0, math.radians(35)); sun.data.energy = 4
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.42, 0.55, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -6.5, 3.2); cam.rotation_euler = (math.radians(68), 0, 0); cam.data.lens = 30
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
print('DONE')
