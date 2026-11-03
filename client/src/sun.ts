// The sun of the table (docs/specs/look.md), as data: no three.js here, so the Open world's day/night cycle (daynight.ts) and the
// save that reads it can be shared with the MCP server (#1498).

/** One sun, elevation 28 (the Blender render's, lights_camera.json), 25 degrees left of the camera axis at yaw 0, fixed in the world; a hemisphere; no point light. */
export const SUN = { colour: 0xffd9a8, intensity: 5.0, elevation: 28, azimuth: 25, sky: 0x9db8d8, ground: 0x8a7a66, hemisphere: 1.6 } as const;
