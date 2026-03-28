import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { createFloor, createMuseum, fillMuseumWallsWithPaintings, type MuseumConfig } from "./environment";
import { addCollidable, resolveCollisions } from "./collision";
import { createNetworkClient, type NetworkClient } from "./network";
import { loadMapFromFile, type ChestConfig, type MapConfig } from "./mapLoader";

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: PointerLockControls;

// Current map file path for loading/reloading
let currentMapPath = "/maps/campus.json";

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

let isRunning = false;
let isSneaking = false;
let isInspectorMode = false;
let showPaintingCoords = false;

let networkClient: NetworkClient | null = null;

// Painting coordinate labels group
let paintingLabelsGroup: THREE.Group;

// Coordinate display element
const coordsElement = document.getElementById("coordinates") as HTMLDivElement;
const crosshairElement = document.getElementById("crosshair") as HTMLDivElement | null;
const slot1Element = document.getElementById("slot-1") as HTMLDivElement | null;
const slot2Element = document.getElementById("slot-2") as HTMLDivElement | null;

type ItemType = "icosahedron" | "box" | "sphere" | "cylinder";

type InventoryItem = {
  itemType: ItemType;
  color: string;
};

type SlotPreviewState = {
  key: string;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
};

let activeToolbarSlot: 1 | 2 = 1;
const toolbarSlots: [InventoryItem | null, InventoryItem | null] = [null, null];
const slotPreviewStates: [SlotPreviewState | null, SlotPreviewState | null] = [null, null];
let slotPreviewAnimationRunning = false;

const SLOT_PREVIEW_SIZE = 52;
const SLOT_PREVIEW_SPIN_SPEED = 0.02;
const SLOT_PREVIEW_FLOAT_SPEED = 1.7;
const SLOT_PREVIEW_FLOAT_AMPLITUDE = 0.07;

function getSlotElement(slot: 1 | 2): HTMLDivElement | null {
  return slot === 1 ? slot1Element : slot2Element;
}

function createPreviewGeometry(itemType: ItemType, size: number): THREE.BufferGeometry {
  switch (itemType) {
    case "box":
      return new THREE.BoxGeometry(size * 2, size * 2, size * 2);
    case "sphere":
      return new THREE.SphereGeometry(size, 20, 12);
    case "cylinder":
      return new THREE.CylinderGeometry(size * 0.8, size * 0.8, size * 2, 16);
    case "icosahedron":
    default:
      return new THREE.IcosahedronGeometry(size, 0);
  }
}

function disposeSlotPreview(slotNumber: 1 | 2): void {
  const idx = slotNumber - 1;
  const state = slotPreviewStates[idx];
  if (!state) return;

  state.mesh.geometry.dispose();
  (state.mesh.material as THREE.Material).dispose();
  state.renderer.dispose();
  slotPreviewStates[idx] = null;
}

function getOrCreateSlotPreview(slotNumber: 1 | 2, item: InventoryItem): HTMLCanvasElement {
  const idx = slotNumber - 1;
  const key = `${item.itemType}|${item.color}`;
  const existing = slotPreviewStates[idx];
  if (existing && existing.key === key) {
    return existing.renderer.domElement;
  }

  disposeSlotPreview(slotNumber);

  const previewScene = new THREE.Scene();
  const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
  previewCamera.position.set(0, 0.08, 2.15);
  previewCamera.lookAt(0, 0, 0);

  const previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  previewRenderer.setSize(SLOT_PREVIEW_SIZE, SLOT_PREVIEW_SIZE);
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  previewRenderer.domElement.className = "slot-icon";

  const itemColor = new THREE.Color(item.color as THREE.ColorRepresentation);
  const material = new THREE.MeshStandardMaterial({
    color: itemColor,
    emissive: itemColor.clone().multiplyScalar(0.3),
    emissiveIntensity: 1,
    roughness: 0.2,
    metalness: 0.25,
  });
  const mesh = new THREE.Mesh(createPreviewGeometry(item.itemType, 0.42), material);
  mesh.position.y = 0;
  previewScene.add(mesh);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  previewScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
  keyLight.position.set(1.7, 2.1, 2.3);
  previewScene.add(keyLight);

  const fill = new THREE.DirectionalLight(0x9bb6ff, 0.45);
  fill.position.set(-1.5, 0.5, 1.4);
  previewScene.add(fill);

  const rim = new THREE.DirectionalLight(itemColor, 0.8);
  rim.position.set(-1.9, 1.1, -2.3);
  previewScene.add(rim);

  slotPreviewStates[idx] = {
    key,
    renderer: previewRenderer,
    scene: previewScene,
    camera: previewCamera,
    mesh,
    baseY: 0,
    phase: Math.random() * Math.PI * 2,
  };

  if (!slotPreviewAnimationRunning) {
    slotPreviewAnimationRunning = true;
    animateSlotPreviews();
  }

  return previewRenderer.domElement;
}

