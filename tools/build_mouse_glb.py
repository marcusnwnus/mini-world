#!/usr/bin/env python3
import base64
import json
import math
import os
import struct

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "mouse.glb")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

vertices = []
normals = []
indices = []
joints = []
weights = []

def add_vertex(p, n, joint):
    vertices.extend(p)
    normals.extend(n)
    joints.extend([joint, 0, 0, 0])
    weights.extend([1.0, 0.0, 0.0, 0.0])
    return len(vertices) // 3 - 1

def add_uv_sphere(cx, cy, cz, rx, ry, rz, joint, rings=4, segs=8):
    base = len(vertices) // 3
    for r in range(rings + 1):
        v = r / rings
        phi = -math.pi / 2 + math.pi * v
        cp, sp = math.cos(phi), math.sin(phi)
        for s in range(segs):
            u = s / segs
            th = u * math.tau
            ct, st = math.cos(th), math.sin(th)
            x = cx + rx * cp * ct
            y = cy + ry * sp
            z = cz + rz * cp * st
            nx = cp * ct / max(rx, 1e-6)
            ny = sp / max(ry, 1e-6)
            nz = cp * st / max(rz, 1e-6)
            nl = math.sqrt(nx*nx + ny*ny + nz*nz) or 1.0
            add_vertex((x, y, z), (nx/nl, ny/nl, nz/nl), joint)
    for r in range(rings):
        for s in range(segs):
            a = base + r * segs + s
            b = base + r * segs + (s + 1) % segs
            c = base + (r + 1) * segs + s
            d = base + (r + 1) * segs + (s + 1) % segs
            indices.extend([a, c, b, b, c, d])

def add_cylinder_segment(a, b, radius, joint, sides=6):
    ax, ay, az = a
    bx, by, bz = b
    vx, vy, vz = bx-ax, by-ay, bz-az
    length = math.sqrt(vx*vx + vy*vy + vz*vz) or 1.0
    dx, dy, dz = vx/length, vy/length, vz/length
    up = (0.0, 1.0, 0.0)
    if abs(dy) > 0.9:
        up = (1.0, 0.0, 0.0)
    ux = dy*up[2] - dz*up[1]
    uy = dz*up[0] - dx*up[2]
    uz = dx*up[1] - dy*up[0]
    ul = math.sqrt(ux*ux + uy*uy + uz*uz) or 1.0
    ux, uy, uz = ux/ul, uy/ul, uz/ul
    wx = dy*uz - dz*uy
    wy = dz*ux - dx*uz
    wz = dx*uy - dy*ux
    base = len(vertices) // 3
    for end in (a, b):
        ex, ey, ez = end
        for s in range(sides):
            ang = math.tau * s / sides
            ca, sa = math.cos(ang), math.sin(ang)
            nx = ux*ca + wx*sa
            ny = uy*ca + wy*sa
            nz = uz*ca + wz*sa
            add_vertex((ex + nx*radius, ey + ny*radius, ez + nz*radius), (nx, ny, nz), joint)
    for s in range(sides):
        n = (s + 1) % sides
        a0 = base + s
        a1 = base + n
        b0 = base + sides + s
        b1 = base + sides + n
        indices.extend([a0, b0, a1, a1, b0, b1])

# Root/body joint 0.
add_uv_sphere(0, .58, -.08, .63, .45, .92, 0, 5, 10)
add_uv_sphere(0, .44, .43, .30, .18, .40, 0, 3, 8)

# Head joint 1.
add_uv_sphere(0, .78, .92, .44, .37, .48, 1, 4, 9)
add_uv_sphere(0, .70, 1.34, .20, .15, .27, 1, 3, 8)
for side in (-1, 1):
    add_uv_sphere(side*.32, 1.10, .75, .22, .09, .22, 1, 3, 7)

# Feet on root.
for side in (-1, 1):
    add_uv_sphere(side*.34, .17, .53, .12, .06, .17, 0, 2, 7)
    add_uv_sphere(side*.40, .16, -.50, .15, .06, .20, 0, 2, 7)

# Tail joint 2.
tail = [(0,.52,-.90),(.18,.43,-1.25),(.42,.38,-1.62),(.58,.31,-1.98)]
for a, b in zip(tail[:-1], tail[1:]):
    add_cylinder_segment(a, b, .05, 2, 6)

blob = bytearray()
buffer_views = []
accessors = []

def align4():
    while len(blob) % 4:
        blob.append(0)

def add_view(data, target=None):
    align4()
    offset = len(blob)
    blob.extend(data)
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
    if target is not None:
        view["target"] = target
    buffer_views.append(view)
    return len(buffer_views)-1

def add_accessor(data, component_type, type_name, count, target=None, minv=None, maxv=None):
    idx = add_view(data, target)
    acc = {"bufferView": idx, "componentType": component_type, "count": count, "type": type_name}
    if minv is not None:
        acc["min"] = minv
    if maxv is not None:
        acc["max"] = maxv
    accessors.append(acc)
    return len(accessors)-1

def floats(values):
    return struct.pack("<" + "f"*len(values), *values)

def ushorts(values):
    return struct.pack("<" + "H"*len(values), *values)

