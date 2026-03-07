import * as THREE from "three";
import { addCollidable } from "./collision";
import type { ColorInput } from "./mapLoader";

export type FloorConfig = {
  size?: number;
  textureRepeat?: number;
};

const CHECKER_CELLS_PER_TILE = 8;
const CHECKER_WORLD_CELL_SIZE = 1;

type EntranceSide =
  | "north"
  | "south"
  | "east"
  | "west"
  | "front"
  | "back"
  | "left"
  | "right";

export type InteriorWall = {
  /**
   * Optional name/label for identification and documentation
   */
  name?: string;
  /**
   * Position relative to the building center
   */
  position: { x: number; y: number; z: number };
  /**
   * Width (X dimension) of the wall or pillar
   */
  width: number;
  /**
   * Height (Y dimension) of the wall or pillar
   */
  height: number;
  /**
   * Depth (Z dimension) of the wall or pillar
   */
  depth: number;
};

export type BuildingConfig = {
  /**
   * Optional name/label for identification and documentation
   */
  name?: string;
  position?: THREE.Vector3;
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
  wallColor?: ColorInput;
  accentColor?: ColorInput;
  /**
   * Set to `false` to build a shell without any walls. Useful for
   * creating open spaces or for debugging. Defaults to `true` (walls
   * are included).
   */
  walls?: boolean;
  /**
   * Width of the entrance as a fraction of the building width.
   * Defaults to 0.3 (30% of building width).
   */
  entranceWidth?: number;
  /**
   * Height of the entrance as a fraction of the building height.
   * Defaults to 0.6 (60% of building height, with top section above).
   */
  entranceHeight?: number;
  /**
   * Horizontal offset of the entrance from center, in world units.
   * Defaults to 0 (centered).
   */
  entranceOffset?: number;
  /**
   * Which wall should have the entrance.
   * Preferred options: "north" (negative Z), "south" (positive Z), "west" (negative X), "east" (positive X).
   * Legacy aliases also supported: "front"="north", "back"="south", "left"="west", "right"="east".
   * Defaults to "north".
   */
  entranceSide?: EntranceSide;
  /**
   * Custom interior walls and pillars. Each wall is positioned relative to the building center.
   */
  interiorWalls?: InteriorWall[];
};

export type MuseumConfig = {
  /**
   * Optional name/label for identification and documentation
   */
  name?: string;
  position?: THREE.Vector3;
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
  wallColor?: ColorInput;
  accentColor?: ColorInput;
  /**
   * If set to `false`, only the outer shell is built.  The central
   * divider, side rooms, and pillars are omitted.  Defaults to `true`.
   * Note: This is ignored if `interiorWalls` is provided.
   */
  includeInteriorWalls?: boolean;
  /**
   * Custom interior walls and pillars. Each wall is positioned relative to the building center.
   * If provided, this overrides `includeInteriorWalls`.
   */
  interiorWalls?: InteriorWall[];
  /**
   * Width of the entrance as a fraction of the building width.
   * Defaults to 0.3 (30% of building width).
   */
  entranceWidth?: number;
  /**
   * Height of the entrance as a fraction of the building height.
   * Defaults to 0.6 (60% of building height, with top section above).
   */
  entranceHeight?: number;
  /**
   * Horizontal offset of the entrance from center, in world units.
   * Defaults to 0 (centered).
   */
  entranceOffset?: number;
  /**
   * Which wall should have the entrance.
   * Preferred options: "north" (negative Z), "south" (positive Z), "west" (negative X), "east" (positive X).
   * Legacy aliases also supported: "front"="north", "back"="south", "left"="west", "right"="east".
   * Defaults to "north".
   */
  entranceSide?: EntranceSide;
};

export type PaintingConfig = {
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

  const geometry = new THREE.PlaneGeometry(size, size);
  const texture = createCheckerTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  // Keep each checker square exactly 1x1 world units, aligned to floor coordinates.
  const repeatPerAxis = size / (CHECKER_CELLS_PER_TILE * CHECKER_WORLD_CELL_SIZE);
  texture.repeat.set(repeatPerAxis, repeatPerAxis);

  const material = new THREE.MeshStandardMaterial({ map: texture });
  const floor = new THREE.Mesh(geometry, material);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  return floor;
}