function animateSlotPreviews(): void {
  let hasActivePreview = false;
  const t = performance.now() * 0.001;

  slotPreviewStates.forEach((state) => {
    if (!state) return;
    hasActivePreview = true;

    state.mesh.rotation.y += SLOT_PREVIEW_SPIN_SPEED;
    state.mesh.rotation.x = Math.sin(t * 1.2 + state.phase) * 0.15;
    state.mesh.position.y =
      state.baseY +
      Math.sin(t * SLOT_PREVIEW_FLOAT_SPEED + state.phase) * SLOT_PREVIEW_FLOAT_AMPLITUDE;
    state.renderer.render(state.scene, state.camera);
  });

  if (!hasActivePreview) {
    slotPreviewAnimationRunning = false;
    return;
  }

  requestAnimationFrame(animateSlotPreviews);
}

function refreshToolbarUI(): void {
  ([1, 2] as const).forEach((slotNumber) => {
    const el = getSlotElement(slotNumber);
    if (!el) return;

    const item = toolbarSlots[slotNumber - 1];
    el.classList.toggle("has-item", !!item);
    el.textContent = "";
    if (item) {
      const previewCanvas = getOrCreateSlotPreview(slotNumber, item);
      el.appendChild(previewCanvas);
    } else {
      disposeSlotPreview(slotNumber);
    }
  });
}

function setActiveToolbarSlot(slot: 1 | 2): void {
  activeToolbarSlot = slot;
  slot1Element?.classList.toggle("active", slot === 1);
  slot2Element?.classList.toggle("active", slot === 2);
  refreshToolbarUI();
}

// Dev mode: toggle coordinates display with 'C' key
let showCoordinates = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

const interactRaycaster = new THREE.Raycaster();
const interactScreenCenter = new THREE.Vector2(0, 0);

let chestGroup: THREE.Group | null = null;
let chestLidPivot: THREE.Group | null = null;
let chestItemMesh: THREE.Mesh | null = null;
let chestInteractiveMesh: THREE.Mesh | null = null;
let chestIsOpen = false;
let chestLidAngle = 0;
let chestHasItem = false;
let chestItemType: ItemType = "icosahedron";
let chestItemColor = "#3de7ff";

const CHEST_INTERACT_DISTANCE = 4.5;
const CHEST_OUTSIDE_DISTANCE = 2.6;
const CHEST_OPEN_ANGLE = -Math.PI * 0.55;

let chestInteractDistance = CHEST_INTERACT_DISTANCE;

let canJump = true;
let verticalVelocity = 0;
const GRAVITY = 30;
const JUMP_SPEED = 10;

function getFacingDirectionLabel(): string {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);

  if (Math.abs(forward.x) >= Math.abs(forward.z)) {
    return forward.x >= 0 ? "East (+X)" : "West (-X)";
  }

  return forward.z >= 0 ? "South (+Z)" : "North (-Z)";
}

/**
 * Create a canvas-based 2D text sprite showing coordinates, filename, and optional name
 */
