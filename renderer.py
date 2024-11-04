import bpy
import bmesh
import json
import numpy as np
from mathutils import Vector, geometry, Matrix

cull = True
shadows = True
shadow_culling = True

def get_shadow_geometry():
    scene = bpy.context.scene
    cam = scene.camera
    light = [obj for obj in scene.objects if obj.type == 'LIGHT'][0]
    
    render = scene.render
    aspect = render.resolution_x / render.resolution_y
    
    # Get camera view and projection matrices
    cam_matrix = cam.matrix_world.inverted()
    projection_matrix = cam.calc_matrix_camera(
        bpy.context.evaluated_depsgraph_get(),
        x=render.resolution_x,
        y=render.resolution_y
    )
    
    def world_to_screen(point):
        # Transform point to camera space
        cam_point = cam_matrix @ point
        # Project to clip space
        clip_point = projection_matrix @ cam_point.to_4d()
        if clip_point.w <= 0:
            return None
        # Convert to NDC space
        ndc = Vector((
            clip_point.x / clip_point.w,
            clip_point.y / clip_point.w
        ))
        # Convert to screen space
        return (
            int((ndc.x + 1) * render.resolution_x * 0.5),
            int((1 - ndc.y) * render.resolution_y * 0.5)
        )
    
    def project_shadow_point(vertex):
        light_pos = light.matrix_world.translation
        direction = (vertex - light_pos).normalized()
        
        # Find intersection with ground plane
        ground_normal = Vector((0, 0, 1))
        ground_point = Vector((0, 0, 0))
        
        denominator = direction.dot(ground_normal)
        if abs(denominator) < 1e-6:
            return None
            
        t = (ground_point - light_pos).dot(ground_normal) / denominator
        shadow_point = light_pos + direction * t
        
        return shadow_point, world_to_screen(shadow_point.to_4d())
    
    def is_face_visible(world_points):
        if not shadow_culling: return True
        # Calculate the normal of the projected triangle
        v1 = world_points[1] - world_points[0]
        v2 = world_points[2] - world_points[0]
        normal = v1.cross(v2)
        
        # Get vector from any point on triangle to camera
        cam_pos = cam.matrix_world.translation
        view_vector = cam_pos - world_points[0]
        
        # If dot product is positive, triangle is facing camera
        return normal.dot(view_vector) > 0
    
    shadow_verts = []
    shadow_faces = []
    vert_map = {}
    
    # Process each mesh object
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
            
        mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
        
        # Project vertices
        vertex_world_positions = {}  # Store world positions for face culling
        for vertex in mesh.vertices:
            world_vertex = obj.matrix_world @ vertex.co
            shadow_result = project_shadow_point(world_vertex)
            
            if shadow_result and shadow_result[1] and (
                0 <= shadow_result[1][0] <= render.resolution_x and
                0 <= shadow_result[1][1] <= render.resolution_y
            ):
                if shadow_result[1] not in vert_map:
                    vert_map[shadow_result[1]] = len(shadow_verts)
                    shadow_verts.append(shadow_result[1])
                    vertex_world_positions[shadow_result[1]] = shadow_result[0]
        
        # Project faces
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        
        for face in bm.faces:
            shadow_face = []
            world_points = []
            valid_face = True
            
            for vert in face.verts:
                world_vert = obj.matrix_world @ vert.co
                shadow_result = project_shadow_point(world_vert)
                
                if not shadow_result or shadow_result[1] not in vert_map:
                    valid_face = False
                    break
                    
                shadow_face.append(vert_map[shadow_result[1]])
                world_points.append(shadow_result[0])
            
            if valid_face and len(shadow_face) == 3:
                # Only add face if it's facing the camera
                if is_face_visible(world_points):
                    shadow_faces.append(shadow_face)
        
        bm.free()
    
    return {
        "vertices": shadow_verts,
        "triangles": shadow_faces
    }

