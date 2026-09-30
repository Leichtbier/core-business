"""Baut den Grabpod in Blender und exportiert ihn als pod.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/pod.py -- [--preview pfad.png]

Konventionen für three.js (1 Einheit = 1 Tile = 50 px):
  - Blickrichtung +X, Boden der Ketten bei z = -0.4 (Kollisionsbox des Pods: 0.8 x 0.8)
  - Animierte Teile mit festen Namen: Rotor (dreht um Hochachse), DrillSide (um X),
    DrillDown (um Hochachse), Wheel_L0..3 / Wheel_R0..3 (um Querachse)
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'pod.glb')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None

# ---------------------------------------------------------------- Szene leeren
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---------------------------------------------------------------- Materialien
def material(name, color, metal=0.0, rough=0.5, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


MAT = {
    'paint': material('Paint', (0.92, 0.45, 0.04), 0.35, 0.35),
    'paint_dark': material('PaintDark', (0.55, 0.22, 0.02), 0.35, 0.45),
    'frame': material('Frame', (0.07, 0.07, 0.08), 0.6, 0.45),
    'steel': material('Steel', (0.72, 0.74, 0.78), 1.0, 0.22),
    'drill': material('DrillSteel', (0.85, 0.86, 0.9), 1.0, 0.12),
    'rubber': material('Rubber', (0.025, 0.025, 0.025), 0.0, 0.85),
    'glass': material('Glass', (0.45, 0.8, 1.0), 0.0, 0.03, alpha=0.38),
    'lamp': material('Lamp', (1, 0.95, 0.8), 0, 0.2, emit=(1, 0.92, 0.7), strength=6),
    'red': material('RedLamp', (1, 0.1, 0.05), 0, 0.2, emit=(1, 0.08, 0.03), strength=6),
    'helmet': material('Helmet', (0.9, 0.9, 0.88), 0.1, 0.3),
    'visor': material('Visor', (0.05, 0.05, 0.06), 0.9, 0.1),
    'hazard': material('Hazard', (0.9, 0.7, 0.02), 0.2, 0.4),
}


# ---------------------------------------------------------------- Helfer
def new_object(name, bm, mat, smooth=True, origin=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    if smooth:
        me.set_sharp_from_angle(angle=math.radians(40))
    if isinstance(mat, list):
        for m in mat:
            me.materials.append(m)
    else:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.location = origin
    return ob


def bevel(ob, width, segments=3, angle=35):
    mod = ob.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    return ob


def box(name, size, loc, mat, bevel_w=0.0, segs=3, origin=None):
    """Quader; loc = Mittelpunkt in Weltkoordinaten. origin (optional) = Pivot."""
    origin = Vector(origin or loc)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc) - origin, verts=bm.verts)
    ob = new_object(name, bm, mat, smooth=bevel_w > 0, origin=origin)
    if bevel_w:
        bevel(ob, bevel_w, segs)
    return ob


def cylinder(bm, r, depth, axis='Z', loc=(0, 0, 0), segs=24, r2=None, mat_index=0):
    """Zylinder/Kegelstumpf in ein bmesh einfügen."""
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r,
                                radius2=r if r2 is None else r2, depth=depth)
    verts = res['verts']
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mat_index
    return verts


def drill_bit(length=0.3, radius=0.12, lobes=5, turns=1.25, rings=18):
    """Gedrehter Bohrkopf mit Schneiden entlang +Z (Basis bei z=0, Spitze bei z=length)."""
    bm = bmesh.new()
    n = lobes * 2
    ring_verts = []
    for i in range(rings):
        t = i / (rings - 1)
        rr = radius * (1 - t) ** 0.9
        twist = t * turns * 2 * math.pi
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n + twist
            rk = rr * (1.0 if k % 2 == 0 else 0.62)
            ring.append(bm.verts.new((math.cos(a) * rk, math.sin(a) * rk, t * length)))
        ring_verts.append(ring)
    tip = bm.verts.new((0, 0, length + 0.02))
    for i in range(rings - 1):
        a, b = ring_verts[i], ring_verts[i + 1]
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    last = ring_verts[-1]
    for k in range(n):
        bm.faces.new((last[k], last[(k + 1) % n], tip))
    bm.faces.new(list(reversed(ring_verts[0])))
    # Halterung
    cylinder(bm, radius * 1.05, 0.06, loc=(0, 0, -0.03), segs=24, mat_index=1)
    cylinder(bm, radius * 0.7, 0.05, loc=(0, 0, -0.08), segs=20, mat_index=1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------------------------------------------------------------- Rumpf
body = box('Hull', (0.62, 0.40, 0.25), (-0.04, 0, -0.03), MAT['paint'], 0.06, 4)
deck = box('Deck', (0.44, 0.34, 0.07), (-0.1, 0, 0.11), MAT['paint_dark'], 0.03, 3)
stripe_l = box('StripeL', (0.5, 0.012, 0.035), (-0.05, 0.2, -0.07), MAT['hazard'], 0.005, 2)
stripe_r = box('StripeR', (0.5, 0.012, 0.035), (-0.05, -0.2, -0.07), MAT['hazard'], 0.005, 2)
belly = box('Suspension', (0.62, 0.3, 0.1), (-0.02, 0, -0.19), MAT['frame'], 0.02, 2)

# Bohrer-Gehäuse vorne
bm = bmesh.new()
cylinder(bm, 0.14, 0.1, axis='X', loc=(0.27, 0, -0.04), segs=32)
cylinder(bm, 0.14, 0.05, axis='X', loc=(0.345, 0, -0.04), segs=32, r2=0.11)
nose = new_object('DrillHousing', bm, MAT['frame'])
bevel(nose, 0.012, 2)

# Scheinwerfer
bm = bmesh.new()
for y in (0.12, -0.12):
    cylinder(bm, 0.035, 0.03, axis='X', loc=(0.27, y, 0.07), segs=16)
lamps = new_object('Headlights', bm, MAT['lamp'])
bm = bmesh.new()
for y in (0.12, -0.12):
    cylinder(bm, 0.045, 0.025, axis='X', loc=(0.255, y, 0.07), segs=16)
new_object('HeadlightRims', bm, MAT['steel'])

# Cockpit-Kuppel (Halbkugel) mit Rahmen und Pilot
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.19)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context='VERTS')
bmesh.ops.scale(bm, vec=(1.2, 1.0, 1.0), verts=bm.verts)
dome = new_object('Cockpit', bm, MAT['glass'], origin=(0.07, 0, 0.145))
bm = bmesh.new()
bmesh.ops.create_circle(bm, segments=40, radius=0.19)
ring = bm.verts[:]
bmesh.ops.scale(bm, vec=(1.2, 1.0, 1.0), verts=ring)
geom = bmesh.ops.extrude_edge_only(bm, edges=bm.edges[:])
bmesh.ops.translate(bm, vec=(0, 0, -0.03), verts=[e for e in geom['geom'] if isinstance(e, bmesh.types.BMVert)])
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
frame = new_object('CockpitFrame', bm, MAT['frame'], origin=(0.07, 0, 0.16))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.065)
new_object('PilotHelmet', bm, MAT['helmet'], origin=(0.06, 0, 0.21))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.05)
bmesh.ops.scale(bm, vec=(0.6, 1.1, 0.7), verts=bm.verts)
new_object('PilotVisor', bm, MAT['visor'], origin=(0.105, 0, 0.215))

# Motor und Auspuff hinten
box('Engine', (0.14, 0.3, 0.12), (-0.3, 0, 0.1), MAT['frame'], 0.02, 2)
bm = bmesh.new()
for y in (0.08, -0.08):
    cylinder(bm, 0.028, 0.16, loc=(-0.33, y, 0.2), segs=16)
    cylinder(bm, 0.034, 0.03, loc=(-0.33, y, 0.28), segs=16)
new_object('Exhaust', bm, MAT['steel'])
for i, x in enumerate((-0.28, -0.26, -0.24)):
    box(f'Vent{i}', (0.008, 0.26, 0.05), (x, 0, 0.17), MAT['steel'])

# Antenne
bm = bmesh.new()
cylinder(bm, 0.008, 0.16, loc=(-0.2, -0.14, 0.23), segs=8)
new_object('Antenna', bm, MAT['steel'])
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.02)
new_object('AntennaLight', bm, MAT['red'], origin=(-0.2, -0.14, 0.32))

# ---------------------------------------------------------------- Fahrwerk
for side, y in (('L', 0.215), ('R', -0.215)):
    belt = box(f'Track{side}', (0.78, 0.12, 0.17), (0, y, -0.315), MAT['rubber'], 0.08, 8)
    bm = bmesh.new()
    for k in range(11):
        x = -0.3 + k * 0.06
        for z in (-0.402, -0.228):
            c = bmesh.ops.create_cube(bm, size=1.0)['verts']
            bmesh.ops.scale(bm, vec=(0.025, 0.124, 0.014), verts=c)
            bmesh.ops.translate(bm, vec=(x, y, z), verts=c)
    new_object(f'Cleats{side}', bm, MAT['frame'], smooth=False)
    box(f'Fender{side}', (0.82, 0.14, 0.03), (0, y, -0.21), MAT['paint'], 0.012, 2)
    for i, x in enumerate((-0.27, -0.09, 0.09, 0.27)):
        bm = bmesh.new()
        cylinder(bm, 0.066, 0.13, axis='Y', segs=24, mat_index=0)
        cylinder(bm, 0.03, 0.136, axis='Y', segs=6, mat_index=1)  # Sechskant-Nabe (zeigt die Drehung)
        wheel = new_object(f'Wheel_{side}{i}', bm, [MAT['steel'], MAT['frame']], origin=(x, y, -0.315))

# ---------------------------------------------------------------- Bohrer
side_drill = new_object('DrillSide', drill_bit(), [MAT['drill'], MAT['frame']], origin=(0.37, 0, -0.04))
side_drill.rotation_euler = (0, math.pi / 2, 0)   # +Z des Bohrers zeigt nach +X
down_drill = new_object('DrillDown', drill_bit(length=0.28, radius=0.11), [MAT['drill'], MAT['frame']],
                        origin=(0.0, 0, -0.36))
down_drill.rotation_euler = (math.pi, 0, 0)       # zeigt nach unten

# ---------------------------------------------------------------- Rotor
bm = bmesh.new()
cylinder(bm, 0.022, 0.24, loc=(-0.08, 0, 0.29), segs=12)
new_object('RotorMast', bm, MAT['frame'])
bm = bmesh.new()
cylinder(bm, 0.045, 0.04, segs=20, mat_index=1)
for k in range(3):
    c = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=(0.36, 0.075, 0.012), verts=c)
    bmesh.ops.translate(bm, vec=(0.2, 0, 0), verts=c)
    bmesh.ops.rotate(bm, verts=c, matrix=Matrix.Rotation(math.radians(12), 3, 'X'))
    bmesh.ops.rotate(bm, verts=c, matrix=Matrix.Rotation(2 * math.pi * k / 3, 3, 'Z'))
rotor = new_object('Rotor', bm, [MAT['steel'], MAT['frame']], smooth=False, origin=(-0.08, 0, 0.41))

# ---------------------------------------------------------------- Export
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          use_selection=False, export_cameras=False, export_lights=False)
print('EXPORTED', OUT, os.path.getsize(OUT))

# ---------------------------------------------------------------- Vorschau
if PREVIEW:
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.render.resolution_x, scene.render.resolution_y = 900, 640
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.18, 0.1, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.lens = 60
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (1.35, -1.7, 0.75)
    direction = Vector((0, 0, -0.05)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    for loc, energy in (((1.5, -1.0, 2.0), 400), ((-1.5, 1.5, 1.0), 150)):
        ld = bpy.data.lights.new('Key', 'AREA')
        ld.energy = energy
        ld.size = 1.5
        lo = bpy.data.objects.new('Key', ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', PREVIEW)
