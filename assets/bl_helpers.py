"""Gemeinsame Helfer für die Blender-Skripte der Gebäude (Blender 5.1, ohne Oberfläche).

Konventionen: 1 Einheit = 1 Tile, Boden bei z = 0, Vorderseite zeigt nach -Y (in three.js +Z).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


def args():
    """Argumente nach '--' auswerten: gibt den Pfad für --preview zurück (oder None)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return argv[argv.index('--preview') + 1] if '--preview' in argv else None


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


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
    bpy.context.scene.collection.objects.link(ob)
    ob.location = origin
    return ob


def _faces(verts, mat_index):
    for f in {f for x in verts for f in x.link_faces}:
        f.material_index = mat_index


def add_box(bm, size, loc, rot=None, mat_index=0):
    v = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=Vector(size), verts=v)
    if rot is not None:
        bmesh.ops.rotate(bm, verts=v, matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=v)
    _faces(v, mat_index)
    return v


def add_cyl(bm, r, depth, loc, axis='Z', segs=20, r2=None, mat_index=0, cap=True):
    v = bmesh.ops.create_cone(bm, cap_ends=cap, segments=segs, radius1=r,
                              radius2=r if r2 is None else r2, depth=depth)['verts']
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=v, matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=v)
    _faces(v, mat_index)
    return v


def add_torus(bm, major, minor, loc, axis='Z', segs=24, rsegs=8, mat_index=0):
    ring = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ring.append([bm.verts.new(((major + minor * math.cos(b)) * math.cos(a),
                                   (major + minor * math.cos(b)) * math.sin(a), minor * math.sin(b)))
                     for b in (2 * math.pi * j / rsegs for j in range(rsegs))])
    for i in range(segs):
        for j in range(rsegs):
            bm.faces.new((ring[i][j], ring[(i + 1) % segs][j], ring[(i + 1) % segs][(j + 1) % rsegs],
                          ring[i][(j + 1) % rsegs])).material_index = mat_index
    verts = [v for row in ring for v in row]
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=verts)
    return verts


def add_sphere(bm, r, loc, segs=12, rings=8, mat_index=0):
    v = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)['verts']
    bmesh.ops.translate(bm, vec=Vector(loc), verts=v)
    _faces(v, mat_index)
    return v


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


def corrugated_side(bm, x, y0, y1, z0, z1, facing=-1, mat_index=0):
    """Wellblech in der YZ-Ebene bei x (Wellen entlang y); facing -1 = zeigt nach -X."""
    sub = bmesh.new()
    corrugated(sub, y0, y1, z0, z1, 0, facing=facing, mat_index=mat_index)
    for v in sub.verts:
        v.co = Vector((x + v.co.y, v.co.x, v.co.z))
    tmp = bpy.data.meshes.new('tmp')
    sub.to_mesh(tmp)
    sub.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def hazard_stripes(bm, x0, x1, z0, z1, y, width=0.12, yellow=0, black=1):
    """Schräge Warnstreifen als Parallelogramme auf einer Fläche bei Tiefe y."""
    x, k, h = x0, 0, z1 - z0
    while x < x1:
        xa, xb = x, min(x + width, x1)
        v = [bm.verts.new((xa, y, z0)), bm.verts.new((xb, y, z0)),
             bm.verts.new((min(xb + h * 0.6, x1 + h * 0.6), y, z1)), bm.verts.new((xa + h * 0.6, y, z1))]
        bm.faces.new(v).material_index = yellow if k % 2 == 0 else black
        x += width
        k += 1


def mesh_from(ob, name, mat):
    """Kurven/Text in ein Mesh-Objekt umwandeln (glTF exportiert nur Meshes)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.materials.clear()
    me.materials.append(mat)
    new = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(new)
    new.matrix_world = ob.matrix_world
    bpy.data.objects.remove(ob)
    return new


def text(name, body, size, loc, mat, extrude=0.015):
    """Schriftzug auf einer Fassade (liest sich von vorne, also von -Y)."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    t = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(t)
    t.location = loc
    t.rotation_euler = (math.pi / 2, 0, 0)
    return mesh_from(t, name, mat)


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    bpy.context.scene.collection.objects.link(e)
    return e


def rust_patches(ob, base_index, rust_index, chance=0.08, low_bonus=0.25, height=2.0, seed=1):
    """Zufällige Flächen auf Rost umfärben, unten häufiger."""
    rnd = random.Random(seed)
    for p in ob.data.polygons:
        if p.material_index == base_index and rnd.random() < chance + low_bonus * max(0, 0.6 - p.center.z / height):
            p.material_index = rust_index


def export(path):
    for ob in list(bpy.context.scene.collection.objects):
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              use_selection=False, export_cameras=False, export_lights=False)
    print('EXPORTED', path, os.path.getsize(path))


def preview(path, cam_loc=(0.3, -5.2, 1.6), target=(0, 1.2, 0.9), lens=35, size=(1100, 700)):
    """Vorschaubild mit Cycles (CPU): Mars-Himmel, Sonne, Bodenplatte."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.28, 0.16, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
    bm = bmesh.new()
    add_box(bm, (30, 30, 0.1), (0, 5, -0.05))
    new_object('PreviewGround', bm, material('Ground', (0.35, 0.16, 0.08), 0, 1))
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.lens = lens
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.energy = 2.5
    so = bpy.data.objects.new('Sun', sun)
    so.rotation_euler = (math.radians(50), math.radians(-25), math.radians(-30))
    scene.collection.objects.link(so)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', path)
