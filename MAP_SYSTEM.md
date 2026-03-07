# Map System Documentation

## Overview

The new map system allows you to:
- Define maps as JSON files for easy editing
- Switch between different maps/environments
- Add custom building types programmatically
- Scale to many buildings without cluttering code

## Quick Start

### 1. Load a Map from JSON

```typescript
import { loadMapFromFile } from "./mapLoader";

// In your main.ts or initialization code
const spawnPoint = await loadMapFromFile(scene, "/maps/default.json");
camera.position.copy(spawnPoint);
```

### 2. Create a New Map

Create a new JSON file in `public/maps/`:

```json
{
  "name": "My Map",
  "floor": {
    "size": 100,
    "textureRepeat": 20
  },
  "buildings": [
    {
      "position": { "x": 10, "y": 0, "z": 10 },
      "width": 12,
      "depth": 12,
      "height": 6,
      "wallColor": 8947848,
      "accentColor": 5592575
    }
  ],
  "museums": [
    {
      "position": { "x": -20, "y": 0, "z": 0 },
      "width": 24,
      "depth": 32,
      "height": 6,
      "includeInteriorWalls": true
    }
  ],
  "spawnPoint": { "x": 0, "y": 2, "z": 15 }
}
```

## Map Configuration

### Floor
- `size`: Floor dimensions (square)
- `textureRepeat`: How many times to tile the texture

### Buildings
Array of building objects with:
- `name`: Optional label for identification and documentation
- `position`: `{ x, y, z }` coordinates
- `width`, `depth`, `height`: Dimensions
- `wallThickness`: Wall thickness (default 0.5)
- `wallColor`: Hex color as decimal (e.g., 0x888888 = 8947848)
- `accentColor`: Accent stripe color
- `walls`: Boolean, whether to include walls (default true)
- `entranceWidth`: Width of entrance as fraction of building width (default 0.3)
- `entranceHeight`: Height of entrance as fraction of building height (default 0.6)
- `entranceOffset`: Horizontal offset from center in world units (default 0)
- `entranceSide`: Which wall has the entrance - "north" (negative Z), "south" (positive Z), "west" (negative X), or "east" (positive X). Default is "north". Legacy aliases are supported: "front", "back", "left", "right"
- `interiorWalls`: Array of custom interior walls/pillars (see Interior Walls section below)

### Museums
Same as buildings, plus:
- `includeInteriorWalls`: Boolean for interior structure (default true). Ignored if `interiorWalls` is provided

### Paintings
- `name`: Optional label for identification (displayed in debug labels)
- `url`: Image URL (supports PNG, JPG, WebP)
- `position`: `{ x, y, z }` coordinates
- `width`, `height`: Dimensions
- `fit`: `"contain"` (default) or `"cover"`
- `unlit`: `true` (default, vibrant colors) or `false` (affected by scene lighting)
- `frame`: `true` (default) or `false` - adds decorative border
- `frameFitContent`: `true` (default) or `false` - when true, frame resizes to match actual painting dimensions after aspect ratio adjustment
- `frameThickness`: Frame border width (default: `0.08`)
- `frameColor`: Frame color as decimal, hex string, or RGB object (default: brown `0x8B4513`)
- `facing`: `"north"`, `"south"`, `"east"`, or `"west"` (easier alternative to rotationY)
- `rotationY`: Rotation in radians (alternative to facing)

**Note:** Use either `facing` (simpler) or `rotationY` (precise control). If both are provided, `facing` takes priority.
`fit: "contain"` preserves the full image without cropping. `fit: "cover"` fills the frame and center-crops overflow.
Set `frameFitContent: true` to make frames hug the actual image dimensions (useful for paintings with different aspect ratios).

### Wall Paintings
- `url`: Image URL
- `museumPosition`: Museum's position
- `museumWidth`, `museumDepth`: Museum dimensions
- `wall`: "left", "right", "front", or "back"
- `along`: Offset along the wall
- `centerHeight`: Height above floor
- `width`, `height`: Dimensions

### Spawn Point
- `x`, `y`, `z`: Player spawn coordinates

### Interior Walls
Custom interior walls and pillars for buildings and museums. Each wall object has:
- `name`: Optional label for identification and documentation
- `position`: `{ x, y, z }` coordinates relative to the building center
- `width`: Width (X dimension) of the wall or pillar
- `height`: Height (Y dimension) of the wall or pillar
- `depth`: Depth (Z dimension) of the wall or pillar

**Example:**
```json
"interiorWalls": [
  {
    "name": "Center divider",
    "position": { "x": 0, "y": 2.5, "z": 5 },
    "width": 0.5,
    "height": 5,
    "depth": 10
  },
  {
    "name": "Support pillar 1",
    "position": { "x": -3, "y": 3, "z": -5 },
    "width": 0.7,
    "height": 6,
    "depth": 0.7
  }
]
```

Tips:
- Use thin walls (width or depth = 0.5) for dividers
- Use square dimensions (width = depth = 0.7) for pillars
- Position Y is typically half the height for walls resting on the floor
- All positions are relative to the building's center (0, 0, 0)

## Custom Building Types

Register custom building types for special structures:

```typescript
import { registerBuildingType } from "./mapLoader";

registerBuildingType("tower", (config) => {
  const group = new THREE.Group();
  
  // Build your custom structure
  const geometry = new THREE.CylinderGeometry(5, 5, 20, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const tower = new THREE.Mesh(geometry, material);
  tower.position.y = 10;
  
  group.add(tower);
  if (config.position) {
    group.position.copy(config.position);
  }
  
  return group;
});
```

## Color Conversion

Colors in JSON must be decimal numbers. Convert hex to decimal:
- `0x888888` (gray) → `8947848`
- `0xFF0000` (red) → `16711680`
- `0x00FF00` (green) → `65280`
- `0x0000FF` (blue) → `255`

Or use an online hex to decimal converter.

## Examples

See the example maps:
- `public/maps/default.json` - Single museum
- `public/maps/campus.json` - Multiple buildings and a museum

See `src/mapLoader.example.ts` for code examples.

## Developer Tools & Debug Keys

The game includes several debug controls for development:

- **C**: Toggle coordinate display (X, Y, Z, facing direction, inspector/painting label status)
- **I**: Toggle inspector mode (noclip - walk through walls)
- **R**: Toggle running (faster movement)
- **M**: Hot-reload the current map (preserves camera position and direction)
- **P**: Toggle painting coordinate labels (displays x, y, z above each painting in the viewport)

These controls are hidden from the HUD by default. Press **C** to show the debug overlay with current status.

## Benefits

1. **Easy editing**: Change maps without touching TypeScript code
2. **Version control**: Map changes show up cleanly in git diffs
3. **Multiple maps**: Switch between environments easily
4. **Collaboration**: Non-programmers can edit JSON files
5. **Scalability**: Add dozens of buildings without code bloat
