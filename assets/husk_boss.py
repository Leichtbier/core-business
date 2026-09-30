"""Baut den Endgegner in zwei Phasen und exportiert husk_boss.glb.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/husk_boss.py -- [--preview pfad.png]

Phase 1 "Husk_P1": Mr. Husk im Kevlar-Anzug, mit Staff of Hell (Nahkampf) und Laser-Monokel (Fernkampf).
Phase 2 "Husk_P2": Satan: Bocksbeine mit Hufen, Hörner, glühende Evil Eyes, im Brustkorb der Boiler of
Eternal Infernos (wirft Feuerbälle), Schornsteine auf dem Rücken, Schwanz. Das Gesicht bleibt in beiden
Phasen das von Mr. Husk.

Konventionen für three.js (1 Einheit = 1 Tile; der Pod ist ca. 0.56 breit):
  - Blick nach vorne (-Y, zur Kamera); das Spiel dreht die Figur beim Laufen in Laufrichtung
  - Füße/Hufe bei z = 0, Phase 1 ca. 3 Tiles hoch, Phase 2 ca. 4.5 Tiles
  - Gelenke sind Empties mit festen Namen (Präfix P1_ / P2_), Drehpunkt im Gelenk, keine Grundrotation:
    Hips (Wurzel, Höhe), Torso (Taille), Head (Hals), ArmL/ArmR (Schulter), ForearmL/R (Ellbogen),
    HandL/R, LegL/R (Hüfte), ShinL/R (Knie), FootL/R (Knöchel bzw. Sprunggelenk), bei P2 zusätzlich Tail
  - L ist die Seite bei +X (vom Betrachter aus rechts), der Stab steckt in P1_HandR
  - Leuchtmaterialien: StaffGlow, LaserGlow (Monokel), InfernoGlow (Boiler), EvilEye, ChimneyGlow
  - Empties für Effekte: P1_LaserOrigin (Monokel), P1_StaffTip, P2_BoilerMouth (Feuerbälle), P2_ChimneyL/R
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from bl_helpers import add_box, add_cyl, add_sphere, add_torus, args, material, mesh_from, reset  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'husk_boss.glb')
PREVIEW = args()
scene = reset()

M = {
    'skin': material('HuskSkin', (0.82, 0.55, 0.42), 0.0, 0.55),
    'hair': material('HuskHair', (0.2, 0.13, 0.08), 0.0, 0.6),
    'brow': material('HuskBrow', (0.12, 0.08, 0.05), 0.0, 0.7),
    'lip': material('HuskLip', (0.45, 0.18, 0.14), 0.0, 0.5),
    'eye_w': material('EyeWhite', (0.9, 0.88, 0.84), 0.0, 0.3),
    'iris': material('Iris', (0.22, 0.34, 0.45), 0.0, 0.2),
    'suit': material('Suit', (0.045, 0.048, 0.055), 0.2, 0.55),
    'kevlar': material('KevlarPlate', (0.14, 0.15, 0.11), 0.35, 0.65),
    'shirt': material('Shirt', (0.85, 0.84, 0.8), 0.0, 0.6),
    'shoe': material('Shoe', (0.02, 0.02, 0.02), 0.3, 0.3),
    'metal': material('DarkMetal', (0.1, 0.1, 0.11), 0.7, 0.4),
    'gold': material('Gold', (0.9, 0.62, 0.15), 1.0, 0.25),
    'staff_glow': material('StaffGlow', (0.6, 0.05, 0.02), 0.0, 0.2, emit=(1.0, 0.15, 0.05), strength=10),
    'laser': material('LaserGlow', (0.7, 0.03, 0.02), 0.0, 0.1, emit=(1.0, 0.05, 0.02), strength=14),
    # Phase 2
    'demon': material('DemonSkin', (0.5, 0.06, 0.035), 0.0, 0.55),
    'demon_dark': material('DemonDark', (0.22, 0.025, 0.02), 0.0, 0.65),
    'fur': material('DemonFur', (0.06, 0.03, 0.025), 0.0, 0.95),
    'horn': material('Horn', (0.16, 0.12, 0.1), 0.1, 0.45),
    'hoof': material('Hoof', (0.03, 0.025, 0.02), 0.2, 0.35),
    'claw': material('Claw', (0.08, 0.06, 0.05), 0.2, 0.3),
    'iron': material('BoilerIron', (0.09, 0.085, 0.08), 0.6, 0.5),
    'rust': material('BoilerRust', (0.28, 0.1, 0.04), 0.3, 0.85),
    'inferno': material('InfernoGlow', (0.8, 0.3, 0.05), 0.0, 0.3, emit=(1.0, 0.45, 0.08), strength=10),
    'evil_eye': material('EvilEye', (1.0, 0.8, 0.1), 0.0, 0.2, emit=(1.0, 0.85, 0.15), strength=14),
    'chimney_glow': material('ChimneyGlow', (0.8, 0.3, 0.05), 0.0, 0.3, emit=(1.0, 0.35, 0.05), strength=8),
    'teeth': material('Teeth', (0.9, 0.86, 0.75), 0.0, 0.4),
}


# ---------------------------------------------------------------- Helfer
JOINTS = {}


def joint(name, loc, parent=None):
    """Gelenk (Empty) an Weltposition loc; Kinder drehen sich um diesen Punkt."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.08
    scene.collection.objects.link(e)
    e.location = Vector(loc) - (JOINTS[parent.name] if parent else Vector())
    e.parent = parent
    JOINTS[name] = Vector(loc)
    return e


