"""Baut das Dropship der Startsequenz (im Original "mothershipMC") und exportiert es als dropship.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/dropship.py -- [--preview pfad.png]

Ein schwerer, etwas heruntergekommener Frachter von Husk Heavy Industries: vier Mantelpropeller für den
Schwebeflug, zwei Schubdüsen am Heck und unter dem Bauch eine Greifklammer, die den Pod hält.

Konventionen für three.js (1 Einheit = 1 Tile, der Pod ist im Spiel ca. 0.56 breit):
  - Flugrichtung +X, oben +Z, Vorderseite (zur Kamera) -Y
  - Ursprung = Mitte des gehaltenen Pods: das Spiel setzt das Schiff so, dass der Pod genau dort hängt
  - Animierte Teile: Fan_0..3 (drehen um die Hochachse), Clamp_F / Clamp_B (Klammern, Drehpunkt oben,
    öffnen um die Querachse), Cable (Seil der Winde, wird in der Höhe skaliert)
  - Materialien: ThrusterGlow (Schub), Beacon (Rundumleuchte), NavRed / NavGreen (Positionslichter)
  - Empties: Lamp_Spot (Suchscheinwerfer nach unten), Lamp_Beacon, Lamp_Thruster
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from bl_helpers import (add_box, add_cyl, add_sphere, add_torus, args, empty, export, hazard_stripes,  # noqa: E402
                        material, new_object, preview, reset, rust_patches, text)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'dropship.glb')
PREVIEW = args()
reset()


def glass(name, color, alpha, emit, strength):
    m = material(name, color, 0.0, 0.05, emit=emit, strength=strength)
    m.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = alpha
    m.surface_render_method = 'BLENDED'
    return m


MAT = {
    'hull': material('ShipHull', (0.14, 0.145, 0.15), 0.5, 0.55),
    'hull_rust': material('ShipRust', (0.22, 0.09, 0.035), 0.3, 0.85),
    'panel': material('ShipPanel', (0.72, 0.38, 0.04), 0.35, 0.45),
    'dark': material('ShipDark', (0.03, 0.03, 0.035), 0.6, 0.5),
    'steel': material('Steel', (0.45, 0.46, 0.48), 0.8, 0.35),
    'blade': material('FanBlade', (0.25, 0.25, 0.27), 0.7, 0.4),
    'hazard_y': material('HazardYellow', (0.75, 0.52, 0.02), 0.2, 0.55),
    'hazard_k': material('HazardBlack', (0.02, 0.02, 0.02), 0.2, 0.6),
    'decal': material('Decal', (0.82, 0.8, 0.72), 0.0, 0.6),
    'glass': glass('CockpitGlass', (0.2, 0.5, 0.6), 0.75, (0.25, 0.7, 0.8), 0.6),
    'window': material('ShipWindow', (0.2, 0.12, 0.04), 0.0, 0.3, emit=(1.0, 0.62, 0.25), strength=2.5),
    'thruster': material('ThrusterGlow', (0.5, 0.25, 0.05), 0.0, 0.2, emit=(1.0, 0.55, 0.2), strength=8),
    'beacon': material('Beacon', (0.4, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.08, 0.03), strength=8),
    'nav_r': material('NavRed', (0.4, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.05, 0.02), strength=6),
    'nav_g': material('NavGreen', (0.02, 0.4, 0.05), 0.0, 0.3, emit=(0.1, 1.0, 0.25), strength=6),
    'lamp': material('SpotLens', (0.9, 0.9, 0.8), 0.0, 0.2, emit=(1.0, 0.95, 0.8), strength=8),
}


def bevel_box(bm, size, loc, mat_index=0, w=0.03, rot=None):
    v = add_box(bm, size, loc, rot=rot, mat_index=mat_index)
    edges = list({e for x in v for e in x.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=w, segments=3, affect='EDGES', profile=0.5)
    return v


BELLY = 0.42      # Unterkante des Rumpfs (der Pod hängt darunter)
TOP = 1.0         # Oberkante des Rumpfs
FRONT_Y = -0.38   # Seitenwand zur Kamera

# ---------------------------------------------------------------- Rumpf
bm = bmesh.new()
bevel_box(bm, (2.8, 0.76, TOP - BELLY), (-0.1, 0, (TOP + BELLY) / 2), w=0.08)            # Hauptrumpf
bevel_box(bm, (2.0, 0.5, 0.15), (-0.2, 0, TOP + 0.07), w=0.05)                         # Rückengrat
v = add_cyl(bm, 0.3, 0.6, (1.55, 0, 0.72), axis='X', segs=24, r2=0.11)                  # Nase
bmesh.ops.scale(bm, vec=(1, 1.25, 1), verts=v, space=Matrix.Translation((-1.55, 0, -0.72)))
bevel_box(bm, (0.5, 0.9, 0.62), (-1.7, 0, 0.74), w=0.06)                                # Triebwerksblock
hull = new_object('Hull', bm, [MAT['hull'], MAT['hull_rust']], smooth=True, sharp_angle=40)
rust_patches(hull, 0, 1, chance=0.05, low_bonus=0.2, height=1.2, seed=5)

# farbige Panele und Warnstreifen auf der Seite (zur Kamera)
bm = bmesh.new()
bevel_box(bm, (0.9, 0.02, 0.26), (0.55, FRONT_Y - 0.005, 0.78), w=0.02)                 # Panel vorne
bevel_box(bm, (0.5, 0.02, 0.3), (-1.7, -0.455, 0.76), w=0.02)                           # Panel Triebwerk
bevel_box(bm, (2.0, 0.54, 0.02), (-0.2, 0, TOP + 0.15), w=0.01)                         # Streifen oben
new_object('Panels', bm, MAT['panel'], smooth=True)
bm = bmesh.new()
hazard_stripes(bm, -1.4, 1.2, BELLY + 0.02, BELLY + 0.1, FRONT_Y - 0.006, width=0.1)
new_object('BellyStripes', bm, [MAT['hazard_y'], MAT['hazard_k']])

# Schriftzüge
text('Logo', 'HUSK  H.I.', 0.2, (-0.45, FRONT_Y - 0.01, 0.74), MAT['decal'], extrude=0.004)
text('Callsign', 'MD-07', 0.09, (0.55, FRONT_Y - 0.02, 0.78), MAT['hazard_k'], extrude=0.003)
text('Warning', 'CARGO  RELEASE', 0.05, (-0.4, FRONT_Y - 0.01, 0.56), MAT['hazard_y'], extrude=0.002)

# Cockpit und Fensterreihe
bm = bmesh.new()
bevel_box(bm, (0.4, 0.6, 0.16), (1.2, 0, 0.98), w=0.04, rot=Matrix.Rotation(math.radians(-22), 3, 'Y'))
new_object('Cockpit', bm, MAT['glass'], smooth=True)
bm = bmesh.new()
for i in range(4):
    add_box(bm, (0.1, 0.02, 0.07), (-1.2 + i * 0.16, FRONT_Y - 0.005, 0.88))
new_object('Windows', bm, MAT['window'])

# Lüftungsgitter auf dem Rücken, Antenne
bm = bmesh.new()
for i in range(8):
    add_box(bm, (0.03, 0.34, 0.03), (-0.9 + i * 0.09, 0, TOP + 0.17))
add_cyl(bm, 0.012, 0.35, (-0.9, 0.15, TOP + 0.3), segs=8)
add_cyl(bm, 0.008, 0.25, (-0.8, 0.15, TOP + 0.27), segs=8)
new_object('Vents', bm, MAT['dark'])

# ---------------------------------------------------------------- Triebwerke hinten
bm = bmesh.new()
for y in (-0.22, 0.22):
    add_cyl(bm, 0.15, 0.18, (-2.0, y, 0.72), axis='X', segs=24, r2=0.19)                # Düsenglocke
    add_torus(bm, 0.19, 0.02, (-2.09, y, 0.72), axis='X', segs=24, rsegs=6)
new_object('Nozzles', bm, MAT['dark'], smooth=True)
bm = bmesh.new()
for y in (-0.22, 0.22):
    add_cyl(bm, 0.13, 0.02, (-2.08, y, 0.72), axis='X', segs=24)
new_object('ThrusterCores', bm, MAT['thruster'])
empty('Lamp_Thruster', (-2.3, 0, 0.72))

# ---------------------------------------------------------------- Mantelpropeller (vier Stück)
FANS = [(0.8, -0.74), (0.8, 0.74), (-1.05, -0.74), (-1.05, 0.74)]
FAN_Z = TOP + 0.02
bm = bmesh.new()
for x, y in FANS:
    add_cyl(bm, 0.31, 0.14, (x, y, FAN_Z), segs=36, cap=False)                          # Mantelrohr
    add_cyl(bm, 0.27, 0.14, (x, y, FAN_Z), segs=36, cap=False)                          # Innenwand
    add_torus(bm, 0.29, 0.03, (x, y, FAN_Z + 0.07), segs=36, rsegs=8)                    # Lippe oben
    add_torus(bm, 0.29, 0.025, (x, y, FAN_Z - 0.07), segs=36, rsegs=8)                   # Lippe unten
    add_box(bm, (0.14, abs(y) - 0.3, 0.1), (x, math.copysign((abs(y) + 0.38) / 2 - 0.04, y), FAN_Z - 0.04))  # Ausleger
    add_cyl(bm, 0.06, 0.1, (x, y, FAN_Z), segs=16)                                      # Nabe
    for a in range(4):                                                                   # Streben
        ang = a * math.pi / 2 + math.pi / 4
        add_box(bm, (0.26, 0.015, 0.015), (x + 0.13 * math.cos(ang), y + 0.13 * math.sin(ang), FAN_Z - 0.05),
                rot=Matrix.Rotation(ang, 3, 'Z'))
new_object('FanDucts', bm, MAT['hull'], smooth=True)
bm = bmesh.new()
for x, y in FANS:                                                                        # Warnring am Mantel
    add_cyl(bm, 0.315, 0.035, (x, y, FAN_Z + 0.02), segs=36, cap=False)
new_object('FanBands', bm, MAT['panel'], smooth=True)
for i, (x, y) in enumerate(FANS):
    bm = bmesh.new()
    for k in range(6):
        v = add_box(bm, (0.24, 0.055, 0.008), (0.14, 0, 0))
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.radians(28), 3, 'X'))
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(k * 2 * math.pi / 6, 3, 'Z'))
    new_object(f'Fan_{i}', bm, MAT['blade'], origin=(x, y, FAN_Z))
bm = bmesh.new()
for (x, y), mat in zip(FANS, (1, 1, 0, 0)):                                              # Positionslichter
    add_sphere(bm, 0.035, (x + (0.33 if x > 0 else -0.33), y, FAN_Z), segs=10, rings=6, mat_index=mat)
new_object('NavLights', bm, [MAT['nav_r'], MAT['nav_g']])

# ---------------------------------------------------------------- Rundumleuchte und Suchscheinwerfer
bm = bmesh.new()
add_cyl(bm, 0.05, 0.04, (0.2, 0, TOP + 0.17), segs=16)
new_object('BeaconBase', bm, MAT['dark'])
bm = bmesh.new()
add_sphere(bm, 0.045, (0.2, 0, TOP + 0.22), segs=12, rings=8)
new_object('BeaconLight', bm, MAT['beacon'])
empty('Lamp_Beacon', (0.2, 0, TOP + 0.3))
bm = bmesh.new()
add_cyl(bm, 0.07, 0.06, (1.25, 0, BELLY + 0.02), segs=16, mat_index=0)
add_cyl(bm, 0.055, 0.01, (1.25, 0, BELLY - 0.015), segs=16, mat_index=1)
new_object('Searchlight', bm, [MAT['dark'], MAT['lamp']])
empty('Lamp_Spot', (1.25, 0, BELLY - 0.05))

# ---------------------------------------------------------------- Greifklammer mit Winde
bm = bmesh.new()
bevel_box(bm, (1.0, 0.56, 0.1), (0, 0, BELLY - 0.03), w=0.02)                            # Windengehäuse
add_cyl(bm, 0.05, 0.5, (0, 0, BELLY - 0.03), axis='Y', segs=16, mat_index=1)             # Trommel
new_object('Winch', bm, [MAT['dark'], MAT['steel']], smooth=True)
bm = bmesh.new()
hazard_stripes(bm, -0.48, 0.48, BELLY - 0.075, BELLY + 0.01, -0.283, width=0.07)
new_object('WinchStripes', bm, [MAT['hazard_y'], MAT['hazard_k']])
bm = bmesh.new()
add_cyl(bm, 0.01, 1.0, (0, 0, -0.5), segs=8)                                             # Seil: Länge 1 nach unten
new_object('Cable', bm, MAT['steel'], origin=(0, 0, BELLY - 0.08))

HINGE_Z = BELLY - 0.07
for name, s in (('Clamp_F', 1), ('Clamp_B', -1)):
    bm = bmesh.new()
    x0 = 0.36 * s
    add_cyl(bm, 0.035, 0.42, (0, 0, 0), axis='Y', segs=12, mat_index=1)                 # Gelenk
    for y in (-0.16, 0.16):
        bevel_box(bm, (0.06, 0.05, 0.5), (0.02 * s, y, -0.25), w=0.012)                 # Arme
        v = bevel_box(bm, (0.14, 0.05, 0.05), (-0.03 * s, y, -0.5), w=0.012)            # Haken nach innen
    bevel_box(bm, (0.05, 0.36, 0.05), (0.03 * s, 0, -0.2), w=0.01, mat_index=2)         # Querstrebe
    new_object(name, bm, [MAT['panel'], MAT['steel'], MAT['hazard_y']], smooth=True, origin=(x0, 0, HINGE_Z))

export(OUT)

if PREVIEW:
    # Pod zum Größenvergleich andeuten (nur fürs Bild)
    bm = bmesh.new()
    bevel_box(bm, (0.56, 0.3, 0.42), (0, 0, -0.05), w=0.05)
    new_object('PodDummy', bm, material('PodDummy', (0.9, 0.45, 0.04), 0.3, 0.4))
    for ob in bpy.context.scene.collection.objects:
        ob.location.z += 1.2
    preview(PREVIEW, cam_loc=(0.8, -6.5, 2.6), target=(-0.2, 0, 1.9), lens=45, size=(1200, 700))
