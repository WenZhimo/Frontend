"""Export the Geometry Nodes mesh, lighting normals and Cycles color rules.
Run with Blender 5.2. The source .blend is never saved.
"""
import colorsys
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
source = bpy.data.objects['Sphere.001']
nodes = bpy.data.materials['树叶-cycles'].node_tree.nodes
palette_nodes = {
    'moss': ('Color Ramp.002', '苔绿', '#abc978'),
    'lime': ('Color Ramp.001', '柠黄', '#d6e88e'),
    'rose': ('Color Ramp.003', '玫瑰', '#d5aca6'),
    'mist': ('Color Ramp.004', '雾白', '#e8e8dd'),
}
config = {
    'palettes': {
        key: {'label': label, 'accent': accent,
              'stops': [[e.position, list(e.color)[:3]] for e in nodes[name].color_ramp.elements]}
        for key, (name, label, accent) in palette_nodes.items()
    },
    'variation': {
        'power': nodes['Math.003'].inputs[1].default_value,
        'offset': nodes['Math'].inputs[1].default_value,
        'hue': nodes['Math.001'].inputs[1].default_value,
        'value': nodes['Math.002'].inputs[1].default_value,
        # Keep the source negative-power variation bounded. Without this,
        # near-zero ID random values become unbounded hue/value outliers.
        'maxDelta': 8.0,
    },
    'distribution': {
        'method': 'fibonacci-sphere',
        'preserveRadialDistance': True,
    },
}
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph),
    depsgraph=depsgraph, preserve_all_data_layers=True)
mesh.transform(source.matrix_world)
mesh.update()

# Geometry Nodes realizes each leaf as one disconnected 32-vertex polygon.
# Store one center and local basis per vertex so the browser can rotate each
# leaf toward the active camera in the vertex shader without turning the model
# into a texture or creating thousands of Three.js objects.
parent = list(range(len(mesh.vertices)))
component_size = [1] * len(parent)
def find(index):
    while parent[index] != index:
        parent[index] = parent[parent[index]]
        index = parent[index]
    return index
def union(first, second):
    first, second = find(first), find(second)
    if first == second:
        return
    if component_size[first] < component_size[second]:
        first, second = second, first
    parent[second] = first
    component_size[first] += component_size[second]
for edge in mesh.edges:
    union(edge.vertices[0], edge.vertices[1])
components = {}
for vertex_index in range(len(mesh.vertices)):
    components.setdefault(find(vertex_index), []).append(vertex_index)

leaf_centers = [(0.0, 0.0, 0.0)] * len(mesh.vertices)
leaf_normals = [(0.0, 1.0, 0.0)] * len(mesh.vertices)
leaf_tangents = [(1.0, 0.0, 0.0)] * len(mesh.vertices)
leaf_shade_normals = [(0.0, 0.0, 1.0)] * len(mesh.vertices)
leaf_billboards = [0.0] * len(mesh.vertices)
billboard_count = 0
leaf_records = []
for indices in components.values():
    # The 482-vertex component is the source sphere/core. Keep it as a normal
    # 3D surface; only the disconnected 32-vertex leaf polygons billboard.
    if len(indices) != 32:
        continue
    index_set = set(indices)
    polygon = next((poly for poly in mesh.polygons if poly.vertices[0] in index_set), None)
    if polygon is None:
        continue
    center = sum((mesh.vertices[index].co for index in indices), start=Vector((0.0, 0.0, 0.0))) / len(indices)
    normal = polygon.normal.normalized()
    tangent = mesh.vertices[indices[1]].co - mesh.vertices[indices[0]].co
    tangent = (tangent - normal * tangent.dot(normal)).normalized()
    if tangent.length < 0.001:
        tangent = normal.orthogonal().normalized()
    leaf_records.append({
        'indices': indices,
        'center': center,
        'normal': normal,
        'tangent': tangent,
    })
    billboard_count += 1

# The source sphere uses a regular face topology, so points sampled from it
# can form visible latitude bands when the cluster is viewed from the side.
# Keep each leaf's radial depth, but assign its angular direction with a
# deterministic Fibonacci sphere. Use a stable index hash for the order so the
# density mask and HSV random seed stay statistically independent of position.
# This removes topology-aligned layers while preserving the original cluster
# volume and leaf meshes.
core_indices = [indices for indices in components.values() if len(indices) != 32]
if len(core_indices) != 1:
    raise RuntimeError(f'Expected one source sphere component, found {len(core_indices)}.')
sphere_center = sum((mesh.vertices[index].co for index in core_indices[0]), start=Vector()) / len(core_indices[0])
golden_angle = math.pi * (3.0 - math.sqrt(5.0))
def direction_order_key(item):
    index = item['indices'][0]
    return (index * 1664525 + 1013904223) & 0xffffffff

