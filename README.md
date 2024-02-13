# blender-to-gd
3D engine that converts Blender scenes to Geometry Dash levels w/ gradient triggers 

NOTE: if you are using a portable version or have not installed Blender to C:\Program Files (x86), set the BLENDER_DIR environment to your own custom path (e.g. run "set BLENDER_DIR=P:\blender-4.0.2-windows-x64" in cmd.exe)

# Usage
```
Usage: blender-to-gd [options]
Options:
--lock: Locks to player X
--loop: Loops animation forever
--fps <frames_per_second> (short: -f): Loops animation forever
--scaling <scale> (short: -s): Scale of animation (anim / scaling)
--output_level <level_name> (short: -o): Output level
--input <blender_file> (short: -i): Input Blender file
```