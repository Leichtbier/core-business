"""Baut die Mineralverarbeitung (industriell, düster) in Blender und exportiert sie als mineral_processing.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/mineral_processing.py -- [--preview pfad.png]

Konventionen für three.js (1 Einheit = 1 Tile):
  - Ursprung: Mitte der Grundfläche (Spalten 10..13 -> x -2..2), Boden bei z = 0
  - Vorderseite zeigt nach -Y, Front bei y = 0; Einfahrt bei x = -1.5 (Spalte 10 löst das Spiel aus)
  - Material "SignGlow" flackert im Spiel, Empties "Lamp_*" werden zu Lichtern
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
OUT = os.path.join(HERE, 'mineral_processing.glb')
PREVIEW = args()
reset()

MAT = {
    'concrete': material('Concrete', (0.15, 0.145, 0.14), 0.0, 0.95),
    'concrete_dark': material('ConcreteDark', (0.08, 0.075, 0.07), 0.0, 0.95),
    'sheet': material('CorrugatedSheet', (0.13, 0.13, 0.13), 0.55, 0.7),
    'sheet_rust': material('CorrugatedRust', (0.2, 0.085, 0.035), 0.3, 0.85),
    'steel': material('DarkSteel', (0.08, 0.08, 0.09), 0.7, 0.55),
    'steel_light': material('Steel', (0.33, 0.33, 0.34), 0.8, 0.4),
    'rust': material('Rust', (0.26, 0.09, 0.03), 0.25, 0.9),
    'hazard_y': material('HazardYellow', (0.62, 0.42, 0.02), 0.2, 0.6),
    'hazard_k': material('HazardBlack', (0.02, 0.02, 0.02), 0.2, 0.6),
    'belt': material('Belt', (0.025, 0.025, 0.025), 0.0, 0.9),
    'interior': material('DarkInterior', (0.012, 0.01, 0.01), 0.0, 1.0),
    'ore': material('Ore', (0.2, 0.12, 0.07), 0.2, 0.8),
    'ore_glow': material('OreGlow', (0.2, 0.3, 0.35), 0.4, 0.3, emit=(0.3, 0.75, 0.9), strength=1.2),
    'ore_gold': material('OreGold', (0.5, 0.35, 0.05), 0.8, 0.3, emit=(0.6, 0.35, 0.05), strength=0.6),
    'furnace': material('FurnaceGlow', (0.3, 0.06, 0.01), 0.0, 0.4, emit=(1.0, 0.32, 0.06), strength=4),
    'sign': material('SignGlow', (0.05, 0.12, 0.14), 0.0, 0.4, emit=(0.45, 0.9, 1.0), strength=6),
    'beacon': material('BeaconRed', (0.4, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.05, 0.02), strength=7),
    'floodlight': material('Floodlight', (0.8, 0.75, 0.6), 0.0, 0.2, emit=(1.0, 0.85, 0.55), strength=8),
}

# ---------------------------------------------------------------- Betonplatte, Gleise
bm = bmesh.new()
add_box(bm, (4.4, 3.4, 0.06), (0, 1.6, 0.03))
add_box(bm, (0.95, 1.2, 0.004), (-1.5, 0.45, 0.062), mat_index=1)          # Fahrspur zur Einfahrt
new_object('Pad', bm, [MAT['concrete'], MAT['concrete_dark']])
bm = bmesh.new()
for y in (0.1, 0.3):
    add_box(bm, (2.5, 0.025, 0.03), (0.85, y, 0.075))
for k in range(13):
    add_box(bm, (0.06, 0.34, 0.02), (-0.35 + k * 0.2, 0.2, 0.065), mat_index=1)
new_object('Rails', bm, [MAT['steel_light'], MAT['rust']])

# ---------------------------------------------------------------- Anlieferungshalle (links)
AX0, AX1, AY0, AY1, AH = -2.0, -0.45, 0.35, 2.5, 1.75
BX0, BX1, BH = -1.95, -1.05, 1.05     # Einfahrt
bm = bmesh.new()
# Betonsockel vorne, links/rechts der Einfahrt, und Sturz darüber
add_box(bm, (BX0 - AX0 + 0.02, 0.12, AH), ((AX0 + BX0) / 2, AY0, AH / 2))
add_box(bm, (AX1 - BX1, 0.12, 0.55), ((BX1 + AX1) / 2, AY0, 0.275))
add_box(bm, (BX1 - BX0, 0.12, AH - BH), ((BX0 + BX1) / 2, AY0, (AH + BH) / 2))
add_box(bm, (0.12, AY1 - AY0, 0.55), (AX0, (AY0 + AY1) / 2, 0.275))
new_object('HallBase', bm, MAT['concrete'])
bm = bmesh.new()
corrugated(bm, BX1, AX1, 0.55, AH, AY0 - 0.01, facing=-1)
corrugated(bm, AX0, AX1, 0.06, AH, AY1, facing=1)
corrugated_side(bm, AX0 - 0.01, AY0, AY1, 0.55, AH, facing=-1)
corrugated_side(bm, AX1, AY0, AY1, 0.06, AH, facing=1)
ob = new_object('HallWalls', bm, [MAT['sheet'], MAT['sheet_rust']])
rust_patches(ob, 0, 1, chance=0.12, height=AH, seed=3)
# Dunkles Inneres hinter der Einfahrt
bm = bmesh.new()
add_box(bm, (BX1 - BX0, 0.02, BH), ((BX0 + BX1) / 2, AY1 - 0.1, BH / 2 + 0.06))
add_box(bm, (0.02, AY1 - AY0, BH), (BX0 + 0.01, (AY0 + AY1) / 2, BH / 2 + 0.06))
add_box(bm, (0.02, AY1 - AY0, BH), (BX1 - 0.01, (AY0 + AY1) / 2, BH / 2 + 0.06))
add_box(bm, (BX1 - BX0, AY1 - AY0, 0.02), ((BX0 + BX1) / 2, (AY0 + AY1) / 2, BH + 0.06))
new_object('BayInterior', bm, MAT['interior'])
# Schwerer Stahlrahmen mit Warnstreifen um die Einfahrt
bm = bmesh.new()
for x in (BX0 - 0.05, BX1 + 0.05):
    add_box(bm, (0.1, 0.14, BH + 0.1), (x, AY0 - 0.05, (BH + 0.1) / 2))
add_box(bm, (BX1 - BX0 + 0.2, 0.14, 0.14), ((BX0 + BX1) / 2, AY0 - 0.05, BH + 0.1))
hazard_stripes(bm, BX0 - 0.1, BX1 + 0.05, BH + 0.03, BH + 0.17, AY0 - 0.125, width=0.09, yellow=1, black=2)
for x in (BX0 - 0.05, BX1 + 0.05):  # Pfosten: gestapelte gelb-schwarze Bänder
    for k in range(int(BH / 0.1)):
        add_box(bm, (0.104, 0.144, 0.1), (x, AY0 - 0.05, 0.11 + k * 0.1), mat_index=1 + k % 2)
new_object('BayFrame', bm, [MAT['steel'], MAT['hazard_y'], MAT['hazard_k']])
# Kettenvorhang (Streifen) im oberen Teil der Einfahrt
bm = bmesh.new()
for k in range(10):
    x = BX0 + 0.05 + k * (BX1 - BX0 - 0.1) / 9
    add_box(bm, (0.05, 0.01, 0.35), (x, AY0 + 0.02, BH - 0.12))
new_object('StripCurtain', bm, MAT['belt'])
# Dach mit Brüstung
bm = bmesh.new()
add_box(bm, (AX1 - AX0 + 0.12, AY1 - AY0 + 0.12, 0.06), ((AX0 + AX1) / 2, (AY0 + AY1) / 2, AH + 0.03))
add_box(bm, (AX1 - AX0 + 0.12, 0.06, 0.14), ((AX0 + AX1) / 2, AY0 - 0.06, AH + 0.1))
for y in (1.2, 2.0):
    add_box(bm, (0.5, 0.4, 0.22), (-1.6, y, AH + 0.14), mat_index=1)          # Lüftungskästen
new_object('HallRoof', bm, [MAT['steel'], MAT['sheet']])
# Leuchtschrift auf einer Tafel über der Einfahrt
bm = bmesh.new()
add_box(bm, (1.45, 0.05, 0.42), ((AX0 + AX1) / 2, AY0 - 0.1, AH + 0.42))
for x in (AX0 + 0.2, AX1 - 0.2):
    add_box(bm, (0.04, 0.04, 0.3), (x, AY0 - 0.05, AH + 0.12))
new_object('SignBoard', bm, MAT['steel'])
text('SignMineral', 'MINERAL', 0.17, ((AX0 + AX1) / 2, AY0 - 0.13, AH + 0.51), MAT['sign'])
text('SignProcessing', 'PROCESSING', 0.13, ((AX0 + AX1) / 2, AY0 - 0.13, AH + 0.33), MAT['sign'])
empty('Lamp_Sign', ((AX0 + AX1) / 2, AY0 - 0.5, AH + 0.4))
# Strahler über der Einfahrt
bm = bmesh.new()
add_box(bm, (0.22, 0.14, 0.06), ((BX0 + BX1) / 2, AY0 - 0.2, BH + 0.3), mat_index=1)
add_box(bm, (0.18, 0.1, 0.01), ((BX0 + BX1) / 2, AY0 - 0.2, BH + 0.265))
add_box(bm, (0.03, 0.2, 0.03), ((BX0 + BX1) / 2, AY0 - 0.1, BH + 0.3), mat_index=1)
new_object('BayLight', bm, [MAT['floodlight'], MAT['steel']])
empty('Lamp_Bay', ((BX0 + BX1) / 2, AY0 - 0.35, BH))

# ---------------------------------------------------------------- Brecherturm (rechts)
TX0, TX1, TY0, TY1, TH = 0.3, 1.95, 0.55, 2.45, 2.7
bm = bmesh.new()
add_box(bm, (TX1 - TX0, TY1 - TY0, 0.95), ((TX0 + TX1) / 2, (TY0 + TY1) / 2, 0.475))
for x in (TX0 + 0.05, TX1 - 0.05):                                            # Strebepfeiler
    add_box(bm, (0.16, 0.22, 0.95), (x, TY0 - 0.05, 0.475))
new_object('TowerBase', bm, MAT['concrete'])
bm = bmesh.new()
corrugated(bm, TX0, TX1, 0.95, TH, TY0 + 0.05, facing=-1)
corrugated(bm, TX0, TX1, 0.95, TH, TY1, facing=1)
corrugated_side(bm, TX0, TY0 + 0.05, TY1, 0.95, TH, facing=-1)
corrugated_side(bm, TX1, TY0 + 0.05, TY1, 0.95, TH, facing=1)
ob = new_object('TowerWalls', bm, [MAT['sheet'], MAT['sheet_rust']])
rust_patches(ob, 0, 1, chance=0.18, low_bonus=0.1, height=TH, seed=7)
bm = bmesh.new()
for x in (TX0, TX1):
    for y in (TY0 + 0.05, TY1):
        add_box(bm, (0.08, 0.08, TH - 0.9), (x, y, (TH + 0.95) / 2))
for z in (1.6, TH):
    add_box(bm, (TX1 - TX0 + 0.08, 0.08, 0.08), ((TX0 + TX1) / 2, TY0 + 0.03, z))
add_box(bm, (TX1 - TX0 + 0.25, TY1 - TY0 + 0.25, 0.08), ((TX0 + TX1) / 2, (TY0 + TY1) / 2, TH + 0.04))
new_object('TowerFrame', bm, MAT['steel'])
# Glühender Brennofen-Schlitz und Lüftungslamellen
bm = bmesh.new()
add_box(bm, (0.9, 0.02, 0.12), (1.12, TY0 - 0.005, 0.55))
new_object('FurnaceSlit', bm, MAT['furnace'])
empty('Lamp_Furnace', (1.12, TY0 - 0.35, 0.55))
bm = bmesh.new()
for dz in (-0.09, 0.09):                                                     # Rahmen um den Ofenschlitz
    add_box(bm, (1.0, 0.04, 0.04), (1.12, TY0 - 0.015, 0.55 + dz))
for dx in (-0.48, 0.48):
    add_box(bm, (0.04, 0.04, 0.22), (1.12 + dx, TY0 - 0.015, 0.55))
for k in range(6):
    add_box(bm, (0.52, 0.05, 0.03), (1.12, TY0 - 0.01, 2.0 + k * 0.08),
            rot=Matrix.Rotation(math.radians(30), 3, 'X'))
new_object('TowerLouvers', bm, MAT['steel'])
# Laufsteg mit Geländer um den Turm
bm = bmesh.new()
WZ = 1.65
add_box(bm, (TX1 - TX0 + 0.5, 0.3, 0.03), ((TX0 + TX1) / 2, TY0 - 0.12, WZ))
for k in range(9):
    x = TX0 - 0.22 + k * (TX1 - TX0 + 0.44) / 8
    add_box(bm, (0.02, 0.02, 0.3), (x, TY0 - 0.26, WZ + 0.15))
    # Stützstrebe: von der Turmwand schräg nach oben zur Vorderkante des Stegs (nur vor der Wand)
    if TX0 + 0.05 <= x <= TX1 - 0.05:
        a = Vector((0, TY0 + 0.04, WZ - 0.3))
        b = Vector((0, TY0 - 0.25, WZ - 0.02))
        d = b - a
        add_box(bm, (0.02, d.length, 0.02), (x, (a.y + b.y) / 2, (a.z + b.z) / 2),
                rot=Matrix.Rotation(math.atan2(d.z, d.y), 3, 'X'))
for z in (WZ + 0.3, WZ + 0.16):
    add_box(bm, (TX1 - TX0 + 0.46, 0.02, 0.02), ((TX0 + TX1) / 2, TY0 - 0.26, z))
# Leiter vom Boden zum Laufsteg
for x in (TX1 + 0.12, TX1 + 0.3):
    add_box(bm, (0.02, 0.02, WZ + 0.3), (x, TY0 - 0.2, (WZ + 0.3) / 2))
for k in range(int(WZ / 0.12)):
    add_box(bm, (0.18, 0.014, 0.014), (TX1 + 0.21, TY0 - 0.2, 0.15 + k * 0.12))
new_object('Catwalk', bm, MAT['steel_light'])
# Zwei Schornsteine
bm = bmesh.new()
for x, h in ((0.75, 1.25), (1.45, 1.0)):
    add_cyl(bm, 0.11, h, (x, 2.1, TH + h / 2), segs=20)
    for k in range(3):
        add_torus(bm, 0.115, 0.014, (x, 2.1, TH + 0.2 + k * h / 3), segs=20, rsegs=6, mat_index=1)
    add_cyl(bm, 0.15, 0.06, (x, 2.1, TH + h), segs=20, mat_index=1)
ob = new_object('Stacks', bm, [MAT['rust'], MAT['steel']], smooth=True)
bm = bmesh.new()
add_sphere(bm, 0.05, (0.75, 2.1, TH + 1.32))
add_sphere(bm, 0.05, (TX0 + 0.05, TY0, TH + 0.12))
new_object('TowerBeacons', bm, MAT['beacon'], smooth=True)
empty('Lamp_Beacon_Stack', (0.75, 2.1, TH + 1.36))
empty('Lamp_Beacon_Tower', (TX0 + 0.05, TY0 - 0.05, TH + 0.16))

# ---------------------------------------------------------------- Förderband: Hallendach -> Turm
P0 = Vector((-1.0, 1.25, AH + 0.25))
P1 = Vector((TX0 + 0.1, 1.25, TH - 0.35))
d = P1 - P0
L = d.length
ang = math.atan2(d.z, d.x)
rot = Matrix.Rotation(-ang, 3, 'Y')
mid = (P0 + P1) / 2
bm = bmesh.new()
add_box(bm, (L, 0.34, 0.05), mid, rot=rot, mat_index=0)                        # Rahmen/Wanne
for side in (-0.17, 0.17):
    add_box(bm, (L, 0.03, 0.12), mid + Vector((0, side, 0.04)), rot=rot, mat_index=0)
new_object('ConveyorFrame', bm, MAT['steel'])
bm = bmesh.new()
add_box(bm, (L, 0.28, 0.012), mid + Vector((0, 0, 0.032)), rot=rot)
new_object('ConveyorBelt', bm, MAT['belt'])
bm = bmesh.new()
n = int(L / 0.12)
for k in range(n):
    p = P0 + d * ((k + 0.5) / n)
    add_cyl(bm, 0.022, 0.3, p + Vector((0, 0, 0.0)), axis='Y', segs=10)
new_object('ConveyorRollers', bm, MAT['steel_light'], smooth=True)
# Stützen unter dem Band
bm = bmesh.new()
for t in (0.45, 0.75):
    p = P0 + d * t
    add_box(bm, (0.06, 0.06, p.z - AH), (p.x, 1.1, (p.z + AH) / 2))
    add_box(bm, (0.06, 0.06, p.z - AH), (p.x, 1.4, (p.z + AH) / 2))
new_object('ConveyorStands', bm, MAT['steel'])
# Erzbrocken auf dem Band (einige glimmen)
bm = bmesh.new()
import random  # noqa: E402
rnd = random.Random(11)
for k in range(14):
    t = (k + rnd.random() * 0.6) / 14
    p = P0 + d * t + Vector((0, rnd.uniform(-0.08, 0.08), 0.075))
    v = add_sphere(bm, 0.035 + rnd.random() * 0.025, p, segs=6, rings=4,
                   mat_index=0 if rnd.random() < 0.6 else (1 if rnd.random() < 0.6 else 2))
    bmesh.ops.scale(bm, vec=(1.2, 1.0, 0.7), verts=v, space=Matrix.Translation(-p))
new_object('BeltOre', bm, [MAT['ore'], MAT['ore_glow'], MAT['ore_gold']])

# ---------------------------------------------------------------- Rutsche und Loren vorne
bm = bmesh.new()
C = Vector((1.12, 0.4, 0.86))                                                # von der Turmwand hinab in die Lore
R = Matrix.Rotation(math.radians(-42), 3, 'X')
add_box(bm, (0.34, 0.58, 0.04), C, rot=R)
for s in (-0.17, 0.17):
    add_box(bm, (0.03, 0.58, 0.14), C + Vector((s, 0, 0.05)), rot=R)
add_box(bm, (0.4, 0.08, 0.12), (1.12, TY0 - 0.02, 1.06))                         # Auslass in der Wand
new_object('Chute', bm, MAT['rust'])


def cart(name, x, load=True):
    bm = bmesh.new()
    add_box(bm, (0.46, 0.3, 0.05), (x, 0.2, 0.2), mat_index=1)                      # Boden
    for s in (-1, 1):
        v = add_box(bm, (0.5, 0.03, 0.24), (x, 0.2 + s * 0.16, 0.32))
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.radians(s * 10), 3, 'X'),
                         cent=(x, 0.2 + s * 0.16, 0.2))
        add_box(bm, (0.03, 0.3, 0.24), (x + s * 0.25, 0.2, 0.32))
    for dx in (-0.14, 0.14):
        for y in (0.1, 0.3):
            add_cyl(bm, 0.06, 0.03, (x + dx, y, 0.12), axis='Y', segs=12, mat_index=1)
    new_object(name, bm, [MAT['rust'], MAT['steel']])
    if load:
        bm = bmesh.new()
        r = random.Random(hash(name) & 0xfff)
        for k in range(9):
            p = Vector((x + r.uniform(-0.18, 0.18), 0.2 + r.uniform(-0.1, 0.1), 0.42 + r.random() * 0.06))
            add_sphere(bm, 0.05 + r.random() * 0.03, p, segs=6, rings=4,
                       mat_index=0 if r.random() < 0.55 else (1 if r.random() < 0.6 else 2))
        new_object(name + 'Ore', bm, [MAT['ore'], MAT['ore_glow'], MAT['ore_gold']])


cart('CartA', 1.12)
cart('CartB', 0.2, load=False)
empty('Lamp_Ore', (1.12, -0.15, 0.6))

# ---------------------------------------------------------------- Erzsilo hinten
bm = bmesh.new()
SX, SY, SR = -1.15, 3.0, 0.45
add_cyl(bm, SR, 1.3, (SX, SY, 1.75), segs=36)
add_cyl(bm, SR, 0.6, (SX, SY, 0.8), segs=36, r2=None)
v = add_cyl(bm, SR, 0.55, (SX, SY, 0.8), segs=36, r2=0.08)
bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.pi, 3, 'X'), cent=(SX, SY, 0.8))
for a in range(4):
    ang = a * math.pi / 2 + math.pi / 4
    add_box(bm, (0.06, 0.06, 1.1), (SX + math.cos(ang) * SR * 0.9, SY + math.sin(ang) * SR * 0.9, 0.55),
            mat_index=1)
for k in range(3):
    add_torus(bm, SR + 0.01, 0.014, (SX, SY, 1.3 + k * 0.4), segs=36, rsegs=6, mat_index=1)
ob = new_object('Silo', bm, [MAT['sheet'], MAT['steel']], smooth=True)
bm = bmesh.new()
add_sphere(bm, 0.045, (SX, SY, 2.45))
new_object('SiloBeacon', bm, MAT['beacon'], smooth=True)
empty('Lamp_Beacon_Silo', (SX, SY, 2.5))

# ---------------------------------------------------------------- Rohre zwischen Halle und Turm
bm = bmesh.new()
add_cyl(bm, 0.05, 0.8, (-0.07, 2.2, 1.2), axis='X', segs=14)
add_cyl(bm, 0.05, 1.2, (-0.07 + 0.37, 2.2, 0.6), segs=14)
add_torus(bm, 0.07, 0.012, (-0.3, 2.2, 1.2), axis='X', segs=16, rsegs=6, mat_index=1)
new_object('Pipes', bm, [MAT['rust'], MAT['steel']], smooth=True)

export(OUT)
if PREVIEW:
    preview(PREVIEW, cam_loc=(0.2, -6.4, 2.0), target=(0, 1.3, 1.3))