def ubytes(values):
    return bytes(values)

vcount = len(vertices)//3
pos_min = [min(vertices[i::3]) for i in range(3)]
pos_max = [max(vertices[i::3]) for i in range(3)]

pos_acc = add_accessor(floats(vertices), 5126, "VEC3", vcount, 34962, pos_min, pos_max)
nor_acc = add_accessor(floats(normals), 5126, "VEC3", vcount, 34962)
jnt_acc = add_accessor(ubytes(joints), 5121, "VEC4", vcount, 34962)
wgt_acc = add_accessor(floats(weights), 5126, "VEC4", vcount, 34962)
idx_acc = add_accessor(ushorts(indices), 5123, "SCALAR", len(indices), 34963)

def mat4_translation(x, y, z):
    return [
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        -x,-y,-z,1
    ]

ibm_values = mat4_translation(0,0,0) + mat4_translation(0,.72,.82) + mat4_translation(0,.52,-.90)
ibm_acc = add_accessor(floats(ibm_values), 5126, "MAT4", 3)

def quat_x(a):
    return [math.sin(a/2), 0, 0, math.cos(a/2)]
def quat_z(a):
    return [0, 0, math.sin(a/2), math.cos(a/2)]

animations = []
def add_anim(name, specs):
    samplers = []
    channels = []
    for node, path, times, values, type_name in specs:
        tin = add_accessor(floats(times), 5126, "SCALAR", len(times))
        flat = [x for value in values for x in value]
        tout = add_accessor(floats(flat), 5126, type_name, len(values))
        sampler_index = len(samplers)
        samplers.append({"input": tin, "output": tout, "interpolation": "LINEAR"})
        channels.append({"sampler": sampler_index, "target": {"node": node, "path": path}})
    animations.append({"name": name, "samplers": samplers, "channels": channels})

add_anim("Idle", [
    (1, "translation", [0,.5,1], [[0,0,0],[0,.035,0],[0,0,0]], "VEC3"),
    (2, "rotation", [0,.5,1], [quat_z(-.025),quat_z(.025),quat_z(-.025)], "VEC4")
])
add_anim("Run", [
    (1, "translation", [0,.15,.3,.45,.6], [[0,0,0],[0,.06,0],[0,0,0],[0,.06,0],[0,0,0]], "VEC3"),
    (2, "rotation", [0,.3,.6], [quat_z(-.05),quat_z(.05),quat_z(-.05)], "VEC4"),
    (3, "rotation", [0,.3,.6], [quat_z(-.18),quat_z(.18),quat_z(-.18)], "VEC4")
])
add_anim("Bite", [
    (2, "rotation", [0,.12,.24,.4], [quat_x(0),quat_x(-.42),quat_x(.12),quat_x(0)], "VEC4")
])
add_anim("Hit", [
    (1, "rotation", [0,.12,.28], [quat_z(0),quat_z(.25),quat_z(0)], "VEC4")
])
add_anim("Death", [
    (1, "rotation", [0,.35,.8], [quat_z(0),quat_z(.7),quat_z(1.45)], "VEC4"),
    (1, "translation", [0,.35,.8], [[0,0,0],[0,-.1,0],[0,-.35,0]], "VEC3")
])

gltf = {
    "asset": {"version": "2.0", "generator": "Mini World GLB Builder"},
    "scene": 0,
    "scenes": [{"nodes": [0,4]}],
    "nodes": [
        {"name": "Armature", "children": [1,2,3]},
        {"name": "BodyJoint"},
        {"name": "HeadJoint", "translation": [0,.72,.82]},
        {"name": "TailJoint", "translation": [0,.52,-.90]},
        {"name": "MouseMesh", "mesh": 0, "skin": 0}
    ],
    "skins": [{"name": "MouseRig", "inverseBindMatrices": ibm_acc, "joints": [1,2,3], "skeleton": 1}],
    "meshes": [{
        "name": "Mouse",
        "primitives": [{
            "attributes": {"POSITION": pos_acc, "NORMAL": nor_acc, "JOINTS_0": jnt_acc, "WEIGHTS_0": wgt_acc},
            "indices": idx_acc,
            "material": 0
        }]
    }],
    "materials": [{
        "name": "MouseFur",
        "pbrMetallicRoughness": {
            "baseColorFactor": [.56,.50,.47,1],
            "metallicFactor": 0,
            "roughnessFactor": .9
        }
    }],
    "animations": animations,
    "buffers": [{"byteLength": len(blob)}],
    "bufferViews": buffer_views,
    "accessors": accessors
}

json_bytes = json.dumps(gltf, separators=(",",":")).encode("utf-8")
while len(json_bytes) % 4:
    json_bytes += b" "
align4()
total = 12 + 8 + len(json_bytes) + 8 + len(blob)
glb = bytearray()
glb.extend(struct.pack("<III", 0x46546C67, 2, total))
glb.extend(struct.pack("<I4s", len(json_bytes), b"JSON"))
glb.extend(json_bytes)
glb.extend(struct.pack("<I4s", len(blob), b"BIN\x00"))
glb.extend(blob)

with open(OUT, "wb") as f:
    f.write(glb)

print("Built", OUT, len(glb), "bytes")
