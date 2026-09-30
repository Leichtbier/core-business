"""Baut die Upgrade-Werkstatt (industriell, düster) in Blender und exportiert sie als upgrade_shop.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/upgrade_shop.py -- [--preview pfad.png]

Konventionen für three.js (1 Einheit = 1 Tile):
  - Ursprung: Mitte der Grundfläche (Spalten 22..25 -> x -2..2), Boden bei z = 0
  - Vorderseite zeigt nach -Y, Front bei y = 0; Einfahrt bei x = +0.5 (Spalte 24 löst das Spiel aus)
  - Turm über Spalte 25 (x 1.0..2.0), im Original der Aufbau in Reihe 2
  - Materialien "SignGlow" (Leuchtschrift) und "WeldGlow" (Schweißlicht) flackern im Spiel,
    Empties "Lamp_*" werden zu Lichtern
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from bl_helpers import (add_box, add_cyl, add_sphere, add_torus, args, corrugated, corrugated_side,  # noqa: E402
                        empty, export, hazard_stripes, material, new_object, preview, reset, rust_patches, text)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'upgrade_shop.glb')
PREVIEW = args()
reset()

MAT = {
    'concrete': material('Concrete', (0.15, 0.145, 0.14), 0.0, 0.95),
    'concrete_dark': material('ConcreteDark', (0.08, 0.075, 0.07), 0.0, 0.95),
    'sheet': material('CorrugatedSheet', (0.12, 0.125, 0.13), 0.55, 0.7),
    'sheet_rust': material('CorrugatedRust', (0.2, 0.085, 0.035), 0.3, 0.85),
    'steel': material('DarkSteel', (0.08, 0.08, 0.09), 0.7, 0.55),
    'steel_light': material('Steel', (0.33, 0.33, 0.34), 0.8, 0.4),
    'rust': material('Rust', (0.26, 0.09, 0.03), 0.25, 0.9),
    'crane': material('CraneYellow', (0.5, 0.33, 0.02), 0.35, 0.6),
    'hazard_y': material('HazardYellow', (0.62, 0.42, 0.02), 0.2, 0.6),
    'hazard_k': material('HazardBlack', (0.02, 0.02, 0.02), 0.2, 0.6),
    'interior': material('DarkInterior', (0.012, 0.01, 0.01), 0.0, 1.0),
    'wood': material('DarkWood', (0.12, 0.07, 0.035), 0.0, 0.85),
    'glass': material('GrimyGlass', (0.05, 0.06, 0.05), 0.0, 0.3, emit=(0.55, 0.6, 0.35), strength=0.35),
    'window': material('GrimyWindow', (0.1, 0.07, 0.03), 0.0, 0.3, emit=(0.8, 0.42, 0.13), strength=0.45),
    'weld': material('WeldGlow', (0.2, 0.3, 0.5), 0.0, 0.3, emit=(0.55, 0.75, 1.0), strength=6),
    'sign': material('SignGlow', (0.06, 0.12, 0.02), 0.0, 0.4, emit=(0.55, 1.0, 0.2), strength=6),
    'beacon': material('BeaconRed', (0.4, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.05, 0.02), strength=7),
    'floodlight': material('Floodlight', (0.8, 0.75, 0.6), 0.0, 0.2, emit=(1.0, 0.85, 0.55), strength=8),
    'gas_red': material('GasRed', (0.3, 0.03, 0.02), 0.3, 0.5),
    'gas_blue': material('GasBlue', (0.03, 0.07, 0.18), 0.3, 0.5),
}

# ---------------------------------------------------------------- Betonplatte
bm = bmesh.new()
add_box(bm, (4.4, 3.2, 0.06), (0, 1.5, 0.03))
add_box(bm, (0.95, 1.3, 0.004), (0.5, 0.45, 0.062), mat_index=1)            # Fahrspur zur Werkstatt
for k in range(4):                                                          # Ölflecken
    add_box(bm, (0.2 + k * 0.05, 0.14, 0.003), (-1.3 + k * 0.45, 0.2 + (k % 2) * 0.2, 0.061), mat_index=1)
new_object('Pad', bm, [MAT['concrete'], MAT['concrete_dark']])

# ---------------------------------------------------------------- Werkhalle
HX0, HX1, HY0, HY1, HH = -1.9, 1.05, 0.35, 2.35, 1.35
BX0, BX1, BH = 0.05, 0.95, 1.05                                              # Werkstattbucht
bm = bmesh.new()
add_box(bm, (BX0 - HX0, 0.12, 0.5), ((HX0 + BX0) / 2, HY0, 0.25))            # Betonsockel links
add_box(bm, (HX1 - BX1, 0.12, HH), ((BX1 + HX1) / 2, HY0, HH / 2))           # Pfeiler rechts der Bucht
add_box(bm, (BX1 - BX0, 0.12, HH - BH), ((BX0 + BX1) / 2, HY0, (HH + BH) / 2))  # Sturz
add_box(bm, (0.12, HY1 - HY0, 0.5), (HX0, (HY0 + HY1) / 2, 0.25))
new_object('HallBase', bm, MAT['concrete'])
bm = bmesh.new()
corrugated(bm, HX0, BX0, 0.5, HH, HY0 - 0.01, facing=-1)
corrugated(bm, HX0, HX1, 0.06, HH, HY1, facing=1)
corrugated_side(bm, HX0 - 0.01, HY0, HY1, 0.5, HH, facing=-1)
ob = new_object('HallWalls', bm, [MAT['sheet'], MAT['sheet_rust']])
rust_patches(ob, 0, 1, chance=0.14, height=HH, seed=5)

# Fensterreihe links (trüb beleuchtet) mit Rahmen
bm = bmesh.new()
for k in range(3):
    x = -1.6 + k * 0.5
    add_box(bm, (0.34, 0.02, 0.26), (x, HY0 - 0.03, 0.9), mat_index=0)
    add_box(bm, (0.4, 0.05, 0.03), (x, HY0 - 0.04, 0.76), mat_index=1)
    add_box(bm, (0.4, 0.05, 0.03), (x, HY0 - 0.04, 1.04), mat_index=1)
    for dx in (-0.185, 0, 0.185):
        add_box(bm, (0.025, 0.05, 0.3), (x + dx, HY0 - 0.04, 0.9), mat_index=1)
new_object('HallWindows', bm, [MAT['window'], MAT['steel']])
empty('Lamp_Windows', (-1.1, HY0 - 0.3, 0.9))

# Sheddach: drei Sägezähne mit trüben Oberlichtern (Glas zeigt nach hinten/oben)
bm = bmesh.new()
glass = bmesh.new()
n = 3
seg = (HX1 - HX0) / n
for k in range(n):
    x0 = HX0 + k * seg
    x1 = x0 + seg
    y0, y1 = HY0 - 0.05, HY1 + 0.05
    zt, zb = HH + 0.42, HH
    # schräge Dachfläche von (x0, zb) nach (x1, zt)
    v = [bm.verts.new((x0, y0, zb)), bm.verts.new((x1, y0, zt)), bm.verts.new((x1, y1, zt)), bm.verts.new((x0, y1, zb))]
    bm.faces.new(v)
    # Giebeldreiecke vorne und hinten
    bm.faces.new([bm.verts.new((x0, y0, zb)), bm.verts.new((x1, y0, zb)), bm.verts.new((x1, y0, zt))])
    bm.faces.new([bm.verts.new((x1, y1, zt)), bm.verts.new((x1, y1, zb)), bm.verts.new((x0, y1, zb))])
    # senkrechte Glasfläche am hohen Ende
    g = [glass.verts.new((x1 - 0.005, y0 + 0.05, zb + 0.02)), glass.verts.new((x1 - 0.005, y1 - 0.05, zb + 0.02)),
         glass.verts.new((x1 - 0.005, y1 - 0.05, zt - 0.03)), glass.verts.new((x1 - 0.005, y0 + 0.05, zt - 0.03))]
    glass.faces.new(g)
    for yy in (y0 + 0.5, y0 + 1.0, y0 + 1.5):                                  # Sprossen
        add_box(bm, (0.03, 0.03, zt - zb), (x1 - 0.02, yy, (zt + zb) / 2))
bmesh.ops.solidify(bm, geom=[f for f in bm.faces if len(f.verts) >= 3], thickness=0.03)
new_object('SawtoothRoof', bm, MAT['steel'])
new_object('Skylights', glass, MAT['glass'])
bm = bmesh.new()
add_box(bm, (HX1 - HX0 + 0.1, 0.1, 0.1), ((HX0 + HX1) / 2, HY0 - 0.02, HH))  # Traufe
for x in (HX0, HX1):
    for y in (HY0, HY1):
        add_box(bm, (0.08, 0.08, HH), (x, y, HH / 2))
new_object('HallFrame', bm, MAT['steel'])

# Werkstattbucht: dunkles Inneres, Hebebühne, Werkzeugwand, Schweißlicht
bm = bmesh.new()
add_box(bm, (BX1 - BX0, 0.02, BH), ((BX0 + BX1) / 2, HY1 - 0.1, BH / 2 + 0.06))
add_box(bm, (0.02, HY1 - HY0, BH), (BX0 + 0.01, (HY0 + HY1) / 2, BH / 2 + 0.06))
add_box(bm, (0.02, HY1 - HY0, BH), (BX1 - 0.01, (HY0 + HY1) / 2, BH / 2 + 0.06))
add_box(bm, (BX1 - BX0, HY1 - HY0, 0.02), ((BX0 + BX1) / 2, (HY0 + HY1) / 2, BH + 0.06))
new_object('BayInterior', bm, MAT['interior'])
bm = bmesh.new()
for x in (BX0 + 0.12, BX1 - 0.12):
    add_box(bm, (0.07, 0.07, 0.8), (x, 1.5, 0.46), mat_index=0)              # Hebebühnen-Säulen
add_box(bm, (0.75, 0.5, 0.04), ((BX0 + BX1) / 2, 1.5, 0.38), mat_index=0)    # Bühne
hazard_stripes(bm, BX0 + 0.1, BX1 - 0.12, 0.36, 0.4, 1.249, width=0.06, yellow=1, black=2)
add_box(bm, (0.7, 0.02, 0.5), ((BX0 + BX1) / 2, HY1 - 0.12, 0.75), mat_index=3)  # Werkzeugwand
for k in range(6):
    add_box(bm, (0.03, 0.03, 0.16 + (k % 3) * 0.05), (BX0 + 0.2 + k * 0.1, HY1 - 0.15, 0.8), mat_index=0)
new_object('Lift', bm, [MAT['steel_light'], MAT['hazard_y'], MAT['hazard_k'], MAT['wood']])
bm = bmesh.new()
add_sphere(bm, 0.035, (BX0 + 0.25, HY1 - 0.35, 0.55), segs=8, rings=6)
new_object('WeldSpark', bm, MAT['weld'], smooth=True)
empty('Lamp_Weld', (BX0 + 0.25, HY1 - 0.5, 0.6))

# Stahlrahmen mit Warnbändern um die Bucht
bm = bmesh.new()
for x in (BX0 - 0.05, BX1 + 0.05):
    for k in range(int(BH / 0.1)):
        add_box(bm, (0.104, 0.144, 0.1), (x, HY0 - 0.05, 0.11 + k * 0.1), mat_index=k % 2)
add_box(bm, (BX1 - BX0 + 0.2, 0.14, 0.14), ((BX0 + BX1) / 2, HY0 - 0.05, BH + 0.1), mat_index=2)
hazard_stripes(bm, BX0 - 0.1, BX1 + 0.05, BH + 0.03, BH + 0.17, HY0 - 0.125, width=0.09, yellow=0, black=1)
new_object('BayFrame', bm, [MAT['hazard_y'], MAT['hazard_k'], MAT['steel']])
bm = bmesh.new()
add_box(bm, (0.22, 0.14, 0.06), ((BX0 + BX1) / 2, HY0 - 0.2, BH + 0.3), mat_index=1)
add_box(bm, (0.18, 0.1, 0.01), ((BX0 + BX1) / 2, HY0 - 0.2, BH + 0.265))
new_object('BayLight', bm, [MAT['floodlight'], MAT['steel']])
empty('Lamp_Bay', ((BX0 + BX1) / 2, HY0 - 0.35, BH))

# Leuchtschrift UPGRADES auf einer Tafel über der linken Hallenfront
bm = bmesh.new()
add_box(bm, (1.6, 0.05, 0.34), (-0.95, HY0 - 0.12, HH + 0.3))
for x in (-1.6, -0.3):
    add_box(bm, (0.04, 0.04, 0.3), (x, HY0 - 0.06, HH + 0.08))
new_object('SignBoard', bm, MAT['steel'])
text('SignUpgrades', 'UPGRADES', 0.2, (-0.95, HY0 - 0.15, HH + 0.3), MAT['sign'])
empty('Lamp_Sign', (-0.95, HY0 - 0.5, HH + 0.3))

# ---------------------------------------------------------------- Kontrollturm (Spalte 25)
TX0, TX1, TY0, TY1, TH = 1.12, 1.95, 0.45, 1.95, 2.55
bm = bmesh.new()
add_box(bm, (TX1 - TX0, TY1 - TY0, 1.6), ((TX0 + TX1) / 2, (TY0 + TY1) / 2, 0.8))
new_object('TowerBase', bm, MAT['concrete'])
bm = bmesh.new()
corrugated(bm, TX0, TX1, 1.6, TH, TY0 + 0.04, facing=-1)
corrugated_side(bm, TX0, TY0 + 0.04, TY1, 1.6, TH, facing=-1)
corrugated_side(bm, TX1, TY0 + 0.04, TY1, 1.6, TH, facing=1)
corrugated(bm, TX0, TX1, 1.6, TH, TY1, facing=1)
ob = new_object('TowerWalls', bm, [MAT['sheet'], MAT['sheet_rust']])
rust_patches(ob, 0, 1, chance=0.2, low_bonus=0.05, height=TH, seed=9)
bm = bmesh.new()
add_box(bm, (TX1 - TX0 - 0.1, 0.02, 0.28), ((TX0 + TX1) / 2, TY0 + 0.0, 2.1), mat_index=0)  # Fensterband
for k in range(5):
    add_box(bm, (0.03, 0.05, 0.32), (TX0 + 0.08 + k * (TX1 - TX0 - 0.16) / 4, TY0 - 0.01, 2.1), mat_index=1)
add_box(bm, (TX1 - TX0 + 0.1, 0.12, 0.05), ((TX0 + TX1) / 2, TY0 - 0.04, 1.93), mat_index=1)
add_box(bm, (TX1 - TX0 + 0.2, TY1 - TY0 + 0.2, 0.06), ((TX0 + TX1) / 2, (TY0 + TY1) / 2, TH + 0.03), mat_index=1)
add_box(bm, (0.3, 0.02, 0.7), (1.53, TY0 - 0.01, 0.4), mat_index=2)                      # Stahltür
new_object('TowerDetails', bm, [MAT['window'], MAT['steel'], MAT['sheet_rust']])
empty('Lamp_Tower', (1.53, TY0 - 0.35, 2.1))
# Antennenmast, Schüssel, Warnleuchte
bm = bmesh.new()
add_cyl(bm, 0.02, 0.9, (1.8, 1.5, TH + 0.45), segs=8)
for k in range(3):
    add_box(bm, (0.2 - k * 0.04, 0.012, 0.012), (1.8, 1.5, TH + 0.35 + k * 0.2))
add_cyl(bm, 0.02, 0.35, (1.35, 1.3, TH + 0.17), segs=8)
new_object('Antenna', bm, MAT['steel_light'], smooth=True)
# Satellitenschüssel: flache Kugelschale in eigenem Mesh, zur Kamera geneigt
dish = bmesh.new()
add_sphere(dish, 0.22, (0, 0, 0), segs=24, rings=12)
bmesh.ops.delete(dish, geom=[v for v in dish.verts if v.co.z > -0.12], context='VERTS')
bmesh.ops.translate(dish, vec=(0, 0, 0.12), verts=dish.verts)
bmesh.ops.scale(dish, vec=(1.6, 1.6, 1.0), verts=dish.verts)
bmesh.ops.solidify(dish, geom=dish.faces[:], thickness=0.012)
bmesh.ops.rotate(dish, verts=dish.verts, matrix=Matrix.Rotation(math.radians(-55), 3, 'X'))
bmesh.ops.translate(dish, vec=(1.35, 1.25, TH + 0.4), verts=dish.verts)
new_object('Dish', dish, MAT['steel_light'], smooth=True)
bm = bmesh.new()
add_sphere(bm, 0.045, (1.8, 1.5, TH + 0.92))
add_sphere(bm, 0.04, (HX0 + 0.05, HY0, HH + 0.48))
new_object('Beacons', bm, MAT['beacon'], smooth=True)
empty('Lamp_Beacon_Mast', (1.8, 1.5, TH + 0.96))
empty('Lamp_Beacon_Hall', (HX0 + 0.05, HY0 - 0.05, HH + 0.52))

# ---------------------------------------------------------------- Laufkran über der Front
CY, CZ = 0.12, 1.95
bm = bmesh.new()
for x in (-2.0, 1.05):                                                      # A-Böcke
    for dy in (-0.12, 0.12):
        v = add_box(bm, (0.07, 0.07, CZ), (x, CY + dy, CZ / 2))
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.radians(8 if dy > 0 else -8), 3, 'X'),
                         cent=(x, CY + dy, CZ))
    add_box(bm, (0.1, 0.3, 0.06), (x, CY, 0.09))
    add_box(bm, (0.04, 0.25, 0.04), (x, CY, 0.8))
add_box(bm, (3.25, 0.12, 0.14), (-0.475, CY, CZ))                            # Brückenträger
add_box(bm, (3.25, 0.03, 0.03), (-0.475, CY - 0.06, CZ + 0.08))
add_box(bm, (3.25, 0.03, 0.03), (-0.475, CY + 0.06, CZ + 0.08))
for k in range(13):                                                         # Fachwerk
    x = -2.0 + k * 0.25
    v = add_box(bm, (0.02, 0.02, 0.16), (x + 0.12, CY, CZ))
    bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.radians(40 * (1 if k % 2 else -1)), 3, 'Y'),
                     cent=(x + 0.12, CY, CZ))
ob = new_object('Gantry', bm, MAT['crane'])
rust_patches(ob, 0, 0, chance=0)
bm = bmesh.new()
KX = -0.75
add_box(bm, (0.3, 0.22, 0.14), (KX, CY, CZ - 0.12), mat_index=0)            # Laufkatze
add_cyl(bm, 0.008, 0.72, (KX - 0.04, CY, CZ - 0.55), segs=6, mat_index=1)   # Seile
add_cyl(bm, 0.008, 0.72, (KX + 0.04, CY, CZ - 0.55), segs=6, mat_index=1)
add_box(bm, (0.14, 0.08, 0.08), (KX, CY, CZ - 0.93), mat_index=0)           # Unterflasche
add_torus(bm, 0.05, 0.014, (KX, CY, CZ - 1.02), axis='Y', segs=16, rsegs=6, mat_index=1)  # Haken
new_object('CraneTrolley', bm, [MAT['crane'], MAT['steel']])
# Riesiger Bohrkopf am Haken (Upgrade-Teil)
bm = bmesh.new()
rings, lobes, turns, length, radius = 14, 5, 1.2, 0.55, 0.2
ring_verts = []
for i in range(rings):
    t = i / (rings - 1)
    rr = radius * (1 - t) ** 0.9
    ring = []
    for k in range(lobes * 2):
        a = 2 * math.pi * k / (lobes * 2) + t * turns * 2 * math.pi
        rk = rr * (1.0 if k % 2 == 0 else 0.62)
        ring.append(bm.verts.new((math.cos(a) * rk, math.sin(a) * rk, -t * length)))
    ring_verts.append(ring)
tip = bm.verts.new((0, 0, -length - 0.03))
m = lobes * 2
for i in range(rings - 1):
    for k in range(m):
        bm.faces.new((ring_verts[i][k], ring_verts[i + 1][k], ring_verts[i + 1][(k + 1) % m], ring_verts[i][(k + 1) % m]))
for k in range(m):
    bm.faces.new((ring_verts[-1][k], tip, ring_verts[-1][(k + 1) % m]))
bm.faces.new(ring_verts[0])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
add_cyl(bm, radius * 1.05, 0.08, (0, 0, 0.04), segs=24, mat_index=1)
add_cyl(bm, 0.05, 0.1, (0, 0, 0.12), segs=12, mat_index=1)
new_object('HangingDrill', bm, [MAT['steel_light'], MAT['steel']], smooth=True, origin=(KX, CY, CZ - 1.18))

# ---------------------------------------------------------------- Kleinkram links
bm = bmesh.new()
rnd = random.Random(4)
for (x, y, z, s) in ((-1.8, 0.2, 0.06, 0.3), (-1.48, 0.18, 0.06, 0.26), (-1.72, 0.22, 0.36, 0.24)):
    v = add_box(bm, (s, s, s), (x, y, z + s / 2), mat_index=0)
    bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.radians(rnd.uniform(-8, 8)), 3, 'Z'), cent=(x, y, 0))
    add_box(bm, (s + 0.01, s + 0.01, 0.025), (x, y, z + s * 0.25), mat_index=1)
    add_box(bm, (s + 0.01, s + 0.01, 0.025), (x, y, z + s * 0.75), mat_index=1)
new_object('Crates', bm, [MAT['wood'], MAT['steel']])
bm = bmesh.new()
add_box(bm, (0.5, 0.36, 0.05), (-0.85, 0.2, 0.09), mat_index=2)             # Palette
add_box(bm, (0.36, 0.26, 0.22), (-0.85, 0.2, 0.23), mat_index=0)            # Motorblock
for k in range(3):
    add_cyl(bm, 0.045, 0.08, (-0.97 + k * 0.12, 0.2, 0.37), segs=10, mat_index=1)
add_cyl(bm, 0.07, 0.05, (-0.64, 0.2, 0.23), axis='X', segs=14, mat_index=1)
new_object('EngineBlock', bm, [MAT['steel'], MAT['rust'], MAT['wood']])
bm = bmesh.new()
for k, mi in enumerate((0, 1, 0, 1)):
    add_cyl(bm, 0.055, 0.55, (-0.35 + k * 0.12, HY0 - 0.08, 0.34), segs=14, mat_index=mi)
    add_sphere(bm, 0.055, (-0.35 + k * 0.12, HY0 - 0.08, 0.615), segs=10, rings=6, mat_index=mi)
add_box(bm, (0.52, 0.02, 0.02), (-0.17, HY0 - 0.14, 0.45), mat_index=2)     # Kette/Haltebügel
new_object('GasBottles', bm, [MAT['gas_red'], MAT['gas_blue'], MAT['steel']], smooth=True)

export(OUT)
if PREVIEW:
    preview(PREVIEW, cam_loc=(0.0, -6.2, 1.9), target=(0, 1.2, 1.2))
