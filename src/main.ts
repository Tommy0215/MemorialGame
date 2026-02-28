import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { createBuilding, createFloor } from "./environment";
import { resolveCollisions } from "./collision";

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: PointerLockControls;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

let canJump = true;
let verticalVelocity = 0;
const GRAVITY = 30;
const JUMP_SPEED = 10;

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
  controlsObject.position.y = 1.6;

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

  const mainBuilding = createBuilding({
    position: new THREE.Vector3(0, 0, -20),
    width: 12,
    depth: 12,
    height: 6,
    wallThickness: 0.5,
    wallColor: 0x888888,
    accentColor: 0x5555ff,
  });
  scene.add(mainBuilding);
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

  const speed = 40.0;

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

    const groundHeight = 1.6;
    if (controlsObject.position.y < groundHeight) {
      controlsObject.position.y = groundHeight;
      verticalVelocity = 0;
      canJump = true;
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