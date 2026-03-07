import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { createFloor, createMuseum, fillMuseumWallsWithPaintings } from "./environment";
import { resolveCollisions } from "./collision";
import { createNetworkClient, type NetworkClient } from "./network";
import { loadMapFromFile } from "./mapLoader";

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

// Dev mode: toggle coordinates display with 'C' key
let showCoordinates = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

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
    controls.lock();
  };
  document.addEventListener("click", onClick);

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
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