function createCoordLabel(position: THREE.Vector3, x: number, y: number, z: number, rotationY: number = 0, url?: string, name?: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  const filename = url ? url.split("/").pop() || url : undefined;
  const lineCount = (name ? 1 : 0) + (filename ? 1 : 0) + 1; // +1 for coordinates
  const lineHeight = 44;
  const verticalPadding = 28;
  canvas.height = verticalPadding * 2 + lineCount * lineHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Dark semi-transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bright white text
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  let yOffset = verticalPadding;

  // Draw name if present
  if (name) {
    ctx.font = "bold 30px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(name, canvas.width / 2, yOffset);
    yOffset += lineHeight;
  }

  // Draw filename (extract from URL)
  if (filename) {
    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = "#aaaaaa";
    ctx.textBaseline = "top";
    ctx.fillText(filename, canvas.width / 2, yOffset);
    yOffset += lineHeight;
  }

  // Draw coordinates
  ctx.font = "bold 34px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  const coordText = `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
  ctx.fillText(coordText, canvas.width / 2, yOffset);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);

  sprite.position.copy(position);
  sprite.position.y += 0.5; // Offset above painting

  // Offset label away from wall based on painting's facing direction
  const offsetDistance = 3; // Pull label 3 units away from wall
  sprite.position.x += Math.cos(rotationY) * offsetDistance;
  sprite.position.z += Math.sin(rotationY) * offsetDistance;

  const labelSizeMultiplier = 0.5;
  const labelHeightScale = Math.max(1.8, 1.2 + lineCount * 0.45) * labelSizeMultiplier;
  const aspectRatio = canvas.width / canvas.height;
  sprite.scale.set(labelHeightScale * aspectRatio, labelHeightScale, 1);

  return sprite;
}

/**
 * Find all paintings in the scene and create coordinate labels for them
 */
function setupPaintingLabels(): void {
  paintingLabelsGroup.clear();

  scene.traverse((obj: THREE.Object3D) => {
    if (obj.userData.isPainting) {
      const pos = obj.position;
      const rotation = obj.rotation.y;
      const config = obj.userData.paintingConfig;
      const name = config?.name;
      const url = config?.url;
      const label = createCoordLabel(pos, pos.x, pos.y, pos.z, rotation, url, name);
      paintingLabelsGroup.add(label);
    }
  });

  paintingLabelsGroup.visible = showPaintingCoords;
}

// create a simple red cube and add to scene at a given position
function createRedBlock(position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const block = new THREE.Mesh(geometry, material);
  block.position.copy(position);
  scene.add(block);
  return block;
}

const BASE_SPEED = 50.0;
const RUN_MULTIPLIER = 3.0;
const SNEAK_MULTIPLIER = 0.4;

const STAND_HEIGHT = 1.6;
const SNEAK_HEIGHT = 1.2;

// Start initialization (async)
init();
animate();

async function loadSelectedMap(mapPath: string, preservePosition = false): Promise<void> {
  currentMapPath = mapPath;
  
  // Store current position if preserving
  const controlsObject = getControlsObject();
  const savedPosition = preservePosition ? controlsObject.position.clone() : null;
  const savedDirection = preservePosition ? new THREE.Vector3() : null;
  if (preservePosition && savedDirection) {
    camera.getWorldDirection(savedDirection);
  }
  
  const spawn = await loadMapFromFile(scene, currentMapPath);
  
  // Restore or use spawn point
  if (preservePosition && savedPosition) {
    controlsObject.position.copy(savedPosition);
    // Maintain the look direction
    if (savedDirection) {
      const lookAtPoint = savedPosition.clone().add(savedDirection);
      controlsObject.lookAt(lookAtPoint);
    }
  } else {
    controlsObject.position.copy(spawn.position);
    controlsObject.lookAt(spawn.lookAt);
  }
  
  velocity.set(0, 0, 0);
  verticalVelocity = 0;
  canJump = true;

  // Setup painting labels for the newly loaded map
  setupPaintingLabels();

  // Place chest at the active museum entrance
  setupMuseumEntranceChest();
}

function normalizeEntranceSide(side?: string): "north" | "south" | "east" | "west" {
  if (side === "front") return "north";
  if (side === "back") return "south";
  if (side === "left") return "west";
  if (side === "right") return "east";
  if (side === "south" || side === "east" || side === "west") return side;
  return "north";
}