def part(name, bm, mats, j, smooth=True, sharp=45):
    """Mesh in Weltkoordinaten bauen und an Gelenk j hängen (Geometrie bleibt an ihrem Platz)."""
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
    ob.parent = j
    ob.location = -JOINTS[j.name]
    return ob


def seg(bm, a, b, r1, r2=None, segs=16, mat_index=0, caps=True):
    """Kegelstumpf von Punkt a nach b (Weltkoordinaten), optional mit Kugeln an den Enden."""
    a, b = Vector(a), Vector(b)
    r2 = r1 if r2 is None else r2
    d = b - a
    v = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=d.length)['verts']
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=v, matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=v)
    for f in {f for x in v for f in x.link_faces}:
        f.material_index = mat_index
    if caps:
        add_sphere(bm, r1, a, segs=segs, rings=8, mat_index=mat_index)
        add_sphere(bm, r2, b, segs=segs, rings=8, mat_index=mat_index)


def tube(name, pts, radii, mat, j, res=10):
    """Gebogene Röhre (Hörner, Schwanz, Mund) mit Radius je Stützpunkt."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 4
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, co, r in zip(sp.bezier_points, pts, radii):
        bp.co = co
        bp.radius = r
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    ob = mesh_from(ob, name, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.parent = j
    ob.location = -JOINTS[j.name]
    return ob


def bevel_box(bm, size, loc, mat_index=0, w=0.02, rot=None):
    v = add_box(bm, size, loc, rot=rot, mat_index=mat_index)
    edges = list({e for x in v for e in x.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=w, segments=2, affect='EDGES', profile=0.5)


def head(prefix, j, c, s, skin, hair, demon=False):
    """Kopf von Mr. Husk mit Mittelpunkt c und Größe s: breiter, kantiger Unterkiefer, Tolle,
    zurückweichender Haaransatz, gerade Brauen, schmale Augen, lange Nase, selbstzufriedenes Grinsen."""
    c = Vector(c)
    bm = bmesh.new()
    v = bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=1.0)['verts']
    for p in v:
        x, y, z = p.co
        if z < 0.15:                                   # Unterkiefer breit und kantig
            t = min(1.0, (0.15 - z) / 1.0)
            x *= 1.0 + 0.16 * t
            y *= 1.0 + 0.05 * t
        if z < -0.72:                                  # Kinn flach und breit
            z = -0.72 + (z + 0.72) * 0.35
        if y < -0.5 and -0.1 < z < 0.45:               # Stirn/Augenpartie etwas flacher
            y *= 0.96
        p.co = Vector((x * 0.8, y * 0.88, z * 1.05)) * s + c
    # Ohren
    for sx in (-1, 1):
        w = add_sphere(bm, 0.17 * s, c + Vector((sx * 0.84 * s, 0.05 * s, 0.0)), segs=12, rings=8)
        if demon:                                      # spitze Ohren
            for p in w:
                d = p.co - (c + Vector((sx * 0.84 * s, 0.05 * s, 0.0)))
                if d.z > 0:
                    p.co += Vector((sx * 0.12 * s, 0.05 * s, 0.25 * s)) * (d.z / (0.17 * s))
        else:
            bmesh.ops.scale(bm, vec=(0.5, 1.0, 1.4), verts=w, space=Matrix.Translation(-(c + Vector((sx * 0.84 * s, 0.05 * s, 0)))))
    # Nase: lang und gerade
    seg(bm, c + Vector((0, -0.8 * s, 0.22 * s)), c + Vector((0, -0.98 * s, -0.12 * s)), 0.07 * s, 0.1 * s, segs=12)
    part(prefix + 'Face', bm, skin, j)

    # Haare: Kappe mit zurückweichendem Haaransatz und Tolle vorne
    bm = bmesh.new()
    v = bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=16, radius=1.0)['verts']
    kill = [p for p in v if p.co.z < -0.12 or (p.co.y < -0.3 and p.co.z < 0.55)
            or (abs(p.co.x) > 0.55 and p.co.y < -0.05 and p.co.z < 0.6)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    for p in bm.verts:
        p.co = Vector((p.co.x * 0.9, p.co.y * 0.98, p.co.z * 1.0)) * (s * 1.06) + c + Vector((0, 0.03 * s, 0.12 * s))
    q = c + Vector((0, -0.38 * s, 0.98 * s))                                        # Tolle
    w = add_sphere(bm, 0.55 * s, q, segs=18, rings=10)
    bmesh.ops.scale(bm, vec=(1.2, 0.85, 0.55), verts=w, space=Matrix.Translation(-q))
    bmesh.ops.rotate(bm, verts=w, cent=q, matrix=Matrix.Rotation(-0.3, 3, 'X'))
    part(prefix + 'Hair', bm, hair, j)

    # Brauen, Augen, Mund
    bm = bmesh.new()
    for sx in (-1, 1):
        bevel_box(bm, (0.3 * s, 0.07 * s, 0.07 * s), c + Vector((sx * 0.3 * s, -0.8 * s, 0.3 * s)), w=0.02 * s,
                  rot=Matrix.Rotation(sx * -0.12, 3, 'Y'))
    part(prefix + 'Brows', bm, M['brow'], j)
    if demon:
        for sx, nm in ((1, 'EyeL'), (-1, 'EyeR')):
            bm = bmesh.new()
            w = add_sphere(bm, 0.11 * s, c + Vector((sx * 0.3 * s, -0.76 * s, 0.13 * s)), segs=14, rings=8)
            bmesh.ops.scale(bm, vec=(1.3, 0.6, 0.75), verts=w, space=Matrix.Translation(-(c + Vector((sx * 0.3 * s, -0.76 * s, 0.13 * s)))))
            part(prefix + nm, bm, M['evil_eye'], j)
    else:
        bm = bmesh.new()
        for sx in (-1, 1):
            e = c + Vector((sx * 0.3 * s, -0.74 * s, 0.13 * s))
            w = add_sphere(bm, 0.1 * s, e, segs=14, rings=8)
            bmesh.ops.scale(bm, vec=(1.25, 0.6, 0.6), verts=w, space=Matrix.Translation(-e))
            add_sphere(bm, 0.05 * s, e + Vector((0, -0.05 * s, 0)), segs=10, rings=6, mat_index=1)
        part(prefix + 'Eyes', bm, [M['eye_w'], M['iris']], j)
    # Grinsen (Mundwinkel rechts höher)
    tube(prefix + 'Mouth', [c + Vector((-0.34 * s, -0.8 * s, -0.4 * s)), c + Vector((0, -0.9 * s, -0.5 * s)),
                            c + Vector((0.34 * s, -0.8 * s, -0.36 * s)), c + Vector((0.4 * s, -0.74 * s, -0.28 * s))],
         [0.035 * s, 0.045 * s, 0.035 * s, 0.025 * s], M['lip'], j)
    if demon:                                          # Fangzähne
        bm = bmesh.new()
        for sx in (-1, 1):
            v = add_cyl(bm, 0.035 * s, 0.14 * s, c + Vector((sx * 0.18 * s, -0.88 * s, -0.55 * s)), segs=8, r2=0.0)
            bmesh.ops.rotate(bm, verts=v, cent=c + Vector((sx * 0.18 * s, -0.88 * s, -0.55 * s)), matrix=Matrix.Rotation(math.pi, 3, 'X'))
        part(prefix + 'Fangs', bm, M['teeth'], j)


def hand(prefix, j, c, s, mat, claws=None):
    bm = bmesh.new()
    w = add_sphere(bm, s, c, segs=16, rings=10)
    bmesh.ops.scale(bm, vec=(0.8, 1.0, 1.1), verts=w, space=Matrix.Translation(-Vector(c)))
    for k in range(4):                                  # Finger(knöchel)
        add_sphere(bm, s * 0.32, Vector(c) + Vector(((k - 1.5) * s * 0.38, -s * 0.75, -s * 0.35)), segs=10, rings=6)
    part(prefix, bm, mat, j)
    if claws:
        bm = bmesh.new()
        for k in range(4):
            p = Vector(c) + Vector(((k - 1.5) * s * 0.38, -s * 1.0, -s * 0.5))
            v = add_cyl(bm, s * 0.1, s * 0.5, p, segs=8, r2=0.0)
            bmesh.ops.rotate(bm, verts=v, cent=p, matrix=Matrix.Rotation(math.radians(150), 3, 'X'))
        part(prefix + 'Claws', bm, claws, j)


# ================================================================ Phase 1: Mr. Husk im Kevlar-Anzug
R1 = bpy.data.objects.new('Husk_P1', None)
scene.collection.objects.link(R1)
JOINTS['Husk_P1'] = Vector()
hips = joint('P1_Hips', (0, 0, 1.35), R1)
torso = joint('P1_Torso', (0, 0, 1.4), hips)
neck = joint('P1_Head', (0, 0, 2.3), torso)

bm = bmesh.new()                                        # Oberkörper (Sakko)
seg(bm, (0, 0, 1.45), (0, 0, 2.1), 0.3, 0.36, segs=24)
w = bm.verts[:]
bmesh.ops.scale(bm, vec=(1.25, 0.72, 1.0), verts=w, space=Matrix.Translation((0, 0, -1.75)))
seg(bm, (-0.42, 0, 2.12), (0.42, 0, 2.12), 0.13, segs=16)  # Schulterlinie
seg(bm, (0, 0, 2.1), (0, 0, 2.32), 0.12, 0.1, segs=16, mat_index=1)  # Hals
part('P1_Body', bm, [M['suit'], M['skin']], torso)
bm = bmesh.new()                                        # Hemd und Kragen
v = add_box(bm, (0.26, 0.02, 0.36), (0, -0.265, 1.98))
for p in v:
    if p.co.z < 1.9:
        p.co.x *= 0.1
part('P1_Shirt', bm, M['shirt'], torso, smooth=False)
bm = bmesh.new()                                        # Kevlar-Platten: Brust, Bauch, Schulterstücke
for i, (x, z) in enumerate(((-0.2, 1.9), (0.2, 1.9), (-0.2, 1.68), (0.2, 1.68), (0, 1.5))):
    bevel_box(bm, (0.24, 0.05, 0.18), (x, -0.27, z), w=0.02)
for sx in (-1, 1):
    w = add_sphere(bm, 0.19, (sx * 0.44, 0, 2.14), segs=16, rings=8)
    bmesh.ops.delete(bm, geom=[p for p in w if p.co.z < 2.1], context='VERTS')
part('P1_Kevlar', bm, M['kevlar'], torso)
bm = bmesh.new()                                        # Gürtel mit Schnalle
seg(bm, (0, 0, 1.42), (0, 0, 1.49), 0.33, segs=24, caps=False)
w = bm.verts[:]
bmesh.ops.scale(bm, vec=(1.22, 0.74, 1.0), verts=w, space=Matrix.Translation((0, 0, -1.455)))
bevel_box(bm, (0.12, 0.03, 0.08), (0, -0.25, 1.455), mat_index=1, w=0.01)
part('P1_Belt', bm, [M['shoe'], M['gold']], torso)

head('P1_', neck, (0, 0, 2.62), 0.3, M['skin'], M['hair'])
bm = bmesh.new()                                        # Laser-Monokel vor dem rechten Auge (Betrachter links)
e = Vector((-0.09, -0.26, 2.66))
add_torus(bm, 0.07, 0.012, e, axis='Y', segs=24, rsegs=6)
add_cyl(bm, 0.03, 0.06, e + Vector((-0.08, 0.0, 0.05)), axis='Y', segs=10)
part('P1_MonocleFrame', bm, M['gold'], neck)
bm = bmesh.new()
add_cyl(bm, 0.062, 0.01, e + Vector((0, -0.005, 0)), axis='Y', segs=24)
part('P1_Monocle', bm, M['laser'], neck)
lo = joint('P1_LaserOrigin', e + Vector((0, -0.05, 0)), neck)

for side, sx in (('L', 1), ('R', -1)):
    sh = joint(f'P1_Arm{side}', (sx * 0.46, 0, 2.12), torso)
    el = joint(f'P1_Forearm{side}', (sx * 0.52, -0.02, 1.62), sh)
    hd = joint(f'P1_Hand{side}', (sx * 0.54, -0.06, 1.16), el)
    bm = bmesh.new()
    seg(bm, (sx * 0.46, 0, 2.12), (sx * 0.52, -0.02, 1.62), 0.12, 0.1)
    part(f'P1_UpperArm{side}', bm, M['suit'], sh)
    bm = bmesh.new()
    seg(bm, (sx * 0.52, -0.02, 1.62), (sx * 0.54, -0.06, 1.2), 0.1, 0.085)
    seg(bm, (sx * 0.54, -0.06, 1.24), (sx * 0.54, -0.06, 1.2), 0.095, 0.095, mat_index=1)   # Manschette
    part(f'P1_Lower{side}', bm, [M['kevlar'], M['shirt']], el)
    hand(f'P1_Fist{side}', hd, (sx * 0.54, -0.07, 1.1), 0.085, M['skin'])

    hip = joint(f'P1_Leg{side}', (sx * 0.18, 0, 1.36), hips)
    kn = joint(f'P1_Shin{side}', (sx * 0.19, 0, 0.72), hip)
    an = joint(f'P1_Foot{side}', (sx * 0.19, 0, 0.1), kn)
    bm = bmesh.new()
    seg(bm, (sx * 0.18, 0, 1.36), (sx * 0.19, 0, 0.72), 0.15, 0.12)
    part(f'P1_Thigh{side}', bm, M['suit'], hip)
    bm = bmesh.new()
    seg(bm, (sx * 0.19, 0, 0.72), (sx * 0.19, 0, 0.12), 0.12, 0.09)
    bevel_box(bm, (0.2, 0.06, 0.34), (sx * 0.19, -0.12, 0.45), mat_index=1, w=0.02)       # Schienbeinplatte
    part(f'P1_Calf{side}', bm, [M['suit'], M['kevlar']], kn)
    bm = bmesh.new()
    bevel_box(bm, (0.18, 0.4, 0.12), (sx * 0.19, -0.09, 0.06), w=0.04)
    part(f'P1_Shoe{side}', bm, M['shoe'], an)

# Staff of Hell in der rechten Faust: dunkler Schaft, gezackter Kopf mit glühender Kugel
hr = bpy.data.objects['P1_HandR']
bm = bmesh.new()
seg(bm, (-0.54, -0.1, 0.1), (-0.54, -0.1, 2.55), 0.03, 0.035, segs=10)
add_torus(bm, 0.05, 0.015, (-0.54, -0.1, 1.3), segs=16, rsegs=6, mat_index=1)
add_torus(bm, 0.05, 0.015, (-0.54, -0.1, 0.9), segs=16, rsegs=6, mat_index=1)
for k in range(3):                                      # Dreizack-Zinken um die Kugel
    a = k * 2 * math.pi / 3
    tip = Vector((-0.54 + 0.16 * math.cos(a), -0.1 + 0.16 * math.sin(a), 2.95))
    seg(bm, (-0.54 + 0.05 * math.cos(a), -0.1 + 0.05 * math.sin(a), 2.55), tip, 0.025, 0.0, segs=8, caps=False, mat_index=1)
part('P1_Staff', bm, [M['metal'], M['gold']], hr)
bm = bmesh.new()
add_sphere(bm, 0.11, (-0.54, -0.1, 2.72), segs=18, rings=10)
part('P1_StaffOrb', bm, M['staff_glow'], hr)
joint('P1_StaffTip', (-0.54, -0.1, 2.72), hr)


# ================================================================ Phase 2: Satan
R2 = bpy.data.objects.new('Husk_P2', None)
scene.collection.objects.link(R2)
JOINTS['Husk_P2'] = Vector()
hips = joint('P2_Hips', (0, 0, 2.0), R2)
torso = joint('P2_Torso', (0, 0, 2.05), hips)
neck = joint('P2_Head', (0, 0, 3.45), torso)

bm = bmesh.new()                                        # mächtiger Oberkörper
seg(bm, (0, 0, 2.1), (0, 0, 3.2), 0.46, 0.66, segs=28)
w = bm.verts[:]
bmesh.ops.scale(bm, vec=(1.15, 0.7, 1.0), verts=w, space=Matrix.Translation((0, 0, -2.65)))
seg(bm, (-0.8, 0, 3.25), (0.8, 0, 3.25), 0.26, segs=18)  # Schultern
seg(bm, (0, 0, 3.2), (0, 0, 3.52), 0.24, 0.2, segs=18)   # Nacken
part('P2_Body', bm, M['demon'], torso)
# Boiler of Eternal Infernos in der Brust
bc = Vector((0, -0.42, 2.9))
bm = bmesh.new()
add_cyl(bm, 0.36, 0.2, bc, axis='Y', segs=32)
add_torus(bm, 0.36, 0.04, bc + Vector((0, -0.1, 0)), axis='Y', segs=32, rsegs=8)
for k in range(12):                                     # Nieten
    a = k * math.pi / 6
    add_sphere(bm, 0.022, bc + Vector((0.36 * math.cos(a), -0.14, 0.36 * math.sin(a))), segs=8, rings=4, mat_index=1)
for x in (-0.16, -0.05, 0.06, 0.17):                    # Gitterstäbe vor der Glut
    add_box(bm, (0.025, 0.03, 0.5), bc + Vector((x, -0.14, 0)), mat_index=0)
part('P2_Boiler', bm, [M['iron'], M['rust']], torso)
bm = bmesh.new()
add_cyl(bm, 0.3, 0.02, bc + Vector((0, -0.12, 0)), axis='Y', segs=32)  # vor der Kesselfront
part('P2_BoilerFire', bm, M['inferno'], torso)
joint('P2_BoilerMouth', bc + Vector((0, -0.3, 0)), torso)
for side, sx in (('L', 1), ('R', -1)):                  # Schornsteine auf dem Rücken
    bm = bmesh.new()
    seg(bm, (sx * 0.4, 0.4, 3.0), (sx * 0.5, 0.45, 4.05), 0.1, 0.12, segs=14)
    add_torus(bm, 0.13, 0.03, (sx * 0.5, 0.45, 4.05), segs=18, rsegs=6)
    part(f'P2_ChimneyPipe{side}', bm, M['iron'], torso)
    bm = bmesh.new()
    add_cyl(bm, 0.1, 0.02, (sx * 0.5, 0.45, 4.07), segs=16)
    part(f'P2_ChimneyFire{side}', bm, M['chimney_glow'], torso)
    joint(f'P2_Chimney{side}', (sx * 0.5, 0.45, 4.15), torso)

# Kopf mit Hörnern
head('P2_', neck, (0, 0, 3.95), 0.52, M['demon'], M['fur'], demon=True)
for sx, nm in ((1, 'L'), (-1, 'R')):                    # gebogene Hörner aus dem Haar
    b = Vector((sx * 0.26, -0.05, 4.33))
    tube(f'P2_Horn{nm}', [b, b + Vector((sx * 0.3, 0.05, 0.25)), b + Vector((sx * 0.62, 0.1, 0.2)),
                          b + Vector((sx * 0.78, 0.0, 0.55)), b + Vector((sx * 0.7, -0.12, 0.92))],
         [0.11, 0.09, 0.07, 0.045, 0.005], M['horn'], neck)

for side, sx in (('L', 1), ('R', -1)):
    # Arme mit Klauen
    sh = joint(f'P2_Arm{side}', (sx * 0.86, 0, 3.25), torso)
    el = joint(f'P2_Forearm{side}', (sx * 1.0, 0.02, 2.55), sh)
    hd = joint(f'P2_Hand{side}', (sx * 1.06, -0.05, 1.92), el)
    bm = bmesh.new()
    seg(bm, (sx * 0.86, 0, 3.25), (sx * 1.0, 0.02, 2.55), 0.22, 0.17)
    part(f'P2_UpperArm{side}', bm, M['demon'], sh)
    bm = bmesh.new()
    seg(bm, (sx * 1.0, 0.02, 2.55), (sx * 1.06, -0.05, 1.98), 0.17, 0.13)
    part(f'P2_Lower{side}', bm, M['demon'], el)
    hand(f'P2_Claw{side}', hd, (sx * 1.06, -0.07, 1.82), 0.14, M['demon_dark'], claws=M['claw'])
    # Bocksbeine: Oberschenkel nach vorn, Unterschenkel nach hinten, Mittelfuß senkrecht, Huf
    hip = joint(f'P2_Leg{side}', (sx * 0.34, 0, 2.02), hips)
    kn = joint(f'P2_Shin{side}', (sx * 0.38, -0.3, 1.25), hip)
    hk = joint(f'P2_Foot{side}', (sx * 0.38, 0.22, 0.62), kn)
    bm = bmesh.new()
    seg(bm, (sx * 0.34, 0, 2.02), (sx * 0.38, -0.3, 1.25), 0.3, 0.2)
    part(f'P2_Thigh{side}', bm, M['fur'], hip)
    bm = bmesh.new()
    seg(bm, (sx * 0.38, -0.3, 1.25), (sx * 0.38, 0.22, 0.62), 0.18, 0.12)
    part(f'P2_Calf{side}', bm, M['fur'], kn)
    bm = bmesh.new()
    seg(bm, (sx * 0.38, 0.22, 0.62), (sx * 0.38, 0.12, 0.16), 0.11, 0.1)
    part(f'P2_Cannon{side}', bm, M['demon_dark'], hk)
    bm = bmesh.new()
    add_cyl(bm, 0.15, 0.16, (sx * 0.38, 0.08, 0.08), segs=16, r2=0.12)
    add_box(bm, (0.03, 0.2, 0.16), (sx * 0.38, -0.05, 0.08))                 # gespaltener Huf
    part(f'P2_Hoof{side}', bm, M['hoof'], hk)

tail = joint('P2_Tail', (0, 0.35, 2.05), hips)          # Schwanz mit Pfeilspitze
tube('P2_TailRope', [(0, 0.35, 2.05), (0, 0.9, 1.6), (0.3, 1.2, 0.9), (0.7, 1.0, 0.55), (1.0, 0.7, 0.6)],
     [0.07, 0.055, 0.045, 0.035, 0.03], M['demon'], tail)
bm = bmesh.new()
v = add_cyl(bm, 0.12, 0.22, (1.1, 0.6, 0.62), segs=3, r2=0.0)
bmesh.ops.rotate(bm, verts=v, cent=Vector((1.1, 0.6, 0.62)), matrix=Vector((0, 0, 1)).rotation_difference(Vector((0.8, -0.6, 0.05))).to_matrix())
part('P2_TailTip', bm, M['demon_dark'], tail, smooth=False)

# ---------------------------------------------------------------- Export
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          use_selection=False, export_cameras=False, export_lights=False)
print('EXPORTED', OUT, os.path.getsize(OUT))

if PREVIEW:
    R1.location = (-1.6, 0, 0)
    R2.location = (1.4, 0, 0)
    if '--turn' in sys.argv:                          # Schrägansicht (Laufrichtung)
        R1.rotation_euler.z = R2.rotation_euler.z = math.radians(-55)
    bm = bmesh.new()                                     # Pod-Attrappe für den Größenvergleich
    bevel_box(bm, (0.56, 0.3, 0.42), (-3.1, -0.2, 0.21), w=0.05)
    me = bpy.data.meshes.new('PodDummy')
    bm.to_mesh(me)
    pod = bpy.data.objects.new('PodDummy', me)
    me.materials.append(material('PodDummy', (0.9, 0.45, 0.04), 0.3, 0.4))
    scene.collection.objects.link(pod)
    from bl_helpers import preview
    preview(PREVIEW, cam_loc=(0.2, -9.5, 2.9), target=(-0.2, 0, 2.1), lens=40, size=(1300, 900))
