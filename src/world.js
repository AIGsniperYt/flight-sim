import * as THREE from 'three';
import SimplexNoise from 'simplex-noise';

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
const simplex = new SimplexNoise();
const heightCache = new Map();
const HEIGHT_CACHE_MAX = 500000;

let visibleChunks = 0;

export function getChunkSize() {
    return CHUNK_SIZE;
}

export function getChunkStats() {
    return { visibleChunks, totalChunks: chunks.size };
}

export function getTerrainHeightAt(worldX, worldZ, lodScale = 1.0) {
    const key = `${worldX},${worldZ}`;
    const cached = heightCache.get(key);
    if (cached !== undefined) {
        return Math.floor(cached * lodScale);
    }

    const baseHeight = simplex.noise2D(worldX * baseScale, worldZ * baseScale) * heightScale * flatnessFactor;
    const hillHeight = simplex.noise2D(worldX * hillScale, worldZ * hillScale) * heightScale * hillHeightMultiplier;
    const mountainHeight = Math.max(0, simplex.noise2D(worldX * mountainScale, worldZ * mountainScale)) * heightScale * mountainHeightMultiplier;
    const height = baseHeight + hillHeight + mountainHeight;

    if (heightCache.size >= HEIGHT_CACHE_MAX) {
        heightCache.clear();
    }
    heightCache.set(key, height);
    return Math.floor(height * lodScale);
}

export function getTerrainColorAt(worldX, worldZ) {
    const y = getTerrainHeightAt(worldX, worldZ);

    if (y < heightScale * 0.3) {
        return { r: 120, g: 204, b: 120 };
    }

    if (y < snowLevel) {
        const shade = THREE.MathUtils.clamp(128 + y * 1.5, 120, 190);
        return { r: shade, g: shade, b: shade };
    }

    return { r: 245, g: 245, b: 245 };
}

const chunkPool = [];
const precomputedIndices = {};

function getIndices(lod) {
    if (precomputedIndices[lod]) return precomputedIndices[lod];

    let step = 1;
    if (lod === "mid") step = 4;
    else if (lod === "far") step = 10;

    const vertsPerSide = Math.ceil(CHUNK_SIZE / step);
    const indices = [];

    for (let row = 0; row < vertsPerSide - 1; row++) {
        for (let col = 0; col < vertsPerSide - 1; col++) {
            const a = row * vertsPerSide + col;
            const b = (row + 1) * vertsPerSide + col;
            const c = row * vertsPerSide + col + 1;
            const d = (row + 1) * vertsPerSide + col + 1;
            indices.push(a, b, c, b, d, c);
        }
    }

    precomputedIndices[lod] = indices;
    return indices;
}

function populateChunkGeometry(geometry, chunkX, chunkZ, lod) {
    let step = 1;
    let lodScale = 1.0;
    if (lod === "mid") { step = 4; lodScale = 0.5; }
    else if (lod === "far") { step = 10; lodScale = 0.1; }

    const vertsPerSide = Math.ceil(CHUNK_SIZE / step);
    const vertexCount = vertsPerSide * vertsPerSide;

    const posAttr = geometry.attributes.position;
    const colAttr = geometry.attributes.color;
    const reuse = posAttr && posAttr.count === vertexCount;

    const positions = reuse ? posAttr.array : new Float32Array(vertexCount * 3);
    const colors = reuse ? colAttr.array : new Float32Array(vertexCount * 3);
    let minY = Infinity, maxY = -Infinity, idx = 0;

    for (let x = 0; x < CHUNK_SIZE; x += step) {
        for (let z = 0; z < CHUNK_SIZE; z += step) {
            const worldX = x + chunkX * CHUNK_SIZE;
            const worldZ = z + chunkZ * CHUNK_SIZE;
            const y = getTerrainHeightAt(worldX, worldZ, lodScale);

            const i3 = idx * 3;
            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            if (y < heightScale * 0.3) {
                colors[i3] = 0.47; colors[i3 + 1] = 0.8; colors[i3 + 2] = 0.47;
            } else if (y < snowLevel) {
                colors[i3] = 0.5; colors[i3 + 1] = 0.5; colors[i3 + 2] = 0.5;
            } else {
                colors[i3] = 1.0; colors[i3 + 1] = 1.0; colors[i3 + 2] = 1.0;
            }

            idx++;
        }
    }

    if (reuse) {
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
    } else {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    const preIndex = getIndices(lod);
    const indexAttr = geometry.index;
    if (indexAttr && indexAttr.count === preIndex.length) {
        indexAttr.array.set(preIndex);
        indexAttr.needsUpdate = true;
    } else {
        geometry.setIndex(preIndex);
    }

    return new THREE.Box3(
        new THREE.Vector3(0, minY - 10, 0),
        new THREE.Vector3(CHUNK_SIZE, maxY + 10, CHUNK_SIZE)
    );
}

function generateChunk(scene, chunkX, chunkZ, lod = "near") {
    for (let i = 0; i < chunkPool.length; i++) {
        if (chunkPool[i].userData.lod === lod) {
            const mesh = chunkPool.splice(i, 1)[0];
            const bbox = populateChunkGeometry(mesh.geometry, chunkX, chunkZ, lod);
            mesh.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
            mesh.userData.boundingBox = bbox;
            mesh.visible = false;
            scene.add(mesh);
            return mesh;
        }
    }

    const geometry = new THREE.BufferGeometry();
    const bbox = populateChunkGeometry(geometry, chunkX, chunkZ, lod);

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide,
        fog: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
    mesh.userData.lod = lod;
    mesh.userData.boundingBox = bbox;
    mesh.visible = false;
    scene.add(mesh);

    return mesh;
}

const _bbox = new THREE.Box3();

function isChunkInFrustum(chunk, frustum) {
    _bbox.copy(chunk.userData.boundingBox);
    _bbox.applyMatrix4(chunk.matrixWorld);
    return frustum.intersectsBox(_bbox);
}

export function updateChunks(scene, camera, frustum) {
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
                const mesh = generateChunk(scene, x, z, lod);
                chunks.set(chunkKey, { mesh, data: { chunkX: x, chunkZ: z, lod } });
            }
        }
    }

    visibleChunks = 0;

    const toRemove = [];
    chunks.forEach((entry, key) => {
        const { chunkX, chunkZ, lod } = entry.data;
        const dx = Math.abs(chunkX - cameraChunkX);
        const dz = Math.abs(chunkZ - cameraChunkZ);
        const inRange = dx <= RENDER_DISTANCE_FAR && dz <= RENDER_DISTANCE_FAR;

        if (!inRange) {
            toRemove.push(key);
        } else {
            entry.mesh.visible = isChunkInFrustum(entry.mesh, frustum);
            if (entry.mesh.visible) visibleChunks++;
        }
    });

    for (const key of toRemove) {
        const entry = chunks.get(key);
        scene.remove(entry.mesh);
        chunkPool.push(entry.mesh);
        chunks.delete(key);
    }
}