function getMuseumEntrancePlacement(
  config: Partial<MuseumConfig>,
  fallbackPosition: THREE.Vector3,
  outsideDistance: number
): { position: THREE.Vector3; facing: THREE.Vector3 } {
  const center = config.position
    ? new THREE.Vector3(config.position.x, config.position.y, config.position.z)
    : fallbackPosition.clone();

  const width = config.width ?? 24;
  const depth = config.depth ?? 32;
  const entranceOffset = config.entranceOffset ?? 0;
  const entranceSide = normalizeEntranceSide(config.entranceSide as string | undefined);

  const position = center.clone();
  const facing = new THREE.Vector3(0, 0, 1);

  switch (entranceSide) {
    case "north":
      position.x = center.x + entranceOffset;
      position.z = center.z - depth / 2 - outsideDistance;
      facing.set(0, 0, 1);
      break;
    case "south":
      position.x = center.x + entranceOffset;
      position.z = center.z + depth / 2 + outsideDistance;
      facing.set(0, 0, -1);
      break;
    case "west":
      position.x = center.x - width / 2 - outsideDistance;
      position.z = center.z + entranceOffset;
      facing.set(1, 0, 0);
      break;
    case "east":
      position.x = center.x + width / 2 + outsideDistance;
      position.z = center.z + entranceOffset;
      facing.set(-1, 0, 0);
      break;
  }

  position.y = center.y;
  return { position, facing };
}

function createChest(
  position: THREE.Vector3,
  facing: THREE.Vector3,
  chestConfig?: ChestConfig
): void {
  chestGroup = new THREE.Group();
  chestGroup.userData.isEnvironment = true;
  chestGroup.userData.isChest = true;

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.85, metalness: 0.05 });
  const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xc8a34a, roughness: 0.35, metalness: 0.7 });
  const itemColor = chestConfig?.item?.color ?? 0x3de7ff;
  const itemType: ItemType = chestConfig?.item?.type ?? "icosahedron";
  const itemSize = Math.max(0.05, chestConfig?.item?.size ?? 0.18);
  chestItemType = itemType;
  chestItemColor =
    typeof itemColor === "string"
      ? itemColor
      : `#${new THREE.Color(itemColor as THREE.ColorRepresentation).getHexString()}`;
  const itemColorThree = new THREE.Color(itemColor as THREE.ColorRepresentation);
  const gemMaterial = new THREE.MeshStandardMaterial({
    color: itemColorThree,
    emissive: itemColorThree.clone().multiplyScalar(0.35),
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.1,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), woodMaterial);
  base.position.set(0, 0.35, 0);
  base.userData.isChestInteractable = true;
  chestGroup.add(base);
  addCollidable(base);
  chestInteractiveMesh = base;

  const lidBand = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.08), bandMaterial);
  lidBand.position.set(0, 0.74, 0.38);
  chestGroup.add(lidBand);

  chestLidPivot = new THREE.Group();
  chestLidPivot.position.set(0, 0.72, -0.4);

  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.8), woodMaterial);
  lid.position.set(0, 0.175, 0.4);
  chestLidPivot.add(lid);

  const lidFrontBand = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.08), bandMaterial);
  lidFrontBand.position.set(0, 0.175, 0.78);
  chestLidPivot.add(lidFrontBand);

  chestGroup.add(chestLidPivot);

  const itemGeometry = createPreviewGeometry(itemType, itemSize);

  chestItemMesh = new THREE.Mesh(itemGeometry, gemMaterial);
  chestItemMesh.position.set(0, 0.93, 0);
  chestItemMesh.visible = false;
  chestGroup.add(chestItemMesh);

  chestGroup.position.copy(position);
  if (typeof chestConfig?.rotationY === "number") {
    chestGroup.rotation.y = chestConfig.rotationY;
  } else {
    chestGroup.lookAt(position.clone().add(facing));
  }
  scene.add(chestGroup);

  chestIsOpen = false;
  chestHasItem = true;
  chestLidAngle = 0;
  if (chestLidPivot) {
    chestLidPivot.rotation.x = 0;
  }
}

