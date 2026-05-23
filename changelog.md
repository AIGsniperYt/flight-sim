# Changelog

## **23/05/2026 — Performance & Rendering Optimisations**

### **Merged Geometries per LOD (Draw Call Reduction)**
**OPT:** Drastically reduced draw calls from ~2600 to 12 by replacing per-chunk `THREE.Mesh` objects with incrementally-updated, pre-allocated merged geometries.
Uses 12 static meshes (3 LODs × 4 world quadrants) to maintain frustum culling while completely eliminating object creation and chunk pooling.

**Before:**
```js
// ~2600 individual meshes rendered per frame
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
```

**After:**
```js
// 12 static meshes pre-allocated to max LOD size
// Chunks incrementally occupy free slots in the Float32Array buffers
const bucket = mergedMeshes[lod][quad];
const slot = bucket.freeSlots.pop();
// writes vertices directly to buffer at slot offset...
bucket.geometry.attributes.position.needsUpdate = true;
```

### **Missing Chunks Bug Fix**
**BUG:** Certain chunks at the edge of the render distance would entirely fail to render when flying far from the origin.
**Cause:** When the camera moved, the system attempted to add new chunks before removing chunks that had just left the render distance. Because all chunks can fall into a single world quadrant when far from the origin, the pre-allocated buffer for that quadrant hit its maximum capacity. Without freeing the old slots first, there were no free slots available for the new chunks, causing them to be permanently dropped.
**Fix:** 
- Reordered the `updateChunks` logic to strictly process removals *before* additions, ensuring slots are always freed up in time.
- Increased the `maxChunks` buffer limit slightly for added safety margin.
- Updated chunk removal to collapse the $x$, $y$, and $z$ coordinates of vertices to `(0, -99999, 0)`, rendering them as zero-area triangles that the GPU trivially drops.

---

### **Seamless Chunk Tiling & J Key Toggle**
**BUG:** Vertex range `x < CHUNK_SIZE` left a 1-unit gap between adjacent chunks. With step=4 (mid LOD) the gaps scaled proportionally. Flying under terrain revealed all layers and gaps.

**Fix:** 
- Mid step changed from 4 → 5 (divides CHUNK_SIZE evenly)
- Dev mode (`showGaps=true`, default): `x <= CHUNK_SIZE - 1` — preserves intentional gaps for debugging
- Player mode (`showGaps=false`): `x <= CHUNK_SIZE` — inclusive range tiles chunks edge-to-edge with no gaps
- **`J` key** toggles between dev (gapped) and player (seamless) mode
- Toggle clears all chunks, pool, and index cache; regenerates on next frame

```js
// Dev mode (J off): x goes 0..48 for step=1
// Player mode (J on): x goes 0..50 for step=1 (seamless)
const maxCoord = showGaps ? CHUNK_SIZE - 1 : CHUNK_SIZE;
for (let x = 0; x <= maxCoord; x += step) { ... }
```

---

### **LOD Stacking Fix**
**BUG:** Chunks at the same (x,z) position but different LODs were all active simultaneously because the key was `${x},${z},${lod}`. When a chunk's LOD changed (camera moves), the old LOD mesh remained visible underneath the new one.

**Fix:** Before creating a chunk at a new LOD, remove any existing chunk at the same (x,z) for any other LOD.

```js
// new: clear stale LOD layers before creating
const prevLODs = ["near", "mid", "far"];
for (const prevLod of prevLODs) {
    if (prevLod !== lod) {
        const prevKey = `${x},${z},${prevLod}`;
        if (chunks.has(prevKey)) {
            scene.remove(entry.mesh);
            chunkPool.push(entry.mesh);
            chunks.delete(prevKey);
        }
    }
}
```

---

### **LOD Rebalance & Bounding Box Optimisation**
**OPT:** Changed LOD steps to meaningful values — mid: step=5 (was 2, now divides CHUNK_SIZE evenly), far: step=10 (was CHUNK_SIZE=50, degenerate single vertex).  
**OPT:** Replaced `geometry.computeBoundingBox()` with manual Box3 construction using already-tracked minY/maxY, avoiding a full pass over vertex data.

| LOD | Before (verts) | After (verts) | Reduction |
|-----|---------------|--------------|-----------|
| near | 50×50 = 2500 | 50×50 = 2500 | 0% |
| mid | 25×25 = 625 | 11×11 = 121 | **-81%** |
| far | 1×1 = 1 (degenerate!) | 6×6 = 36 | **+3500%** (actually useful) |
| **Total** (all active chunks) | **~620K** | **~370K** | **-40%** |