def get_screen_coordinates(coord, matrix, res_x, res_y, normalize = False):
    vec = Vector((coord.x, coord.y, coord.z, 1.0))
    vec_proj = matrix @ vec
    if vec_proj.w != 0:
        x = (vec_proj.x / vec_proj.w + 1) * res_x / 2
        y = (1 - vec_proj.y / vec_proj.w) * res_y / 2
        z = vec_proj.z / vec_proj.w
        
        if check_bounds((x, y, z), res_x, res_y) and normalize:
            return norm_bounds((x, y, z), res_x, res_y) + (z,)
        return (x, y, z)
    return None

def rgb_to_0_255(color):
    return [int(max(min(c * 255, 255), 0)) for c in color[:3]]

def check_bounds(coords, res_x, res_y):
    x, y = coords[:-1]
    return x < 0 or x >= res_x or y < 0 or y >= res_y

def norm_bounds(coords, res_x, res_y):
    x, y = coords[:-1]
    return (max(min(x, res_x), 0), max(min(y, res_y), 0))
  
def get_material_color(material):
    if material and material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                return node.inputs['Base Color'].default_value
            elif node.type == 'EMISSION':
                return node.inputs['Color'].default_value
    return material.diffuse_color if material else (0.8, 0.8, 0.8, 1.0)

def is_vertex_behind_camera(vertex_coord, cam_location):
    cam_forward = bpy.context.scene.camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))

    # Vector from camera to the vertex
    cam_to_vertex = vertex_coord - cam_location
    
    # Check the dot product between the forward vector and the camera-to-vertex vector
    dot_product = cam_to_vertex.dot(cam_forward)
    
    # If the dot product is negative, the vertex is behind the camera
    return dot_product < 0

def is_face_visible(face, camera_location, scene, depsgraph, final_matrix, res_x, res_y):
    if all(check_bounds(get_screen_coordinates(vert.co, final_matrix, res_x, res_y, False), res_x, res_y) for vert in face.verts):
        return False
    for vert in face.verts:
        if is_vertex_behind_camera(vert.co, camera_location):
            return False
    if not cull:
        return True
    threshold = 0.01
    # Check each vertex of the face
    for vert in face.verts:
        ray_direction = vert.co - camera_location
        ray_length = ray_direction.length
        ray_direction.normalize()
        
        hit, location, normal, index, hit_obj, matrix = bpy.context.scene.ray_cast(
            depsgraph=bpy.context.evaluated_depsgraph_get(),
            origin=camera_location,
            direction=ray_direction,
            distance=ray_length + threshold
        )
        
        if not hit:
            return True  # If any vertex is directly visible
            
        # Check if hit point is close to our vertex
        hit_distance = (location - camera_location).length
        if abs(hit_distance - ray_length) < threshold:
            return True  # This vertex is visible
            
    # If we're still here, check some points along the edges
    for edge in face.edges:
        # Get middle point of edge
        mid_point = (edge.verts[0].co + edge.verts[1].co) / 2
        ray_direction = mid_point - camera_location
        ray_length = ray_direction.length
        ray_direction.normalize()
        
        hit, location, normal, index, hit_obj, matrix = bpy.context.scene.ray_cast(
            depsgraph=bpy.context.evaluated_depsgraph_get(),
            origin=camera_location,
            direction=ray_direction,
            distance=ray_length + threshold
        )
        
        if not hit:
            return True
            
        hit_distance = (location - camera_location).length
        if abs(hit_distance - ray_length) < threshold:
            return True
            
    # If no points were visible, the face is occluded
    return False

def sort_faces(faces):
    # Sort faces based on the z-coordinate (depth) in descending order
    # This ensures that faces closer to the camera (larger z-values) are rendered later
    return sorted(faces, key=lambda f: f['buffer'], reverse=True)

def is_face_clipped(face, mesh):
    for vertex_index in face.vertices:
        vertex = mesh.vertices[vertex_index]
        # Check if the Z coordinate is less than or equal to 0
        if vertex.co.z <= 0:
            return True
    return False

