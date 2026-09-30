"""Baut die Tankstelle (industriell, düster) in Blender und exportiert sie als fuel_station.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/fuel_station.py -- [--preview pfad.png]

Konventionen für three.js (1 Einheit = 1 Tile):
  - Ursprung: Mitte der Grundfläche (Spalten 3..5 -> x -1.5..1.5), Boden bei z = 0
  - Vorderseite zeigt nach -Y (wird in three.js zu +Z, also zur Kamera); Front bei y = 0, alles liegt bei y >= 0
  - Einfahrt/Zapfsäule bei x = -1 (Spalte 3, dort löst das Spiel die Tankstelle aus)
  - Leuchtende Teile: Material "SignGlow" (flackert im Spiel), Empties "Lamp_*" (dort setzt das Spiel Lichter)
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fuel_station.glb')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---------------------------------------------------------------- Materialien
def material(name, color, metal=0.0, rough=0.7, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    return m


MAT = {
    'concrete': material('Concrete', (0.16, 0.15, 0.14), 0.0, 0.95),
    'concrete_dark': material('ConcreteDark', (0.09, 0.085, 0.08), 0.0, 0.95),
    'sheet': material('CorrugatedSheet', (0.14, 0.13, 0.12), 0.55, 0.7),
    'sheet_rust': material('CorrugatedRust', (0.22, 0.09, 0.04), 0.3, 0.85),
    'steel': material('DarkSteel', (0.09, 0.09, 0.1), 0.7, 0.55),
    'steel_light': material('Steel', (0.35, 0.35, 0.36), 0.8, 0.4),
    'rust': material('Rust', (0.28, 0.1, 0.035), 0.25, 0.9),
    'tank': material('TankPaint', (0.17, 0.18, 0.15), 0.35, 0.75),
    'hazard_y': material('HazardYellow', (0.62, 0.42, 0.02), 0.2, 0.6),
    'hazard_k': material('HazardBlack', (0.02, 0.02, 0.02), 0.2, 0.6),
    'pump': material('PumpRed', (0.32, 0.03, 0.02), 0.3, 0.55),
    'rubber': material('Rubber', (0.02, 0.02, 0.02), 0.0, 0.9),
    'window': material('GrimyWindow', (0.1, 0.07, 0.03), 0.0, 0.3, emit=(0.85, 0.4, 0.12), strength=0.7),
    'sign': material('SignGlow', (0.3, 0.08, 0.01), 0.0, 0.4, emit=(1.0, 0.36, 0.05), strength=9),
    'beacon': material('BeaconRed', (0.4, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.05, 0.02), strength=7),
    'display': material('PumpDisplay', (0.02, 0.08, 0.03), 0.0, 0.3, emit=(0.25, 1.0, 0.35), strength=2.5),
    'floodlight': material('Floodlight', (0.8, 0.75, 0.6), 0.0, 0.2, emit=(1.0, 0.85, 0.55), strength=8),
}


# ---------------------------------------------------------------- Helfer
def new_object(name, bm, mat, smooth=False, origin=(0, 0, 0), sharp_angle=35):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    if smooth:
        me.set_sharp_from_angle(angle=math.radians(sharp_angle))
    for m in (mat if isinstance(mat, list) else [mat]):
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.location = origin
    return ob


def add_box(bm, size, loc, rot=None, mat_index=0):
    v = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=Vector(size), verts=v)
    if rot is not None:
        bmesh.ops.rotate(bm, verts=v, matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=v)
    for f in {f for x in v for f in x.link_faces}:
        f.material_index = mat_index
    return v


def add_cyl(bm, r, depth, loc, axis='Z', segs=20, r2=None, mat_index=0, cap=True):
    v = bmesh.ops.create_cone(bm, cap_ends=cap, segments=segs, radius1=r,
                              radius2=r if r2 is None else r2, depth=depth)['verts']
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=v)
    for f in {f for x in v for f in x.link_faces}:
        f.material_index = mat_index
    return v


def add_torus(bm, major, minor, loc, axis='Z', segs=24, rsegs=8, mat_index=0):
    verts = []
    ring = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        row = []
        for j in range(rsegs):
            b = 2 * math.pi * j / rsegs
            p = Vector(((major + minor * math.cos(b)) * math.cos(a),
                        (major + minor * math.cos(b)) * math.sin(a), minor * math.sin(b)))
            row.append(bm.verts.new(p))
        ring.append(row)
    for i in range(segs):
        for j in range(rsegs):
            f = bm.faces.new((ring[i][j], ring[(i + 1) % segs][j], ring[(i + 1) % segs][(j + 1) % rsegs],
                              ring[i][(j + 1) % rsegs]))
            f.material_index = mat_index
    verts = [v for row in ring for v in row]
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=verts)
    return verts


def corrugated(bm, x0, x1, z0, z1, y, amp=0.018, period=0.09, facing=-1, mat_index=0):
    """Wellblech in der XZ-Ebene bei Tiefe y (Wellen entlang x); facing -1 = Vorderseite zeigt nach -Y."""
    n = max(2, int((x1 - x0) / period * 4))
    bottom, top = [], []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        d = amp * math.sin(2 * math.pi * (x - x0) / period)
        bottom.append(bm.verts.new((x, y + d, z0)))
        top.append(bm.verts.new((x, y + d, z1)))
    for i in range(n):
        q = (bottom[i], bottom[i + 1], top[i + 1], top[i]) if facing < 0 else (bottom[i], top[i], top[i + 1], bottom[i + 1])
        bm.faces.new(q).material_index = mat_index


def hazard_stripes(bm, x0, x1, z0, z1, y, width=0.12, yellow=0, black=1):
    """Schräge Warnstreifen als Folge von Parallelogrammen auf einer Fläche bei Tiefe y."""
    x = x0
    k = 0
    h = z1 - z0
    while x < x1:
        xa, xb = x, min(x + width, x1)
        v = [bm.verts.new((xa, y, z0)), bm.verts.new((xb, y, z0)),
             bm.verts.new((min(xb + h * 0.6, x1 + h * 0.6), y, z1)), bm.verts.new((xa + h * 0.6, y, z1))]
        f = bm.faces.new(v)
        f.material_index = yellow if k % 2 == 0 else black
        x += width
        k += 1


def mesh_from(ob, name, mat):
    """Kurven/Text in ein Mesh-Objekt umwandeln (glTF exportiert nur Meshes)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.materials.clear()
    me.materials.append(mat)
    new = bpy.data.objects.new(name, me)
    scene.collection.objects.link(new)
    new.matrix_world = ob.matrix_world
    bpy.data.objects.remove(ob)
    return new


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    scene.collection.objects.link(e)
    return e


