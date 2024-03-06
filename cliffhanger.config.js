const colors = require('@colors/colors/safe');
const render = require('./renderer');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const baseDirectory = process.env.BLENDER_DIR ?? 'C:\\Program Files\\Blender Foundation';
let exts;
if (!fs.existsSync(baseDirectory)) {
    console.log(colors.red(`ERROR: Directory "${baseDirectory}" could not be found while searching for Blender installation! Make sure you have Blender installed, you have changed the BLENDER_DIR environment variable to the correct path or you are on a Windows system.`))
    process.exit(1);
}
const directories = !process.env.BLENDER_DIR ? fs.readdirSync(baseDirectory, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => path.join(baseDirectory, entry.name)) : baseDirectory;

let blender_path = !process.env.BLENDER_DIR ? directories[0] : directories
let exec = path.join(blender_path, "blender.exe");

console.log(`Using Blender located at "${exec}" (change BLENDER_DIR environment variable to use Blender located in another directory)`)
if (!fs.existsSync(exec)) {
    colors.red(`ERROR: Blender executable located at ${exec} was not found! Please change the BLENDER_DIR environment variable to where your Blender installation is located.`);
    process.exit(1);
}

let tid = crypto.randomUUID();
let tdir = path.join(__dirname, `temp_${tid}`)
let tname = `temp_file_${tid}.json`;
let tscript = `script_${tid}.py`;

const exitCleanup = () => {
	if (fs.existsSync(tname)) fs.unlinkSync(tname);
    if (fs.existsSync(tscript)) fs.unlinkSync(tscript);
    if (fs.existsSync(tdir)) fs.rmSync(tdir, {recursive: true});
	console.log(colors.red('Program interrupted or errored, rolling back files..'))
	process.exit(1);
};

process.on('SIGINT', exitCleanup);
process.on('SIGTERM', exitCleanup);
process.on('uncaughtException', exitCleanup);
process.on('unhandledRejection', exitCleanup);


/*
import json 
import bpy

res_o = {}

# Get the active object
obj = bpy.context.active_object

# Ensure the object has vertex colors
if obj.data.vertex_colors:
    # Access the active vertex color layer
    vertex_color_layer = obj.data.vertex_colors.active

    # Get the mesh data
    mesh_data = obj.data

    # Loop through the polygons (faces) to retrieve vertex colors
    for poly in mesh_data.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = mesh_data.loops[loop_index].vertex_index
            color = vertex_color_layer.data[loop_index].color
            r, g, b, a = color  # RGB values (a is alpha, which might be unused)
            r *= 255;
            g *= 255;
            b *= 255;
            # Do something with the color information or index
            res_o[vertex_index + 1] = [round(r), round(g), round(b)]
else:
    print("The selected object does not have vertex colors.")

res = json.dumps(res_o)
with open('C:\\Users\\Diego\\Downloads\\blender-to-gd\\vertex_colors.json', 'w') as file:
    file.write(res)
	*/
let scr = (temp_dir, output, txtr_on) => `import json
import bpy
import math
import os

camera_object = bpy.context.scene.camera
camposes = []
res_o = {}
found_vertex_colors = False

${txtr_on ? `def bake_textures():
    bpy.ops.object.select_all(action='DESELECT')
    original_engine = bpy.context.scene.render.engine
    bpy.context.scene.render.engine = 'CYCLES'

    kname = 'Bake'
    ccol = 0

    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            # Create a new color attribute
            if kname not in obj.data.color_attributes:
                ccol = obj.data.color_attributes.new(
                    name=kname,
                    type='FLOAT_COLOR',
                    domain='POINT',
                )
            else:
                ccol = obj.data.color_attributes[kname]

            # Check materials and textures
            for mat in obj.data.materials:
                if mat.use_nodes:
                    output_prop = mat.node_tree.nodes.get('Material Output').inputs['Surface']
                    for node in mat.node_tree.nodes:
                        if node.type == 'TEX_IMAGE':
                            mat.node_tree.links.new(node.outputs['Color'], output_prop)
                            attribute_node = mat.node_tree.nodes.new(type='ShaderNodeAttribute')
                            attribute_node.attribute_name = kname
                            # Bake the texture
                            obj.select_set(True)
                            bpy.context.view_layer.objects.active = obj
                            bpy.ops.object.bake(type='EMIT', target='VERTEX_COLORS')
                            mat.node_tree.links.new(attribute_node.outputs['Color'], output_prop)
                            bpy.ops.object.select_all(action='DESELECT')
                            break
    bpy.context.scene.render.engine = original_engine
	
