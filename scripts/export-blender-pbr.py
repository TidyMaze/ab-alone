# Exports PBR textures (albedo, normal, roughness, displacement) from Blender for Three.js.
# Run inside Blender or via: blender -b --python scripts/export-blender-pbr.py
import os
import sys

try:
    import bpy
except ImportError:
    print("Run this script within Blender Python environment.", file=sys.stderr)
    sys.exit(1)

TARGET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "client", "public", "assets", "pbr"))
os.makedirs(TARGET_DIR, exist_ok=True)

# Texture configurations: (source_image_name, target_filename, file_format, color_mode, color_depth, quality)
TEXTURE_CONFIGS = [
    # Bulkhead (blue_metal_plate)
    ("blue_metal_plate_Diffuse", "bulkhead-albedo.jpg", "JPEG", "RGB", "8", 85),
    ("blue_metal_plate_nor_gl", "bulkhead-normal.png", "PNG", "RGB", "8", None),
    ("blue_metal_plate_Rough", "bulkhead-roughness.png", "PNG", "BW", "8", None),
    ("blue_metal_plate_Displacement", "bulkhead-displacement.png", "PNG", "BW", "8", None),

    # Deck PBR (metal_plate)
    ("metal_plate_Diffuse", "deck-pbr-albedo.jpg", "JPEG", "RGB", "8", 85),
    ("metal_plate_nor_gl", "deck-pbr-normal.png", "PNG", "RGB", "8", None),
    ("metal_plate_Rough", "deck-pbr-roughness.png", "PNG", "BW", "8", None),
    ("metal_plate_Displacement", "deck-pbr-displacement.png", "PNG", "BW", "8", None),

    # Grate / Machinery (rusty_metal_grid)
    ("rusty_metal_grid_Diffuse", "grate-albedo.jpg", "JPEG", "RGB", "8", 85),
    ("rusty_metal_grid_nor_gl", "grate-normal.png", "PNG", "RGB", "8", None),
    ("rusty_metal_grid_Rough", "grate-roughness.png", "PNG", "BW", "8", None),
    ("rusty_metal_grid_Displacement", "grate-displacement.png", "PNG", "BW", "8", None),
]

scene = bpy.context.scene
exported = []

for src_name, out_name, fmt, col_mode, col_depth, quality in TEXTURE_CONFIGS:
    img = bpy.data.images.get(src_name)
    if not img:
        print(f"Warning: source image {src_name} not found in Blender data.")
        continue

    scene.render.image_settings.file_format = fmt
    scene.render.image_settings.color_mode = col_mode
    scene.render.image_settings.color_depth = col_depth
    if quality is not None:
        scene.render.image_settings.quality = quality
    scene.render.image_settings.compression = 90

    out_path = os.path.join(TARGET_DIR, out_name)
    img.save_render(out_path, scene=scene)
    size_kb = os.path.getsize(out_path) / 1024
    exported.append((out_name, size_kb, img.size[0], img.size[1]))

print(f"Successfully exported {len(exported)} PBR textures to {TARGET_DIR}:")
for name, kb, w, h in exported:
    print(f"  - {name}: {kb:.1f} KB ({w}x{h})")