# ---------------------------------------------------------------- Betonplatte
bm = bmesh.new()
add_box(bm, (3.5, 3.2, 0.06), (0, 1.55, 0.03))
for x in (-1.25, -0.75):  # Fahrspuren / Ölflecken
    add_box(bm, (0.32, 1.0, 0.004), (x, 0.55, 0.062), mat_index=1)
new_object('Pad', bm, [MAT['concrete'], MAT['concrete_dark']])

# ---------------------------------------------------------------- Halle (rechts)
HX0, HX1, HY0, HY1, HH = -0.15, 1.6, 0.35, 2.4, 1.55
# Pultdach (siehe unten): um 9° geneigt, steigt nach hinten an; Unterkante in Abhängigkeit von y.
# Seitenwände (Giebel), Rückwand und hintere Eckpfosten reichen bis dorthin, sonst klafft ein Spalt unter dem Dach.
ROOF_TILT, ROOF_Z, ROOF_T = math.radians(9), HH + 0.17, 0.05
HYC = (HY0 + HY1) / 2


def roof_under(y):
    return ROOF_Z + (y - HYC) * math.tan(ROOF_TILT) - ROOF_T / 2 / math.cos(ROOF_TILT)


bm = bmesh.new()
corrugated(bm, HX0, HX1, 0.06, HH, HY0, facing=-1)                      # Front
corrugated(bm, HX0, HX1, 0.06, roof_under(HY1) + 0.01, HY1, facing=1)   # Rückseite bis unter das Dach
new_object('ShedFront', bm, MAT['sheet'])
bm = bmesh.new()
# Seitenwände als Wellblech entlang y (Punkte tauschen x/y), Oberkante folgt der Dachneigung
for x, facing in ((HX0, -1), (HX1, 1)):
    sub = bmesh.new()
    corrugated(sub, HY0, HY1, 0.06, HH + 1.0, 0, facing=facing)
    for v in sub.verts:
        if v.co.z > HH:
            v.co.z = max(HH, roof_under(v.co.x) + 0.01)
        v.co = Vector((x + v.co.y, v.co.x, v.co.z))
    tmp = bpy.data.meshes.new('tmp')
    sub.to_mesh(tmp)
    sub.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
