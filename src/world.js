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

const simplex = new SimplexNoise();
const heightCache = new Map();
const HEIGHT_CACHE_MAX = 500000;

let visibleChunks = 0;
let showGaps = true;

const LOD_CONFIGS = {
    near: { step: 1, scale: 1.0, maxChunks: 150 },
    mid: { step: 5, scale: 0.5, maxChunks: 600 },
    far: { step: 10, scale: 0.1, maxChunks: 2200 }
};

const QUADRANTS = ['NE', 'NW', 'SE', 'SW'];

const mergedMeshes = { near: {}, mid: {}, far: {} };
const globalChunks = new Map();
const precomputedIndices = {};
let initialized = false;

export function getChunkSize() {
    return CHUNK_SIZE;
}

export function getChunkStats() {
    return { visibleChunks, totalChunks: globalChunks.size };
}

export function getShowGaps() {
    return showGaps;
}

export function toggleGapMode(scene) {
    showGaps = !showGaps;
    
    if (initialized) {
        for (const lod of ["near", "mid", "far"]) {
            for (const quad of QUADRANTS) {
                const bucket = mergedMeshes[lod][quad];
                scene.remove(bucket.mesh);
                bucket.geometry.dispose();
                bucket.mesh.material.dispose();
            }
        }
        initialized = false;
    }

    for (const key in precomputedIndices) {
        delete precomputedIndices[key];
    }
    globalChunks.clear();
    heightCache.clear();
    return showGaps;
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

function getIndicesForLOD(lod) {
    const cacheKey = `${lod}_${showGaps ? 'g' : 's'}`;
    if (precomputedIndices[cacheKey]) return precomputedIndices[cacheKey];

    const config = LOD_CONFIGS[lod];
    const step = config.step;
    const vertsPerSide = showGaps
        ? CHUNK_SIZE / step
        : CHUNK_SIZE / step + 1;
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

    precomputedIndices[cacheKey] = indices;
    return indices;
}

function getQuadrantForChunk(chunkX, chunkZ) {
    if (chunkX >= 0 && chunkZ >= 0) return 'NE';
    if (chunkX < 0 && chunkZ >= 0) return 'NW';
    if (chunkX >= 0 && chunkZ < 0) return 'SE';
    return 'SW';
}

function initMeshes(scene) {
    for (const lod of ['near', 'mid', 'far']) {
        const config = LOD_CONFIGS[lod];
        
        const vertsPerSide = showGaps ? CHUNK_SIZE / config.step : CHUNK_SIZE / config.step + 1;
        const vertsPerChunk = vertsPerSide * vertsPerSide;
        const chunkIndices = getIndicesForLOD(lod);
        const indicesPerChunk = chunkIndices.length;
        
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
            fog: true
        });

        for (const quad of QUADRANTS) {
            const maxChunks = config.maxChunks;
            const totalVerts = maxChunks * vertsPerChunk;
            const totalIndices = maxChunks * indicesPerChunk;

            const positions = new Float32Array(totalVerts * 3);
            const colors = new Float32Array(totalVerts * 3);
            const indices = new Uint32Array(totalIndices);

            for (let i = 0; i < maxChunks; i++) {
                const indexOffset = i * indicesPerChunk;
                const vertexOffset = i * vertsPerChunk;
                for (let j = 0; j < indicesPerChunk; j++) {
                    indices[indexOffset + j] = chunkIndices[j] + vertexOffset;
                }
                
                for (let j = 0; j < vertsPerChunk; j++) {
                    positions[(vertexOffset + j) * 3] = 0;
                    positions[(vertexOffset + j) * 3 + 1] = -99999;
                    positions[(vertexOffset + j) * 3 + 2] = 0;
                }
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
            
            geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 1000000); 

            const mesh = new THREE.Mesh(geometry, material);
            mesh.frustumCulled = false; 
            scene.add(mesh);

            const freeSlots = [];
            for (let i = maxChunks - 1; i >= 0; i--) freeSlots.push(i);

            mergedMeshes[lod][quad] = {
                mesh,
                geometry,
                freeSlots,
                activeChunks: new Map(), 
                vertsPerChunk,
                bounds: new THREE.Box3(),
                changed: false,
                dirty: false
            };
        }
    }
    initialized = true;
}

