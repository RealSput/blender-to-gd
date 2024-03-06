# blender-to-gd
3D engine that converts Blender scenes to Geometry Dash levels w/ gradient triggers 

NOTE: if you are using a portable version or have not installed Blender to C:\Program Files (x86), set the BLENDER_DIR environment to your own custom path (e.g. run "set BLENDER_DIR=P:\blender-4.0.2-windows-x64" in cmd.exe)

# Usage
```
blender-to-gd (version 1.0) 
3D engine that converts Blender scenes to Geometry Dash levels w/ gradient triggers 

Usage: blender-to-gd [options]
Options:
--lock : Locks to player X
--backface_culling (short: -b): Applies backface culling to scene (experimental)
--textures (short: -t): Renders textures to level (experimental)
--loop : Loops animation forever
--fps (short: -f): Sets FPS of scene (default: 24, only change if your Blender scene has a different framerate than 24 FPS)
--intensity (short: -p): Intensity of light source
--scaling (short: -s): Scale of animation (anim / scaling)
--output_level (short: -o): Output level
--input (short: -i): Input Blender file
```