function setupMuseumEntranceChest(): void {
  if (chestGroup) {
    scene.remove(chestGroup);
  }
  chestGroup = null;
  chestLidPivot = null;
  chestItemMesh = null;
  chestInteractiveMesh = null;
  chestIsOpen = false;
  chestHasItem = false;
  chestLidAngle = 0;
  chestInteractDistance = CHEST_INTERACT_DISTANCE;

  const mapConfig = (scene.userData.mapConfig ?? {}) as Partial<MapConfig>;
  const chestConfig = mapConfig.chest;
  if (chestConfig?.enabled === false) {
    return;
  }

  const museums: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj.userData.isMuseum) {
      museums.push(obj);
    }
  });

  const museumIndex = Math.max(0, chestConfig?.museumIndex ?? 0);
  const museum = museums[museumIndex];
  if (!museum && !chestConfig?.position) {
    return;
  }

  if (typeof chestConfig?.interactDistance === "number") {
    chestInteractDistance = Math.max(1, chestConfig.interactDistance);
  }

  if (chestConfig?.position) {
    createChest(
      new THREE.Vector3(
        chestConfig.position.x,
        chestConfig.position.y,
        chestConfig.position.z
      ),
      new THREE.Vector3(0, 0, 1),
      chestConfig
    );
    return;
  }

  const museumConfig = (museum.userData.mapConfig ?? {}) as Partial<MuseumConfig>;
  const placement = getMuseumEntrancePlacement(
    museumConfig,
    museum.position.clone(),
    Math.max(0.5, chestConfig?.entranceDistance ?? CHEST_OUTSIDE_DISTANCE)
  );
  createChest(placement.position, placement.facing, chestConfig);
}

function tryInteractWithChest(): void {
  if (!controls.isLocked || !chestInteractiveMesh) {
    return;
  }

  interactRaycaster.setFromCamera(interactScreenCenter, camera);
  const hits = interactRaycaster.intersectObject(chestInteractiveMesh, false);
  if (hits.length === 0 || hits[0].distance > chestInteractDistance) {
    return;
  }

  chestIsOpen = !chestIsOpen;
  if (chestItemMesh) {
    chestItemMesh.visible = chestIsOpen && chestHasItem;
  }
}

function tryGrabChestItem(): boolean {
  if (!controls.isLocked || !chestIsOpen || !chestHasItem || !chestItemMesh) {
    return false;
  }

  interactRaycaster.setFromCamera(interactScreenCenter, camera);
  const hits = interactRaycaster.intersectObject(chestItemMesh, false);
  if (hits.length === 0 || hits[0].distance > chestInteractDistance) {
    return false;
  }

  const slotIndex = activeToolbarSlot - 1;
  if (toolbarSlots[slotIndex]) {
    console.log(`[Chest] Slot ${activeToolbarSlot} is occupied.`);
    return true;
  }

  toolbarSlots[slotIndex] = {
    itemType: chestItemType,
    color: chestItemColor,
  };
  refreshToolbarUI();

  chestHasItem = false;
  chestItemMesh.visible = false;
  console.log(`[Chest] Picked up item into slot ${activeToolbarSlot}.`);
  return true;
}

