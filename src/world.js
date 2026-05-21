const CHUNK_SIZE = 50;
const RENDER_DISTANCE_NEAR = 5;
const RENDER_DISTANCE_MID = 12;
const RENDER_DISTANCE_FAR = 25;
const heightScale = 20;
const baseScale = 0.02;
const mountainScale = 0.003;
const hillScale = 0.04;
const flatnessFactor = 0.2;
const mountainHeightMultiplier = 4.0;
const hillHeightMultiplier = 0.1;
const snowLevel = 0.99 * heightScale * 2;

const chunks = new Map();
let sceneRef = null;

const simplex = new SimplexNoise();

const frustum = new THREE.Frustum();
const viewProjectionMatrix = new THREE.Matrix4();

let visibleChunks = 0;

export function initWorld(scene) {
    sceneRef = scene;
}

export function getChunkSize() {
    return CHUNK_SIZE;
}

export function getChunkStats() {
    return { visibleChunks, totalChunks: chunks.size };
}

function generateChunk(chunkX, chunkZ, lod = "near") {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];

    let step = 1;
    let lodScale = 1.0;

    if (lod === "mid") {
        step = 2;
        lodScale = 0.5;
    } else if (lod === "far") {
        step = CHUNK_SIZE;
        lodScale = 0.1;
    }

    let minY = Infinity;
    let maxY = -Infinity;

    for (let x = 0; x < CHUNK_SIZE; x += step) {
        for (let z = 0; z < CHUNK_SIZE; z += step) {
            const worldX = x + chunkX * CHUNK_SIZE;
            const worldZ = z + chunkZ * CHUNK_SIZE;

            const baseHeight = simplex.noise2D(worldX * baseScale, worldZ * baseScale) * heightScale * flatnessFactor;
            const hillHeight = simplex.noise2D(worldX * hillScale, worldZ * hillScale) * heightScale * hillHeightMultiplier;
            const mountainHeight = Math.max(0, simplex.noise2D(worldX * mountainScale, worldZ * mountainScale)) * heightScale * mountainHeightMultiplier;

            const y = Math.floor((baseHeight + hillHeight + mountainHeight) * lodScale);

            vertices.push(x, y, z);

            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            if (y < heightScale * 0.3) {
                colors.push(0.47, 0.8, 0.47);
            } else if (y < snowLevel) {
                colors.push(0.5, 0.5, 0.5);
            } else {
                colors.push(1.0, 1.0, 1.0);
            }

            if (x < CHUNK_SIZE - step && z < CHUNK_SIZE - step) {
                const row = CHUNK_SIZE / step;
                const a = (x / step) + (z / step) * row;
                const b = (x / step) + (z / step + 1) * row;
                const c = (x / step + 1) + (z / step) * row;
                const d = (x / step + 1) + (z / step + 1) * row;
                indices.push(a, b, c, b, d, c);
            }
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide,
        fog: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
    mesh.visible = false;
    sceneRef.add(mesh);

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox.clone();
    bbox.min.y = Math.min(minY - 10, bbox.min.y);
    bbox.max.y = Math.max(maxY + 10, bbox.max.y);
    mesh.userData.boundingBox = bbox;

    return mesh;
}

function isChunkInFrustum(chunk, camera) {
    const box = chunk.userData.boundingBox.clone();
    box.applyMatrix4(chunk.matrixWorld);

    camera.updateMatrixWorld();
    viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjectionMatrix);

    return frustum.intersectsBox(box);
}

export function updateChunks(camera) {
    const cameraChunkX = Math.floor(camera.position.x / CHUNK_SIZE);
    const cameraChunkZ = Math.floor(camera.position.z / CHUNK_SIZE);

    for (let x = cameraChunkX - RENDER_DISTANCE_FAR; x <= cameraChunkX + RENDER_DISTANCE_FAR; x++) {
        for (let z = cameraChunkZ - RENDER_DISTANCE_FAR; z <= cameraChunkZ + RENDER_DISTANCE_FAR; z++) {
            const dx = Math.abs(x - cameraChunkX);
            const dz = Math.abs(z - cameraChunkZ);
            let lod = "far";
            if (dx <= RENDER_DISTANCE_NEAR && dz <= RENDER_DISTANCE_NEAR) lod = "near";
            else if (dx <= RENDER_DISTANCE_MID && dz <= RENDER_DISTANCE_MID) lod = "mid";

            const chunkKey = `${x},${z},${lod}`;
            if (!chunks.has(chunkKey)) {
                const chunk = generateChunk(x, z, lod);
                chunks.set(chunkKey, chunk);
            }
        }
    }

    visibleChunks = 0;

    chunks.forEach((chunk, key) => {
        const [chunkX, chunkZ, lod] = key.split(',').map((v, i) => i < 2 ? Number(v) : v);

        const dx = Math.abs(chunkX - cameraChunkX);
        const dz = Math.abs(chunkZ - cameraChunkZ);
        const inRange = dx <= RENDER_DISTANCE_FAR && dz <= RENDER_DISTANCE_FAR;

        if (!inRange) {
            sceneRef.remove(chunk);
            chunk.geometry.dispose();
            chunks.delete(key);
        } else {
            chunk.visible = isChunkInFrustum(chunk, camera);
            if (chunk.visible) visibleChunks++;
        }
    });
}
