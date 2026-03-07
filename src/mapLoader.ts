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
  type WallPaintingConfig,
} from "./environment";
import { clearCollidables } from "./collision";

// Helper type for flexible color input (hex string, RGB object, or decimal number)
export type ColorInput = string | { r: number; g: number; b: number } | number;

/**
 * Convert color to decimal number
 * Accepts hex string ("#FF0000"), RGB object { r, g, b }, or decimal number
 */
function toDecimalColor(color: ColorInput): number {
  if (typeof color === "number") {
    return color;
  }
  if (typeof color === "string") {
    // Parse hex string like "#7f4747"
    const hex = color.replace("#", "");
    return parseInt(hex, 16);
  }
  // RGB object: convert to 0xRRGGBB
  return (color.r << 16) | (color.g << 8) | color.b;
}

export interface PaintingConfig {
  name?: string;
  url: string;
  position: THREE.Vector3;
  width?: number;
  height?: number;
  fit?: "contain" | "cover";
  unlit?: boolean;
  frame?: boolean;
  frameFitContent?: boolean;
  frameThickness?: number;
  frameColor?: ColorInput;
  rotationY?: number;
  facing?: "north" | "south" | "east" | "west";
}

export interface SimpleObjectConfig {
  type: "box" | "sphere" | "cylinder";
  position: { x: number; y: number; z: number };
  color: ColorInput;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
}

// Map structure definition
export interface MapConfig {
  name: string;
  floor: FloorConfig;
  buildings?: BuildingConfig[];
  museums?: MuseumConfig[];
  paintings?: PaintingConfig[];
  wallPaintings?: WallPaintingConfig[];
  objects?: SimpleObjectConfig[];
  spawnPoint?: { x: number; y: number; z: number; lookAt?: { x: number; y: number; z: number } };
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
export function loadMap(scene: THREE.Scene, mapConfig: MapConfig): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
  clearCollidables();

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

  // Create simple objects
  mapConfig.objects?.forEach((objConfig) => {
    const obj = createSimpleObject(objConfig);
    obj.userData.isEnvironment = true;
    scene.add(obj);
  });

  // Return spawn point and look direction
  const spawn = mapConfig.spawnPoint || { x: 0, y: 2, z: 15 };
  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  const lookAt = spawn.lookAt 
    ? new THREE.Vector3(spawn.lookAt.x, spawn.lookAt.y, spawn.lookAt.z)
    : position.clone().add(new THREE.Vector3(0, 0, -5));
  return { position, lookAt };
}

/**
 * Create a simple geometric object (box, sphere, cylinder)
 */
function createSimpleObject(config: SimpleObjectConfig): THREE.Mesh {
  let geometry: THREE.BufferGeometry;

  switch (config.type) {
    case "box":
      geometry = new THREE.BoxGeometry(
        config.width ?? 1,
        config.height ?? 1,
        config.depth ?? 1
      );
      break;
    case "sphere":
      geometry = new THREE.SphereGeometry(config.radius ?? 1);
      break;
    case "cylinder":
      geometry = new THREE.CylinderGeometry(
        config.radius ?? 1,
        config.radius ?? 1,
        config.height ?? 1
      );
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color: toDecimalColor(config.color),
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(config.position.x, config.position.y, config.position.z);
  if (config.rotationX) mesh.rotation.x = config.rotationX;
  if (config.rotationY) mesh.rotation.y = config.rotationY;
  if (config.rotationZ) mesh.rotation.z = config.rotationZ;

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Load a map from a JSON file
 */
export async function loadMapFromFile(
  scene: THREE.Scene,
  mapPath: string
): Promise<{ position: THREE.Vector3; lookAt: THREE.Vector3 }> {
  console.log(`[MapLoader] Fetching map from: ${mapPath}`);
  const requestPath = import.meta.env.DEV ? `${mapPath}?t=${Date.now()}` : mapPath;
  const response = await fetch(requestPath);
  if (!response.ok) {
    throw new Error(
      `[MapLoader] Failed to fetch map (${response.status} ${response.statusText}): ${requestPath}`
    );
  }
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
