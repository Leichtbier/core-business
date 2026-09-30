"""Baut den Save-Pod (schwebende Speicherstation über der Oberfläche) und exportiert ihn als save_pod.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/save_pod.py -- [--preview pfad.png]

Vorbild ist savePodMC aus dem Original: ein runder, olivgrauer Schwebekörper mit Glaskuppel, einer
Klappe oben (zwei Hälften, die sich zur Seite öffnen), langer Antenne rechts, Gabelantenne links und
zwei kurzen Düsenrohren. Er schwebt bei x = 850..923 px, y = -50..48 px (73 x 98 px Trefferfläche).

Konventionen für three.js (1 Einheit = 1 Tile = 50 px):
  - Ursprung: Mitte der Trefferfläche (1.46 x 1.96), Vorderseite zeigt nach -Y
  - Klappenhälften "Hatch_L" / "Hatch_R" drehen sich um ihre Außenkante (Blender-Y = Tiefe)
  - Materialien "SignGlow" (Schriftzug, flackert) und "ThrusterGlow" (Schwebedüse, pulsiert)
  - Empties "Lamp_*" werden im Spiel zu Lichtern
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from bl_helpers import (add_box, add_cyl, add_sphere, add_torus, args, empty, export,  # noqa: E402
                        material, new_object, preview, reset, text)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'save_pod.glb')
PREVIEW = args()
reset()

MAT = {
    'hull': material('PodOlive', (0.2, 0.19, 0.13), 0.45, 0.55),
    'hull_dark': material('PodOliveDark', (0.09, 0.085, 0.06), 0.45, 0.6),
    'chrome': material('Chrome', (0.55, 0.56, 0.58), 0.8, 0.3),
    'steel': material('DarkSteel', (0.08, 0.08, 0.09), 0.7, 0.55),
    'glass': material('DomeGlass', (0.25, 0.4, 0.55), 0.2, 0.08, emit=(0.35, 0.6, 0.9), strength=0.35),
    'panel': material('HatchPanel', (0.5, 0.5, 0.52), 0.6, 0.35),
    'sign': material('SignGlow', (0.02, 0.15, 0.05), 0.0, 0.4, emit=(0.3, 1.0, 0.45), strength=6),
    'thruster': material('ThrusterGlow', (0.3, 0.2, 0.1), 0.0, 0.3, emit=(1.0, 0.55, 0.2), strength=5),
    'beacon': material('BeaconRed', (0.4, 0.02, 0.01), 0.0, 0.3, emit=(1.0, 0.05, 0.02), strength=7),
    'button': material('ButtonGrey', (0.35, 0.34, 0.3), 0.3, 0.5),
}

BODY_Z = -0.42   # Mitte des runden Körpers (untere Hälfte der Trefferfläche)
BODY_R = 0.5

# ---------------------------------------------------------------- runder Körper
bm = bmesh.new()
v = add_sphere(bm, 1.0, (0, 0, 0), segs=32, rings=16)
bmesh.ops.scale(bm, vec=Vector((BODY_R, 0.3, BODY_R * 0.92)), verts=v)
bmesh.ops.translate(bm, vec=Vector((0, 0, BODY_Z)), verts=v)
new_object('Body', bm, MAT['hull'], smooth=True)

# Wulst rund um den Körper (in der Bildebene) und dunkle Fuge davor
bm = bmesh.new()
add_torus(bm, BODY_R - 0.02, 0.07, (0, 0, BODY_Z), axis='Y', segs=40, rsegs=10)
new_object('Rim', bm, MAT['hull'], smooth=True)
bm = bmesh.new()
add_torus(bm, BODY_R - 0.14, 0.018, (0, -0.24, BODY_Z), axis='Y', segs=40, rsegs=6)
new_object('Seam', bm, MAT['hull_dark'], smooth=True)

# Glaskuppel vorne unten
bm = bmesh.new()
v = add_sphere(bm, 1.0, (0, 0, 0), segs=24, rings=12)
bmesh.ops.scale(bm, vec=Vector((0.27, 0.16, 0.2)), verts=v)
bmesh.ops.translate(bm, vec=Vector((0, -0.2, BODY_Z - 0.12)), verts=v)
new_object('Dome', bm, MAT['glass'], smooth=True)
bm = bmesh.new()
add_torus(bm, 0.27, 0.025, (0, -0.285, BODY_Z - 0.12), axis='Y', segs=32, rsegs=6)
new_object('DomeFrame', bm, MAT['chrome'], smooth=True)

# Knöpfe rechts unten (wie im Original drei runde Tasten)
bm = bmesh.new()
for (x, dz, r) in ((0.37, 0.1, 0.04), (0.41, -0.08, 0.05), (0.33, -0.26, 0.045)):
    k = min(0.97, math.hypot(x, dz) / BODY_R)
    add_cyl(bm, r, 0.06, (x, -0.3 * math.sqrt(1 - k * k) - 0.01, BODY_Z + dz), axis='Y', segs=14)
new_object('Buttons', bm, MAT['button'], smooth=True)

# ---------------------------------------------------------------- Klappengehäuse oben
HZ = BODY_Z + BODY_R * 0.8  # Unterkante des Gehäuses
bm = bmesh.new()
add_box(bm, (0.6, 0.36, 0.34), (0, 0, HZ + 0.12))
add_box(bm, (0.66, 0.4, 0.05), (0, 0, HZ + 0.3), mat_index=1)   # Rahmen der Klappe
add_box(bm, (0.5, 0.02, 0.18), (0, -0.185, HZ + 0.1), mat_index=2)  # Lüftungsblech vorne
for i in range(4):
    add_box(bm, (0.44, 0.012, 0.012), (0, -0.197, HZ + 0.04 + i * 0.04), mat_index=1)
new_object('HatchHousing', bm, [MAT['hull'], MAT['hull_dark'], MAT['panel']])

# Bügel über der Klappe (wie die gebogenen Rohre im Original)
bm = bmesh.new()
for side in (-1, 1):
    add_cyl(bm, 0.022, 0.26, (side * 0.36, 0, HZ + 0.3), segs=10)
    add_torus(bm, 0.1, 0.022, (side * 0.26, 0, HZ + 0.43), axis='Y', segs=16, rsegs=6)
add_cyl(bm, 0.022, 0.34, (0, 0, HZ + 0.53), axis='X', segs=10)
new_object('HatchBars', bm, MAT['chrome'], smooth=True)

# Schriftzug SAVE vorne am Gehäuse
text('SaveSign', 'SAVE', 0.13, (0, -0.207, HZ + 0.22), MAT['sign'], extrude=0.008)
empty('Lamp_SaveSign', (0, -0.3, HZ + 0.22))

# Klappenhälften: Ursprung an der Außenkante (Scharnier), öffnen im Spiel nach außen
for name, side in (('Hatch_L', -1), ('Hatch_R', 1)):
    bm = bmesh.new()
    add_box(bm, (0.29, 0.34, 0.04), (-side * 0.145, 0, 0))
    add_box(bm, (0.22, 0.26, 0.02), (-side * 0.145, 0, 0.03), mat_index=1)
    new_object(name, bm, [MAT['panel'], MAT['hull_dark']], origin=(side * 0.3, 0, HZ + 0.34))

# ---------------------------------------------------------------- Antennen
bm = bmesh.new()
add_cyl(bm, 0.045, 0.08, (0.16, 0, HZ + 0.36), segs=12)            # Sockel auf dem Gehäuse
add_cyl(bm, 0.014, 0.9, (0.16, 0, HZ + 0.84), segs=8)              # Mast
add_cyl(bm, 0.03, 0.05, (0.16, 0, HZ + 1.1), segs=10)              # Verdickung oben
new_object('Antenna', bm, MAT['chrome'], smooth=True)
bm = bmesh.new()
add_sphere(bm, 0.035, (0.16, 0, HZ + 1.31))
new_object('AntennaTip', bm, MAT['beacon'], smooth=True)
empty('Lamp_Beacon_Antenna', (0.16, -0.05, HZ + 1.31))

# Gabelantenne links: zwei Stäbe mit Querstreben, unten gebogen am Körper befestigt
bm = bmesh.new()
for dx in (-0.04, 0.04):
    add_cyl(bm, 0.01, 0.62, (-0.64 + dx, 0, BODY_Z + 0.08), segs=6)
for i in range(4):
    add_cyl(bm, 0.008, 0.12, (-0.64, 0, BODY_Z + 0.26 + i * 0.045), axis='X', segs=6)
add_cyl(bm, 0.014, 0.16, (-0.55, 0, BODY_Z - 0.12), axis='X', segs=8)
add_cyl(bm, 0.014, 0.16, (-0.55, 0, BODY_Z + 0.02), axis='X', segs=8)
new_object('ForkAntenna', bm, MAT['steel'], smooth=True)

# Düsenrohre rechts
bm = bmesh.new()
for z, ln in ((BODY_Z - 0.05, 0.3), (BODY_Z - 0.2, 0.22)):
    add_cyl(bm, 0.028, ln, (BODY_R + ln / 2 - 0.05, 0, z), axis='X', segs=10)
    add_cyl(bm, 0.04, 0.04, (BODY_R + ln - 0.05, 0, z), axis='X', segs=10, mat_index=1)
new_object('SidePipes', bm, [MAT['chrome'], MAT['steel']], smooth=True)

# Schwebedüse unten
bm = bmesh.new()
add_cyl(bm, 0.12, 0.12, (0, 0, BODY_Z - BODY_R * 0.92 - 0.02), r2=0.16, segs=16)
new_object('Nozzle', bm, MAT['steel'], smooth=True)
bm = bmesh.new()
add_cyl(bm, 0.1, 0.02, (0, 0, BODY_Z - BODY_R * 0.92 - 0.085), segs=16)
new_object('NozzleGlow', bm, MAT['thruster'])
empty('Lamp_Thruster', (0, -0.1, BODY_Z - BODY_R * 0.92 - 0.2))

export(OUT)
if PREVIEW:
    import bpy  # noqa: E402
    for ob in bpy.context.scene.collection.objects:  # für das Bild über die Bodenplatte heben
        ob.location.z += 1.3
    preview(PREVIEW, cam_loc=(0.9, -3.6, 1.5), target=(0, 0, 1.25), lens=50, size=(700, 900))