/**
 * Convert ColorInput to decimal number
 * Accepts hex string ("#FF0000"), RGB object { r, g, b }, or decimal number
 */
function resolveColor(color: ColorInput): number {
  if (typeof color === "number") {
    return color;
  }
  if (typeof color === "string") {
    // Parse hex string like "#FF0000"
    const hex = color.replace("#", "");
    return parseInt(hex, 16);
  }
  return (color.r << 16) | (color.g << 8) | color.b;
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
    walls = true,
    entranceWidth = 0.3,
    entranceHeight = 0.6,
    entranceOffset = 0,
    entranceSide = "north",
    interiorWalls = [],
  } = config;

  const normalizedEntranceSide =
    entranceSide === "front"
      ? "north"
      : entranceSide === "back"
        ? "south"
        : entranceSide === "left"
          ? "west"
          : entranceSide === "right"
            ? "east"
            : entranceSide;

  const group = new THREE.Group();

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: resolveColor(wallColor),
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: resolveColor(accentColor),
  });

  // Helper function to create a wall with an entrance
  const createWallWithEntrance = (
    wallWidth: number,
    wallDepth: number,
    zPos: number,
    xPos: number,
    isHorizontalWall: boolean
  ) => {
    // For horizontal walls (front/back), entrance runs along X axis
    // For vertical walls (left/right), entrance runs along Z axis
    const effectiveWidth = isHorizontalWall ? wallWidth : wallDepth;
    const entranceWidthActual = effectiveWidth * entranceWidth;
    const entranceHalfWidth = entranceWidthActual / 2;
    const entranceCenter = entranceOffset;
    
    const entranceLeft = entranceCenter - entranceHalfWidth;
    const entranceRight = entranceCenter + entranceHalfWidth;
    
    // Left segment: from left edge to left entrance edge
    const leftSegmentSize = effectiveWidth / 2 + entranceLeft;
    if (leftSegmentSize > 0) {
      const geom = isHorizontalWall
        ? new THREE.BoxGeometry(leftSegmentSize, height, wallThickness)
        : new THREE.BoxGeometry(wallThickness, height, leftSegmentSize);
      const mesh = new THREE.Mesh(geom, wallMaterial);
      
      if (isHorizontalWall) {
        mesh.position.set(-effectiveWidth / 2 + leftSegmentSize / 2 + xPos, height / 2, zPos);
      } else {
        mesh.position.set(xPos, height / 2, -effectiveWidth / 2 + leftSegmentSize / 2 + zPos);
      }
      group.add(mesh);
      addCollidable(mesh);
    }
    
    // Right segment: from right entrance edge to right edge
    const rightSegmentSize = effectiveWidth / 2 - entranceRight;
    if (rightSegmentSize > 0) {
      const geom = isHorizontalWall
        ? new THREE.BoxGeometry(rightSegmentSize, height, wallThickness)
        : new THREE.BoxGeometry(wallThickness, height, rightSegmentSize);
      const mesh = new THREE.Mesh(geom, wallMaterial);
      
      if (isHorizontalWall) {
        mesh.position.set(effectiveWidth / 2 - rightSegmentSize / 2 + xPos, height / 2, zPos);
      } else {
        mesh.position.set(xPos, height / 2, effectiveWidth / 2 - rightSegmentSize / 2 + zPos);
      }
      group.add(mesh);
      addCollidable(mesh);
    }

    // Top section above entrance
    const topSectionHeight = height * (1 - entranceHeight);
    if (topSectionHeight > 0) {
      const geom = isHorizontalWall
        ? new THREE.BoxGeometry(entranceWidthActual, topSectionHeight, wallThickness)
        : new THREE.BoxGeometry(wallThickness, topSectionHeight, entranceWidthActual);
      const mesh = new THREE.Mesh(geom, wallMaterial);
      
      if (isHorizontalWall) {
        mesh.position.set(entranceCenter + xPos, height - topSectionHeight / 2, zPos);
      } else {
        mesh.position.set(xPos, height - topSectionHeight / 2, entranceCenter + zPos);
      }
      group.add(mesh);
      addCollidable(mesh);
    }
  };

  // Helper function to create a solid wall
  const createSolidWall = (
    wallWidth: number,
    wallDepth: number,
    zPos: number,
    xPos: number
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(wallWidth, height, wallDepth),
      wallMaterial
    );
    mesh.position.set(xPos, height / 2, zPos);
    group.add(mesh);
    addCollidable(mesh);
  };

  // outer shell walls (conditional)
  if (walls) {
    // Front wall (negative Z)
    if (normalizedEntranceSide === "north") {
      createWallWithEntrance(width, wallThickness, -depth / 2, 0, true);
    } else {
      createSolidWall(width, wallThickness, -depth / 2, 0);
    }

    // Back wall (positive Z)
    if (normalizedEntranceSide === "south") {
      createWallWithEntrance(width, wallThickness, depth / 2, 0, true);
    } else {
      createSolidWall(width, wallThickness, depth / 2, 0);
    }

    // Left wall (negative X)
    if (normalizedEntranceSide === "west") {
      createWallWithEntrance(wallThickness, depth, 0, -width / 2, false);
    } else {
      createSolidWall(wallThickness, depth, 0, -width / 2);
    }

    // Right wall (positive X)
    if (normalizedEntranceSide === "east") {
      createWallWithEntrance(wallThickness, depth, 0, width / 2, false);
    } else {
      createSolidWall(wallThickness, depth, 0, width / 2);
    }
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width, wallThickness, depth),
    wallMaterial
  );
  roof.position.set(0, height + wallThickness / 2, 0);
  group.add(roof);

  // Decorative accent stripe on the entrance wall
  let stripeGeometry: THREE.BoxGeometry;
  let stripePosition: THREE.Vector3;
  
  switch (normalizedEntranceSide) {
    case "north":
      stripeGeometry = new THREE.BoxGeometry(width, height * 0.15, wallThickness * 1.2);
      stripePosition = new THREE.Vector3(0, height * 0.55, -depth / 2 - 0.01);
      break;
    case "south":
      stripeGeometry = new THREE.BoxGeometry(width, height * 0.15, wallThickness * 1.2);
      stripePosition = new THREE.Vector3(0, height * 0.55, depth / 2 + 0.01);
      break;
    case "west":
      stripeGeometry = new THREE.BoxGeometry(wallThickness * 1.2, height * 0.15, depth);
      stripePosition = new THREE.Vector3(-width / 2 - 0.01, height * 0.55, 0);
      break;
    case "east":
      stripeGeometry = new THREE.BoxGeometry(wallThickness * 1.2, height * 0.15, depth);
      stripePosition = new THREE.Vector3(width / 2 + 0.01, height * 0.55, 0);
      break;
  }
  
  const stripe = new THREE.Mesh(stripeGeometry, accentMaterial);
  stripe.position.copy(stripePosition);
  group.add(stripe);

  // Add custom interior walls
  if (interiorWalls && interiorWalls.length > 0) {
    for (const wall of interiorWalls) {
      const interiorWallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall.width, wall.height, wall.depth),
        wallMaterial
      );
      interiorWallMesh.position.set(wall.position.x, wall.position.y, wall.position.z);
      group.add(interiorWallMesh);
      addCollidable(interiorWallMesh);
    }
  }

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
    includeInteriorWalls = true,
    interiorWalls,
    entranceWidth = 0.3,
    entranceHeight = 0.6,
    entranceOffset = 0,
    entranceSide = "north",
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
    entranceWidth,
    entranceHeight,
    entranceOffset,
    entranceSide,
  });
  group.add(shell);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: resolveColor(wallColor),
  });

  // Interior structure
  if (interiorWalls && interiorWalls.length > 0) {
    // Use custom interior walls if provided
    for (const wall of interiorWalls) {
      const interiorWallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall.width, wall.height, wall.depth),
        wallMaterial
      );
      interiorWallMesh.position.set(wall.position.x, wall.position.y, wall.position.z);
      group.add(interiorWallMesh);
      addCollidable(interiorWallMesh);
    }
  } else if (includeInteriorWalls) {
    // Use default interior layout if no custom walls provided
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
  }

  group.position.copy(position);
  return group;
}

