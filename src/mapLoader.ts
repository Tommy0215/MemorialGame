import * as THREE from "three";
import {
  createFloor,
  createBuilding,
  createMuseum,
  createPainting,
  createWallPainting,
  type FloorConfig,
  type BuildingConfig,
  type MuseumConfig,
  type PaintingConfig,
  type WallPaintingConfig,
} from "./environment";

// Map structure definition
export interface MapConfig {
  name: string;
  floor: FloorConfig;
  buildings?: BuildingConfig[];
  museums?: MuseumConfig[];
  paintings?: PaintingConfig[];
  wallPaintings?: WallPaintingConfig[];
  spawnPoint?: { x: number; y: number; z: number };
}

// Building type registry for extensibility
type BuildingFactory = (config: any) => THREE.Group;

const buildingRegistry = new Map<string, BuildingFactory>();

// Register default building types
buildingRegistry.set("building", createBuilding);
buildingRegistry.set("museum", createMuseum);

/**
 * Register a custom building type
 * @param typeName - Unique identifier for the building type
 * @param factory - Function that creates the building group
 */
export function registerBuildingType(
  typeName: string,
  factory: BuildingFactory
): void {
  buildingRegistry.set(typeName, factory);
}

/**
 * Load a map configuration and add all elements to the scene
 */
export function loadMap(scene: THREE.Scene, mapConfig: MapConfig): THREE.Vector3 {
  // Clear existing environment objects (optional - keeps lights and player)
  const objectsToRemove: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj.userData.isEnvironment) {
      objectsToRemove.push(obj);
    }
  });
  objectsToRemove.forEach((obj) => scene.remove(obj));

  console.log(`[MapLoader] Loading map: ${mapConfig.name}`);

  // Create floor
  const floor = createFloor(mapConfig.floor);
  floor.userData.isEnvironment = true;
  scene.add(floor);

  // Create buildings
  mapConfig.buildings?.forEach((buildingConfig) => {
    const building = createBuilding(buildingConfig);
    building.userData.isEnvironment = true;
    scene.add(building);
  });

  // Create museums
  mapConfig.museums?.forEach((museumConfig) => {
    const museum = createMuseum(museumConfig);
    museum.userData.isEnvironment = true;
    scene.add(museum);
  });

  // Create standalone paintings
  mapConfig.paintings?.forEach((paintingConfig) => {
    const painting = createPainting(paintingConfig);
    painting.userData.isEnvironment = true;
    scene.add(painting);
  });

  // Create wall paintings
  mapConfig.wallPaintings?.forEach((wallPaintingConfig) => {
    const painting = createWallPainting(wallPaintingConfig);
    painting.userData.isEnvironment = true;
    scene.add(painting);
  });

  // Return spawn point
  const spawn = mapConfig.spawnPoint || { x: 0, y: 2, z: 15 };
  return new THREE.Vector3(spawn.x, spawn.y, spawn.z);
}

/**
 * Load a map from a JSON file
 */
export async function loadMapFromFile(
  scene: THREE.Scene,
  mapPath: string
): Promise<THREE.Vector3> {
  console.log(`[MapLoader] Fetching map from: ${mapPath}`);
  const response = await fetch(mapPath + '?t=' + Date.now()); // Cache bust for dev
  const mapConfig: MapConfig = await response.json();
  return loadMap(scene, mapConfig);
}

/**
 * Create a custom building using a registered type
 */
export function createCustomBuilding(
  typeName: string,
  config: any
): THREE.Group | null {
  const factory = buildingRegistry.get(typeName);
  if (!factory) {
    console.warn(`[MapLoader] Unknown building type: ${typeName}`);
    return null;
  }
  return factory(config);
}