bake_textures()` : ''}
	
def vert_colors(obj):
    global found_vertex_colors
    if obj.type == 'MESH' and obj.data.color_attributes:
        found_vertex_colors = True
        colattr = obj.data.color_attributes[0]
        for v_index in range(len(obj.data.vertices)):
            color = colattr.data[v_index].color
            r, g, b, a = color
            r *= 255;
            g *= 255;
            b *= 255;
            res_o[v_index + 1] = [round(r), round(g), round(b)]
            
def dupframe():
    original_objects = tuple(bpy.context.scene.objects)
    bpy.ops.object.select_all(action='DESELECT')
    duplicated_meshes = []

    def dupmesh(original_mesh):
        if original_mesh.type == 'MESH':
            vert_colors(original_mesh)
            original_mesh.select_set(True)
            bpy.context.view_layer.objects.active = original_mesh
            bpy.ops.object.duplicate(linked=False)
            duplicate = bpy.context.active_object
            duplicate.animation_data_clear()
            duplicate.select_set(True)
            duplicated_meshes.append(duplicate)

    for obj in original_objects:
        dupmesh(obj)
        bpy.ops.object.select_all(action='DESELECT')

    for duplicate_mesh in duplicated_meshes:
        duplicate_mesh.animation_data_clear()
        duplicate_mesh.select_set(True)

    bpy.context.view_layer.objects.active = duplicated_meshes[0] 
    bpy.ops.object.join()    

temp_objs_path = "${temp_dir}" # insert path to temp objs folder
output_file = "${output}" # insert path to output JSON file

if not os.path.exists(temp_objs_path): os.makedirs(temp_objs_path)

def convert_frame_to_obj(frame_number):
    obj_path = os.path.join(temp_objs_path, f"frame_{frame_number}.obj")
    dupframe()
    vert_colors(bpy.context.active_object)
    bpy.ops.wm.obj_export(
        filepath=obj_path,
        export_triangulated_mesh=True,
        export_selected_objects=True
    )
    bpy.ops.object.delete()
    return obj_path

def read_delete(path):
    dat = ""
    with open(path, 'r') as file:
        data = file.read()
        dat = data
    os.remove(path)
    return dat

frame_start = bpy.context.scene.frame_start
frame_end = bpy.context.scene.frame_end
obj_list = []
final_res = []


for frame_number in range(frame_start, frame_end + 1):
    bpy.context.scene.frame_set(frame_number)
    obj_path = convert_frame_to_obj(frame_number)
    r = read_delete(obj_path)
    obj_list.append(r)
    if camera_object: camposes.append([[camera_object.location.x, camera_object.location.z, camera_object.location.y], [camera_object.rotation_euler.x, camera_object.rotation_euler.z, camera_object.rotation_euler.y]])

for obj in bpy.context.scene.objects:
    print(obj, obj.type)

mtl_res = read_delete(os.path.join(temp_objs_path, f"frame_{frame_number}.mtl"))
final_res.append(mtl_res)
final_res.append(obj_list)
final_res.append(camposes)
final_res.append(res_o if found_vertex_colors else 0)

res = json.dumps(final_res)
with open(output_file, 'w') as file:
    file.write(res)`;

let config = {
    lock: false,
    loop: false,
	texture_on: false,
    fps: 24
}

module.exports = (cwd) => ({
    name: "blender-to-gd",
    version: "1.3",
    description: "3D engine that converts Blender scenes to Geometry Dash levels w/ gradient triggers",
    flags: {
        lock: {
            description: "Locks to player X",
            init: () => config.lock = true
        },
        backface_culling: {
			short: "-b",
            description: "Applies backface culling to scene (experimental)",
            init: () => {
				console.log(colors.yellow('WARNING: Backface culling is experimental and may result in visual glitches'));
				config.cull_faces = true;
			}
        },
		textures: {
			short: "-t",
            description: "Renders textures to level (experimental)",
            init: () => {
				console.log(colors.yellow('WARNING: Textures are experimental and usually have large object counts. Make sure the meshes with textures have a high enough amount of subdivisions, but vertex count should stay below 9800'));
				config.texture_on = true;
			}
        },
        loop: {
            description: "Loops animation forever",
            init: () => config.loop = true
        },
        fps: {
            short: "-f",
            amount_of_args: 1,
            description: "Sets FPS of scene (default: 24, only change if your Blender scene has a different framerate than 24 FPS)",
            init: (fps) => config.fps = fps
        },
		intensity: {
			short: "-p",
            amount_of_args: 1,
            description: "Intensity of light source",
            init: (intst) => config.intensity = intst
        },
        scaling: {
            short: "-s",
            amount_of_args: 1,
            description: "Scale of animation (anim / scaling)",
            init: (scale) => config.scale = scale
        },
        output_level: {
            short: "-o",
            description: "Output level",
            amount_of_args: 1,
            init: (arg) => {
                config.level = arg;
            }
        },
        input: {
            short: "-i",
            amount_of_args: 1,
            description: "Input Blender file",
            required: true,
            init: async (arg) => {
                let normalize = (x) => x.replaceAll('\\', '/');
                let script_cont = scr(normalize(tdir), normalize(tname), config.texture_on);
                fs.writeFileSync(tscript, script_cont);
                console.log('INFO: Gathering animation data... (1/2)')
                let cmd = `"${exec}" -b "${
                    path.join(process.cwd(), arg)
                }" -P ${tscript}`;
                cp.exec(cmd, async (err, res) => {
                    if (err) {
                        console.log(colors.red(`ERROR: Blender has exited with error code ${
                            err.code
                        }, message:\n\n${res}`))
                        fs.unlinkSync(tscript);
                        fs.rmSync(tdir, {recursive: true});
                        process.exit(err.code)
                    }
                    if (!fs.existsSync(tname)) {
                        console.log(colors.red(`ERROR: Blender has closed unexpectedly and the script has not run.`));
                        console.log(colors.red(`Output log: ${res}`));
						fs.unlinkSync(tscript);
                        process.exit(1);
                    }
                    fs.unlinkSync(tscript);
                    fs.rmSync(tdir, {recursive: true});
                    config.file_name = tname;
                    console.log('INFO: Rendering and writing to savefile... (2/2)')
                    await render(config);
                    fs.unlinkSync(tname);
                });
            }
        }
    }
});
