const render = require('./renderer');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const baseDirectory = process.env.BLENDER_DIR ?? 'C:\\Program Files\\Blender Foundation';
const directories = !process.env.BLENDER_DIR ? fs.readdirSync(baseDirectory, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => path.join(baseDirectory, entry.name)) : baseDirectory;

let blender_path = !process.env.BLENDER_DIR ? directories[0] : directories
let exec = path.join(blender_path, "blender.exe");

console.log(`Using Blender located at "${exec}" (change BLENDER_DIR environment variable to use Blender located in another directory)`)

let scr = (temp_dir, output) => `import json
import bpy
import os

def dupframe():
    original_objects = tuple(bpy.context.scene.objects)
    bpy.ops.object.select_all(action='DESELECT')
    duplicated_meshes = []

    def dupmesh(original_mesh):
        if original_mesh.type == 'MESH':
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

mtl_res = read_delete(os.path.join(temp_objs_path, f"frame_{frame_number}.mtl"))
final_res.append(mtl_res)
final_res.append(obj_list)

res = json.dumps(final_res)
with open(output_file, 'w') as file:
    file.write(res)`;

let config = {
    lock: false,
    loop: false,
    fps: 24
}

module.exports = (cwd) => ({
    name: "blender-to-gd",
    version: "1.0",
    description: "3D engine that converts Blender scenes to Geometry Dash levels w/ gradient triggers",
    flags: {
        lock: {
            description: "Locks to player X",
            init: () => config.lock = true
        },
        loop: {
            description: "Loops animation forever",
            init: () => config.loop = true
        },
        fps: {
            short: "-f",
            amount_of_args: 1,
            description: "Loops animation forever",
            init: (fps) => config.fps = fps
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
                let tid = crypto.randomUUID();
                let tdir = path.join(__dirname, `temp_${tid}`)
                let tname = `temp_file_${tid}.json`;
                let script_cont = scr(normalize(tdir), normalize(tname));
                let tscript = `script_${tid}.py`;
                fs.writeFileSync(tscript, script_cont);
                console.log('INFO: Gathering animation data... (1/2)')
                let cmd = `"${exec}" -b ${arg} -P ${tscript}`;
                cp.spawnSync(cmd, {shell: true});
                fs.unlinkSync(tscript);
                fs.rmSync(tdir, {recursive: true});
                config.file_name = tname;
                console.log('INFO: Rendering and writing to savefile... (2/2)')
                await render(config);
                fs.unlinkSync(tname);
            }
        }
    }
});