**Before (degenerate far LOD):**
```js
else if (lod === "far") { step = CHUNK_SIZE; lodScale = 0.1; }
// Only 1 vertex, creates a useless single-triangle chunk
vertsPerSide = CHUNK_SIZE / step; // = 1
```

**After (meaningful LODs):**
```js
else if (lod === "mid") { step = 5; lodScale = 0.5; }
else if (lod === "far") { step = 10; lodScale = 0.1; }
vertsPerSide = CHUNK_SIZE / step + 1; // = 11 for mid, 6 for far
```

**Before (expensive bounding box):**
```js
geometry.computeBoundingBox();  // full vertex iteration
const bbox = geometry.boundingBox;
bbox.min.y = Math.min(minY - 10, bbox.min.y);
bbox.max.y = Math.max(maxY + 10, bbox.max.y);
return bbox.clone();
```

**After (direct construction):**
```js
return new THREE.Box3(
    new THREE.Vector3(0, minY - 10, 0),
    new THREE.Vector3(CHUNK_SIZE, maxY + 10, CHUNK_SIZE)
);
```

---

### **Precomputed Indices**
**OPT:** Index buffer computed once per LOD level and shared across all chunks. Eliminates per-chunk index array allocation and `setIndex` creation overhead.

**Before:** indices were regenerated inside the per-vertex loop for every chunk
```js
const indices = [];
for (let x = 0; x < CHUNK_SIZE; x += step) {
    for (let z = 0; z < CHUNK_SIZE; z += step) {
        if (x < CHUNK_SIZE - step && z < CHUNK_SIZE - step) {
            indices.push(idx, idx + vertsPerSide, idx + 1, ...);
        }
        idx++;
    }
}
geometry.setIndex(indices);
```

**After:** computed once per LOD via `getIndices(lod)`, reused as shared constant array
```js
const preIndex = getIndices(lod);
const indexAttr = geometry.index;
if (indexAttr && indexAttr.count === preIndex.length) {
    indexAttr.array.set(preIndex);       // no allocation — writes into existing buffer
    indexAttr.needsUpdate = true;
} else {
    geometry.setIndex(preIndex);
}
```

---

### **Chunk Pooling**
**OPT:** Added chunk pool to reuse mesh/geometry instances instead of dispose+recreate cycle.  
On removal, meshes go into the pool; on creation, pool is checked first — avoids GC churn from allocation/deallocation.

**Before (dispose+recreate on every transition):**
```js
// removal:
scene.remove(entry.mesh);
entry.mesh.geometry.dispose();
// creation: new BufferGeometry(), new Mesh(), new Material()
```

**After (reuse from pool, repopulate buffers):**
```js
const chunkPool = [];
// removal:
chunkPool.push(entry.mesh);
// creation: check pool first, repopulate via buffer writes + needsUpdate
```

---

### **Frustum Culling Optimisation**
**OPT:** Eliminated per‑frame `Box3.clone()` allocations in frustum checks by reusing a shared `_bbox` instance.

**Before:**
```js
function isChunkInFrustum(chunk, frustum) {
    const box = chunk.userData.boundingBox.clone();
    box.applyMatrix4(chunk.matrixWorld);
    return frustum.intersectsBox(box);
}
```

**After:**
```js
const _bbox = new THREE.Box3();

function isChunkInFrustum(chunk, frustum) {
    _bbox.copy(chunk.userData.boundingBox);
    _bbox.applyMatrix4(chunk.matrixWorld);
    return frustum.intersectsBox(_bbox);
}
```

---

### **Vertex Buffer Optimisation**
**OPT:** Replaced dynamic JS arrays with `Float32Array` buffers for vertex positions & colors.  
Uses index‑based writes instead of `push()`, improving memory locality and GC behaviour.

**Before:**
```js
const vertices = [];
const colors = [];
// ...
vertices.push(x, y, z);
colors.push(0.47, 0.8, 0.47);
```

**After:**
```js
const vertsPerSide = CHUNK_SIZE / step;
const vertexCount = vertsPerSide * vertsPerSide;
const positions = new Float32Array(vertexCount * 3);
const colors = new Float32Array(vertexCount * 3);
// ...
const i3 = idx * 3;
positions[i3] = x;
positions[i3 + 1] = y;
positions[i3 + 2] = z;
colors[i3] = 0.47;
colors[i3 + 1] = 0.8;
colors[i3 + 2] = 0.47;
```