def get_light_intensity(light):
    if light.type == 'POINT' or light.type == 'SPOT':
        return light.data.energy
    elif light.type == 'SUN':
        return light.data.energy * 0.1  # Adjust this factor as needed for sun lamps
    else:
        return 1.0  # Default intensity for other light types

def main():
    scene = bpy.context.scene
    camera = scene.camera
    light = bpy.data.objects["Light"]
    light_intensity = get_light_intensity(light)

    render = scene.render
    res_x = render.resolution_x
    res_y = render.resolution_y

    depsgraph = bpy.context.evaluated_depsgraph_get()
    camera_matrix = camera.matrix_world.inverted()
    projection_matrix = camera.calc_matrix_camera(
        depsgraph,
        x=res_x,
        y=res_y,
        scale_x=render.pixel_aspect_x,
        scale_y=render.pixel_aspect_y
    )
    final_matrix = projection_matrix @ camera_matrix

    data = {
        "vertices": [],
        "faces": [],
        "colors": [],
        "buffers": []
    }

    camera_location = camera.matrix_world.translation

    all_faces = []

    for obj in scene.objects:
        if obj.type == 'MESH':
            mesh = obj.evaluated_get(depsgraph).data
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bm.transform(obj.matrix_world)

            vertex_lookup = {}

            if len(obj.material_slots) == 0:
                mat = bpy.data.materials.new(name="Default")
                obj.data.materials.append(mat)

            for f in bm.faces:
                if is_face_visible(f, camera_location, scene, depsgraph, final_matrix, res_x, res_y):
                    face_vertices = []
                    face_screen_coords = []
                    for v in f.verts: 
                        if v not in vertex_lookup:
                            screen_coord = get_screen_coordinates(v.co, final_matrix, res_x, res_y)
                            if screen_coord:
                                vertex_lookup[v] = len(data["vertices"])
                                data["vertices"].append([
                                    round(screen_coord[0], 2),
                                    round(screen_coord[1], 2),
                                    round(screen_coord[2], 2)
                                ])
                        face_vertices.append(vertex_lookup[v])
                        face_screen_coords.append(get_screen_coordinates(v.co, final_matrix, res_x, res_y))

                    if len(face_vertices) == len(f.verts):
                        light_direction = (light.location - f.calc_center_median()).normalized()
                        dot_product = max(f.normal.dot(light_direction), 0)

                        if f.material_index < len(obj.material_slots):
                            material = obj.material_slots[f.material_index].material
                            mat_color = get_material_color(material)
                        else:
                            mat_color = (0.8, 0.8, 0.8, 1.0)

                        # Apply light intensity to the dot product
                        lighting_factor = dot_product * light_intensity
                        final_color = [min(c * lighting_factor, 1.0) for c in mat_color[:3]]
                        
                        zvals = list(coord[2] for coord in face_screen_coords if coord is not None)
                        buffer_value = sum(zvals) / len(zvals)
                        buffer_value *= 2
                        all_faces.append({
                            'vertices': face_screen_coords,
                            'indices': face_vertices,
                            'color': rgb_to_0_255(final_color),
                            'buffer': buffer_value
                        })

            bm.free()

    sorted_faces = sort_faces(all_faces)

    for face in sorted_faces:
        data["faces"].append(face['indices'])
        data["colors"].append(face['color'])
        data["buffers"].append(round(face['buffer']))

    return data

anim_full = [[bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y]]
shadows_full = []

bpy.context.scene.frame_set(0)
final_frame = bpy.context.scene.frame_end
for frame in range(bpy.context.scene.frame_start, final_frame + 1):
    bpy.context.scene.frame_set(frame)
    mframe = main()
    anim_full.append(mframe)
    if shadows: shadows_full.append(get_shadow_geometry())
    print(f'frame {frame} done')

with open("thy path", "w") as f:
    json.dump({
        'animation': anim_full,
        'shadows': shadows_full
    }, f)
    
print(f'info: {bpy.context.scene.render.resolution_x}, {bpy.context.scene.render.resolution_y}')

# 0.336773 m, -4.17971 m, 3.52784 m

# 186.176, # 1.30256d, 97.3679d
