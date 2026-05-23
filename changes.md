# Terrain Optimisation Plan (No Logic Changes)

## Phase 1 — Immediate Performance Wins

### 1. Height Caching
- Introduce a cache (Map) for terrain heights
- Avoid repeated simplex noise calls for same (worldX, worldZ)
- Replace direct calls to getTerrainHeightAt with cached lookup

---

### 2. Typed Arrays (Replace Dynamic Arrays)
- Replace:
  - vertices = []
  - colors = []
- With:
  - Float32Array for positions
  - Float32Array for colors
- Precompute vertex count based on LOD step
- Write using index pointer instead of push()

---

### 3. Remove Per-Frame Allocations in Frustum Check
- Stop using `.clone()` on bounding boxes each frame
- Use a shared temporary Box3 instance instead
- Reuse instead of reallocating

---

## Phase 2 — Structural Optimisations

### 4. Chunk Pooling (Reuse Instead of Destroy/Create)
- Introduce a chunkPool array
- On chunk removal:
  - Do NOT dispose geometry
  - Store mesh in pool
- On chunk creation:
  - Reuse mesh from pool if available

---

### 5. Precompute Indices
- Move index generation out of generateChunk()
- Precompute once per LOD step
- Reuse index buffer for all chunks

---

## Phase 3 — Scaling Improvements

### 6. LOD Rebalance
- Replace:
  - near: step = 1
  - mid: step = 2
  - far: step = CHUNK_SIZE (bad)
- With:
  - near: 1
  - mid: 4
  - far: 10 (or similar)

---

### 7. Reduce Draw Calls (Advanced)
- Merge chunk geometries per LOD region
OR
- Use instancing for repeated chunk layouts

---

## Long-Term (Do Later)

### 8. Data-Oriented Terrain System
- Separate terrain data from rendering
- Store heightmap independently
- Mesh becomes a visual projection

---

### 9. Streaming Terrain System
- Shift chunks instead of destroying/recreating
- Recycle grid around player

---

### 10. GPU-Based Terrain
- Move height calculations to shaders
- Use displacement maps or procedural vertex shaders