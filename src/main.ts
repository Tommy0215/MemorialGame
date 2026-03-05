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

let networkClient: NetworkClient | null = null;

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

// create a simple red cube and add to scene at a given position
function createRedBlock(position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const block = new THREE.Mesh(geometry, material);
  block.position.copy(position);
  scene.add(block);
  return block;
}

const BASE_SPEED = 40.0;
const RUN_MULTIPLIER = 1.7;
const SNEAK_MULTIPLIER = 0.4;

const STAND_HEIGHT = 1.6;
const SNEAK_HEIGHT = 1.2;

// Start initialization (async)
init();
animate();

async function loadSelectedMap(mapPath: string): Promise<void> {
  currentMapPath = mapPath;
  const spawn = await loadMapFromFile(scene, currentMapPath);
  const controlsObject = getControlsObject();
  controlsObject.position.copy(spawn.position);
  controlsObject.lookAt(spawn.lookAt);
  velocity.set(0, 0, 0);
  verticalVelocity = 0;
  canJump = true;
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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.tabIndex = 0;
  document.body.appendChild(renderer.domElement);

  setupLights();

  controls = new PointerLockControls(camera, document.body);
  const controlsObject = getControlsObject();
  scene.add(controlsObject);

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
        isRunning = true;
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
        loadSelectedMap(currentMapPath)
          .then(() => {
            console.log("[Dev] Map reloaded successfully");
          })
          .catch((err) => {
            console.error("[Dev] Failed to reload map:", err);
          });
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
        isRunning = false;
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

    resolveCollisions(controlsObject.position);

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
      coordsElement.innerHTML = `
        X: ${pos.x.toFixed(2)}<br>
        Y: ${pos.y.toFixed(2)}<br>
        Z: ${pos.z.toFixed(2)}
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