async function init(): Promise<void> {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.tabIndex = 0;
  document.body.appendChild(renderer.domElement);

  setupLights();

  controls = new PointerLockControls(camera, document.body);
  const controlsObject = getControlsObject();
  scene.add(controlsObject);

  setActiveToolbarSlot(activeToolbarSlot);
  refreshToolbarUI();

  if (crosshairElement) {
    crosshairElement.style.display = "none";
  }

  controls.addEventListener("lock", () => {
    if (crosshairElement) {
      crosshairElement.style.display = "block";
    }
  });

  controls.addEventListener("unlock", () => {
    if (crosshairElement) {
      crosshairElement.style.display = "none";
    }
  });

  // Initialize painting labels group
  paintingLabelsGroup = new THREE.Group();
  scene.add(paintingLabelsGroup);

  // Load map from JSON file
  try {
    await loadSelectedMap(currentMapPath);
    console.log("[Main] Map loaded successfully");
  } catch (err) {
    console.error("[Main] Failed to load map:", err);
    // Fallback to old setup if map fails
    setupWorld();
    controlsObject.position.set(0, 1.6, -30);
    controlsObject.lookAt(new THREE.Vector3(0, 1.6, -41));
  }

  networkClient = createNetworkClient(scene);

  const onClick = () => {
    if (!controls.isLocked) {
      controls.lock();
      return;
    }

    if (tryGrabChestItem()) {
      return;
    }

    tryInteractWithChest();
  };
  document.addEventListener("click", onClick);

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "Digit1":
        setActiveToolbarSlot(1);
        break;
      case "Digit2":
        setActiveToolbarSlot(2);
        break;
      case "ArrowUp":
      case "KeyW":
        moveForward = true;
        break;
      case "ArrowLeft":
      case "KeyA":
        moveLeft = true;
        break;
      case "ArrowDown":
      case "KeyS":
        moveBackward = true;
        break;
      case "ArrowRight":
      case "KeyD":
        moveRight = true;
        break;
      case "KeyR":
        isRunning = !isRunning;
        break;
      case "ShiftLeft":
        isSneaking = true;
        break;
      case "KeyC":
        // Toggle coordinate display
        showCoordinates = !showCoordinates;
        if (coordsElement) {
          coordsElement.style.display = showCoordinates ? "block" : "none";
        }
        break;
      case "KeyM":
        // Hot-reload map for development
        console.log("[Dev] Reloading map...");
        loadSelectedMap(currentMapPath, true)
          .then(() => {
            console.log("[Dev] Map reloaded successfully");
          })
          .catch((err) => {
            console.error("[Dev] Failed to reload map:", err);
          });
        break;
      case "KeyI":
        // Toggle inspector mode (noclip)
        isInspectorMode = !isInspectorMode;
        console.log(
          `[Dev] Inspector mode ${isInspectorMode ? "enabled" : "disabled"} (noclip ${
            isInspectorMode ? "ON" : "OFF"
          })`
        );
        break;
      case "KeyP":
        // Toggle painting coordinate labels
        showPaintingCoords = !showPaintingCoords;
        paintingLabelsGroup.visible = showPaintingCoords;
        console.log(
          `[Dev] Painting labels ${showPaintingCoords ? "visible" : "hidden"}`
        );
        break;
      case "Space":
        if (canJump) {
          verticalVelocity = JUMP_SPEED;
          canJump = false;
        }
        break;
      case "KeyF":
        // spawn a red block at current player position
        const spawnPos = controlsObject.position.clone();
        spawnPos.y += 1; // float slightly above feet
        if (networkClient) {
          networkClient.spawnBlock(spawnPos);
        }
        // also show an immediate local copy just for responsiveness; it will
        // vanish after five seconds to match the networked blocks.
        const temp = createRedBlock(spawnPos);
        setTimeout(() => {
          scene.remove(temp);
        }, 5000);
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case "ArrowUp":
      case "KeyW":
        moveForward = false;
        break;
      case "ArrowLeft":
      case "KeyA":
        moveLeft = false;
        break;
      case "ArrowDown":
      case "KeyS":
        moveBackward = false;
        break;
      case "ArrowRight":
      case "KeyD":
        moveRight = false;
        break;
      case "KeyR":
        break;
      case "ShiftLeft":
        isSneaking = false;
        break;
    }
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  window.addEventListener("resize", onWindowResize);
}

function setupLights(): void {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);
}

function setupWorld(): void {
  const floor = createFloor({
    size: 100,
    textureRepeat: 20,
  });
  scene.add(floor);

  const museumConfig = {
    position: new THREE.Vector3(0, 0, -25),
    width: 24,
    depth: 32,
    height: 6,
    wallThickness: 0.5,
    wallColor: 0x888888,
    accentColor: 0x5555ff,
    // no interior partitions, pillars, etc.
    includeInteriorWalls: false,
  };

  const museum = createMuseum(museumConfig);
  scene.add(museum);

  const museumCenter = museumConfig.position;

  // populate every wall with paintings using the helper
  // when the museum uses the default front "gate" geometry there is
  // a 30%‑width opening in the centre; exclude a range there so no
  // paintings float in the doorway.
  // calculate an exclusion that leaves some breathing room
  // (prevent paintings from straddling the doorway).
  const halfOpening = museumConfig.width * 0.15; // base opening half-width
  const paintW = 3;
  const pad = 0.5;
  const frontGateHalf = halfOpening + paintW / 2 + pad;

  const wallPaintings = fillMuseumWallsWithPaintings({
    museumPosition: museumCenter,
    museumWidth: museumConfig.width,
    museumDepth: museumConfig.depth,
    url: "/images/paint.png",
    paintingWidth: paintW,
    paintingHeight: 2,
    centerHeight: 2.2,
    padding: pad,
    excludeAlongRanges: {
      front: [{ start: -frontGateHalf, end: frontGateHalf }],
    },
    // optional: restrict to certain walls using `walls: ["left","front"]`
  });
  wallPaintings.forEach((p: THREE.Mesh) => scene.add(p));
}

