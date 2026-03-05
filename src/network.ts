import * as THREE from "three";

export interface NetworkClient {
  update(localObject: THREE.Object3D, extra: { isRunning: boolean; isSneaking: boolean }): void;
  /**
   * Inform the server that the local player has created a red block at the
   * given position.  The server will broadcast to other clients, which will
   * also add the block to their scene.
   */
  spawnBlock(position: THREE.Vector3): void;
}

type RemotePlayer = {
  object: THREE.Object3D;
};

// derive the websocket endpoint from whatever host the
// page was served from.  this avoids hard‑coding an IP and
// works whether you access the site by IP address, domain or
// localhost.  it also respects secure (wss) vs unsecure (ws)
// protocols.
// always try to connect to the game server port 8080.  During development
// the page may be served by Vite on 3000, so relying on
// `window.location.host` would attempt to talk back to 3000 where no
// WebSocket server is listening.  Using a fixed port makes multiplayer work
// regardless of whether the client is served from the same process.
const WS_URL = (() => {
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = 8080; // must match server.js
    return `${proto}//${host}:${port}`;
  }
  return "ws://localhost:8080";
})();

function generateClientId(): string {
  return `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

export function createNetworkClient(scene: THREE.Scene): NetworkClient {
  const clientId = generateClientId();
  const remotePlayers = new Map<string, RemotePlayer>();

  // keep track of blocks currently in the scene so they can be removed later
  const blocks = new Map<string, THREE.Mesh>();

  // texture loader for skins
  const textureLoader = new THREE.TextureLoader();
  const skinTextureCache = new Map<string, THREE.Texture>();
  const pendingTextureLoads = new Map<string, Promise<THREE.Texture>>();

  // Load or return cached skin texture
  function loadSkinTexture(skinName: string): Promise<THREE.Texture> {
    console.log(`[Network] Loading skin texture: ${skinName}`);
    
    if (skinTextureCache.has(skinName)) {
      console.log(`[Network] Using cached skin texture: ${skinName}`);
      return Promise.resolve(skinTextureCache.get(skinName)!);
    }
    if (pendingTextureLoads.has(skinName)) {
      console.log(`[Network] Waiting for pending skin texture: ${skinName}`);
      return pendingTextureLoads.get(skinName)!;
    }

    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      const path = `/images/skins/${skinName}.png`;
      console.log(`[Network] Fetching skin from: ${path}`);
      
      textureLoader.load(
        path,
        (tex) => {
          console.log(`[Network] Successfully loaded skin texture: ${skinName}`);
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          skinTextureCache.set(skinName, tex);
          resolve(tex);
        },
        undefined,
        (error) => {
          console.error(`[Network] Failed to load skin texture: ${skinName}`, error);
          reject(error);
        }
      );
    });

    pendingTextureLoads.set(skinName, promise);
    promise.finally(() => {
      pendingTextureLoads.delete(skinName);
    });

    return promise;
  }

  let socket: WebSocket | null = null;
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    // If WebSocket construction fails (e.g. unsupported), just no-op networking.
    socket = null;
  }

  if (socket) {
    socket.addEventListener("open", () => {
      console.log("[Network] WebSocket connected to", WS_URL);
    });

    socket.addEventListener("error", (event) => {
      console.error("[Network] WebSocket error:", event);
    });
    socket.addEventListener("close", (event) => {
      console.log("[Network] WebSocket closed", event);
    });

    socket.addEventListener("close", () => {
      console.log("[Network] WebSocket closed");
    });

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!data) return;

      switch (data.type) {
        case "state": {
          if (data.id === clientId) return;
          const { id, position, rotationY, isRunning, isSneaking, skin } = data;
          if (!position) return;

          console.log("[Network] Received remote player update:", id, position, "skin:", skin);

          let remote = remotePlayers.get(id);
          if (!remote) {
            console.log("[Network] Creating new remote player with skin:", skin);
            const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);

            // Create material for front face (skin)
            let frontMaterial = new THREE.MeshStandardMaterial({ color: 0x00aaff });

            // Load skin texture asynchronously and update material when ready
            if (skin) {
              console.log("[Network] Attempting to load skin:", skin);
              loadSkinTexture(skin).then(() => {
                // After loading, update the material
                const cached = skinTextureCache.get(skin);
                if (cached) {
                  frontMaterial.map = cached;
                  frontMaterial.needsUpdate = true;
                }
              }).catch(err => {
                console.error(`[Network] Failed to apply skin texture: ${skin}`, err);
              });
            }

            // create materials: textured for front, solid colors for other sides
            const materials = [
              new THREE.MeshStandardMaterial({ color: 0x00aaff }), // right
              new THREE.MeshStandardMaterial({ color: 0x00aaff }), // left
              new THREE.MeshStandardMaterial({ color: 0x0088dd }), // top
              new THREE.MeshStandardMaterial({ color: 0x006699 }), // bottom
              frontMaterial, // front
              new THREE.MeshStandardMaterial({ color: 0x00aaff }), // back
            ];

            const mesh = new THREE.Mesh(geometry, materials);
            mesh.castShadow = true;
            scene.add(mesh);
            remote = { object: mesh };
            remotePlayers.set(id, remote);
          }

          const obj = remote.object;
          obj.position.set(position.x, position.y, position.z);
          obj.rotation.y = rotationY ?? obj.rotation.y;

          // update color on non-textured faces based on state
          const mesh = obj as THREE.Mesh;
          const mats = mesh.material as THREE.Material[];
          if (Array.isArray(mats)) {
            const color = isSneaking ? 0xffaa00 : isRunning ? 0x00ff88 : 0x00aaff;
            for (let i = 0; i < mats.length; i++) {
              if (i !== 4 && mats[i] instanceof THREE.MeshStandardMaterial) {
                (mats[i] as THREE.MeshStandardMaterial).color.setHex(color);
              }
            }
          }
          break;
        }

        case "spawnBlock": {
          // don't process the event if it originated from this client; our
          // local key‑press handler has already shown us a block.
          if (data.clientId === clientId) break;

          const { position, blockId } = data;
          if (position && blockId) {
            const geom = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            const cube = new THREE.Mesh(geom, mat);
            cube.position.set(position.x, position.y, position.z);
            scene.add(cube);
            blocks.set(blockId, cube);

            // mirror the server's timeout in case the despawn message is lost
            setTimeout(() => {
              const m = blocks.get(blockId);
              if (m) {
                scene.remove(m);
                blocks.delete(blockId);
              }
            }, 5000);
          }
          break;
        }

        case "despawnBlock": {
          const { blockId } = data;
          if (blockId) {
            const m = blocks.get(blockId);
            if (m) {
              scene.remove(m);
              blocks.delete(blockId);
            }
          }
          break;
        }
      }
    });
  }

  const lastPosition = new THREE.Vector3();
  let lastRotationY = 0;
  let lastSent = 0;
  const HEARTBEAT_INTERVAL = 1000; // send at least once per second

  return {
    update(localObject: THREE.Object3D, extra: { isRunning: boolean; isSneaking: boolean }) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const now = performance.now();
      const minIntervalMs = 1000 / 15; // send at most ~15 times per second

      const pos = localObject.position;
      const rotY = localObject.rotation.y;

      const movedEnough = lastPosition.distanceToSquared(pos) > 0.0001;
      const rotatedEnough = Math.abs(rotY - lastRotationY) > 0.001;
      const heartbeatDue = now - lastSent > HEARTBEAT_INTERVAL;

      // send if: moved/rotated (and enough time passed) OR heartbeat is due
      if (!heartbeatDue && !movedEnough && !rotatedEnough && now - lastSent < minIntervalMs) {
        return;
      }

      lastSent = now;
      lastPosition.copy(pos);
      lastRotationY = rotY;

      const payload = {
        type: "state",
        id: clientId,
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotationY: rotY,
        isRunning: extra.isRunning,
        isSneaking: extra.isSneaking,
      };

      try {
        socket.send(JSON.stringify(payload));
        console.log("[Network] Sent update:", payload.position);
      } catch (e) {
        console.error("[Network] Failed to send:", e);
      }
    },

    spawnBlock(position: THREE.Vector3) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const payload = {
        type: "spawnBlock",
        clientId,
        position: { x: position.x, y: position.y, z: position.z },
      };
      try {
        socket.send(JSON.stringify(payload));
        console.log("[Network] Sent spawnBlock:", payload.position);
      } catch (e) {
        console.error("[Network] Failed to send spawnBlock:", e);
      }
    },

  };
}