---

### **Terrain Height Optimisation**
**OPT:** Added a height‑cache (`Map`) to avoid repeated simplex noise evaluations for identical world coordinates.  
**FIX:** Capped cache at 500,000 entries with auto‑clear to prevent unbounded memory growth (minimap was leaking ~150k entries/sec).

**Before:**
```js
export function getTerrainHeightAt(worldX, worldZ, lodScale = 1.0) {
    const baseHeight = simplex.noise2D(worldX * baseScale, worldZ * baseScale) * heightScale * flatnessFactor;
    const hillHeight = simplex.noise2D(worldX * hillScale, worldZ * hillScale) * heightScale * hillHeightMultiplier;
    const mountainHeight = Math.max(0, simplex.noise2D(worldX * mountainScale, worldZ * mountainScale)) * heightScale * mountainHeightMultiplier;
    return Math.floor((baseHeight + hillHeight + mountainHeight) * lodScale);
}
```

**After:**
```js
const heightCache = new Map();

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
    heightCache.set(key, height);
    return Math.floor(height * lodScale);
}
```

---

## **22/05/2026 — Major Flight Physics Overhaul**

### **Codebase Refactor**
- Migrated to **ES6 modules**
- Extracted `physics.js` and `world.js` from monolithic `main.js`
- Added constants table to debug overlay (mass, wing area, CL max, stall AoA, etc.)

---

### **UI & Camera Improvements**
- Added **Artificial Horizon** instrument (toggle: `F`)
- Added **minimap** with terrain shading + heading indicator (toggle: `M`)
- Replaced `PointerLockControls` with **OrbitControls** for better workflow  
- Added camera modes:
  - **Chase cam** (behind aircraft)
  - **Orbit cam** (free look)
  - Reset orbit cam with `C`

---

### **Force Visualisation**
Added toggleable debug arrows for:

- Velocity  
- Acceleration  
- Lift  
- Drag  
- Thrust  
- Weight  
- Side force  
- Total force  
- Reference axes  

**Toggles:**  
- `F6` — force vectors  
- `F7` — reference axes  

---

### **Instrumentation & Debugging**
Added extensive real‑time flight instrumentation:

- Angle of Attack (AoA)
- Sideslip angle
- Pitch & bank angles
- Dynamic pressure
- Lift‑to‑weight ratio
- Thrust‑to‑drag ratio
- Stall speed & stall warning

Added formula‑level debugging to overlay (live lift/drag/thrust/weight equations).

---

### **Throttle Control**
Added throttle input via **Shift** (increase) and **Ctrl** (decrease), clamped to `[0, 1]`.

**Before:**  
Throttle fixed at `1.0`, no user control.

**After:**
```js
const throttleInput = (keyboard['ShiftLeft'] || keyboard['ShiftRight'] ? 1 : 0) +
    (keyboard['ControlLeft'] || keyboard['ControlRight'] ? -1 : 0);
throttle = THREE.MathUtils.clamp(throttle + throttleInput * dt, 0, 1);
```

---

### **Full Aerodynamics System**
Replaced the old "move forward at constant speed" model with a full aerodynamic simulation including:

- Lift, drag, thrust, weight, side force  
- Cessna‑172‑like aerodynamic parameters  
- Air density model  
- Stall physics & stall AoA  
- CL/CD breakdown  
- Full state tracking (velocities, accelerations, forces)

**Before (simple movement):**
```js
plane.translateZ(-speed * throttle * dt);
if (plane.position.y < 2) plane.position.y = 2;
```

**After (real physics):**
```js
const rho = getAirDensity(plane.position.y);
const dynamicPressure = 0.5 * rho * speed * speed;
const liftForce = dynamicPressure * AIRCRAFT.wingArea * liftCoefficient.cl;
const dragForce = dynamicPressure * AIRCRAFT.wingArea * dragBreakdown.cd;
const thrustForce = throttle * AIRCRAFT.maxThrust;
const weightForce = AIRCRAFT.mass * GRAVITY;
// ... integrate forces into acceleration/velocity
velocity.addScaledVector(acceleration, dt);
plane.position.addScaledVector(velocity, dt);
```

---