for order, record in enumerate(sorted(leaf_records, key=direction_order_key)):
    z = 1.0 - 2.0 * (order + 0.5) / len(leaf_records)
    radial = math.sqrt(max(0.0, 1.0 - z * z))
    theta = golden_angle * order
    direction = Vector((math.cos(theta) * radial, math.sin(theta) * radial, z))
    radius = (record['center'] - sphere_center).length
    target = sphere_center + direction * radius
    translation = target - record['center']
    center_tuple = tuple(target)
    normal_tuple, tangent_tuple = tuple(record['normal']), tuple(record['tangent'])
    shade_tuple = tuple(direction)
    for index in record['indices']:
        mesh.vertices[index].co += translation
        leaf_centers[index] = center_tuple
        leaf_normals[index] = normal_tuple
        leaf_tangents[index] = tangent_tuple
        leaf_shade_normals[index] = shade_tuple
        leaf_billboards[index] = 1.0
mesh.update()

def add_vector_attribute(name, values):
    attribute = mesh.attributes.new(name, 'FLOAT_VECTOR', 'POINT')
    for index, value in enumerate(values):
        attribute.data[index].vector = value

add_vector_attribute('_LEAF_CENTER', leaf_centers)
add_vector_attribute('_LEAF_NORMAL', leaf_normals)
add_vector_attribute('_LEAF_TANGENT', leaf_tangents)
# The material uses the redistributed sphere direction for stylized lighting,
# not the polygon normal used only as the billboard's local basis.
add_vector_attribute('_LEAF_SHADE_NORMAL', leaf_shade_normals)
billboard_attribute = mesh.attributes.new('_LEAF_BILLBOARD', 'FLOAT', 'POINT')
for index, value in enumerate(leaf_billboards):
    billboard_attribute.data[index].value = value

light_values = [max(0.0, min(1.0, (Vector(leaf_shade_normals[i]).dot(s.vector) + 1.0) / 2.0))
    for i, s in enumerate(mesh.attributes['sun vector'].data)]
randoms = [v.value for v in mesh.attributes['ID random'].data]

# Custom glTF attributes retain the source's light factor and per-leaf random seed.
for name, values in [('_LEAF_LIGHT', light_values), ('_LEAF_RANDOM', randoms)]:
    attr = mesh.attributes.new(name, 'FLOAT', 'POINT')
    attr.data.foreach_set('value', values)
for layer in list(mesh.color_attributes):
    mesh.color_attributes.remove(layer)
color = mesh.color_attributes.new('leafColor', 'FLOAT_COLOR', 'POINT')
ramp = nodes[palette_nodes['moss'][0]].color_ramp
variation = config['variation']
for i, (light, seed) in enumerate(zip(light_values, randoms)):
    h, s, v = colorsys.rgb_to_hsv(*ramp.evaluate(light)[:3])
    delta = (seed ** variation['power'] if seed > 0 else 0) - variation['offset']
    delta = max(-variation['maxDelta'], min(variation['maxDelta'], delta))
    rgb = colorsys.hsv_to_rgb((h + delta * variation['hue']) % 1.0, s,
        v * (1.0 + delta * variation['value']))
    color.data[i].color = (*rgb, 1.0)

material = bpy.data.materials.new('Source color ramps - vertex color PBR')
material.use_nodes = True
material.node_tree.nodes.clear()
output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
principled = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
principled.inputs['Roughness'].default_value = 0.9
principled.inputs['Metallic'].default_value = 0.0
vertex_color = material.node_tree.nodes.new('ShaderNodeVertexColor')
vertex_color.layer_name = 'leafColor'
material.node_tree.links.new(vertex_color.outputs['Color'], principled.inputs['Base Color'])
material.node_tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
mesh.materials.clear()
mesh.materials.append(material)
for poly in mesh.polygons:
    poly.material_index = 0
obj = bpy.data.objects.new('Leaf cluster', mesh)
bpy.context.collection.objects.link(obj)
for item in list(bpy.context.scene.objects):
    if item != obj:
        bpy.data.objects.remove(item, do_unlink=True)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / 'leaf-cluster.glb'), export_format='GLB',
    use_selection=True, export_apply=True, export_materials='EXPORT',
    export_vertex_color='NAME', export_vertex_color_name='leafColor',
    export_attributes=True, export_texcoords=False, export_normals=True,
    export_lights=False, export_cameras=False, export_animations=False,
)
config['geometry'] = {
    'sourceVertices': len(mesh.vertices),
    'sourcePolygons': len(mesh.polygons),
    'billboardLeaves': billboard_count,
}
(ROOT / 'src').mkdir(exist_ok=True)
(ROOT / 'src' / 'palettes.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Exported {len(mesh.vertices)} vertices / {len(mesh.polygons)} polygons; four source palettes.')
