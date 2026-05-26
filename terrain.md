# Terrain Generation System

## Overview

The terrain is generated entirely from GPU-computed simplex noise (GLSL) with an identical CPU fallback (JavaScript) for collision detection and the minimap. There are no heightmaps, no textures, no pre-baked data — every vertex computes its height on the fly using a layered noise stack.

Both paths use the same Gustavson `snoise2D` implementation ported to GLSL and JS respectively. The noise function is deterministic (same input → same output), so the CPU and GPU always agree on terrain height at any world coordinate.

---

## Noise Octaves

Height is the sum of five octaves, each at a different scale and amplitude:

```
preDetailHeight = continent + base + hill + (mountain * mountainMask)
height = preDetailHeight + (detail * elevationFactor)

where:
  mountainMask = smoothstep(-15, 25, continent)   — mountains cluster in high regions
  elevationFactor = clamp(preDetailHeight / 60, 0, 1) — detail grows with height
```

### 1. Continent (scale=0.0005, amplitude=±40m)

```
snoise(wx * 0.0005, wz * 0.0005) * 40.0
```

- Period: ~12500 world units (one full noise cycle)
- Range: -40m to +40m
- Purpose: Creates broad basin-and-range structure so the world has distinct highlands and lowlands instead of being uniformly bumpy everywhere

This octave is sampled at the **raw world position** (not domain-warped), because warping at this scale would wash out the large-scale structure.

### 2. Base (scale=0.02, amplitude=±4m)

```
snoise(warpedPos * 0.02) * 4.0
```

- Period: ~314 units
- Range: -4m to +4m
- Purpose: General fine-scale undulation — the "texture" of lowland terrain

### 3. Hill (scale=0.04, amplitude=±2m)

```
snoise(warpedPos * 0.04) * 2.0
```

- Period: ~157 units
- Range: -2m to +2m
- Purpose: Small hills and dips, adds variety on top of the base layer

### 4. Mountain — Ridged Noise (scale=0.003, amplitude=0–80m)

```
ridgedNoise(warpedPos * 0.003) * 80.0
```

Where:

```
ridgedNoise(p) = (1.0 - abs(snoise(p)))²
```

- Period: ~2094 units
- Range: 0 to +80m (always positive — no negative contribution)
- Purpose: Generates the primary topographic relief — mountain ranges, ridges, valleys

**Continent masking:** The mountain amplitude is multiplied by `mountainMask = smoothstep(-15, 25, continent)`. In low-continent regions (continent below −15), the mask is 0 — flat plains with no mountains. In the transition band (−15 to 25), rolling hills emerge. Above 25, full mountain ranges appear. This ensures mountains cluster into distinct ranges constrained by the large-scale continent structure, rather than appearing uniformly everywhere.

**Why ridged noise instead of `max(0, snoise)`:**

The old code used `max(0, snoise(p))`, which produces smooth, round bumps — like hills, not mountains. Every transition from 0 to peak is a gentle slope.

Ridged noise works differently:

| snoise value | `abs(snoise)` | `1 - abs` | `(1 - abs)²` | What it means |
|---|---|---|---|---|
| 1.0 | 1.0 | 0.0 | 0.0 | valley floor |
| 0.5 | 0.5 | 0.5 | 0.25 | lower slope |
| 0.0 | 0.0 | 1.0 | 1.0 | **ridge crest** (peak) |
| -0.5 | 0.5 | 0.5 | 0.25 | lower slope |
| -1.0 | 1.0 | 0.0 | 0.0 | valley floor |

The absolute value folds the noise: both positive and negative slopes of the underlying sine wave become the same side of a V-shaped valley. The squaring sharpens the ridge crests and flattens the valley floors.

Visually: where the old noise produced rolling hills, ridged noise produces knife-edge mountain ridges with flat valley floors between them — much more like real topography.

### 5. Detail (scale=0.3, amplitude=±1m, elevation-scaled)

```
float preDetailHeight = continent + base + hill + mountain;
float elevationFactor = clamp(preDetailHeight / 60.0, 0.0, 1.0);
detail = snoise(warpedPos * 0.3) * 1.0 * elevationFactor;
```

- Period: ~21 units
- Range: -1m to +1m (full amplitude only at highest peaks)
- Purpose: High-frequency crackle that breaks up the smooth plastic look at close range. Scaled by elevation so valley floors are smooth and peaks are jagged — matching the real-world pattern where erosion textures intensify at higher altitudes.

---

## Domain Warp

Domain warping is the technique of feeding noise-shifted coordinates into the noise function instead of the raw world position. It is the single most important improvement for natural-looking terrain.

### How it works

```
rawWarpX = snoise(wx * 0.002, wz * 0.002)         // range: [-1, 1]
rawWarpZ = snoise(wx * 0.002 + 100, wz * 0.002 + 100) // different noise, same frequency

warpX = rawWarpX * 100.0   // shift up to ±100m
warpZ = rawWarpZ * 100.0   // shift up to ±100m

warpedX = wx + warpX
warpedZ = wz + warpZ

// All subsequent octaves sample at warpedPos instead of (wx, wz)
height = base(warpedPos) + hill(warpedPos) + mountain(warpedPos) + detail(warpedPos)
```