function animate(): void {
  requestAnimationFrame(animate);

  const time = performance.now();
  const delta = (time - prevTime) / 1000;

  // Apply friction
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;

  direction.z = Number(moveForward) - Number(moveBackward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize();

  let speed = BASE_SPEED;

  const running = isRunning && moveForward && !isSneaking;
  if (running) {
    speed *= RUN_MULTIPLIER;
  }

  if (isSneaking) {
    speed *= SNEAK_MULTIPLIER;
  }

  if (moveForward || moveBackward) {
    velocity.z -= direction.z * speed * delta;
  }
  if (moveLeft || moveRight) {
    velocity.x -= direction.x * speed * delta;
  }

  if (controls.isLocked) {
    const controlsObject = getControlsObject();

    const stepX = -velocity.x * delta;
    const stepZ = -velocity.z * delta;

    if (stepX !== 0) {
      controls.moveRight(stepX);
    }

    if (stepZ !== 0) {
      controls.moveForward(stepZ);
    }

    verticalVelocity -= GRAVITY * delta;
    controlsObject.position.y += verticalVelocity * delta;

    if (!isInspectorMode) {
      resolveCollisions(controlsObject.position);
    }

    const targetHeight = isSneaking ? SNEAK_HEIGHT : STAND_HEIGHT;

    if (verticalVelocity === 0) {
      const lerpFactor = Math.min(10 * delta, 1);
      controlsObject.position.y +=
        (targetHeight - controlsObject.position.y) * lerpFactor;
    }

    if (controlsObject.position.y < targetHeight) {
      controlsObject.position.y = targetHeight;
      verticalVelocity = 0;
      canJump = true;
    }

    if (networkClient) {
      networkClient.update(controlsObject, { isRunning, isSneaking });
    }

    // Update coordinate display
    if (coordsElement && showCoordinates) {
      const pos = controlsObject.position;
      const facing = getFacingDirectionLabel();
      coordsElement.innerHTML = `
        X: ${pos.x.toFixed(2)}<br>
        Y: ${pos.y.toFixed(2)}<br>
        Z: ${pos.z.toFixed(2)}<br>
        Facing: ${facing}<br>
        Inspector: ${isInspectorMode ? "ON" : "OFF"}<br>
        Painting Labels: ${showPaintingCoords ? "ON" : "OFF"}
      `;
    }
  }

  if (chestLidPivot) {
    const targetAngle = chestIsOpen ? CHEST_OPEN_ANGLE : 0;
    const lidLerp = Math.min(12 * delta, 1);
    chestLidAngle += (targetAngle - chestLidAngle) * lidLerp;
    chestLidPivot.rotation.x = chestLidAngle;
  }

  if (chestItemMesh && chestIsOpen && chestHasItem) {
    chestItemMesh.rotation.y += delta * 2.2;
    chestItemMesh.position.y = 0.93 + Math.sin(time * 0.007) * 0.04;
  }

  prevTime = time;

  renderer.render(scene, camera);
}

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function getControlsObject(): THREE.Object3D {
  const anyControls = controls as unknown as {
    getObject?: () => THREE.Object3D;
    object?: THREE.Object3D;
  };

  if (anyControls.getObject) {
    return anyControls.getObject();
  }

  if (anyControls.object) {
    return anyControls.object;
  }

  throw new Error("PointerLockControls does not expose a controllable object.");
}