new_object('ShedSides', bm, MAT['sheet_rust'])

bm = bmesh.new()
# Rahmen: Eckpfosten, Traufe, Sockel
for x in (HX0, HX1):
    for y in (HY0, HY1):
        top = max(HH + 0.05, roof_under(y) + 0.02)  # hinten bis unter das ansteigende Dach
        add_box(bm, (0.07, 0.07, top), (x, y, top / 2))
add_box(bm, (HX1 - HX0 + 0.1, 0.08, 0.08), ((HX0 + HX1) / 2, HY0 - 0.02, HH), mat_index=0)
add_box(bm, (HX1 - HX0 + 0.1, 0.12, 0.12), ((HX0 + HX1) / 2, HY0, 0.12), mat_index=0)
new_object('ShedFrame', bm, MAT['steel'])

# Pultdach mit Überstand, nach hinten ansteigend (vorne tief über dem Rolltor)
bm = bmesh.new()
v = add_box(bm, (HX1 - HX0 + 0.3, HY1 - HY0 + 0.4, ROOF_T), ((HX0 + HX1) / 2, HYC, 0))
bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(ROOF_TILT, 3, 'X'), cent=((HX0 + HX1) / 2, HYC, 0))
bmesh.ops.translate(bm, vec=(0, 0, ROOF_Z), verts=v)
new_object('ShedRoof', bm, MAT['steel'])

# Rolltor mit Lamellen
bm = bmesh.new()
DX0, DX1, DZ1 = 0.05, 0.85, 1.05
add_box(bm, (DX1 - DX0, 0.03, DZ1), ((DX0 + DX1) / 2, HY0 - 0.03, DZ1 / 2 + 0.06), mat_index=0)
for k in range(12):
    z = 0.12 + k * 0.08
    add_box(bm, (DX1 - DX0 - 0.02, 0.02, 0.012), ((DX0 + DX1) / 2, HY0 - 0.05, z), mat_index=1)
add_box(bm, (DX1 - DX0 + 0.12, 0.1, 0.1), ((DX0 + DX1) / 2, HY0 - 0.06, DZ1 + 0.1), mat_index=1)  # Rollkasten
for x in (DX0 - 0.04, DX1 + 0.04):
    add_box(bm, (0.04, 0.06, DZ1 + 0.05), (x, HY0 - 0.05, (DZ1 + 0.05) / 2 + 0.06), mat_index=1)
hazard_stripes(bm, DX0, DX1 - 0.12, 0.07, 0.15, HY0 - 0.066, width=0.1, yellow=2, black=3)
new_object('RollerDoor', bm, [MAT['sheet_rust'], MAT['steel'], MAT['hazard_y'], MAT['hazard_k']])