### What it looks like

Without domain warp, every octave's features align with the noise grid axes. Ridges run in straight lines. Valleys are evenly spaced. The terrain looks like stretched perlin noise — an artificial, computer-generated surface.

With domain warp, each point's effective sampling position is smoothly shifted by up to ±100m. This means:

- Ridge lines curve and bend organically
- Valleys meander instead of running straight
- Features flow into each other like real topography shaped by erosion
- The world no longer looks like it was generated by a math equation

The warp itself is smooth (at scale 0.002, period ~3141 units), so adjacent points shift gradually — the terrain doesn't tear or pinch.

### Why continent is not warped

The continent octave is sampled at raw world position because warping at 0.0005 scale would require an impractically large warp magnitude to have any visible effect at that scale. The continent provides the unfiltered large-scale skeleton; everything else is draped onto it through the warp.

---

## CPU / GPU Synchronisation

Two copies of the noise logic exist:

| File | Language | Function | Role |
|---|---|---|---|
| `src/terrain.js` | JavaScript | `snoise2D`, `generateTile`, `getHeight` | Collision detection, minimap |
| `src/world.js` | GLSL (in `simplexNoiseGLSL` string) | `snoise`, `computeHeight` | Vertex shader (all 5 LODs) |

Both implement the exact same Gustavson simplex noise algorithm and the exact same `computeHeight` / `generateTile` math with the same constants. The JS path tiles and caches heights (64×64 tiles, LRU cache of 4000 tiles, evicts ~500 at a time when full); the GLSL path recomputes per-vertex every frame.

When modifying the noise stack, both files must be updated identically. A mismatch would cause collision detection to disagree with visible terrain — the plane would float above or clip into the ground.

---

## Surface Colouring

The fragment shader colours each fragment based on its height using four smooth colour bands:

| Height | Colour | Represents |
|---|---|---|
| 0–4m | Green (0.33, 0.55, 0.22) | Grass / low vegetation |
| 4–18m | Brown (0.55, 0.40, 0.25) | Earth / dirt |
| 18–35m | Grey (0.55, 0.50, 0.45) | Rock / alpine scree |
| 35m+ | White (0.96, 0.96, 0.98) | Snow cap |

Blending uses `smoothstep` + `mix` for continuous gradients — no hard bands. The transition regions overlap so a 12m hill is a mix of green and brown, and a 32m peak is a mix of grey and white.

These thresholds are fixed constants in the fragment shader, not derived from the noise parameters.

---

## LOD System (5 Levels)

The vertex count is controlled by the chunk step size per LOD, but since Phase 1, all LODs compute height at full floating-point precision (the old `floor(h * lodScale)` quantization is removed).

| LOD | Step (units between vertices) | Vertices per chunk | Render distance (chunks) | Render distance (world units) | Pool capacity |
|---|---|---|---|---|---|
| near | 1 | 51×51 = 2601 | 5 | 250 | 250 |
| mid | 5 | 11×11 = 121 | 12 | 600 | 700 |
| far | 10 | 6×6 = 36 | 25 | 1250 | 2400 |
| ultra | 25 | 3×3 = 9 | 50 | 2500 | 8700 |
| horizon | 50 | 2×2 = 4 | 100 | 5000 | 32000 |

All LODs feed the same `computeHeight()` function — the only difference is how many vertices per chunk and how far out they extend. This means the horizon LOD's 2×2 vertex chunks sit at the correct mountain heights, giving real silhouettes at the 5000m visibility limit instead of flat planes.

---

## Fog

```
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0004)
```

At 0.0004 density:
- 1000m: 33% fog (near terrain still crisp)
- 2500m: 63% fog (mid-distance begins to haze)
- 5000m: 86% fog (horizon edge mostly concealed)

The fog colour matches the sky (sky blue `#87ceeb`), so distant terrain visually blends into the sky rather than hitting a hard geometric edge.

---

## Parameters Reference

| Constant | Value | Used in | Purpose |
|---|---|---|---|
| `CHUNK_SIZE` | 50 | world.js | Size of one chunk in world units |
| `TILE_SIZE` | 50 | terrain.js | Size of one cached heightmap tile |
| `MAX_TILES` | 4000 | terrain.js | LRU cache capacity |
| `heightScale` | 20 | both | Base multiplier for all height contributions |
| `baseScale` | 0.02 | both | Frequency of base undulation |
| `hillScale` | 0.04 | both | Frequency of hill layer |
| `mountainScale` | 0.003 | both | Frequency of mountain / ridged noise |
| `continentScale` | 0.0005 | both | Frequency of continent basin |
| `warpScale` | 0.002 | both | Frequency of domain warp field |
| `flatnessFactor` | 0.2 | both | How flat the base terrain is |
| `hillHeightMultiplier` | 0.1 | both | How pronounced hills are |
| `mountainHeightMultiplier` | 4.0 | both | How tall mountains are |
| `RENDER_DISTANCE_HORIZON` | 100 | world.js | Furthest chunk ring (5000 units) |