export function createPainting(config: PaintingConfig): THREE.Mesh {
  const {
    url,
    position,
    width = 2,
    height = 1.5,
    fit = "contain",
    unlit = true,
    frame = true,
    frameFitContent = true,
    frameThickness = 0.08,
    frameColor = 0x8B4513,
    rotationY,
    facing,
  } = config;

  // Convert facing direction to rotationY if specified
  let finalRotationY = rotationY ?? 0;
  if (facing) {
    switch (facing) {
      case "north":
        finalRotationY = 0;
        break;
      case "east":
        finalRotationY = Math.PI / 2;
        break;
      case "south":
        finalRotationY = Math.PI;
        break;
      case "west":
        finalRotationY = -Math.PI / 2;
        break;
    }
  }

  const geometry = new THREE.PlaneGeometry(width, height);
  const material = unlit
    ? new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        alphaTest: 0,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        alphaTest: 0,
      });

  const painting = new THREE.Mesh(geometry, material);
  painting.position.copy(position);
  painting.rotation.y = finalRotationY;
  painting.userData.isPainting = true;
  painting.userData.paintingConfig = config;

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    url,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.premultiplyAlpha = false;
      material.map = texture;
      material.transparent = false;
      material.opacity = 1;
      material.needsUpdate = true;

      const image = texture.image as { width?: number; height?: number } | undefined;
      const imageWidth = image?.width ?? 0;
      const imageHeight = image?.height ?? 0;

      if (imageWidth > 0 && imageHeight > 0) {
        const imageAspect = imageWidth / imageHeight;
        const targetAspect = width / height;

        if (fit === "cover") {
          texture.repeat.set(1, 1);
          texture.offset.set(0, 0);

          // Keep frame size and crop texture to fill while preserving image aspect ratio.
          if (imageAspect > targetAspect) {
            const repeatX = targetAspect / imageAspect;
            texture.repeat.x = repeatX;
            texture.offset.x = (1 - repeatX) / 2;
          } else if (imageAspect < targetAspect) {
            const repeatY = imageAspect / targetAspect;
            texture.repeat.y = repeatY;
            texture.offset.y = (1 - repeatY) / 2;
          }

          texture.needsUpdate = true;
        } else {
          texture.repeat.set(1, 1);
          texture.offset.set(0, 0);

          let fittedWidth = width;
          let fittedHeight = height;

          // Fit image inside configured width/height while preserving original aspect ratio.
          if (imageAspect > targetAspect) {
            fittedHeight = width / imageAspect;
          } else {
            fittedWidth = height * imageAspect;
          }

          painting.geometry.dispose();
          painting.geometry = new THREE.PlaneGeometry(fittedWidth, fittedHeight);

          // Update frame to fit actual content dimensions if frameFitContent is enabled
          if (frame && frameFitContent) {
            createOrUpdateFrame(fittedWidth, fittedHeight);
          }
        }
      }
    },
    undefined,
    () => {
      // If loading fails, keep the plain white material so it still renders.
    }
  );

  // Helper function to create/update frame pieces
  const createOrUpdateFrame = (frameWidth: number, frameHeight: number) => {
    const frameDepth = 0.05;
    const frameOffset = 0.001;
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: resolveColor(frameColor),
    });

    // Remove existing frames if they exist
    const existingFrames = painting.children.filter((c) => c.userData.isFrame);
    existingFrames.forEach((f) => painting.remove(f));

    // Top frame
    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameWidth + frameThickness * 2, frameThickness, frameDepth),
      frameMaterial
    );
    topFrame.position.set(0, frameHeight / 2 + frameThickness / 2, -frameOffset);
    topFrame.userData.isFrame = true;
    painting.add(topFrame);

    // Bottom frame
    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameWidth + frameThickness * 2, frameThickness, frameDepth),
      frameMaterial
    );
    bottomFrame.position.set(0, -frameHeight / 2 - frameThickness / 2, -frameOffset);
    bottomFrame.userData.isFrame = true;
    painting.add(bottomFrame);

    // Left frame
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth),
      frameMaterial
    );
    leftFrame.position.set(-frameWidth / 2 - frameThickness / 2, 0, -frameOffset);
    leftFrame.userData.isFrame = true;
    painting.add(leftFrame);

    // Right frame
    const rightFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth),
      frameMaterial
    );
    rightFrame.position.set(frameWidth / 2 + frameThickness / 2, 0, -frameOffset);
    rightFrame.userData.isFrame = true;
    painting.add(rightFrame);
  };

  // Add initial frame if enabled
  if (frame) {
    createOrUpdateFrame(width, height);
  }

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


