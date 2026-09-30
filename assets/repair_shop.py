"""Baut die Reparaturwerkstatt (industriell, düster) in Blender und exportiert sie als repair_shop.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/repair_shop.py -- [--preview pfad.png]

Konventionen für three.js (1 Einheit = 1 Tile):
  - Ursprung: Mitte der Grundfläche (Spalten 30..32 -> x -1.5..1.5), Boden bei z = 0
  - Vorderseite zeigt nach -Y, Front bei y = 0; Einfahrt bei x = 0 (Spalte 31 löst das Spiel aus)
  - Im Original werden hier auch die Items verkauft: der Container links zeigt Dynamit, Kanister, Ersatzteile
  - Materialien "SignGlow" und "WeldGlow" flackern im Spiel, Empties "Lamp_*" werden zu Lichtern
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from bl_helpers import (add_box, add_cyl, add_sphere, add_torus, args, corrugated, corrugated_side,  # noqa: E402
                        empty, export, hazard_stripes, material, new_object, preview, reset, rust_patches, text)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'repair_shop.glb')
PREVIEW = args()
reset()

MAT = {
    'concrete': material('Concrete', (0.15, 0.145, 0.14), 0.0, 0.95),
    'concrete_dark': material('ConcreteDark', (0.08, 0.075, 0.07), 0.0, 0.95),
    'sheet': material('CorrugatedSheet', (0.12, 0.125, 0.13), 0.55, 0.7),
    'sheet_rust': material('CorrugatedRust', (0.2, 0.085, 0.035), 0.3, 0.85),
    'container': material('ContainerGreen', (0.08, 0.12, 0.09), 0.4, 0.75),
    'steel': material('DarkSteel', (0.08, 0.08, 0.09), 0.7, 0.55),
    'steel_light': material('Steel', (0.33, 0.33, 0.34), 0.8, 0.4),
    'rust': material('Rust', (0.26, 0.09, 0.03), 0.25, 0.9),
    'robot': material('RobotOrange', (0.42, 0.16, 0.02), 0.4, 0.5),
    'hazard_y': material('HazardYellow', (0.62, 0.42, 0.02), 0.2, 0.6),
    'hazard_k': material('HazardBlack', (0.02, 0.02, 0.02), 0.2, 0.6),
    'interior': material('DarkInterior', (0.012, 0.01, 0.01), 0.0, 1.0),
    'wood': material('DarkWood', (0.12, 0.07, 0.035), 0.0, 0.85),
    'dynamite': material('DynamiteRed', (0.35, 0.03, 0.02), 0.0, 0.6),
    'canister': material('CanisterRed', (0.3, 0.04, 0.02), 0.3, 0.5),
    'rubber': material('Rubber', (0.02, 0.02, 0.02), 0.0, 0.9),
    'coolant': material('CoolantGlow', (0.05, 0.15, 0.08), 0.0, 0.3, emit=(0.3, 1.0, 0.45), strength=1.2),
    'weld': material('WeldGlow', (0.2, 0.3, 0.5), 0.0, 0.3, emit=(0.55, 0.75, 1.0), strength=6),
    'sign': material('SignGlow', (0.15, 0.02, 0.02), 0.0, 0.4, emit=(1.0, 0.18, 0.12), strength=7),
    'beacon': material('BeaconRed', (0.4, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.05, 0.02), strength=7),
    'floodlight': material('Floodlight', (0.8, 0.75, 0.6), 0.0, 0.2, emit=(1.0, 0.85, 0.55), strength=8),
    'window': material('GrimyWindow', (0.1, 0.07, 0.03), 0.0, 0.3, emit=(0.8, 0.42, 0.13), strength=0.45),
}

# ---------------------------------------------------------------- Betonplatte
bm = bmesh.new()
add_box(bm, (3.4, 3.0, 0.06), (0, 1.4, 0.03))
add_box(bm, (0.95, 1.3, 0.004), (0, 0.45, 0.062), mat_index=1)
new_object('Pad', bm, [MAT['concrete'], MAT['concrete_dark']])

# ---------------------------------------------------------------- Werkstatthalle mit Bucht in der Mitte
HX0, HX1, HY0, HY1, HH = -0.75, 0.75, 0.35, 2.3, 1.45
BX0, BX1, BH = -0.45, 0.45, 1.08
bm = bmesh.new()
for x0, x1 in ((HX0, BX0), (BX1, HX1)):                                     # Betonpfeiler neben der Bucht
    add_box(bm, (x1 - x0, 0.14, HH), ((x0 + x1) / 2, HY0, HH / 2))
add_box(bm, (BX1 - BX0, 0.14, HH - BH), (0, HY0, (HH + BH) / 2))            # Sturz
new_object('HallFront', bm, MAT['concrete'])
bm = bmesh.new()
corrugated(bm, HX0, HX1, 0.06, HH, HY1, facing=1)
corrugated_side(bm, HX0, HY0, HY1, 0.06, HH, facing=-1)
corrugated_side(bm, HX1, HY0, HY1, 0.06, HH, facing=1)
ob = new_object('HallWalls', bm, [MAT['sheet'], MAT['sheet_rust']])
rust_patches(ob, 0, 1, chance=0.14, height=HH, seed=13)
bm = bmesh.new()
add_box(bm, (HX1 - HX0 + 0.2, HY1 - HY0 + 0.2, 0.07), (0, (HY0 + HY1) / 2, HH + 0.035))
add_box(bm, (HX1 - HX0 + 0.2, 0.08, 0.16), (0, HY0 - 0.08, HH + 0.1))
new_object('HallRoof', bm, MAT['steel'])
# dunkles Inneres
bm = bmesh.new()
add_box(bm, (BX1 - BX0, 0.02, BH), (0, HY1 - 0.1, BH / 2 + 0.06))
add_box(bm, (0.02, HY1 - HY0, BH), (BX0 + 0.01, (HY0 + HY1) / 2, BH / 2 + 0.06))
add_box(bm, (0.02, HY1 - HY0, BH), (BX1 - 0.01, (HY0 + HY1) / 2, BH / 2 + 0.06))
add_box(bm, (BX1 - BX0, HY1 - HY0, 0.02), (0, (HY0 + HY1) / 2, BH + 0.06))
new_object('BayInterior', bm, MAT['interior'])
# Warnrahmen um die Bucht
bm = bmesh.new()
for x in (BX0 - 0.05, BX1 + 0.05):
    for k in range(int(BH / 0.1)):
        add_box(bm, (0.104, 0.16, 0.1), (x, HY0 - 0.06, 0.11 + k * 0.1), mat_index=k % 2)
add_box(bm, (BX1 - BX0 + 0.2, 0.16, 0.14), (0, HY0 - 0.06, BH + 0.1), mat_index=2)
hazard_stripes(bm, BX0 - 0.1, BX1 + 0.05, BH + 0.03, BH + 0.17, HY0 - 0.145, width=0.09, yellow=0, black=1)
new_object('BayFrame', bm, [MAT['hazard_y'], MAT['hazard_k'], MAT['steel']])
bm = bmesh.new()
add_box(bm, (0.22, 0.14, 0.06), (0, HY0 - 0.22, BH + 0.3), mat_index=1)
add_box(bm, (0.18, 0.1, 0.01), (0, HY0 - 0.22, BH + 0.265))
new_object('BayLight', bm, [MAT['floodlight'], MAT['steel']])
empty('Lamp_Bay', (0, HY0 - 0.35, BH))

# Reparaturarm an der Decke der Bucht (Gelenke als Kugeln, Segmente als Quader)
bm = bmesh.new()
base = Vector((0.1, 1.3, BH + 0.02))
add_cyl(bm, 0.1, 0.06, base, segs=20, mat_index=1)
j1 = base + Vector((0, 0, -0.08))
j2 = j1 + Vector((-0.28, -0.1, -0.28))
j3 = j2 + Vector((0.12, -0.25, -0.22))
for a, b in ((j1, j2), (j2, j3)):
    d = b - a
    rot = d.to_track_quat('Z', 'Y').to_matrix()
    v = add_box(bm, (0.08, 0.08, d.length), (0, 0, 0), mat_index=0)
    bmesh.ops.rotate(bm, verts=v, matrix=rot)
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=v)
for j in (j1, j2, j3):
    add_sphere(bm, 0.065, j, segs=12, rings=8, mat_index=1)
tip = j3 + Vector((0, -0.04, -0.1))
add_cyl(bm, 0.025, 0.12, j3 + Vector((0, -0.02, -0.05)), segs=10, mat_index=1)
new_object('RepairArm', bm, [MAT['robot'], MAT['steel']], smooth=True)
bm = bmesh.new()
add_sphere(bm, 0.03, tip, segs=8, rings=6)
new_object('ArmSpark', bm, MAT['weld'], smooth=True)
empty('Lamp_Weld', tip + Vector((0, -0.2, 0)))

# Leuchtschrift REPAIR mit Kreuz auf dem Dach
bm = bmesh.new()
add_box(bm, (1.5, 0.05, 0.36), (0.1, HY0 - 0.02, HH + 0.45))
for x in (-0.5, 0.7):
    add_box(bm, (0.04, 0.04, 0.3), (x, HY0 + 0.02, HH + 0.2))
new_object('SignBoard', bm, MAT['steel'])
text('SignRepair', 'REPAIR', 0.22, (0.28, HY0 - 0.05, HH + 0.45), MAT['sign'])
bm = bmesh.new()
add_box(bm, (0.22, 0.02, 0.07), (-0.43, HY0 - 0.055, HH + 0.45))
add_box(bm, (0.07, 0.02, 0.22), (-0.43, HY0 - 0.055, HH + 0.45))
new_object('SignCross', bm, MAT['sign'])
empty('Lamp_Sign', (0.1, HY0 - 0.5, HH + 0.45))

# ---------------------------------------------------------------- Frachtcontainer links (Items)
CX0, CX1, CY0, CY1, CH = -1.5, -0.8, 0.25, 1.65, 0.95
bm = bmesh.new()
add_box(bm, (CX1 - CX0, CY1 - CY0, 0.05), ((CX0 + CX1) / 2, (CY0 + CY1) / 2, 0.085))    # Boden
add_box(bm, (CX1 - CX0, CY1 - CY0, 0.05), ((CX0 + CX1) / 2, (CY0 + CY1) / 2, CH + 0.06))  # Dach
add_box(bm, (CX1 - CX0, 0.03, CH), ((CX0 + CX1) / 2, CY1, CH / 2 + 0.06))               # Rückwand
new_object('ContainerShell', bm, MAT['container'])
bm = bmesh.new()
corrugated_side(bm, CX0, CY0, CY1, 0.06, CH + 0.06, facing=-1)
corrugated_side(bm, CX1, CY0, CY1, 0.06, CH + 0.06, facing=1)
ob = new_object('ContainerSides', bm, [MAT['container'], MAT['rust']])
rust_patches(ob, 0, 1, chance=0.2, height=CH, seed=21)
bm = bmesh.new()
for x in (CX0, CX1):                                                          # Eckpfosten
    add_box(bm, (0.05, 0.05, CH + 0.1), (x, CY0, CH / 2 + 0.06))
v = add_box(bm, (0.03, 0.62, CH - 0.05), (CX0 - 0.28, CY0 - 0.02, CH / 2 + 0.06))       # offene Tür
bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.radians(-50), 3, 'Z'), cent=(CX0, CY0, 0))
for z in (0.35, 0.65):                                                        # Regalböden
    add_box(bm, (CX1 - CX0 - 0.06, 0.4, 0.02), ((CX0 + CX1) / 2, CY0 + 0.3, z))
new_object('ContainerRack', bm, [MAT['steel'], MAT['container']])
bm = bmesh.new()
for k in range(3):                                                             # Dynamitkisten
    x = CX0 + 0.12 + k * 0.2
    add_box(bm, (0.16, 0.14, 0.1), (x, CY0 + 0.25, 0.42), mat_index=0)
    for s in range(3):
        add_cyl(bm, 0.018, 0.12, (x - 0.04 + s * 0.04, CY0 + 0.2, 0.52), segs=8, mat_index=1)
for k in range(2):                                                             # Treibstoffkanister
    add_box(bm, (0.14, 0.08, 0.2), (CX0 + 0.16 + k * 0.22, CY0 + 0.25, 0.77), mat_index=2)
    add_cyl(bm, 0.018, 0.04, (CX0 + 0.2 + k * 0.22, CY0 + 0.25, 0.89), segs=8, mat_index=3)
add_box(bm, (0.2, 0.2, 0.16), (CX0 + 0.35, CY0 + 0.3, 0.17), mat_index=4)       # Ersatzteilkiste
new_object('Items', bm, [MAT['wood'], MAT['dynamite'], MAT['canister'], MAT['steel'], MAT['steel_light']])
empty('Lamp_Container', ((CX0 + CX1) / 2, CY0 - 0.2, 0.7))

# ---------------------------------------------------------------- Generator rechts
bm = bmesh.new()
GX = 1.12
add_box(bm, (0.55, 0.7, 0.55), (GX, 0.8, 0.335), mat_index=0)
for k in range(6):                                                              # Kühlrippen
    add_box(bm, (0.57, 0.02, 0.4), (GX, 0.46 - 0.001, 0.2 + k * 0.001 + 0.14), mat_index=1)
    add_box(bm, (0.02, 0.02, 0.45), (GX - 0.22 + k * 0.088, 0.44, 0.34), mat_index=1)
add_cyl(bm, 0.045, 0.5, (GX + 0.15, 1.0, 0.85), segs=12, mat_index=1)          # Auspuff
add_cyl(bm, 0.06, 0.04, (GX + 0.15, 1.0, 1.1), segs=12, mat_index=1)
new_object('Generator', bm, [MAT['steel'], MAT['steel_light']])
bm = bmesh.new()
add_cyl(bm, 0.2, 0.55, (GX - 0.05, 1.55, 0.335), segs=24)                      # Kühlmitteltank
new_object('CoolantTank', bm, MAT['rust'], smooth=True)
bm = bmesh.new()
add_box(bm, (0.03, 0.2, 0.3), (GX - 0.26, 1.55, 0.45))
new_object('CoolantGauge', bm, MAT['coolant'])
bm = bmesh.new()
add_cyl(bm, 0.18, 0.2, (GX + 0.1, 0.2, 0.24), axis='X', segs=24, mat_index=0)   # Kabeltrommel
add_torus(bm, 0.13, 0.03, (GX + 0.1, 0.2, 0.24), axis='X', segs=20, rsegs=8, mat_index=1)
new_object('CableSpool', bm, [MAT['wood'], MAT['rubber']], smooth=True)
cu_pts = [(GX - 0.28, 0.6, 0.3), (0.85, 0.3, 0.07), (0.6, 0.25, 0.07), (BX1 + 0.12, HY0 - 0.1, 0.4)]
import bpy  # noqa: E402
cu = bpy.data.curves.new('Cable', 'CURVE')
cu.dimensions = '3D'
cu.bevel_depth = 0.015
cu.bevel_resolution = 3
sp = cu.splines.new('BEZIER')
sp.bezier_points.add(len(cu_pts) - 1)
for bp, co in zip(sp.bezier_points, cu_pts):
    bp.co = co
    bp.handle_left_type = bp.handle_right_type = 'AUTO'
cable = bpy.data.objects.new('Cable', cu)
bpy.context.scene.collection.objects.link(cable)
from bl_helpers import mesh_from  # noqa: E402
mesh_from(cable, 'PowerCable', MAT['rubber'])

# Warnleuchten und Laterne
bm = bmesh.new()
add_sphere(bm, 0.045, (HX0 + 0.05, HY0, HH + 0.7))
add_sphere(bm, 0.04, (GX + 0.15, 1.0, 1.16))
new_object('Beacons', bm, MAT['beacon'], smooth=True)
bm = bmesh.new()
add_cyl(bm, 0.02, 0.62, (HX0 + 0.05, HY0, HH + 0.37), segs=8)
new_object('BeaconMast', bm, MAT['steel'])
empty('Lamp_Beacon_Roof', (HX0 + 0.05, HY0 - 0.05, HH + 0.74))
empty('Lamp_Beacon_Gen', (GX + 0.15, 0.95, 1.2))

export(OUT)
if PREVIEW:
    preview(PREVIEW, cam_loc=(0.0, -5.0, 1.6), target=(0, 1.0, 0.9))
