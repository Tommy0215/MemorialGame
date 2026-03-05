// Example of how to use the new map loader system in main.ts

import { loadMap, loadMapFromFile, registerBuildingType, type MapConfig } from "./mapLoader";
import * as THREE from "three";

// OPTION 1: Load from a JSON file
async function _loadFromFile(scene: THREE.Scene) {
  const spawnPoint = await loadMapFromFile(scene, "/maps/default.json");
  // or use "/maps/campus.json" for multiple buildings
  return spawnPoint;
}

// OPTION 2: Define map inline (programmatic)
function _loadInlineMap(scene: THREE.Scene) {
  const myMap: MapConfig = {
    name: "Custom Map",
    floor: {
      size: 100,
      textureRepeat: 20,
    },
    museums: [
      {
        position: new THREE.Vector3(0, 0, 0),
        width: 24,
        depth: 32,
        height: 6,
      },
    ],
    buildings: [
      {
        position: new THREE.Vector3(30, 0, 0),
        width: 12,
        depth: 12,
        height: 6,
      },
    ],
    spawnPoint: { x: 0, y: 2, z: 15 },
  };
  
  return loadMap(scene, myMap);
}

// OPTION 3: Register custom building types
function _registerCustomBuildings() {
  // Example: Register a "tower" building type
  registerBuildingType("tower", (config) => {
    const group = new THREE.Group();
    const height = config.height || 20;
    const radius = config.radius || 3;
    
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
    const material = new THREE.MeshStandardMaterial({ 
      color: config.color || 0x888888 
    });
    const tower = new THREE.Mesh(geometry, material);
    tower.position.y = height / 2;
    
    group.add(tower);
    if (config.position) {
      group.position.copy(config.position);
    }
    
    return group;
  });
}

// Usage in main.ts:
// const spawnPoint = await loadMapFromFile(scene, "/maps/campus.json");
// camera.position.copy(spawnPoint);
