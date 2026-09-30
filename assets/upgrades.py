"""Baut alle Upgrades (je Kategorie und Stufe ein Modell), exportiert upgrades.glb und rendert Icons.

Aufruf (ohne Oberfläche):
  blender -b --factory-startup --python assets/upgrades.py -- [--icons] [--preview pfad.png]

  --icons    rendert assets/upgrades/<kategorie>_<stufe>.png (256 x 256, transparent) für den Upgrade-Shop
  --preview  Übersicht aller Stufen (eine Zeile pro Kategorie)

Konventionen für three.js (1 Einheit = 1 Tile):
  - Jedes Upgrade ist ein Empty "Up_<kategorie>_<stufe>" im Ursprung; Kategorien wie in constants.js:
    drill, hull, engine, fuelTank, radiator, bay
  - Bohrköpfe (Up_drill_*) liegen wie im Pod-Modell entlang +Z (Basis bei z = 0) und werden im Spiel
    anstelle von DrillSide/DrillDown eingesetzt; alle übrigen stehen auf z = 0, Vorderseite nach -Y
  - Die Farben der Panzerplatten (Up_hull_*) entsprechen der Lackierung des Pods (HULL_LOOK in render.js)
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
OUT = os.path.join(HERE, 'upgrades.glb')
ICON_DIR = os.path.join(HERE, 'upgrades')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
ICONS = '--icons' in argv
scene = reset()
rnd = random.Random(7)


def hexcol(h):
    """sRGB-Hex -> lineare Farbe (wie three.js Color.setHex)."""
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def glass(name, color, alpha, emit=None, strength=0.0):
    m = material(name, color, 0.0, 0.05, emit=emit, strength=strength)
    m.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = alpha
    m.surface_render_method = 'BLENDED'
    return m


M = {
    'dark': material('DarkSteel', (0.05, 0.05, 0.055), 0.6, 0.5),
    'steel': material('Steel', (0.5, 0.51, 0.53), 0.85, 0.3),
    'chrome': material('Chrome', (0.85, 0.86, 0.88), 1.0, 0.06),
    'white': material('WhitePaint', (0.8, 0.8, 0.78), 0.3, 0.3),
    'rubber': material('Rubber', (0.02, 0.02, 0.02), 0.0, 0.9),
    'hazard': material('HazardYellow', (0.85, 0.6, 0.03), 0.2, 0.5),
    'black': material('Black', (0.015, 0.015, 0.015), 0.1, 0.6),
    'rust': material('Rust', (0.3, 0.1, 0.035), 0.3, 0.85),
    'copper': material('Copper', (0.6, 0.24, 0.1), 0.9, 0.3),
    'wood': material('Wood', (0.3, 0.17, 0.07), 0.0, 0.8),
    # Mineralien / Werkstoffe
    'ironium': material('Ironium', (0.3, 0.25, 0.22), 0.7, 0.55),
    'bronzium': material('Bronzium', (0.6, 0.33, 0.12), 0.9, 0.35),
    'silver': material('Silverium', (0.8, 0.82, 0.85), 1.0, 0.18),
    'gold': material('Goldium', (1.0, 0.68, 0.18), 1.0, 0.22),
    'platinum': material('Platinium', (0.88, 0.89, 0.9), 1.0, 0.1),
    'einsteinium': material('Einsteinium', (0.3, 0.85, 0.2), 0.2, 0.3, emit=(0.35, 1.0, 0.2), strength=2.5),
    'emerald': material('Emerald', (0.05, 0.7, 0.3), 0.0, 0.05, emit=(0.05, 0.6, 0.25), strength=1.0),
    'ruby': material('Ruby', (0.8, 0.02, 0.08), 0.0, 0.05, emit=(0.6, 0.0, 0.05), strength=1.0),
    'diamond': material('Diamond', (0.85, 0.95, 1.0), 0.0, 0.02, emit=(0.5, 0.7, 0.8), strength=0.8),
    'amazonite': material('Amazonite', (0.15, 0.85, 0.78), 0.2, 0.15, emit=(0.1, 0.9, 0.8), strength=3),
    # Lacke
    'red': material('RedPaint', (0.6, 0.04, 0.02), 0.3, 0.35),
    'blue': material('BluePaint', (0.03, 0.12, 0.5), 0.3, 0.35),
    'orange': material('OrangePaint', (0.92, 0.45, 0.04), 0.35, 0.35),
    'fuel': material('FuelRed', (0.72, 0.16, 0.03), 0.4, 0.35),
    'olive': material('ContainerOlive', (0.2, 0.24, 0.1), 0.3, 0.6),
    'navy': material('ContainerBlue', (0.04, 0.1, 0.25), 0.4, 0.5),
    # Leuchten
    'fuel_glow': material('FuelGlow', (0.4, 0.2, 0.02), 0.0, 0.2, emit=(1.0, 0.5, 0.05), strength=6),
    'cool_glow': material('CoolantGlow', (0.1, 0.4, 0.7), 0.0, 0.2, emit=(0.2, 0.7, 1.0), strength=4),
    'frost': material('FrostGlow', (0.6, 0.9, 1.0), 0.0, 0.2, emit=(0.6, 0.95, 1.0), strength=5),
    'shield': glass('ShieldGlow', (0.3, 0.8, 1.0), 0.3, emit=(0.2, 0.75, 1.0), strength=2.5),
    'gauge': material('GaugeFace', (0.92, 0.9, 0.84), 0.0, 0.4),
    'led_g': material('LedGreen', (0.05, 0.4, 0.1), 0.0, 0.3, emit=(0.2, 1.0, 0.3), strength=5),
}

# Lackierung der Hülle je Stufe (gleiche Werte stehen in render.js, HULL_LOOK)
HULL = [
    (0xeb7310, 0.35, 0.35), (0x6e5a50, 0.6, 0.6), (0xb8763a, 0.8, 0.35), (0x7d8a99, 0.8, 0.3),
    (0xd9dde2, 0.55, 0.2), (0x5fd040, 0.3, 0.35), (0x26345e, 0.6, 0.3),
]
HULL_MAT = [material(f'HullPaint{i}', hexcol(c), m, r) for i, (c, m, r) in enumerate(HULL)]


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


def tube(name, pts, radius, mat, parent, res=8):
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


def bevel_box(bm, size, loc, mat_index=0, w=0.006, rot=None):
    v = add_box(bm, size, loc, rot=rot, mat_index=mat_index)
    edges = list({e for x in v for e in x.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=w, segments=2, affect='EDGES', profile=0.5)


def rotate(bm, verts, angle, axis, pivot=(0, 0, 0)):
    bmesh.ops.rotate(bm, verts=verts, cent=Vector(pivot), matrix=Matrix.Rotation(angle, 3, axis))


def crystal(bm, size, loc, direction=(0, 0, 1), mat_index=0, sides=6):
    """Kleiner Kristall (Doppelpyramide), zeigt in direction."""
    v = add_cyl(bm, size * 0.5, size * 1.2, (0, 0, 0), segs=sides, r2=0.0, mat_index=mat_index)
    w = add_cyl(bm, size * 0.5, size * 0.5, (0, 0, -size * 0.85), segs=sides, r2=0.0, mat_index=mat_index)
    bmesh.ops.rotate(bm, verts=w, matrix=Matrix.Rotation(math.pi, 3, 'X'), cent=Vector((0, 0, -size * 0.6)))
    all_v = v + w
    q = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    bmesh.ops.rotate(bm, verts=all_v, matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=Vector(loc), verts=all_v)


# ================================================================ Bohrer
def drill_bit(bm, length, radius, lobes, turns, rings=20, mat_index=0):
    """Gedrehter Bohrkopf entlang +Z (wie im Pod-Modell), liefert Punkte auf den Schneiden."""
    n = lobes * 2
    ring_verts, ridge = [], []
    for i in range(rings):
        t = i / (rings - 1)
        rr = radius * (1 - t) ** 0.9
        twist = t * turns * 2 * math.pi
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n + twist
            rk = rr * (1.0 if k % 2 == 0 else 0.62)
            ring.append(bm.verts.new((math.cos(a) * rk, math.sin(a) * rk, t * length)))
            if k % 2 == 0 and 0.15 < t < 0.8 and i % 3 == 0:
                ridge.append((Vector((math.cos(a) * rk, math.sin(a) * rk, t * length)), Vector((math.cos(a), math.sin(a), 0.3))))
        ring_verts.append(ring)
    tip = bm.verts.new((0, 0, length + 0.02))
    for i in range(rings - 1):
        a, b = ring_verts[i], ring_verts[i + 1]
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])).material_index = mat_index
    last = ring_verts[-1]
    for k in range(n):
        bm.faces.new((last[k], last[(k + 1) % n], tip)).material_index = mat_index
    bm.faces.new(list(reversed(ring_verts[0]))).material_index = mat_index
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ridge


def build_drill(level, parent):
    specs = [  # Werkstoff, Schneiden, Windungen, Länge, Radius, Einsätze
        ('steel', 5, 1.25, 0.3, 0.12, None),
        ('silver', 6, 1.5, 0.31, 0.12, None),
        ('gold', 4, 1.1, 0.31, 0.12, 'gold'),
        ('emerald', 5, 1.3, 0.32, 0.12, 'emerald'),
        ('ruby', 6, 1.4, 0.32, 0.12, 'ruby'),
        ('diamond', 6, 1.6, 0.33, 0.12, 'diamond'),
        ('amazonite', 5, 1.8, 0.34, 0.115, 'amazonite'),
    ]
    mat, lobes, turns, length, radius, insert = specs[level]
    name = f'Up_drill_{level}'
    bm = bmesh.new()
    ridge = drill_bit(bm, length, radius, lobes, turns)
    add_cyl(bm, radius * 1.05, 0.06, (0, 0, -0.03), segs=24, mat_index=1)         # Halterung
    add_cyl(bm, radius * 0.7, 0.05, (0, 0, -0.08), segs=20, mat_index=1)
    if level >= 2:                                                                   # Zierring an der Basis
        add_torus(bm, radius * 1.05, 0.008, (0, 0, 0.0), segs=32, rsegs=6, mat_index=2)
    mats = [M[mat], M['dark'], M['gold'] if level < 5 else M['platinum']]
    obj(name + '_Bit', bm, mats, parent, sharp=50)
    if insert and insert != 'gold':                                                  # Kristallspitze in Metallfassung
        bm = bmesh.new()
        crystal(bm, 0.05, (0, 0, length + 0.01), (0, 0, 1), sides=8 if insert == 'diamond' else 6)
        obj(name + '_Tip', bm, M[insert], parent, smooth=False)
        bm = bmesh.new()
        add_cyl(bm, 0.03, 0.012, (0, 0, length - 0.035), segs=16)
        obj(name + '_TipMount', bm, M['gold'] if level < 5 else M['platinum'], parent)
    if insert == 'gold':                                                             # Hartmetallzähne
        bm = bmesh.new()
        for p, n in ridge[::2]:
            add_box(bm, (0.016, 0.01, 0.01), p + n * 0.006,
                    rot=Vector((1, 0, 0)).rotation_difference(n).to_matrix())
        obj(name + '_Teeth', bm, M['dark'], parent, smooth=False)
    if level == 6:                                                                   # zweite Schneidstufe
        bm = bmesh.new()
        add_torus(bm, 0.13, 0.012, (0, 0, 0.045), segs=40, rsegs=8)
        for k in range(12):
            a = k * math.pi / 6
            v = add_cyl(bm, 0.01, 0.03, (0.14 * math.cos(a), 0.14 * math.sin(a), 0.05), segs=4, r2=0.0)
            rotate(bm, v, -0.6, 'Z', (0.14 * math.cos(a), 0.14 * math.sin(a), 0.05))
        obj(name + '_Cutter', bm, M['platinum'], parent)


# ================================================================ Hülle (Panzerplatten)
def build_hull(level, parent):
    name = f'Up_hull_{level}'
    W, H = 0.34 + level * 0.01, 0.26 + level * 0.008
    T = 0.02 + level * 0.008
    bm = bmesh.new()
    bevel_box(bm, (W, T, H), (0, 0, H / 2), w=0.012 + level * 0.002)
    if level >= 3:                                                                   # zweite, versetzte Lage
        bevel_box(bm, (W * 0.8, T * 0.6, H * 0.75), (0, -T * 0.7, H / 2), w=0.01)
    if level == 2:                                                                   # Mittelrippe
        bevel_box(bm, (W * 0.9, T * 0.8, 0.03), (0, -T * 0.5, H / 2), w=0.008)
    if level == 4:                                                                   # sechseckiger Buckel
        v = add_cyl(bm, 0.07, 0.03, (0, -T * 1.3, H / 2), axis='Y', segs=6)
    obj(name + '_Plate', bm, HULL_MAT[level], parent, sharp=30)
    # Nieten / Bolzen am Rand
    bm = bmesh.new()
    n = 2 + level
    front = -T / 2 - (T * 0.6 if level >= 3 else 0) * 0
    for i in range(n):
        x = -W / 2 + 0.03 + i * (W - 0.06) / max(1, n - 1)
        for z in (0.025, H - 0.025):
            if level >= 3:
                add_cyl(bm, 0.009, 0.012, (x, front - 0.004, z), axis='Y', segs=6)
            else:
                add_sphere(bm, 0.008, (x, front, z), segs=8, rings=4)
    obj(name + '_Rivets', bm, M['steel'] if level != 4 else M['chrome'], parent)
    if level == 0:                                                                   # Warnstreifen
        bm = bmesh.new()
        add_box(bm, (W * 0.8, 0.004, 0.025), (0, -T / 2 - 0.001, H * 0.3))
        obj(name + '_Stripe', bm, M['hazard'], parent, smooth=False)
    if level == 1:                                                                   # Rostflecken
        bm = bmesh.new()
        for _ in range(6):
            add_box(bm, (0.03 + rnd.random() * 0.04, 0.003, 0.02 + rnd.random() * 0.03),
                    (rnd.uniform(-W / 2.5, W / 2.5), -T / 2 - 0.0005, rnd.uniform(0.05, H - 0.05)))
        obj(name + '_Rust', bm, M['rust'], parent, smooth=False)
    if level == 5:                                                                   # leuchtende Einlagen
        bm = bmesh.new()
        for z in (H * 0.3, H * 0.5, H * 0.7):
            add_box(bm, (W * 0.7, 0.004, 0.012), (0, -T / 2 - T * 0.6 - 0.002, z))
        obj(name + '_Glow', bm, M['einsteinium'], parent, smooth=False)
    if level == 6:                                                                   # Schildemitter und Schild
        bm = bmesh.new()
        for x in (-W / 2 + 0.03, W / 2 - 0.03):
            for z in (0.035, H - 0.035):
                add_sphere(bm, 0.018, (x, -T - 0.01, z), segs=12, rings=8)
        obj(name + '_Emitters', bm, M['frost'], parent)
        bm = bmesh.new()
        v = add_sphere(bm, 1.0, (0, 0, 0), segs=32, rings=16)
        bmesh.ops.delete(bm, geom=[x for x in v if x.co.y > 0.001], context='VERTS')
        bmesh.ops.scale(bm, vec=(W * 0.62, 0.09, H * 0.62), verts=bm.verts[:])
        bmesh.ops.translate(bm, vec=(0, -T, H / 2), verts=bm.verts[:])
        obj(name + '_Shield', bm, M['shield'], parent)


# ================================================================ Motoren
def build_engine(level, parent):
    name = f'Up_engine_{level}'
    cyl = [1, 4, 4, 6, 8, 12, 16][level]
    cover = [M['steel'], M['red'], M['red'], M['blue'], M['black'], M['silver'], M['chrome']][level]
    block_m = M['dark'] if level < 6 else M['steel']
    if level == 0:                                                                   # Einzylinder mit Kühlrippen
        bm = bmesh.new()
        bevel_box(bm, (0.16, 0.12, 0.1), (0, 0, 0.05), w=0.01)
        add_cyl(bm, 0.045, 0.14, (0, 0, 0.17), segs=20, mat_index=1)
        for k in range(7):
            add_cyl(bm, 0.065, 0.006, (0, 0, 0.11 + k * 0.018), segs=20, mat_index=1)
        add_cyl(bm, 0.05, 0.02, (0, 0, 0.25), segs=20, mat_index=2)
        add_cyl(bm, 0.035, 0.03, (-0.095, 0, 0.05), axis='X', segs=16, mat_index=2)  # Riemenscheibe
        obj(name + '_Block', bm, [block_m, M['steel'], M['dark']], parent)
        tube(name + '_Exhaust', [(0.03, -0.04, 0.2), (0.08, -0.08, 0.16), (0.12, -0.08, 0.06)], 0.012, M['rust'], parent)
        return
    bank = cyl // 2
    L = 0.06 + bank * 0.05
    bm = bmesh.new()
    bevel_box(bm, (L, 0.16, 0.12), (0, 0, 0.06), w=0.01)                             # Kurbelgehäuse
    add_box(bm, (L * 0.9, 0.2, 0.02), (0, 0, 0.01), mat_index=0)                     # Ölwanne
    add_cyl(bm, 0.045, 0.02, (-L / 2 - 0.012, 0, 0.06), axis='X', segs=24, mat_index=1)  # Riemenscheiben
    add_cyl(bm, 0.028, 0.02, (-L / 2 - 0.012, 0.05, 0.13), axis='X', segs=20, mat_index=1)
    add_cyl(bm, 0.028, 0.02, (-L / 2 - 0.012, -0.05, 0.13), axis='X', segs=20, mat_index=1)
    obj(name + '_Block', bm, [block_m, M['steel']], parent)
    # zwei Zylinderbänke in V-Form
    bm = bmesh.new()
    for s in (1, -1):
        pivot = (0, 0, 0.12)
        v = []
        for i in range(bank):
            x = -L / 2 + 0.035 + i * (L - 0.07) / max(1, bank - 1) if bank > 1 else 0
            v += add_cyl(bm, 0.022, 0.07, (x, 0, 0.155), segs=12, mat_index=1)     # Zylinder
        v += add_box(bm, (L * 0.95, 0.06, 0.03), (0, 0, 0.2))                       # Ventildeckel
        rotate(bm, v, s * math.radians(32), 'X', pivot)
        bmesh.ops.translate(bm, vec=(0, s * 0.035, 0), verts=v)
    obj(name + '_Banks', bm, [cover, M['steel']], parent)
    # Krümmer seitlich
    for s, side in ((1, 'L'), (-1, 'R')):
        tube(f'{name}_Header{side}', [(L / 2 - 0.02, s * 0.1, 0.16), (L / 2 + 0.04, s * 0.12, 0.12),
                                      (L / 2 + 0.07, s * 0.1, 0.03)], 0.012 + level * 0.001,
             M['chrome'] if level >= 5 else M['rust'], parent)
    if level == 2:                                                                   # Turbolader
        bm = bmesh.new()
        add_torus(bm, 0.04, 0.02, (L / 2 + 0.06, -0.12, 0.12), axis='X', segs=24, rsegs=10)
        add_cyl(bm, 0.03, 0.05, (L / 2 + 0.06, -0.12, 0.12), axis='X', segs=16)
        obj(name + '_Turbo', bm, M['steel'], parent)
    if level == 4:                                                                   # Kompressor mit Ansaughutze
        bm = bmesh.new()
        bevel_box(bm, (L * 0.7, 0.11, 0.07), (0, 0, 0.225), w=0.02)
        bevel_box(bm, (0.08, 0.07, 0.06), (0.02, 0, 0.28), w=0.012, mat_index=1)
        obj(name + '_Blower', bm, [M['chrome'], M['black']], parent)
    if level >= 5:                                                                   # Ansaugbrücke mit Trichtern
        bm = bmesh.new()
        for i in range(bank):
            x = -L / 2 + 0.035 + i * (L - 0.07) / max(1, bank - 1)
            add_cyl(bm, 0.014, 0.05, (x, 0, 0.25), r2=0.02, segs=12)
        add_box(bm, (L * 0.9, 0.04, 0.02), (0, 0, 0.22))
        obj(name + '_Intake', bm, M['gold'] if level == 6 else M['silver'], parent)
    if level == 6:
        bm = bmesh.new()
        add_box(bm, (0.08, 0.004, 0.02), (0, -0.081, 0.07))
        obj(name + '_Badge', bm, M['gold'], parent, smooth=False)


# ================================================================ Tanks
def capsule(bm, r, length, loc, axis='X', mat_index=0, segs=28):
    v = add_cyl(bm, r, length, (0, 0, 0), segs=segs, mat_index=mat_index)
    for z in (length / 2, -length / 2):
        w = add_sphere(bm, r, (0, 0, 0), segs=segs, rings=12, mat_index=mat_index)
        for p in w:
            p.co.z = z + (max(p.co.z, 0) if z > 0 else min(p.co.z, 0))
        v += w
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=v)
    return v


def build_tank(level, parent):
    name = f'Up_fuelTank_{level}'
    bm = bmesh.new()
    extra = bmesh.new()
    if level == 0:                                                                   # Kanister
        bevel_box(bm, (0.1, 0.05, 0.14), (0, 0, 0.07), w=0.01)
        add_cyl(extra, 0.012, 0.03, (0.03, 0, 0.15), segs=12)
        tube(name + '_Handle', [(-0.035, 0, 0.14), (-0.02, 0, 0.17), (0.005, 0, 0.14)], 0.006, M['dark'], parent)
    elif level == 1:                                                                 # stehende Flasche
        capsule(bm, 0.07, 0.16, (0, 0, 0.15), axis='Z')
        for z in (0.08, 0.2):
            add_cyl(extra, 0.073, 0.012, (0, 0, z), segs=28)
        add_cyl(extra, 0.02, 0.03, (0, 0, 0.3), segs=12)
    elif level == 2:                                                                 # liegender Tank auf Sätteln
        capsule(bm, 0.09, 0.26, (0, 0, 0.11))
        for x in (-0.09, 0.09):
            add_box(extra, (0.03, 0.14, 0.05), (x, 0, 0.025))
            add_torus(extra, 0.092, 0.006, (x, 0, 0.11), axis='X', segs=28, rsegs=6)
    elif level == 3:                                                                 # Zwillingstanks
        for y in (-0.08, 0.08):
            capsule(bm, 0.075, 0.28, (0, y, 0.09))
        add_cyl(extra, 0.015, 0.16, (0.0, 0, 0.17), axis='Y', segs=12)
        for x in (-0.1, 0.1):
            add_box(extra, (0.025, 0.3, 0.02), (x, 0, 0.01))
    elif level == 4:                                                                 # Kugeltank im Gestell
        add_sphere(bm, 0.15, (0, 0, 0.19), segs=32, rings=16)
        add_torus(extra, 0.152, 0.008, (0, 0, 0.19), segs=40, rsegs=6)
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            add_cyl(extra, 0.01, 0.2, (0.12 * math.cos(a), 0.12 * math.sin(a), 0.1), segs=8)
    elif level == 5:                                                                 # Leviathan: lange Kapsel mit Rippen
        capsule(bm, 0.12, 0.36, (0, 0, 0.14))
        for i in range(5):
            add_torus(extra, 0.122, 0.008, (-0.16 + i * 0.08, 0, 0.14), axis='X', segs=36, rsegs=6)
        for x in (-0.14, 0.14):
            add_box(extra, (0.04, 0.2, 0.03), (x, 0, 0.015))
    else:                                                                            # Flüssigkompression
        capsule(bm, 0.11, 0.3, (0, 0, 0.14))
        for i in range(4):
            add_torus(extra, 0.118, 0.014, (-0.12 + i * 0.08, 0, 0.14), axis='X', segs=36, rsegs=8, mat_index=1)
        add_box(extra, (0.3, 0.03, 0.02), (0, 0, 0.01))
    paint = M['fuel'] if level < 5 else (M['dark'] if level == 5 else M['white'])
    obj(name + '_Body', bm, paint, parent)
    obj(name + '_Fittings', extra, [M['steel'], M['copper']], parent)
    # Manometer / Füllstand vorne
    bm = bmesh.new()
    front = {0: -0.026, 1: -0.07, 2: -0.09, 3: -0.155, 4: -0.15, 5: -0.12, 6: -0.11}[level]
    gz = {0: 0.08, 1: 0.15, 2: 0.11, 3: 0.09, 4: 0.19, 5: 0.14, 6: 0.14}[level]
    add_cyl(bm, 0.022, 0.01, (0, front - 0.004, gz), axis='Y', segs=20)
    obj(name + '_Gauge', bm, M['gauge'], parent)
    if level == 6:                                                                   # Sichtfenster mit glühendem Kern
        bm = bmesh.new()
        add_box(bm, (0.2, 0.01, 0.05), (0.02, -0.108, 0.14))
        obj(name + '_Core', bm, M['fuel_glow'], parent, smooth=False)


# ================================================================ Kühler
def fan(bm, r, loc, blades=5, mat_blade=0, mat_hub=1, pitch=0.45):
    """Lüfter mit Achse entlang Y (bläst nach -Y)."""
    x0, y0, z0 = loc
    add_cyl(bm, r * 0.28, 0.03, (x0, y0, z0), axis='Y', segs=16, mat_index=mat_hub)
    for k in range(blades):
        v = add_box(bm, (r * 0.75, 0.004, r * 0.35), (r * 0.52, 0, 0), mat_index=mat_blade)
        rotate(bm, v, pitch, 'X')
        rotate(bm, v, 2 * math.pi * k / blades, 'Y')
        bmesh.ops.translate(bm, vec=Vector(loc), verts=v)


def turbine(bm, r, loc, blades=14):
    x0, y0, z0 = loc
    v = add_cyl(bm, r, 0.12, (x0, y0 + 0.02, z0), axis='Y', segs=32, mat_index=0, cap=False)
    add_torus(bm, r, 0.012, (x0, y0 - 0.04, z0), axis='Y', segs=32, rsegs=6, mat_index=0)
    add_cyl(bm, r * 0.3, 0.08, (x0, y0 - 0.06, z0), axis='Y', segs=16, r2=0.0, mat_index=1)  # Nabe (Kegel nach vorne)
    fan(bm, r * 0.95, (x0, y0, z0), blades=blades, mat_blade=1, mat_hub=1, pitch=0.6)


def build_radiator(level, parent):
    name = f'Up_radiator_{level}'
    bm = bmesh.new()
    if level in (0, 1):                                                              # Lüfter im Rahmen
        n = level + 1
        W = 0.2 * n
        bevel_box(bm, (W, 0.05, 0.2), (0, 0.01, 0.1), w=0.008)
        for i in range(n):
            x = -W / 2 + 0.1 + i * 0.2
            add_cyl(bm, 0.085, 0.052, (x, 0.0, 0.1), axis='Y', segs=28, mat_index=2)  # Aussparung (dunkel)
        obj(name + '_Frame', bm, [M['steel'], M['dark'], M['black']], parent, sharp=30)
        bm = bmesh.new()
        for i in range(n):
            fan(bm, 0.08, (-W / 2 + 0.1 + i * 0.2, -0.03, 0.1))
            add_torus(bm, 0.08, 0.004, (-W / 2 + 0.1 + i * 0.2, -0.035, 0.1), axis='Y', segs=24, rsegs=4)
        obj(name + '_Fans', bm, [M['dark'], M['steel']], parent)
    elif level in (2, 3):                                                            # Turbinen
        n = level - 1
        for i in range(n):
            x = (i - (n - 1) / 2) * 0.24
            turbine(bm, 0.1, (x, 0, 0.12))
            add_box(bm, (0.05, 0.1, 0.02), (x, 0.02, 0.01), mat_index=0)
        obj(name + '_Turbines', bm, [M['steel'], M['dark']], parent)
    elif level == 4:                                                                 # Puron: Lamellenblock und Kühlmittel
        bevel_box(bm, (0.34, 0.06, 0.22), (0, 0.02, 0.12), w=0.008)
        for i in range(22):
            add_box(bm, (0.004, 0.066, 0.2), (-0.155 + i * 0.0148, 0.0, 0.12), mat_index=1)
        obj(name + '_Core', bm, [M['dark'], M['silver']], parent, smooth=False)
        bm = bmesh.new()
        capsule(bm, 0.035, 0.1, (0.21, 0.02, 0.2), axis='Z')
        obj(name + '_Tank', bm, M['cool_glow'], parent)
        for i, z in enumerate((0.05, 0.19)):
            tube(f'{name}_Pipe{i}', [(0.17, 0.0, z), (0.2, -0.03, z), (0.21, 0.0, 0.2 if i else 0.13)], 0.009,
                 M['copper'], parent)
    else:                                                                            # Freon-Array mit drei Turbinen
        for i, (x, z) in enumerate(((-0.13, 0.1), (0.13, 0.1), (0.0, 0.3))):
            turbine(bm, 0.1, (x, 0, z), blades=16)
        add_box(bm, (0.42, 0.08, 0.02), (0, 0.02, 0.0))
        obj(name + '_Turbines', bm, [M['platinum'], M['dark']], parent)
        bm = bmesh.new()
        for x, z in ((-0.13, 0.1), (0.13, 0.1), (0.0, 0.3)):
            add_torus(bm, 0.1, 0.008, (x, -0.045, z), axis='Y', segs=32, rsegs=6)
        obj(name + '_Frost', bm, M['frost'], parent)


# ================================================================ Laderaum
def crate(bm, size, loc, ribs=0, mat=0, rib_mat=1, corner_mat=1):
    sx, sy, sz = size
    bevel_box(bm, size, (loc[0], loc[1], loc[2] + sz / 2), mat_index=mat, w=0.006)
    for i in range(ribs):                                                            # senkrechte Sicken vorne
        x = loc[0] - sx / 2 + (i + 1) * sx / (ribs + 1)
        add_box(bm, (0.008, 0.006, sz * 0.86), (x, loc[1] - sy / 2 - 0.002, loc[2] + sz / 2), mat_index=rib_mat)
    for dx in (-1, 1):                                                               # Eckbeschläge
        for dz in (0, 1):
            add_box(bm, (0.025, sy + 0.006, 0.025), (loc[0] + dx * (sx / 2 - 0.01), loc[1], loc[2] + dz * sz - (0.0125 if dz else -0.0125)), mat_index=corner_mat)


def build_bay(level, parent):
    name = f'Up_bay_{level}'
    bm = bmesh.new()
    if level == 0:
        crate(bm, (0.12, 0.1, 0.1), (0, 0, 0), mat=2)
    elif level == 1:
        crate(bm, (0.18, 0.13, 0.14), (0, 0, 0), ribs=3)
    elif level == 2:
        crate(bm, (0.3, 0.16, 0.16), (0, 0, 0), ribs=7)
    elif level == 3:
        crate(bm, (0.38, 0.19, 0.19), (0, 0, 0), ribs=9, mat=3)
        for x in (0.1, 0.16):                                                         # Türgriffe
            add_box(bm, (0.006, 0.01, 0.12), (x, -0.1, 0.1), mat_index=1)
    elif level == 4:
        crate(bm, (0.38, 0.19, 0.16), (0, 0, 0), ribs=9)
        crate(bm, (0.38, 0.19, 0.16), (0.02, 0, 0.16), ribs=9, mat=3)
    else:                                                                            # Leviathan: großes Rahmenmodul
        crate(bm, (0.44, 0.22, 0.26), (0, 0, 0.02), ribs=11, mat=3)
        for x in (-0.23, 0.23):
            for y in (-0.12, 0.12):
                add_box(bm, (0.025, 0.025, 0.32), (x, y, 0.16), mat_index=1)
        add_box(bm, (0.5, 0.27, 0.02), (0, 0, 0.01), mat_index=1)
        add_box(bm, (0.5, 0.27, 0.02), (0, 0, 0.31), mat_index=1)
    obj(name + '_Box', bm, [M['olive'], M['dark'], M['wood'], M['navy']], parent, smooth=False)
    # Warnstreifen und Beschriftung ab mittlerer Größe
    if level >= 2:
        w = {2: 0.3, 3: 0.38, 4: 0.38, 5: 0.44}[level]
        y = {2: -0.082, 3: -0.097, 4: -0.097, 5: -0.112}[level]
        bm = bmesh.new()
        add_box(bm, (w * 0.9, 0.004, 0.018), (0, y, 0.03))
        obj(name + '_Stripe', bm, M['hazard'], parent, smooth=False)
    if level == 5:
        bm = bmesh.new()
        add_sphere(bm, 0.015, (-0.2, -0.125, 0.29), segs=10, rings=6)
        add_sphere(bm, 0.015, (0.2, -0.125, 0.29), segs=10, rings=6)
        obj(name + '_Lights', bm, M['led_g'], parent)


BUILD = {'drill': (build_drill, 7), 'hull': (build_hull, 7), 'engine': (build_engine, 7),
         'fuelTank': (build_tank, 7), 'radiator': (build_radiator, 6), 'bay': (build_bay, 6)}
ROOTS = {}
for cat, (fn, n) in BUILD.items():
    for lvl in range(n):
        r = empty(f'Up_{cat}_{lvl}', (0, 0, 0))
        fn(lvl, r)
        ROOTS[(cat, lvl)] = r

# ================================================================ Export
os.makedirs(ICON_DIR, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          use_selection=False, export_cameras=False, export_lights=False)
print('EXPORTED', OUT, os.path.getsize(OUT))


def descendants(ob):
    out = []
    for c in ob.children:
        out += [c] + descendants(c)
    return out


def bounds(obs):
    pts = [ob.matrix_world @ Vector(c) for ob in obs if ob.type == 'MESH' for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return (lo + hi) / 2, (hi - lo).length / 2


def setup_render(size):
    for m in bpy.data.materials:        # Leuchten dämpfen, sonst werden sie ohne Bloom weiß
        if m.node_tree and 'Principled BSDF' in m.node_tree.nodes:
            m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value *= 0.3
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 40
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
    for name, loc, energy, color, size_ in (('Key', (-0.8, -1.2, 1.2), 70, (1, 0.9, 0.8), 0.7),
                                            ('Rim', (0.9, 1.0, 0.8), 50, (0.7, 0.8, 1), 0.5),
                                            ('Fill', (1.2, -0.8, 0.2), 18, (1, 0.85, 0.75), 0.8)):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.color, light.size = energy, color, size_
        lo = bpy.data.objects.new(name, light)
        lo.location = loc
        lo.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)
    return cam


def aim(cam, c, r, d):
    fov = 2 * math.atan(18 / cam.data.lens)
    cam.location = c + d * (r / math.sin(fov / 2) * 0.85)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def show_only(keys):
    for key, root in ROOTS.items():
        for ob in [root] + descendants(root):
            ob.hide_render = key not in keys


if ICONS or PREVIEW:
    cam = setup_render((256, 256))
    front = Vector((-0.45, -1, 0.5)).normalized()
    if ICONS:
        for cat, (_, n) in BUILD.items():
            radii = [bounds(descendants(ROOTS[(cat, l)]))[1] for l in range(n)]
            for lvl in range(n):
                show_only({(cat, lvl)})
                c, r = bounds(descendants(ROOTS[(cat, lvl)]))
                # Größenunterschiede innerhalb einer Kategorie sichtbar lassen, aber nichts winzig werden lassen
                r = max(r, 0.65 * max(radii)) if cat in ('fuelTank', 'bay', 'engine') else r
                if cat == 'drill':   # Bohrköpfe schräg liegend zeigen: Blick von der Seite
                    aim(cam, c, r, Vector((-0.9, -1, 0.35)).normalized())
                else:
                    aim(cam, c, r, front)
                scene.render.filepath = os.path.join(ICON_DIR, f'{cat}_{lvl}.png')
                bpy.ops.render.render(write_still=True)
                print('ICON', scene.render.filepath)
    if PREVIEW:
        for (cat, lvl), root in ROOTS.items():
            row = list(BUILD).index(cat)
            root.location = (lvl * 0.6, 0, -row * 0.55)
        bpy.context.view_layer.update()
        show_only(set(ROOTS))
        scene.render.film_transparent = False
        scene.render.resolution_x, scene.render.resolution_y = 1500, 1300
        c, r = bounds([o for root in ROOTS.values() for o in descendants(root)])
        cam.data.lens = 50
        aim(cam, c, r * 0.95, Vector((-0.15, -1, 0.25)).normalized())
        scene.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        print('PREVIEW', PREVIEW)