# Schmutziges Fenster mit warmem Licht, Gitter davor
bm = bmesh.new()
add_box(bm, (0.42, 0.02, 0.3), (1.25, HY0 - 0.025, 0.95), mat_index=0)
for k in range(4):
    add_box(bm, (0.012, 0.03, 0.32), (1.07 + k * 0.12, HY0 - 0.045, 0.95), mat_index=1)
add_box(bm, (0.48, 0.05, 0.03), (1.25, HY0 - 0.04, 0.78), mat_index=1)
new_object('Window', bm, [MAT['window'], MAT['steel']])
empty('Lamp_Window', (1.25, HY0 - 0.3, 0.95))

# Lüfter an der Front
bm = bmesh.new()
add_cyl(bm, 0.14, 0.05, (1.25, HY0 - 0.03, 0.42), axis='Y', segs=24, mat_index=0)
for k in range(5):
    v = add_box(bm, (0.24, 0.012, 0.035), (0, 0, 0), mat_index=1)
    bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(k * math.pi / 5, 3, 'Y'))
    bmesh.ops.translate(bm, vec=(1.25, HY0 - 0.06, 0.42), verts=v)
new_object('Vent', bm, [MAT['steel'], MAT['steel_light']])

# Schornstein auf dem Dach
bm = bmesh.new()
add_cyl(bm, 0.07, 0.9, (1.3, 1.9, HH + 0.55), segs=16, mat_index=0)
add_cyl(bm, 0.1, 0.05, (1.3, 1.9, HH + 1.02), segs=16, mat_index=1)
add_torus(bm, 0.075, 0.012, (1.3, 1.9, HH + 0.4), mat_index=1)
new_object('Chimney', bm, [MAT['rust'], MAT['steel']])

# ---------------------------------------------------------------- Tanktürme (links hinten)
def tank(name, x, y, r, h):
    bm = bmesh.new()
    add_cyl(bm, r, h, (x, y, 0.06 + h / 2), segs=40, mat_index=0)
    d = bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=12, radius=r)['verts']
    bmesh.ops.delete(bm, geom=[v for v in d if v.co.z < -1e-4], context='VERTS')
    d = [v for v in bm.verts if v.is_valid and v in set(d)]
    bmesh.ops.scale(bm, vec=(1, 1, 0.35), verts=d)
    bmesh.ops.translate(bm, vec=(x, y, 0.06 + h), verts=d)
    for f in {f for v in d for f in v.link_faces}:
        f.material_index = 0
    for k in range(4):  # Bänder
        add_torus(bm, r + 0.012, 0.016, (x, y, 0.2 + k * (h - 0.3) / 3), segs=40, mat_index=1)
    add_cyl(bm, r + 0.05, 0.1, (x, y, 0.1), segs=40, mat_index=1)  # Sockel
    ob = new_object(name, bm, [MAT['tank'], MAT['rust']], smooth=True)
    # Rostflecken: einige Flächen auf Rost umfärben
    import random
    rnd = random.Random(hash(name) & 0xffff)
    for p in ob.data.polygons:
        if p.material_index == 0 and p.center.z < 0.06 + h and rnd.random() < 0.06 + 0.25 * max(0, 0.6 - p.center.z / h):
            p.material_index = 1
    # Leiter vorne
    bm = bmesh.new()
    ly = y - r - 0.05
    for lx in (x - 0.09, x + 0.09):
        add_box(bm, (0.018, 0.018, h + 0.25), (lx, ly, (h + 0.25) / 2 + 0.06))
    for k in range(int(h / 0.12)):
        add_box(bm, (0.18, 0.014, 0.014), (x, ly, 0.2 + k * 0.12))
    for k in range(4):  # Rückenschutz-Bögen
        add_torus(bm, 0.14, 0.008, (x, ly - 0.08, 0.9 + k * (h - 0.8) / 3), segs=16, rsegs=6)
    new_object(name + 'Ladder', bm, MAT['steel_light'])
    # Umlaufender Gitterrost auf Höhe des Tankrands, darauf das Geländer (die Pfosten stehen auf dem Rost;
    # die Kuppel ist am Rand schon r*0.35 tiefer als ihre Spitze)
    top = 0.06 + h + r * 0.35
    rim = 0.06 + h
    bm = bmesh.new()
    add_cyl(bm, r + 0.1, 0.025, (x, y, rim + 0.0125), segs=40)
    add_torus(bm, r + 0.1, 0.01, (x, y, rim + 0.02), segs=40, rsegs=6)
    new_object(name + 'Deck', bm, MAT['steel'])
    bm = bmesh.new()
    for z in (rim + 0.18, rim + 0.34):
        add_torus(bm, r + 0.08, 0.012, (x, y, z), segs=40, rsegs=6)
    for k in range(12):
        a = 2 * math.pi * k / 12
        add_box(bm, (0.015, 0.015, 0.34), (x + math.cos(a) * (r + 0.08), y + math.sin(a) * (r + 0.08), rim + 0.17))
    new_object(name + 'Rail', bm, MAT['steel'])
    # Warnleuchte oben
    bm = bmesh.new()
    s = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.05)['verts']
    bmesh.ops.translate(bm, vec=(x, y, top + 0.06), verts=s)
    new_object(name + 'Beacon', bm, MAT['beacon'], smooth=True)
    empty('Lamp_Beacon_' + name, (x, y, top + 0.1))


