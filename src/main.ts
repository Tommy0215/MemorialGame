import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { createFloor, createMuseum, createWallPainting } from "./environment";
import { resolveCollisions } from "./collision";
import { createNetworkClient, type NetworkClient } from "./network";

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: PointerLockControls;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

let isRunning = false;
let isSneaking = false;

let networkClient: NetworkClient | null = null;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

let canJump = true;
let verticalVelocity = 0;
const GRAVITY = 30;
const JUMP_SPEED = 10;

const BASE_SPEED = 40.0;
const RUN_MULTIPLIER = 1.7;
const SNEAK_MULTIPLIER = 0.4;

const STAND_HEIGHT = 1.6;
const SNEAK_HEIGHT = 1.2;

init();
animate();

function init(): void {
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
  document.body.appendChild(renderer.domElement);

  setupLights();
  setupWorld();

  controls = new PointerLockControls(camera, document.body);
  const controlsObject = getControlsObject();
  scene.add(controlsObject);
  controlsObject.position.set(0, 1.6, -30);
  controlsObject.lookAt(new THREE.Vector3(0, 1.6, -41));

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
      case "Space":
        if (canJump) {
          verticalVelocity = JUMP_SPEED;
          canJump = false;
        }
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
  };

  const museum = createMuseum(museumConfig);
  scene.add(museum);

  const museumCenter = museumConfig.position;

  // Example paintings – replace `url` with your own image paths.
  const leftWallPainting = createWallPainting({
    url: "/images/paint.png",
    museumPosition: museumCenter,
    museumWidth: museumConfig.width,
    museumDepth: museumConfig.depth,
    wall: "left",
    along: -6, // slide along the wall (negative is towards front, positive towards back)
    centerHeight: 2.2,
    width: 3,
    height: 2,
  });
  scene.add(leftWallPainting);

  const rightWallPainting = createWallPainting({
    url: "/images/paint.png",
    museumPosition: museumCenter,
    museumWidth: museumConfig.width,
    museumDepth: museumConfig.depth,
    wall: "right",
    along: -10,
    centerHeight: 2.2,
    width: 2.5,
    height: 2,
  });
  scene.add(rightWallPainting);
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