function addChunkToBucket(scene, chunkX, chunkZ, lod) {
    if (!initialized) initMeshes(scene);
    
    const quad = getQuadrantForChunk(chunkX, chunkZ);
    const bucket = mergedMeshes[lod][quad];
    const slot = bucket.freeSlots.pop();
    
    if (slot === undefined) {
        console.warn("No free slots in bucket", lod, quad);
        return;
    }

    const pos = bucket.geometry.attributes.position.array;
    const col = bucket.geometry.attributes.color.array;

    const config = LOD_CONFIGS[lod];
    const step = config.step;
    const lodScale = config.scale;
    const maxCoord = showGaps ? CHUNK_SIZE - 1 : CHUNK_SIZE;

    let minY = Infinity, maxY = -Infinity;
    let idx = slot * bucket.vertsPerChunk;

    for (let x = 0; x <= maxCoord; x += step) {
        for (let z = 0; z <= maxCoord; z += step) {
            const worldX = x + chunkX * CHUNK_SIZE;
            const worldZ = z + chunkZ * CHUNK_SIZE;
            const y = getTerrainHeightAt(worldX, worldZ, lodScale);

            const i3 = idx * 3;
            pos[i3] = worldX;
            pos[i3 + 1] = y;
            pos[i3 + 2] = worldZ;

            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            if (y < heightScale * 0.3) {
                col[i3] = 0.47; col[i3 + 1] = 0.8; col[i3 + 2] = 0.47;
            } else if (y < snowLevel) {
                col[i3] = 0.5; col[i3 + 1] = 0.5; col[i3 + 2] = 0.5;
            } else {
                col[i3] = 1.0; col[i3 + 1] = 1.0; col[i3 + 2] = 1.0;
            }
            idx++;
        }
    }

    bucket.dirty = true;
    bucket.changed = true;

    const bbox = new THREE.Box3(
        new THREE.Vector3(chunkX * CHUNK_SIZE, minY - 10, chunkZ * CHUNK_SIZE),
        new THREE.Vector3((chunkX + 1) * CHUNK_SIZE, maxY + 10, (chunkZ + 1) * CHUNK_SIZE)
    );

    const chunkKey = `${chunkX},${chunkZ}`;
    bucket.activeChunks.set(chunkKey, { slot, bbox });
}

function removeChunkFromBucket(chunkX, chunkZ, lod) {
    const quad = getQuadrantForChunk(chunkX, chunkZ);
    const bucket = mergedMeshes[lod][quad];
    const chunkKey = `${chunkX},${chunkZ}`;
    const chunkData = bucket.activeChunks.get(chunkKey);
    
    if (!chunkData) return;

    const pos = bucket.geometry.attributes.position.array;
    const slot = chunkData.slot;
    let idx = slot * bucket.vertsPerChunk;

    for (let i = 0; i < bucket.vertsPerChunk; i++) {
        pos[idx * 3] = 0;
        pos[idx * 3 + 1] = -99999;
        pos[idx * 3 + 2] = 0;
        idx++;
    }

    bucket.dirty = true;
    bucket.changed = true;
    bucket.freeSlots.push(slot);
    bucket.activeChunks.delete(chunkKey);
}

export function updateChunks(scene, camera, frustum) {
    if (!initialized) initMeshes(scene);

    const cameraChunkX = Math.floor(camera.position.x / CHUNK_SIZE);
    const cameraChunkZ = Math.floor(camera.position.z / CHUNK_SIZE);

    const newActive = new Set();
    const toAdd = [];

    for (let x = cameraChunkX - RENDER_DISTANCE_FAR; x <= cameraChunkX + RENDER_DISTANCE_FAR; x++) {
        for (let z = cameraChunkZ - RENDER_DISTANCE_FAR; z <= cameraChunkZ + RENDER_DISTANCE_FAR; z++) {
            const dx = Math.abs(x - cameraChunkX);
            const dz = Math.abs(z - cameraChunkZ);
            let lod = "far";
            if (dx <= RENDER_DISTANCE_NEAR && dz <= RENDER_DISTANCE_NEAR) lod = "near";
            else if (dx <= RENDER_DISTANCE_MID && dz <= RENDER_DISTANCE_MID) lod = "mid";

            const chunkKey = `${x},${z},${lod}`;
            newActive.add(chunkKey);

            if (!globalChunks.has(chunkKey)) {
                toAdd.push({ x, z, lod, chunkKey });
            }
        }
    }

    const toRemove = [];
    globalChunks.forEach((entry, key) => {
        if (!newActive.has(key)) {
            toRemove.push(key);
        }
    });

    for (const key of toRemove) {
        const entry = globalChunks.get(key);
        removeChunkFromBucket(entry.chunkX, entry.chunkZ, entry.lod);
        globalChunks.delete(key);
    }

    for (const item of toAdd) {
        addChunkToBucket(scene, item.x, item.z, item.lod);
        globalChunks.set(item.chunkKey, { chunkX: item.x, chunkZ: item.z, lod: item.lod });
    }

    visibleChunks = 0;

    for (const lod of ["near", "mid", "far"]) {
        for (const quad of QUADRANTS) {
            const bucket = mergedMeshes[lod][quad];
            if (bucket.dirty) {
                bucket.geometry.attributes.position.needsUpdate = true;
                bucket.geometry.attributes.color.needsUpdate = true;
                bucket.dirty = false;
            }
            if (bucket.changed) {
                bucket.bounds.makeEmpty();
                for (const chunk of bucket.activeChunks.values()) {
                    bucket.bounds.union(chunk.bbox);
                }
                bucket.changed = false;
            }
            
            bucket.mesh.visible = bucket.activeChunks.size > 0 && frustum.intersectsBox(bucket.bounds);
            if (bucket.mesh.visible) {
                visibleChunks += bucket.activeChunks.size;
            }
        }
    }
}
