"""Baut Gesteinsbrocken und Felsformationen für die Marsoberfläche und exportiert sie als rocks.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/rocks.py -- [--preview pfad.png]

Jedes Objekt liegt mit der Unterseite bei z = 0 im Ursprung und wird im Spiel vielfach instanziert:
  - Rock_0..5      Brocken (ca. 1 Einheit groß, im Spiel skaliert)
  - Formation_0..3 Felstürme und Tafelberge mit Gesteinsschichten
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from bl_helpers import args, export, material, preview, reset  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'rocks.glb')
PREVIEW = args()
reset()
scene = bpy.context.scene

MAT = [
    material('RockDark', (0.24, 0.1, 0.05), 0.0, 0.95),
    material('Rock', (0.33, 0.15, 0.075), 0.0, 0.95),
    material('RockLight', (0.46, 0.23, 0.12), 0.0, 0.95),
]


def displaced(name, bm, seed, strength=0.3, scale=0.7, kind='VORONOI'):
    """bmesh -> Objekt mit Verschiebung durch Rauschtextur, danach als festes Mesh übernehmen."""
    me = bpy.data.meshes.new(name + '_tmp')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name + '_tmp', me)
    scene.collection.objects.link(ob)
    tex = bpy.data.textures.new(name + '_noise', kind)
    tex.noise_scale = scale
    if kind == 'VORONOI':
        tex.distance_metric = 'DISTANCE'
    mod = ob.modifiers.new('Displace', 'DISPLACE')
    mod.texture = tex
    mod.strength = strength
    mod.mid_level = 0.5
    mod.texture_coords = 'OBJECT'
    empty = bpy.data.objects.new(name + '_offset', None)
    empty.location = (seed * 7.3, seed * 3.1, seed * 5.7)       # anderer Rauschausschnitt je Stein
    scene.collection.objects.link(empty)
    mod.texture_coords_object = empty
    dg = bpy.context.evaluated_depsgraph_get()
    new_me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.objects.remove(empty)
    out = bpy.data.objects.new(name, new_me)
    scene.collection.objects.link(out)
    return out


def flatten_bottom(ob, cut=0.15):
    """Unterseite abschneiden (liegt flach auf dem Boden) und auf z = 0 setzen."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    zmin = min(v.co.z for v in bm.verts)
    floor = zmin + cut * (max(v.co.z for v in bm.verts) - zmin)
    for v in bm.verts:
        if v.co.z < floor:
            v.co.z = floor
    for v in bm.verts:
        v.co.z -= floor
    bm.to_mesh(ob.data)
    bm.free()


def color_by_height(ob, bands, rnd):
    """Materialien nach Höhe in Schichten (Strata) vergeben, mit etwas Zufall."""
    me = ob.data
    for m in MAT:
        me.materials.append(m)
    zmax = max(v.co.z for v in me.vertices) or 1
    for p in me.polygons:
        h = p.center.z / zmax
        band = int(h * bands + rnd.uniform(-0.15, 0.15))
        p.material_index = [0, 1, 2, 1][band % 4] if bands else 1
        p.use_smooth = False


# ---------------------------------------------------------------- Brocken
for i in range(6):
    rnd = random.Random(100 + i)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.5)
    ob = displaced(f'Rock_{i}', bm, seed=i + 1, strength=rnd.uniform(0.25, 0.4), scale=rnd.uniform(0.35, 0.6))
    ob.data.transform(__import__('mathutils').Matrix.Diagonal(
        (rnd.uniform(1.0, 1.6), rnd.uniform(0.8, 1.2), rnd.uniform(0.55, 0.95), 1)))
    flatten_bottom(ob, cut=0.2)
    color_by_height(ob, 0, rnd)
    for p in ob.data.polygons:                                        # etwas dunkle Flecken
        if rnd.random() < 0.25:
            p.material_index = 0

# ---------------------------------------------------------------- Formationen
def formation(name, layers, seed, taper, width, height, strength):
    """Aus gestapelten, verschobenen Scheiben gebauter Felsturm/Tafelberg."""
    rnd = random.Random(seed)
    parts = []
    z = 0.0
    for k in range(layers):
        h = height / layers
        r = width * (1 - taper * k / layers) * rnd.uniform(0.9, 1.1)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r, radius2=r * rnd.uniform(0.82, 0.95),
                              depth=h)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
        bmesh.ops.translate(bm, vec=(rnd.uniform(-0.06, 0.06) * width, rnd.uniform(-0.06, 0.06) * width,
                                     z + h / 2), verts=bm.verts)
        part = displaced(f'{name}_{k}', bm, seed=seed * 10 + k, strength=strength, scale=0.45)
        parts.append(part)
        z += h * 0.96
    # Teile zu einem Objekt vereinen
    bm = bmesh.new()
    for part in parts:
        bm.from_mesh(part.data)
        bpy.data.objects.remove(part)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    flatten_bottom(ob, cut=0.03)
    color_by_height(ob, layers + 2, rnd)
    return ob


formation('Formation_0', 4, 1, taper=0.35, width=0.9, height=3.0, strength=0.35)   # Felsturm
formation('Formation_1', 3, 2, taper=0.1, width=2.2, height=1.8, strength=0.5)     # Tafelberg
formation('Formation_2', 5, 3, taper=0.55, width=0.7, height=3.6, strength=0.3)    # schlanke Nadel
formation('Formation_3', 3, 4, taper=0.25, width=1.5, height=2.2, strength=0.45)   # breiter Klotz

export(OUT)
if PREVIEW:
    # Vorschau: alles nebeneinander aufstellen
    x = -6
    for ob in sorted(scene.collection.objects, key=lambda o: o.name):
        if ob.type != 'MESH':
            continue
        w = max(v.co.x for v in ob.data.vertices) - min(v.co.x for v in ob.data.vertices)
        ob.location.x = x + w / 2
        x += w + 0.4
    preview(PREVIEW, cam_loc=(0.5, -12, 3.5), target=(0.5, 0, 1.2), lens=35, size=(1300, 600))