tank('TankA', -1.05, 2.15, 0.5, 2.1)
tank('TankB', 0.2, 2.9, 0.42, 1.75)

# ---------------------------------------------------------------- Rohrleitungen
bm = bmesh.new()
PIPE = 0.045
add_cyl(bm, PIPE, 1.6, (-1.05, 1.1, 0.28), axis='Y', segs=16)                     # Tank A -> vorne
add_cyl(bm, PIPE, 0.75, (-1.05, 0.72, 0.28), axis='Y', segs=16)
add_cyl(bm, PIPE, 1.3, (-0.45, 2.9, 0.45), axis='X', segs=16)                    # Tank B -> Tank A
add_cyl(bm, PIPE, 0.5, (-0.3, 2.3, 1.35), axis='X', segs=16)                     # Verbindung oben
add_cyl(bm, PIPE, 1.0, (-0.55, 2.3, 0.85), segs=16)
for loc in ((-1.05, 0.35, 0.28), (-1.05, 1.9, 0.28), (-0.55, 2.3, 1.35), (-0.55, 2.3, 0.35)):  # Flansche
    add_cyl(bm, PIPE * 1.5, 0.04, loc, axis='Y', segs=16, mat_index=1)
add_cyl(bm, PIPE * 0.9, 0.25, (-1.05, 0.35, 0.15), segs=16)                      # runter zur Zapfsäule
for loc in ((-1.05, 1.5, 0.28), (-0.2, 2.9, 0.45)):                               # Stützen
    add_box(bm, (0.05, 0.05, loc[2]), (loc[0], loc[1], loc[2] / 2), mat_index=1)
new_object('Pipes', bm, [MAT['rust'], MAT['steel']], smooth=True)
bm = bmesh.new()
for loc, axis in (((-1.05, 1.3, 0.4), 'Z'), ((-0.55, 2.3, 1.05), 'X')):           # Ventilräder
    add_torus(bm, 0.07, 0.012, loc, axis=axis, segs=20, rsegs=6)
    add_cyl(bm, 0.015, 0.14, (loc[0], loc[1], loc[2] - 0.06) if axis == 'Z' else loc, axis=axis, segs=8)
new_object('Valves', bm, MAT['pump'], smooth=True)

