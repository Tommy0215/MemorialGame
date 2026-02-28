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

export type MuseumConfig = {
  position?: THREE.Vector3;
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
  wallColor?: number;
  accentColor?: number;
};

export type PaintingConfig = {
  url: string;
  position: THREE.Vector3;
  width?: number;
  height?: number;
  rotationY?: number;
};

export type WallSide = "left" | "right" | "front" | "back";

export type WallPaintingConfig = {
  url: string;
  museumPosition: THREE.Vector3;
  museumWidth: number;
  museumDepth: number;
  wall: WallSide;
  along?: number; // offset along the wall in world units
  centerHeight?: number; // height of the painting center above the floor
  width?: number;
  height?: number;
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

export function createMuseum(config: MuseumConfig = {}): THREE.Group {
  const {
    position = new THREE.Vector3(0, 0, 0),
    width = 24,
    depth = 32,
    height = 6,
    wallThickness = 0.5,
    wallColor = 0x888888,
    accentColor = 0x5555ff,
  } = config;

  const group = new THREE.Group();

  // Outer shell using existing building helper
  const shell = createBuilding({
    width,
    depth,
    height,
    wallThickness,
    wallColor,
    accentColor,
  });
  group.add(shell);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor });

  // Central gallery divider
  const centralWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, height - 1, depth - 4),
    wallMaterial
  );
  centralWall.position.set(0, (height - 1) / 2, 0);
  group.add(centralWall);
  addCollidable(centralWall);

  // Left short wall creating a side room
  const leftShortWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, height - 1, depth * 0.4),
    wallMaterial
  );
  leftShortWall.position.set(-width * 0.25, (height - 1) / 2, -depth * 0.3);
  group.add(leftShortWall);
  addCollidable(leftShortWall);

  // Right short wall creating another side room
  const rightShortWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, height - 1, depth * 0.4),
    wallMaterial
  );
  rightShortWall.position.set(width * 0.25, (height - 1) / 2, depth * 0.1);
  group.add(rightShortWall);
  addCollidable(rightShortWall);

  // A couple of pillars in the main hall
  const pillarGeometry = new THREE.BoxGeometry(0.7, height, 0.7);
  const pillar1 = new THREE.Mesh(pillarGeometry, wallMaterial);
  pillar1.position.set(-width * 0.15, height / 2, -depth * 0.1);
  group.add(pillar1);
  addCollidable(pillar1);

  const pillar2 = new THREE.Mesh(pillarGeometry, wallMaterial);
  pillar2.position.set(width * 0.15, height / 2, -depth * 0.18);
  group.add(pillar2);
  addCollidable(pillar2);

  group.position.copy(position);
  return group;
}

export function createPainting(config: PaintingConfig): THREE.Mesh {
  const { url, position, width = 2, height = 1.5, rotationY = 0 } = config;

  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });

  const painting = new THREE.Mesh(geometry, material);
  painting.position.copy(position);
  painting.rotation.y = rotationY;

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    url,
    (texture) => {
      material.map = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {
      // If loading fails, keep the plain white material so it still renders.
    }
  );

  return painting;
}

export function createWallPainting(config: WallPaintingConfig): THREE.Mesh {
  const {
    url,
    museumPosition,
    museumWidth,
    museumDepth,
    wall,
    along = 0,
    centerHeight = 2.2,
    width = 3,
    height = 2,
  } = config;

  const epsilon = 0.26; // pull slightly off the wall to avoid z-fighting

  let x = museumPosition.x;
  let z = museumPosition.z;
  let rotationY = 0;

  switch (wall) {
    case "left":
      x = museumPosition.x - museumWidth / 2 + epsilon;
      z = museumPosition.z + along;
      rotationY = -Math.PI / 2;
      break;
    case "right":
      x = museumPosition.x + museumWidth / 2 - epsilon;
      z = museumPosition.z + along;
      rotationY = Math.PI / 2;
      break;
    case "front":
      z = museumPosition.z - museumDepth / 2 + epsilon;
      x = museumPosition.x + along;
      rotationY = 0;
      break;
    case "back":
      z = museumPosition.z + museumDepth / 2 - epsilon;
      x = museumPosition.x + along;
      rotationY = Math.PI;
      break;
  }

  const position = new THREE.Vector3(x, museumPosition.y + centerHeight, z);

  return createPainting({
    url,
    position,
    width,
    height,
    rotationY,
  });
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

