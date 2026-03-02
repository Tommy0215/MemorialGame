import * as THREE from "three";

export interface NetworkClient {
  update(localObject: THREE.Object3D, extra: { isRunning: boolean; isSneaking: boolean }): void;
}

type RemotePlayer = {
  object: THREE.Object3D;
};

// derive the websocket endpoint from whatever host the
// page was served from.  this avoids hard‑coding an IP and
// works whether you access the site by IP address, domain or
// localhost.  it also respects secure (wss) vs unsecure (ws)
// protocols.
const WS_URL = (() => {
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`; // includes port if any
  }
  // fallback for non-browser environments (shouldn't really
  // happen, but keeps the type system happy).
  return "ws://localhost:8080";
})();

function generateClientId(): string {
  return `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

export function createNetworkClient(scene: THREE.Scene): NetworkClient {
  const clientId = generateClientId();
  const remotePlayers = new Map<string, RemotePlayer>();

  let socket: WebSocket | null = null;
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    // If WebSocket construction fails (e.g. unsupported), just no-op networking.
    socket = null;
  }

  if (socket) {
    socket.addEventListener("message", (event: MessageEvent<string>) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!data || data.id === clientId || data.type !== "state") {
        return;
      }

      const { id, position, rotationY, isRunning, isSneaking } = data;
      if (!position) return;

      let remote = remotePlayers.get(id);
      if (!remote) {
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshStandardMaterial({
          color: isRunning ? 0x00ff88 : 0x00aaff,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        scene.add(mesh);
        remote = { object: mesh };
        remotePlayers.set(id, remote);
      }

      const obj = remote.object;
      obj.position.set(position.x, position.y, position.z);
      obj.rotation.y = rotationY ?? obj.rotation.y;

      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (isSneaking) {
        mat.color.setHex(0xffaa00);
      } else if (isRunning) {
        mat.color.setHex(0x00ff88);
      } else {
        mat.color.setHex(0x00aaff);
      }
    });
  }

  const lastPosition = new THREE.Vector3();
  let lastRotationY = 0;
  let lastSent = 0;

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

      if (!movedEnough && !rotatedEnough && now - lastSent < minIntervalMs) {
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
      } catch {
        // ignore send errors
      }
    },
  };
}