# ---------------------------------------------------------------- Vordach über der Einfahrt
CX0, CX1, CY0, CY1, CH = -1.75, -0.25, 0.05, 1.3, 1.45
bm = bmesh.new()
for x in (CX0 + 0.08, CX1 - 0.08):
    for y in (CY0 + 0.1, CY1 - 0.1):
        add_box(bm, (0.09, 0.09, CH), (x, y, CH / 2))                              # I-Träger vereinfacht
        add_box(bm, (0.16, 0.16, 0.03), (x, y, 0.075))
        add_box(bm, (0.14, 0.02, CH), (x, y, CH / 2))
add_box(bm, (CX1 - CX0, CY1 - CY0, 0.06), ((CX0 + CX1) / 2, (CY0 + CY1) / 2, CH + 0.03))
for y in (CY0 + 0.1, CY1 - 0.1):
    add_box(bm, (CX1 - CX0, 0.07, 0.12), ((CX0 + CX1) / 2, y, CH - 0.06))
new_object('Canopy', bm, MAT['steel'])
bm = bmesh.new()
add_box(bm, (CX1 - CX0 + 0.04, 0.05, 0.3), ((CX0 + CX1) / 2, CY0 - 0.025, CH + 0.12), mat_index=1)
hazard_stripes(bm, CX0, CX1 - 0.02, CH - 0.05, CH + 0.02, CY0 - 0.052, width=0.1, yellow=0, black=1)
new_object('CanopyFascia', bm, [MAT['hazard_y'], MAT['hazard_k']])

# Schriftzug FUEL (flackert im Spiel)
cu = bpy.data.curves.new('FuelText', 'FONT')
cu.body = 'FUEL'
cu.size = 0.26
cu.extrude = 0.015
cu.align_x = 'CENTER'
cu.align_y = 'CENTER'
t = bpy.data.objects.new('FuelText', cu)
scene.collection.objects.link(t)
t.location = ((CX0 + CX1) / 2, CY0 - 0.07, CH + 0.12)
t.rotation_euler = (math.pi / 2, 0, 0)
mesh_from(t, 'FuelSign', MAT['sign'])
empty('Lamp_Sign', ((CX0 + CX1) / 2, CY0 - 0.4, CH + 0.1))

# Strahler unter dem Vordach
bm = bmesh.new()
for x in (CX0 + 0.45, CX1 - 0.45):
    add_box(bm, (0.2, 0.12, 0.05), (x, 0.65, CH - 0.03), mat_index=1)
    add_box(bm, (0.17, 0.09, 0.01), (x, 0.65, CH - 0.06), mat_index=0)
new_object('CanopyLights', bm, [MAT['floodlight'], MAT['steel']])
empty('Lamp_Canopy', ((CX0 + CX1) / 2, 0.65, CH - 0.25))

# Warnleuchten an den Vordach-Ecken
bm = bmesh.new()
for x in (CX0 + 0.02, CX1 - 0.02):
    s = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.04)['verts']
    bmesh.ops.translate(bm, vec=(x, CY0, CH + 0.3), verts=s)
new_object('CanopyBeacons', bm, MAT['beacon'], smooth=True)

# ---------------------------------------------------------------- Zapfsäule
PX, PY = -1.0, 0.75
bm = bmesh.new()
add_box(bm, (0.5, 0.6, 0.08), (PX, PY, 0.1), mat_index=2)                           # Insel
hazard_stripes(bm, PX - 0.25, PX + 0.2, 0.06, 0.14, PY - 0.301, width=0.08, yellow=3, black=4)
add_box(bm, (0.3, 0.26, 0.78), (PX, PY, 0.53), mat_index=0)                        # Gehäuse
add_box(bm, (0.34, 0.3, 0.06), (PX, PY, 0.95), mat_index=1)                        # Kopf
add_box(bm, (0.2, 0.01, 0.12), (PX, PY - 0.135, 0.72), mat_index=5)                # Anzeige
add_box(bm, (0.08, 0.04, 0.12), (PX + 0.2, PY - 0.05, 0.55), mat_index=1)          # Zapfhalter
new_object('Pump', bm, [MAT['pump'], MAT['steel'], MAT['concrete_dark'], MAT['hazard_y'], MAT['hazard_k'],
                        MAT['display']])
