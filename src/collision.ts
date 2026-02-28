import * as THREE from "three";

const collidableMeshes: THREE.Object3D[] = [];

export function addCollidable(object: THREE.Object3D): void {
  collidableMeshes.push(object);
}

export function resolveCollisions(playerPosition: THREE.Vector3): void {
  const playerRadius = 0.5;
  const playerHeight = 1.7;

  const playerBox = new THREE.Box3(
    new THREE.Vector3(
      playerPosition.x - playerRadius,
      playerPosition.y - playerHeight,
      playerPosition.z - playerRadius
    ),
    new THREE.Vector3(
      playerPosition.x + playerRadius,
      playerPosition.y,
      playerPosition.z + playerRadius
    )
  );

  for (const object of collidableMeshes) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.intersectsBox(playerBox)) {
      const overlapX1 = box.max.x - playerBox.min.x;
      const overlapX2 = box.min.x - playerBox.max.x;
      const overlapZ1 = box.max.z - playerBox.min.z;
      const overlapZ2 = box.min.z - playerBox.max.z;

      const resolveX = Math.abs(overlapX1) < Math.abs(overlapX2) ? overlapX1 : overlapX2;
      const resolveZ = Math.abs(overlapZ1) < Math.abs(overlapZ2) ? overlapZ1 : overlapZ2;

      if (Math.abs(resolveX) < Math.abs(resolveZ)) {
        playerPosition.x += resolveX;
      } else {
        playerPosition.z += resolveZ;
      }

      playerBox.min.set(
        playerPosition.x - playerRadius,
        playerPosition.y - playerHeight,
        playerPosition.z - playerRadius
      );
      playerBox.max.set(
        playerPosition.x + playerRadius,
        playerPosition.y,
        playerPosition.z + playerRadius
      );
    }
  }
}

