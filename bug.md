# Bug: Terrain Height Inconsistency Between Rendering and Collision

## Severity
**CRITICAL** — renders collision system non-functional, minimap useless for navigation, terrain generation produces two different worlds.

## Root Cause
Two different simplex noise implementations running in the same application:

| Path | Implementation | Used by |
|------|---------------|---------|
| **CPU (JS)** | `simplex-noise` npm package (Jonas Wagner) | `terrain.js` → `getHeight()`, `getHeightScaled()`, `getTerrainColorAt()` |
| **GPU (GLSL)** | Stefan Gustavson classic (Stefan Gustavson) | `world.js` → `onBeforeCompile` vertex shader `computeHeight()` |

Both are "simplex noise" but use different hash tables, gradient vectors, and permutation functions. For the same `(x, z)` input, they return different values. This means `terrain.js` and the vertex shader generate completely different height fields.

## Impact
- **Collision system** samples `getHeight()` from terrain.js (JS noise) → detects a mountain at position P
- **Minimap** samples `getTerrainColorAt()` from terrain.js (JS noise) → shows a mountain at position P
- **Rendered terrain** computes height in vertex shader (GLSL noise) → shows flat/low terrain at position P
- **User experience**: plane inexplicably "climbs stairs" over invisible terrain, crashes into phantom mountains

## Discovery
User noticed plane climbing in low-elevation (visually flat) areas. Disabled collisions for investigation. Plane rose over terrain invisible to the renderer but visible on the minimap. Suspected x/z axis swap — ruled out because minimap and collision agreed with each other, narrowing the inconsistency to the rendering path.

## System data flow before fix

```
terrain.js (JS noise)
  ├── getHeight() ─────────┬── collision detection (physics.js)
  │                         └── minimap color (main.js)
  └── getHeightScaled() ──── chunk vertex height (world.js — NOT USED)

world.js (GLSL noise in shader)
  └── computeHeight() ────── chunk vertex height (rendering)
```

Two separate noise computations, two different terrains.

## Fix applied

**Approach:** CPU writes heights from terrain.js into vertex buffer. Shader reads pre-computed heights instead of computing noise.

### Changes to `world.js`

1. **Removed** `simplexNoiseGLSL` string (152 lines of GLSL noise implementation)
2. **Removed** `computeHeight()` GLSL function
3. **Removed** uniforms: `baseScale`, `hillScale`, `mountainScale`, `flatnessFactor`, `hillHeightMultiplier`, `mountainHeightMultiplier`
4. **Kept** uniforms: `heightScale`, `snowLevel`, `lodScale`
5. **Modified** `addChunkToBucket()`: writes `getHeight(worldX, worldZ)` (real height from terrain.js) to `pos[i3 + 1]` instead of `0`
6. **Modified** vertex shader: reads raw height from position buffer's Y component, quantizes with `floor(vHeight * lodScale)` for mesh position, passes raw height to fragment shader via `vHeight` for colors

```
// Before (shader computed noise):
float h = computeHeight(transformed.x, transformed.z, ...);
h = floor(h * lodScale);
transformed.y = h;
vHeight = h;

// After (shader reads from buffer):
vHeight = transformed.y;
transformed.y = floor(vHeight * lodScale);
```

### System data flow after fix

```
terrain.js (JS noise — single source of truth)
  ├── getHeight() ───────┬── collision detection (physics.js)
  │                       ├── minimap color (main.js)
  │                       └── vertex buffer Y (world.js → addChunkToBucket)
  └── getHeightScaled() ─── (available for future use)

vertex shader (no noise)
  └── reads raw height from position Y → quantizes for mesh → colors
```

### Optimisation impact
- **Merged geometries (12 draw calls):** PRESERVED — still writing to pre-allocated Float32Array buffers
- **Streaming / LRU eviction:** PRESERVED — terrain.js tile cache unchanged
- **Chunk gen frequency:** PRESERVED — only runs on camera movement (step 9)
- **Memory stability:** PRESERVED — no new allocations, no GC churn
- **GPU noise computation:** REPLACED — vertex shader no longer computes noise. Gains ~uniform memory bandwidth per vertex instead
- **CPU cost at chunk gen:** RESTORED — `getHeight()` called per vertex during chunk generation. Acceptable: tile cache makes this O(1) for cached tiles, chunk gen is infrequent

## What was tested
- [x] All modules parse clean (`node --check`)
- [x] No circular dependencies (terrain.js imports only simplex-noise → now none)
- [x] `getHeight` works for negative world coordinates (tile indexing uses `Math.floor`)
- [x] Color thresholds use raw height (consistent with minimap)
- [x] Vertex quantization uses `floor(vHeight * lodScale)` matching `getHeightScaled`
- [x] Collision `getHeight()` and rendering Y-buffer use same terrain.js call
- [x] No stale references to removed GLSL/computeHeight identifiers

## Remaining concern
Fragment shader now uses **raw** height for colors (`vHeight = transformed.y`), while the original used **compressed** height (`vHeight = floor(h * lodScale)`). Mid/far LOD meshes previously had compressed colors (duller, shifted thresholds). Now they use the full-detail raw height for coloring. This is a **visual improvement** (colors match across LODs) but could look different if snow/green boundaries were previously masked by LOD compression.