// -----------------------------------------------------------------------------
// Utilities for painting placement
// -----------------------------------------------------------------------------

export type Range = { start: number; end: number };

export type WallPaintingFillConfig = {
  museumPosition: THREE.Vector3;
  museumWidth: number;
  museumDepth: number;
  url: string;               // image used for every painting (can be extended later)
  wall: WallSide;            // which wall to fill
  paintingWidth?: number;    // defaults to 2
  paintingHeight?: number;   // defaults to 1.5
  centerHeight?: number;     // defaults to 2.2
  padding?: number;          // space between paintings, default = 0.2 * width
  /**
   * Optional ranges along the wall to skip; units are world-space units
   * measured from wall center (negative to positive).  Any painting whose
   * center lies within a range will not be created.  Useful for doorways or
   * other openings.
   */
  excludeAlongRanges?: Range[];
};

export type MuseumWallPaintingsConfig = Omit<WallPaintingFillConfig, "wall" | "excludeAlongRanges"> & {
  /**
   * If provided, only these walls are filled; otherwise all four.
   */
  walls?: WallSide[];
  /**
   * Per-wall exclusion ranges; the key is the wall name.  Each array is
   * forwarded to the corresponding call to `fillWallWithPaintings`.
   */
  excludeAlongRanges?: Partial<Record<WallSide, Range[]>>;
};

