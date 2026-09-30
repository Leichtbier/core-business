"""Baut die sechs Items (und einen Nanobot für den Effekt) in Blender, exportiert items.glb und rendert Icons.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/items.py -- [--icons] [--preview pfad.png]

  --icons    rendert assets/items/<name>.png (256 x 256, transparent) für Shop und HUD
  --preview  Übersichtsbild aller Items nebeneinander

Konventionen für three.js (1 Einheit = 1 Tile = 50 px, der Pod ist im Spiel ca. 0.56 breit):
  - Jedes Item ist ein Empty "Item_<Name>" im Ursprung mit den Teilen als Kindern; Boden bei z = 0,
    Vorderseite zeigt nach -Y (in three.js +Z)
  - Animierte Teile: Quantum_Ring0..2 und Matter_Ring0..1 (Ursprung im Zentrum des Rings),
    Dynamite_Spark (Funke an der Zündschnur), Nanobot (einzelner Roboter für den Schwarm)
  - Leuchtmaterialien, die das Spiel ansteuert: FuseSpark, BlinkRed, QuantumGlow, MatterGlow, NanoGlow, FuelGlow
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from bl_helpers import add_box, add_cyl, add_sphere, add_torus, empty, material, mesh_from, reset  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'items.glb')
ICON_DIR = os.path.join(HERE, 'items')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
ICONS = '--icons' in argv
scene = reset()


def glass(name, color, alpha):
    m = material(name, color, 0.0, 0.05)
    m.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = alpha
    m.surface_render_method = 'BLENDED'
    return m


MAT = {
    'steel': material('Steel', (0.5, 0.51, 0.53), 0.8, 0.35),
    'dark': material('DarkSteel', (0.06, 0.06, 0.065), 0.6, 0.5),
    'rubber': material('Rubber', (0.02, 0.02, 0.02), 0.0, 0.9),
    'brass': material('Brass', (0.55, 0.36, 0.1), 0.9, 0.35),
    'copper': material('Copper', (0.6, 0.24, 0.1), 0.9, 0.3),
    'white': material('WhitePaint', (0.8, 0.8, 0.78), 0.1, 0.35),
    'hazard': material('HazardYellow', (0.85, 0.6, 0.03), 0.2, 0.5),
    'black': material('Black', (0.015, 0.015, 0.015), 0.1, 0.6),
    # Reservetank
    'fuel_paint': material('FuelTankPaint', (0.72, 0.16, 0.03), 0.4, 0.35),
    'fuel_glow': material('FuelGlow', (0.4, 0.2, 0.02), 0.0, 0.2, emit=(1.0, 0.55, 0.08), strength=4),
    'gauge': material('GaugeFace', (0.92, 0.9, 0.84), 0.0, 0.4),
    'needle': material('Needle', (0.8, 0.05, 0.02), 0.0, 0.4),
    # Nanobots
    'nano_glass': glass('NanoGlass', (0.55, 0.85, 1.0), 0.3),
    'nano_glow': material('NanoGlow', (0.1, 0.5, 0.7), 0.0, 0.2, emit=(0.25, 0.9, 1.0), strength=6),
    'medical': material('MedicalGreen', (0.08, 0.55, 0.25), 0.1, 0.4, emit=(0.1, 0.9, 0.35), strength=1.5),
    # Dynamit
    'dynamite': material('DynamiteRed', (0.62, 0.05, 0.03), 0.0, 0.55),
    'paper': material('Paper', (0.78, 0.7, 0.55), 0.0, 0.8),
    'fuse': material('Fuse', (0.28, 0.2, 0.12), 0.0, 0.9),
    'spark': material('FuseSpark', (1.0, 0.7, 0.2), 0.0, 0.2, emit=(1.0, 0.65, 0.15), strength=12),
    'tape': material('BlackTape', (0.03, 0.03, 0.03), 0.0, 0.45),
    # C4
    'putty': material('Putty', (0.72, 0.68, 0.55), 0.0, 0.85),
    'wrap': material('OliveWrap', (0.22, 0.25, 0.12), 0.0, 0.5),
    'display': material('C4Display', (0.1, 0.01, 0.01), 0.0, 0.3, emit=(1.0, 0.1, 0.04), strength=5),
    'led': material('BlinkRed', (0.5, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.05, 0.02), strength=10),
    'wire_r': material('WireRed', (0.7, 0.04, 0.02), 0.0, 0.5),
    'wire_b': material('WireBlue', (0.04, 0.15, 0.7), 0.0, 0.5),
    # Quantenteleporter (bastelig, instabil)
    'q_glow': material('QuantumGlow', (0.5, 0.1, 0.7), 0.0, 0.2, emit=(0.85, 0.25, 1.0), strength=9),
    'q_body': material('QuantumBody', (0.16, 0.12, 0.2), 0.6, 0.45),
    'q_ring': material('QuantumRing', (0.4, 0.2, 0.5), 0.8, 0.3),
    # Materietransmitter (sauber, stabil)
    'm_glow': material('MatterGlow', (0.1, 0.4, 0.7), 0.0, 0.2, emit=(0.2, 0.75, 1.0), strength=9),
    'm_glass': glass('MatterGlass', (0.7, 0.9, 1.0), 0.25),
    'm_status': material('StatusGreen', (0.05, 0.4, 0.1), 0.0, 0.3, emit=(0.2, 1.0, 0.35), strength=5),
}


# ---------------------------------------------------------------- Helfer
def obj(name, bm, mats, parent, smooth=True, origin=(0, 0, 0), sharp=40):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    if smooth:
        me.set_sharp_from_angle(angle=math.radians(sharp))
    for m in (mats if isinstance(mats, list) else [mats]):
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.location = origin
    ob.parent = parent
    return ob


def tube(name, pts, radius, mat, parent, res=10):
    """Schlauch/Kabel/Zündschnur entlang einer Bezier-Kurve (automatische Tangenten)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, co in zip(sp.bezier_points, pts):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    ob = mesh_from(ob, name, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.parent = parent
    return ob


def label(name, body, size, loc, mat, parent, rot=(math.pi / 2, 0, 0), extrude=0.002):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    t = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(t)
    t.location = loc
    t.rotation_euler = rot
    t = mesh_from(t, name, mat)
    t.parent = parent
    return t


def root(name):
    return empty(name, (0, 0, 0))


def bevel_box(bm, size, loc, mat_index=0, w=0.006):
    v = add_box(bm, size, loc, mat_index=mat_index)
    edges = list({e for x in v for e in x.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=w, segments=2, affect='EDGES', profile=0.5)


# ================================================================ Reservetank (F)
# Kompakte Druckgasflasche: orange lackiert, Schauglas mit leuchtendem Treibstoff, Ventil mit Handrad,
# Manometer an der Schulter und ein Tragebügel.
R = root('Item_Fuel')
bm = bmesh.new()
H0, H1, RAD = 0.02, 0.2, 0.068
add_cyl(bm, RAD, H1 - H0, (0, 0, (H0 + H1) / 2), segs=32)                       # Körper
v = add_sphere(bm, RAD, (0, 0, H1), segs=32, rings=16)                          # Kuppel
for x in v:
    if x.co.z < H1:
        x.co.z = H1                                                             # untere Hälfte plattdrücken
add_cyl(bm, RAD * 0.92, 0.02, (0, 0, 0.01), segs=32, mat_index=1)               # Standring
add_cyl(bm, RAD + 0.003, 0.022, (0, 0, 0.055), segs=32, mat_index=2)            # Warnband
add_cyl(bm, RAD + 0.003, 0.006, (0, 0, 0.07), segs=32, mat_index=3)
add_cyl(bm, RAD + 0.003, 0.006, (0, 0, 0.04), segs=32, mat_index=3)
obj('FuelBody', bm, [MAT['fuel_paint'], MAT['dark'], MAT['hazard'], MAT['black']], R)

bm = bmesh.new()
add_box(bm, (0.026, 0.01, 0.085), (0, -RAD + 0.002, 0.135), mat_index=0)        # Schauglas-Rahmen
add_box(bm, (0.016, 0.012, 0.075), (0, -RAD - 0.001, 0.13), mat_index=1)        # Treibstoffstand
obj('FuelSight', bm, [MAT['dark'], MAT['fuel_glow']], R, smooth=False)

bm = bmesh.new()
add_cyl(bm, 0.018, 0.03, (0, 0, H1 + RAD - 0.005), segs=16)                     # Hals
add_cyl(bm, 0.024, 0.012, (0, 0, H1 + RAD + 0.014), segs=6, mat_index=1)        # Ventilkörper
add_cyl(bm, 0.008, 0.035, (0.03, 0, H1 + RAD + 0.014), axis='X', segs=12)       # Auslass
add_cyl(bm, 0.011, 0.01, (0.05, 0, H1 + RAD + 0.014), axis='X', segs=12, mat_index=1)
add_cyl(bm, 0.004, 0.02, (0, 0, H1 + RAD + 0.03), segs=8)                       # Spindel
add_torus(bm, 0.022, 0.004, (0, 0, H1 + RAD + 0.04), segs=24, rsegs=6, mat_index=2)  # Handrad
for a in range(3):
    ang = a * 2 * math.pi / 3
    add_box(bm, (0.022, 0.004, 0.004), (0.011 * math.cos(ang), 0.011 * math.sin(ang), H1 + RAD + 0.04),
            rot=Matrix.Rotation(ang, 3, 'Z'), mat_index=2)
obj('FuelValve', bm, [MAT['steel'], MAT['brass'], MAT['needle']], R)

# Tragebügel über dem Ventil
tube('FuelHandle', [(-0.05, 0, H1 + 0.025), (-0.045, 0, H1 + 0.075), (0, 0, H1 + 0.095),
                    (0.045, 0, H1 + 0.075), (0.05, 0, H1 + 0.025)], 0.006, MAT['dark'], R)

# Manometer an der Schulter (schaut nach vorne)
bm = bmesh.new()
gz, gx = H1 + 0.02, -0.035
add_cyl(bm, 0.022, 0.012, (gx, -RAD + 0.004, gz), axis='Y', segs=24)
add_cyl(bm, 0.018, 0.002, (gx, -RAD - 0.003, gz), axis='Y', segs=24, mat_index=1)
add_box(bm, (0.002, 0.002, 0.015), (gx + 0.004, -RAD - 0.005, gz + 0.004),
        rot=Matrix.Rotation(-0.6, 3, 'Y'), mat_index=2)
obj('FuelGauge', bm, [MAT['steel'], MAT['gauge'], MAT['needle']], R)
label('FuelLabel', '25L', 0.019, (0, -RAD - 0.0045, 0.055), MAT['black'], R)                  # auf dem Warnband

# ================================================================ Nanobots (R)
# Injektorkapsel: Glaszylinder mit einem leuchtenden Schwarm, weiße Endkappen mit grünem Kreuz,
# oben eine Injektionsdüse.
R = root('Item_Nanobots')
bm = bmesh.new()
add_cyl(bm, 0.062, 0.035, (0, 0, 0.0175), segs=32)                              # Bodenkappe
add_cyl(bm, 0.066, 0.008, (0, 0, 0.004), segs=32, mat_index=1)
add_cyl(bm, 0.062, 0.03, (0, 0, 0.19), segs=32)                                 # Deckel
add_cyl(bm, 0.03, 0.03, (0, 0, 0.22), r2=0.012, segs=24, mat_index=1)           # Düsenkegel
add_cyl(bm, 0.004, 0.03, (0, 0, 0.248), segs=8, mat_index=1)                    # Nadel
for a in range(4):                                                               # Streben ums Glas
    ang = a * math.pi / 2 + math.pi / 4
    add_box(bm, (0.008, 0.008, 0.14), (0.062 * math.cos(ang), 0.062 * math.sin(ang), 0.105), mat_index=1)
obj('NanoCaps', bm, [MAT['white'], MAT['steel']], R)

bm = bmesh.new()
add_cyl(bm, 0.056, 0.14, (0, 0, 0.105), segs=32)
obj('NanoGlass', bm, MAT['nano_glass'], R)

bm = bmesh.new()
rnd = random.Random(4)
for _ in range(70):                                                              # der Schwarm im Glas
    r, a = 0.045 * math.sqrt(rnd.random()), rnd.random() * 2 * math.pi
    add_sphere(bm, 0.004 + rnd.random() * 0.004, (r * math.cos(a), r * math.sin(a), 0.045 + rnd.random() * 0.12),
               segs=6, rings=4)
obj('NanoSwarm', bm, MAT['nano_glow'], R)

bm = bmesh.new()
add_box(bm, (0.012, 0.004, 0.034), (0, -0.063, 0.019))                          # grünes Kreuz vorne
add_box(bm, (0.034, 0.004, 0.012), (0, -0.063, 0.019))
obj('NanoCross', bm, MAT['medical'], R, smooth=False)

# Einzelner Nanobot für den Reparatur-Effekt: kleiner Käfer mit Leuchtauge und sechs Beinen
N = root('Nanobot')
bm = bmesh.new()
v = add_sphere(bm, 0.5, (0, 0, 0), segs=16, rings=10)
bmesh.ops.scale(bm, vec=(1.2, 0.9, 0.7), verts=v)
add_cyl(bm, 0.18, 0.2, (0.5, 0, 0.05), axis='X', segs=12, mat_index=1)          # Kopf
obj('NanobotBody', bm, [MAT['white'], MAT['steel']], N)
bm = bmesh.new()
add_sphere(bm, 0.13, (0.62, 0, 0.08), segs=10, rings=6)
add_box(bm, (0.5, 0.35, 0.05), (-0.05, 0, 0.33))                                # Leuchtstreifen auf dem Rücken
obj('NanobotEye', bm, MAT['nano_glow'], N)
for i in range(6):
    s = 1 if i < 3 else -1
    x = (i % 3 - 1) * 0.35
    tube(f'NanobotLeg{i}', [(x, s * 0.35, 0), (x + 0.05, s * 0.75, 0.2), (x + 0.1, s * 0.95, -0.35)],
         0.045, MAT['dark'], N, res=4)

# ================================================================ Dynamit (X)
# Drei Stangen im Bündel (liegend), schwarzes Klebeband, eine gewundene Zündschnur mit Funken
# und eine alte Zeitschaltuhr als Zugabe.
R = root('Item_Dynamite')
L, SR = 0.26, 0.028
bm = bmesh.new()
sticks = [(-SR, SR), (SR, SR), (0, SR * (1 + math.sqrt(3)))]
for (y, z) in sticks:
    add_cyl(bm, SR, L, (0, y, z), axis='X', segs=20)
    add_cyl(bm, SR * 0.96, 0.004, (L / 2 + 0.001, y, z), axis='X', segs=20, mat_index=1)    # Papierkappen
    add_cyl(bm, SR * 0.96, 0.004, (-L / 2 - 0.001, y, z), axis='X', segs=20, mat_index=1)
obj('DynamiteSticks', bm, [MAT['dynamite'], MAT['paper']], R)

bm = bmesh.new()
cz = SR * (1 + math.sqrt(3)) / 2 + SR * 0.25
for x in (-0.07, 0.07):                                                           # Klebebänder
    v = add_cyl(bm, SR * 2.25, 0.028, (x, 0, cz), axis='X', segs=24)
    for p in v:
        p.co.z = cz + (p.co.z - cz) * 1.05
obj('DynamiteTape', bm, MAT['tape'], R)
label('DynamiteText', 'TNT', 0.024, (0, -SR * 2.2, cz + 0.008), MAT['black'], R)

# Zeitschaltuhr (Wecker) vorne auf dem Bündel
bm = bmesh.new()
ux, uz = 0.0, cz + 0.004
add_cyl(bm, 0.028, 0.014, (ux, -SR * 2.25 - 0.004, uz), axis='Y', segs=24)
add_cyl(bm, 0.024, 0.002, (ux, -SR * 2.25 - 0.012, uz), axis='Y', segs=24, mat_index=1)
add_sphere(bm, 0.009, (ux - 0.018, -SR * 2.25, uz + 0.026), segs=8, rings=6, mat_index=2)  # Glocken
add_sphere(bm, 0.009, (ux + 0.018, -SR * 2.25, uz + 0.026), segs=8, rings=6, mat_index=2)
add_box(bm, (0.0025, 0.002, 0.018), (ux, -SR * 2.25 - 0.014, uz + 0.007), mat_index=3)    # Zeiger
add_box(bm, (0.013, 0.002, 0.0025), (ux + 0.006, -SR * 2.25 - 0.014, uz), mat_index=3)
obj('DynamiteClock', bm, [MAT['steel'], MAT['gauge'], MAT['brass'], MAT['black']], R)
tube('DynamiteWire', [(ux + 0.02, -SR * 2.2, uz - 0.02), (0.07, -SR * 2.3, SR * 0.6), (0.1, -SR, SR * 0.4)],
     0.0025, MAT['wire_r'], R, res=6)

# Zündschnur aus dem oberen Stangenende, geschwungen nach oben
top = sticks[2]
fuse_end = (L / 2 + 0.07, top[0] - 0.01, top[1] + 0.1)
tube('DynamiteFuse', [(L / 2 - 0.005, top[0], top[1]), (L / 2 + 0.035, top[0] - 0.01, top[1] + 0.005),
                      (L / 2 + 0.06, top[0] + 0.01, top[1] + 0.05), fuse_end], 0.0035, MAT['fuse'], R)
bm = bmesh.new()
for i in range(7):                                                                # sternförmiger Funke
    d = Vector((rnd.random() - 0.5, rnd.random() - 0.5, rnd.random() - 0.3)).normalized()
    v = add_cyl(bm, 0.002, 0.03, (0, 0, 0.015), segs=4, r2=0.0)
    bmesh.ops.rotate(bm, verts=v, matrix=Vector((0, 0, 1)).rotation_difference(d).to_matrix())
add_sphere(bm, 0.008, (0, 0, 0), segs=8, rings=6)
obj('Dynamite_Spark', bm, MAT['spark'], R, smooth=False, origin=fuse_end)

# ================================================================ Plastiksprengstoff / C4 (C)
# Zwei Blöcke Knetmasse in olivgrüner Folie, verschnürt, obenauf ein Zünder mit rotem Display,
# blinkender LED, Antenne und zwei Kabeln, die in der Masse stecken.
R = root('Item_C4')
BL, BW, BH = 0.22, 0.09, 0.034
bm = bmesh.new()
for k in range(2):
    bevel_box(bm, (BL, BW, BH), (0, 0, BH / 2 + k * (BH + 0.002)), w=0.008)
obj('C4Blocks', bm, MAT['wrap'], R, sharp=30)
bm = bmesh.new()
add_box(bm, (BL * 0.9, 0.004, BH * 0.7), (0, -BW / 2 - 0.0005, BH / 2))                 # Etiketten
add_box(bm, (BL * 0.9, 0.004, BH * 0.7), (0, -BW / 2 - 0.0005, BH * 1.5 + 0.002))
obj('C4Labels', bm, MAT['putty'], R, smooth=False)
label('C4Text0', 'C-4  PLASTIC EXPLOSIVE', 0.011, (0, -BW / 2 - 0.003, BH / 2), MAT['black'], R)
label('C4Text1', 'HANDLE WITH CARE', 0.011, (0, -BW / 2 - 0.003, BH * 1.5 + 0.002), MAT['black'], R)
bm = bmesh.new()
for x in (-0.075, 0.075):                                                          # Spanngurte
    add_box(bm, (0.018, BW + 0.008, BH * 2 + 0.01), (x, 0, BH + 0.001))
obj('C4Straps', bm, MAT['tape'], R, smooth=False)

bm = bmesh.new()
DZ = BH * 2 + 0.002
bevel_box(bm, (0.085, 0.055, 0.028), (0.02, 0, DZ + 0.014), w=0.004)              # Zündergehäuse
add_cyl(bm, 0.003, 0.09, (0.055, 0.015, DZ + 0.07), segs=6)                       # Antenne
add_sphere(bm, 0.005, (0.055, 0.015, DZ + 0.116), segs=8, rings=6)
obj('C4Detonator', bm, MAT['dark'], R, sharp=30)
bm = bmesh.new()
add_box(bm, (0.05, 0.003, 0.014), (0.012, -0.028, DZ + 0.016))
obj('C4Screen', bm, MAT['display'], R, smooth=False)
label('C4Digits', '0:03', 0.012, (0.012, -0.0305, DZ + 0.0155), MAT['black'], R, extrude=0.0008)
bm = bmesh.new()
add_sphere(bm, 0.006, (0.05, -0.024, DZ + 0.022), segs=10, rings=6)
obj('C4_LED', bm, MAT['led'], R)
tube('C4WireRed', [(-0.02, -0.01, DZ + 0.02), (-0.05, -0.02, DZ + 0.04), (-0.07, -0.03, DZ + 0.003)],
     0.0025, MAT['wire_r'], R, res=6)
tube('C4WireBlue', [(-0.02, 0.012, DZ + 0.015), (-0.045, 0.02, DZ + 0.035), (-0.06, 0.028, DZ + 0.002)],
     0.0025, MAT['wire_b'], R, res=6)

# ================================================================ Quantenteleporter (Q)
# Instabiler Eigenbau: ein violett glühender Kern in einem Käfig aus Kupferspulen, darum drei
# schief gelagerte Ringe, die im Spiel unruhig taumeln. Ein Kabel hängt lose heraus.
R = root('Item_Quantum')
CZ = 0.16
bm = bmesh.new()
add_cyl(bm, 0.075, 0.03, (0, 0, 0.015), segs=6)                                   # Sockel (sechseckig)
add_cyl(bm, 0.06, 0.05, (0, 0, 0.055), r2=0.035, segs=6)
add_cyl(bm, 0.03, 0.015, (0, 0, 0.087), segs=16, mat_index=1)
for a in range(3):                                                                 # Käfigstreben
    ang = a * 2 * math.pi / 3 + 0.3
    tube(f'QuantumStrut{a}', [(0.03 * math.cos(ang), 0.03 * math.sin(ang), 0.09),
                              (0.065 * math.cos(ang), 0.065 * math.sin(ang), CZ),
                              (0.02 * math.cos(ang), 0.02 * math.sin(ang), CZ + 0.075)], 0.005, MAT['q_body'], R, res=6)
add_cyl(bm, 0.018, 0.012, (0, 0, CZ + 0.075), segs=12, mat_index=1)               # Kappe
obj('QuantumBase', bm, [MAT['q_body'], MAT['brass']], R, sharp=30)
bm = bmesh.new()
for k in range(4):                                                                 # Spulenwicklung am Sockel
    add_torus(bm, 0.033 - k * 0.001, 0.0035, (0, 0, 0.098 + k * 0.007), segs=20, rsegs=6)
obj('QuantumCoil', bm, MAT['copper'], R)
bm = bmesh.new()
v = add_sphere(bm, 0.038, (0, 0, 0), segs=20, rings=12)
for p in v:                                                                        # unruhige Oberfläche
    p.co *= 1 + 0.12 * math.sin(p.co.x * 150) * math.cos(p.co.z * 130)
obj('QuantumCore', bm, MAT['q_glow'], R, origin=(0, 0, CZ))
tilts = [(0.5, 0.2), (-0.35, 0.9), (1.2, -0.6)]
for i, (tx, ty) in enumerate(tilts):
    bm = bmesh.new()
    v = add_torus(bm, 0.075 + i * 0.013, 0.004, (0, 0, 0), segs=40, rsegs=6)
    bmesh.ops.rotate(bm, verts=v, matrix=(Matrix.Rotation(tx, 3, 'X') @ Matrix.Rotation(ty, 3, 'Y')))
    obj(f'Quantum_Ring{i}', bm, MAT['q_ring'], R, origin=(0, 0, CZ))
tube('QuantumCable', [(0.05, -0.02, 0.07), (0.09, -0.05, 0.05), (0.1, -0.03, 0.012), (0.13, -0.05, 0.004)],
     0.004, MAT['wire_r'], R, res=6)
bm = bmesh.new()
add_box(bm, (0.035, 0.003, 0.02), (0, -0.0555, 0.055), rot=Matrix.Rotation(-0.55, 3, 'X'))  # Warnaufkleber
obj('QuantumSticker', bm, MAT['hazard'], R, smooth=False)

# ================================================================ Materietransmitter (M)
# Die ausgereifte Version: weißes Gehäuse, blauer Kern unter einer Glaskuppel, drei Emitterstifte
# und zwei exakt ausgerichtete Ringe; grüne Statusleiste.
R = root('Item_Matter')
bm = bmesh.new()
add_cyl(bm, 0.085, 0.022, (0, 0, 0.011), segs=40)                                 # Fuß
add_cyl(bm, 0.075, 0.07, (0, 0, 0.057), r2=0.06, segs=40)                          # Gehäuse
add_cyl(bm, 0.064, 0.008, (0, 0, 0.096), segs=40, mat_index=1)                     # Zierring
for a in range(3):                                                                  # Emitterstifte
    ang = a * 2 * math.pi / 3 + math.pi / 2
    x, y = 0.055 * math.cos(ang), 0.055 * math.sin(ang)
    add_cyl(bm, 0.006, 0.13, (x, y, 0.16), segs=12, mat_index=1)
    add_sphere(bm, 0.009, (x, y, 0.228), segs=10, rings=6, mat_index=2)
obj('MatterBase', bm, [MAT['white'], MAT['steel'], MAT['m_glow']], R)
bm = bmesh.new()
for x in (-0.03, -0.015, 0.0, 0.015, 0.03):
    add_box(bm, (0.01, 0.004, 0.012), (x, -0.07, 0.05))
obj('MatterStatus', bm, MAT['m_status'], R, smooth=False)
bm = bmesh.new()
add_sphere(bm, 0.03, (0, 0, 0), segs=20, rings=12)
obj('MatterCore', bm, MAT['m_glow'], R, origin=(0, 0, 0.14))
bm = bmesh.new()
v = add_sphere(bm, 0.045, (0, 0, 0.1), segs=24, rings=12)
bmesh.ops.delete(bm, geom=[x for x in v if x.co.z < 0.099], context='VERTS')
bmesh.ops.scale(bm, vec=(1, 1, 1.9), verts=[x for x in bm.verts], space=Matrix.Translation((0, 0, -0.1)))
obj('MatterDome', bm, MAT['m_glass'], R)
for i, z in enumerate((0.16, 0.205)):
    bm = bmesh.new()
    add_torus(bm, 0.07, 0.005, (0, 0, 0), segs=48, rsegs=8)
    obj(f'Matter_Ring{i}', bm, MAT['steel'], R, origin=(0, 0, z))


# ================================================================ Export
os.makedirs(ICON_DIR, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          use_selection=False, export_cameras=False, export_lights=False)
print('EXPORTED', OUT, os.path.getsize(OUT))

ITEMS = ['Item_Fuel', 'Item_Nanobots', 'Item_Dynamite', 'Item_C4', 'Item_Quantum', 'Item_Matter']


def descendants(ob):
    out = []
    for c in ob.children:
        out += [c] + descendants(c)
    return out


def setup_render(size):
    # Leuchtmaterialien für die Icons dämpfen, sonst werden sie ohne Bloom einfach weiß
    for m in bpy.data.materials:
        if m.node_tree and 'Principled BSDF' in m.node_tree.nodes:
            m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value *= 0.3
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.22, 0.18, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, loc, energy, color, size_ in (('Key', (-0.6, -0.9, 0.9), 40, (1, 0.9, 0.8), 0.5),
                                            ('Rim', (0.7, 0.8, 0.6), 30, (0.7, 0.8, 1), 0.4),
                                            ('Fill', (0.9, -0.6, 0.1), 10, (1, 0.85, 0.75), 0.6)):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.color, light.size = energy, color, size_
        lo = bpy.data.objects.new(name, light)
        lo.location = loc
        lo.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)
    return cam


def frame(cam, obs, fill=0.82):
    """Kamera schräg von vorne oben auf die Bounding-Sphere der Objekte richten."""
    pts = [ob.matrix_world @ Vector(c) for ob in obs if ob.type == 'MESH' for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c, r = (lo + hi) / 2, (hi - lo).length / 2
    fov = 2 * math.atan(18 / cam.data.lens)
    d = Vector((-0.45, -1, 0.5)).normalized()
    cam.location = c + d * (r / math.sin(fov / 2) * fill)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


if ICONS or PREVIEW:
    bpy.data.objects['Nanobot'].location = (10, 0, 0)   # nicht mit ins Bild
    cam = setup_render((256, 256))
    if ICONS:
        for name in ITEMS:
            for other in ITEMS:
                for ob in [bpy.data.objects[other]] + descendants(bpy.data.objects[other]):
                    ob.hide_render = other != name
            frame(cam, descendants(bpy.data.objects[name]))
            scene.render.filepath = os.path.join(ICON_DIR, name[5:].lower() + '.png')
            bpy.ops.render.render(write_still=True)
            print('ICON', scene.render.filepath)
    if PREVIEW:
        for i, name in enumerate(ITEMS):
            bpy.data.objects[name].location = ((i - 2.5) * 0.3, 0, 0)
            for ob in [bpy.data.objects[name]] + descendants(bpy.data.objects[name]):
                ob.hide_render = False
        bpy.data.objects['Nanobot'].location = (0.95, -0.1, 0.02)
        bpy.data.objects['Nanobot'].scale = (0.06, 0.06, 0.06)
        bpy.context.view_layer.update()
        scene.render.resolution_x, scene.render.resolution_y = 1600, 500
        scene.render.film_transparent = False
        scene.cycles.samples = 64
        pts = [o for n in ITEMS for o in descendants(bpy.data.objects[n])]
        cam.data.lens = 50
        pts_all = [ob.matrix_world @ Vector(c) for ob in pts if ob.type == 'MESH' for c in ob.bound_box]
        cx = sum(p.x for p in pts_all) / len(pts_all)
        cam.location = (cx, -2.6, 0.8)
        cam.rotation_euler = (Vector((cx, 0, 0.12)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        print('PREVIEW', PREVIEW)
