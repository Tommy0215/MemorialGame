import * as THREE from "three";
import { addCollidable } from "./collision";

export type FloorConfig = {
  size?: number;
  textureRepeat?: number;
};

export type BuildingConfig = {
  position?: THREE.Vector3;
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
  wallColor?: number;
  accentColor?: number;
};

export function createFloor(config: FloorConfig = {}): THREE.Mesh {
  const size = config.size ?? 100;
  const textureRepeat = config.textureRepeat ?? 20;

  const geometry = new THREE.PlaneGeometry(size, size);
  const texture = createCheckerTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(textureRepeat, textureRepeat);

  const material = new THREE.MeshStandardMaterial({ map: texture });
  const floor = new THREE.Mesh(geometry, material);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  return floor;
}

export function createBuilding(config: BuildingConfig = {}): THREE.Group {
  const {
    position = new THREE.Vector3(0, 0, 0),
    width = 12,
    depth = 12,
    height = 6,
    wallThickness = 0.5,
    wallColor = 0x888888,
    accentColor = 0x5555ff,
  } = config;

  const group = new THREE.Group();

  const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accentColor });

  const frontLeftWall = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.35, height, wallThickness),
    wallMaterial
  );
  frontLeftWall.position.set(-width * 0.325, height / 2, -depth / 2);
  group.add(frontLeftWall);
  addCollidable(frontLeftWall);

  const frontRightWall = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.35, height, wallThickness),
    wallMaterial
  );
  frontRightWall.position.set(width * 0.325, height / 2, -depth / 2);
  group.add(frontRightWall);
  addCollidable(frontRightWall);

  const frontTop = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.3, height * 0.4, wallThickness),
    wallMaterial
  );
  frontTop.position.set(0, height * 0.8, -depth / 2);
  group.add(frontTop);
  addCollidable(frontTop);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, wallThickness),
    wallMaterial
  );
  backWall.position.set(0, height / 2, depth / 2);
  group.add(backWall);
  addCollidable(backWall);

  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, height, depth),
    wallMaterial
  );
  leftWall.position.set(-width / 2, height / 2, 0);
  group.add(leftWall);
  addCollidable(leftWall);

  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, height, depth),
    wallMaterial
  );
  rightWall.position.set(width / 2, height / 2, 0);
  group.add(rightWall);
  addCollidable(rightWall);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width, wallThickness, depth),
    wallMaterial
  );
  roof.position.set(0, height + wallThickness / 2, 0);
  group.add(roof);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(width, height * 0.15, wallThickness * 1.2),
    accentMaterial
  );
  stripe.position.set(0, height * 0.55, -depth / 2 - 0.01);
  group.add(stripe);

  group.position.copy(position);
  return group;
}

function createCheckerTexture(): THREE.CanvasTexture {
  const size = 128;
  const segments = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get 2D context");
  }

  const colors = ["#3b3b3b", "#2a2a2a"];
  const cellSize = size / segments;

  for (let y = 0; y < segments; y++) {
    for (let x = 0; x < segments; x++) {
      const index = (x + y) % 2;
      context.fillStyle = colors[index];
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