/**
 * Returns an array of paintings evenly spaced along a single wall.
 *
 * The `along` offset is calculated so that the series of paintings is
 * centered on the wall and separated by the provided padding.  The helper
 * currently uses a single URL (repeating it); the signature could easily be
 * extended to take an array of urls for variety.
 */
export function fillWallWithPaintings(cfg: WallPaintingFillConfig): THREE.Mesh[] {
  const {
    museumPosition,
    museumWidth,
    museumDepth,
    wall,
    url,
    paintingWidth = 2,
    paintingHeight = 1.5,
    centerHeight = 2.2,
    padding,
  } = cfg;

  const span = wall === "left" || wall === "right" ? museumDepth : museumWidth;
  const gap = padding ?? paintingWidth * 0.2;
  const step = paintingWidth + gap;
  if (step <= 0) return [];

  const count = Math.floor(span / step);
  if (count <= 0) return [];

  const start = -span / 2 + step / 2;
  const paintings: THREE.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const along = start + i * step;

    // skip if this position lies within any exclusion range
    if (cfg.excludeAlongRanges) {
      let shouldSkip = false;
      for (const r of cfg.excludeAlongRanges) {
        if (along >= r.start && along <= r.end) {
          shouldSkip = true;
          break;
        }
      }
      if (shouldSkip) continue;
    }

    paintings.push(
      createWallPainting({
        url,
        museumPosition,
        museumWidth,
        museumDepth,
        wall,
        along,
        centerHeight,
        width: paintingWidth,
        height: paintingHeight,
      })
    );
  }

  return paintings;
}

/**
 * Convenience wrapper that populates multiple walls of a museum.  By default
 * all four faces are filled; pass `walls` to restrict the set.
 */
export function fillMuseumWallsWithPaintings(cfg: MuseumWallPaintingsConfig): THREE.Mesh[] {
  const { walls = ["left", "right", "front", "back"], excludeAlongRanges, ...rest } = cfg;
  let result: THREE.Mesh[] = [];
  walls.forEach((w) => {
    result = result.concat(
      fillWallWithPaintings({
        ...rest,
        wall: w,
        excludeAlongRanges: excludeAlongRanges?.[w],
      })
    );
  });
  return result;
}


function createCheckerTexture(): THREE.CanvasTexture {
  const size = 128;
  const segments = CHECKER_CELLS_PER_TILE;
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

