# Shadow LODs for a piece set (docs/hifi-models.md): decimate each <family>_<n>_lod0 of a .glb to about
# a tenth (LOD2: casts the far shadows; a shadow needs the mass, not the sculpt) and write them alone to
# <set>-shadow.glb (the set's own .glb stays byte-identical). No bake: LOD2 is never drawn in colour.
#   blender -b --factory-startup --python tools/models/shadow_lod.py -- <glb>
import bpy, sys
src = sys.argv[sys.argv.index('--') + 1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=src)
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.data.name.endswith('_lod2')]: bpy.data.objects.remove(o)
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.data.name.endswith('_lod0')]:
    me = o.data.copy(); me.name = o.data.name[:-1] + '2'
    ob = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = max(48, len(me.polygons) * 0.1) / len(me.polygons); m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec')
    print('lod2', me.name, len(me.polygons))
lod2 = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.name.endswith('_lod2')]
bpy.ops.object.select_all(action='DESELECT')
for o in lod2: o.select_set(True); o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0); o.scale = (1, 1, 1)
bpy.ops.export_scene.gltf(filepath=src[:-4] + '-shadow.glb', use_selection=True, export_format='GLB', export_materials='NONE', export_normals=True, export_apply=True, export_yup=True)
print('DONE')
