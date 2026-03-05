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
- `position`: `{ x, y, z }` coordinates
- `width`, `depth`, `height`: Dimensions
- `wallThickness`: Wall thickness (default 0.5)
- `wallColor`: Hex color as decimal (e.g., 0x888888 = 8947848)
- `accentColor`: Accent stripe color
- `walls`: Boolean, whether to include walls (default true)

### Museums
Same as buildings, plus:
- `includeInteriorWalls`: Boolean for interior structure (default true)

### Paintings
- `url`: Image URL
- `position`: `{ x, y, z }` coordinates
- `width`, `height`: Dimensions
- `rotationY`: Rotation in radians

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

## Benefits

1. **Easy editing**: Change maps without touching TypeScript code
2. **Version control**: Map changes show up cleanly in git diffs
3. **Multiple maps**: Switch between environments easily
4. **Collaboration**: Non-programmers can edit JSON files
5. **Scalability**: Add dozens of buildings without code bloat