# Schlauch als Kurve
cu = bpy.data.curves.new('Hose', 'CURVE')
cu.dimensions = '3D'
cu.bevel_depth = 0.018
cu.bevel_resolution = 3
sp = cu.splines.new('BEZIER')
pts = [(PX + 0.15, PY - 0.05, 0.8), (PX + 0.3, PY - 0.2, 0.3), (PX + 0.22, PY - 0.07, 0.55)]
sp.bezier_points.add(len(pts) - 1)
for bp, co in zip(sp.bezier_points, pts):
    bp.co = co
    bp.handle_left_type = bp.handle_right_type = 'AUTO'
hose = bpy.data.objects.new('Hose', cu)
scene.collection.objects.link(hose)
mesh_from(hose, 'PumpHose', MAT['rubber'])

# ---------------------------------------------------------------- Ölfässer
def drum(bm, x, y, z=0.06, lying=False, mi=0):
    if lying:
        add_cyl(bm, 0.11, 0.34, (x, y, z + 0.11), axis='X', segs=18, mat_index=mi)
        for dx in (-0.1, 0.1):
            add_torus(bm, 0.112, 0.01, (x + dx, y, z + 0.11), axis='X', segs=18, rsegs=5, mat_index=2)
    else:
        add_cyl(bm, 0.11, 0.34, (x, y, z + 0.17), segs=18, mat_index=mi)
        for dz in (0.07, 0.27):
            add_torus(bm, 0.112, 0.01, (x, y, z + dz), segs=18, rsegs=5, mat_index=2)


bm = bmesh.new()
drum(bm, 1.45, 0.12, mi=0)
drum(bm, 1.2, 0.08, mi=1)
drum(bm, 1.33, 0.1, z=0.4, mi=0)
drum(bm, -1.62, 1.55, mi=1)
drum(bm, 0.2, 0.15, lying=True, mi=0)
new_object('Drums', bm, [MAT['hazard_y'], MAT['rust'], MAT['steel']], smooth=True)

# Laterne an der Ecke
bm = bmesh.new()
add_cyl(bm, 0.03, 2.0, (1.72, 0.2, 1.06), segs=10, mat_index=0)
add_box(bm, (0.3, 0.04, 0.04), (1.6, 0.2, 2.04), mat_index=0)
add_box(bm, (0.16, 0.12, 0.06), (1.47, 0.2, 2.0), mat_index=0)
add_box(bm, (0.13, 0.09, 0.01), (1.47, 0.2, 1.965), mat_index=1)
new_object('LampPost', bm, [MAT['steel'], MAT['floodlight']])
empty('Lamp_Post', (1.47, 0.1, 1.8))

# ---------------------------------------------------------------- Export
for ob in list(scene.collection.objects):
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          use_selection=False, export_cameras=False, export_lights=False)
print('EXPORTED', OUT, os.path.getsize(OUT))

# ---------------------------------------------------------------- Vorschau
if PREVIEW:
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.render.resolution_x, scene.render.resolution_y = 1100, 700
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.28, 0.16, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
    bm = bmesh.new()
    add_box(bm, (30, 30, 0.1), (0, 5, -0.05))
    new_object('PreviewGround', bm, material('Ground', (0.35, 0.16, 0.08), 0, 1))
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.lens = 35
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.3, -5.2, 1.6)
    cam.rotation_euler = (Vector((0, 1.2, 0.9)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.energy = 2.5
    so = bpy.data.objects.new('Sun', sun)
    so.rotation_euler = (math.radians(50), math.radians(-25), math.radians(-30))
    scene.collection.objects.link(so)
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', PREVIEW)
