# Terrain Generation System

## Overview

The terrain is generated entirely from GPU-computed simplex noise (GLSL) with an identical CPU fallback (JavaScript) for collision detection and the minimap. There are no heightmaps, no textures, no pre-baked data — every vertex computes its height on the fly using a layered noise stack.

Both paths use the same Gustavson `snoise2D` implementation ported to GLSL and JS respectively. The noise function is deterministic (same input → same output), so the CPU and GPU always agree on terrain height at any world coordinate.

---

## Noise Octaves

Height is the sum of 10+ layered noise samples built in three structural stages:

```
preDetailHeight = continent + base + hill + mountain
height = preDetailHeight + (detail * elevationFactor)
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

### 4. Mountain — Squared Base Domes + fBM Detail + Peak Jaggedness

Mountains are built in three structural layers, not a single octave.

#### 4a. Mountain Base Dome (scale=0.0003, amplitude=0–800m)

```
rawMountain = max(0, snoise(warpedPos * 0.0003))
mountainBase = rawMountain² * 800.0 * mountainMask
```

- Period: ~20944 units (extremely broad)
- Range: 0 to +800m
- Purpose: Creates the massive bulk of mountain ranges. The `max(0, ...)` ensures domes only add height (never carve). The squaring (`rawMountain²`) produces a smooth zero-slope transition at the boundary — mountains rise from the plains with zero slope instead of an abrupt step.

This wide, tall base is why mountains now tower over the fighter jet at cruise altitude. The 800m amplitude is aggressive — only appears where the mask allows.

#### 4b. Rocky Detail — fBM (4 octaves)

```
n1 = snoise(warpedPos * 0.001) × 150m   — broad rock forms
n2 = snoise(warpedPos * 0.003) × 50m    — medium rock bumps
n3 = snoise(warpedPos * 0.009) × 15m    — small rock texture
n4 = ridgedNoise(warpedPos * 0.015) × 10m — faint ridge creases
rockyDetail = n1 + n2 + n3 + n4
```

- Purpose: Adds natural rocky texture to the mountain faces. Uses **Fractional Brownian Motion (fBM)** — stacking noise at progressively smaller scales with decreasing amplitude. Creates a chaotic, organic surface that prevents "plastic" smoothness.
- Gated by `smoothstep(10, 200, mountainBase)` — only activates once the mountain dome is tall enough (>10m), ramping up to full strength at 200m+.

#### 4c. Peak Jaggedness (3 ridged octaves)

```
r1 = ridgedNoise(warpedPos * 0.002) × 150m   — broad ridge cuts
r2 = ridgedNoise(warpedPos * 0.006) × 60m    — medium ridge cuts
r3 = ridgedNoise(warpedPos * 0.015) × 15m    — fine alpine texture
peakJaggedness = r1 + r2 + r3
```

- Purpose: Carves sharp, V-shaped alpine ridges and peaks exclusively at the summits of tall mountains.
- Gated by `peakMask = smoothstep(150, 500, mountainBase)` — only activates near the top of mountains 150m+. Below 150m, these ridges are zero.

#### 4d. Assembly

```
mountainDetail = rockyDetail × smoothstep(10, 200, mountainBase) + peakJaggedness × peakMask
mountain = mountainBase + mountainDetail
```

The mountain base provides 80%+ of the volume. Rocky detail fills the surface with natural texture. Peak jaggedness adds extreme alpine sharpness only at the very top, preserving bulky lower slopes.

#### 4e. Mountain Mask (Dual-Field)

Instead of a single continent-based mask, mountains are gated by two multiplied conditions:

```
mountainRegion = snoise(rawPos * 0.0005)
mountainMask = smoothstep(0.1, 0.4, mountainRegion) × smoothstep(0.0, 25.0, continent)
```

- `mountainRegion` is a second continent-scale noise field (period ~12500 units) that determines *where* mountain ranges form. Only the top ~15% of this field passes.
- `smoothstep(0.0, 25.0, continent)` ensures mountains only form where the terrain is already elevated.

This dual mask creates discrete, isolated mountain belts — not a smooth gradient from plains to peaks. Mountains pop up as distinct ranges separated by wide, flat valleys.

### 5. Detail (scale=0.3, amplitude=±1m, elevation-scaled)

```
float preDetailHeight = continent + base + hill + mountain;
float elevationFactor = clamp(preDetailHeight / 120.0, 0.0, 1.0);
detail = snoise(warpedPos * 0.3) * 1.0 * elevationFactor;
```

- Range: -1m to +1m (full amplitude only at highest peaks)
- Purpose: High-frequency crackle that breaks up the smooth plastic look at close range. Scaled by elevation so valley floors are smooth and peaks are jagged.

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

The fragment shader colours each fragment based on its height using four smooth colour bands, rescaled for the new 800m+ mountain altitudes:

| Height | Colour | Represents |
|---|---|---|
| 0–80m | Deep Green (0.25, 0.48, 0.20) | Lush valley grass |
| 80–150m | Brown (0.42, 0.32, 0.20) | Hillside dirt |
| 150–300m | Slate Grey (0.45, 0.45, 0.48) | Mountain rock |
| 500–650m | White (0.95, 0.95, 0.98) | Alpine snow |

Blending uses `smoothstep` + `mix` — the first transition (grass→dirt) spans 80–150m, the second (dirt→rock) spans 150–300m, and the third (rock→snow) spans 500–650m. The 200m snow-free gap between rock and snow ensures that many mountains remain rocky-topped instead of being capped in white automatically.

---

## LOD System (5 Levels)

The vertex count is controlled by the chunk step size per LOD, but since Phase 1, all LODs compute height at full floating-point precision (the old `floor(h * lodScale)` quantization is removed).

| LOD | Step (units between vertices) | Vertices per chunk | Render distance (chunks) | Render distance (world units) | Pool capacity | Height range |
|---|---|---|---|---|---|---|---|
| near | 1 | 51×51 = 2601 | 5 | 250 | 250 | -10 to 1000 |
| mid | 5 | 11×11 = 121 | 12 | 600 | 700 | -5 to 800 |
| far | 10 | 6×6 = 36 | 25 | 1250 | 2400 | -2 to 400 |
| ultra | 25 | 3×3 = 9 | 50 | 2500 | 8700 | -1 to 100 |
| horizon | 50 | 2×2 = 4 | 100 | 5000 | 32000 | -1 to 25 |

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
|---|---|---|---|---|
| `CHUNK_SIZE` | 50 | world.js | Size of one chunk in world units |
| `TILE_SIZE` | 50 | terrain.js | Size of one cached heightmap tile |
| `MAX_TILES` | 4000 | terrain.js | LRU cache capacity |
| `heightScale` | 20 | both | Base multiplier for all height contributions |
| `baseScale` | 0.02 | both | Frequency of base undulation |
| `hillScale` | 0.04 | both | Frequency of hill layer |
| `mountainScale` | 0.003 | both | Not currently used in computeHeight |
| `mountainHeightMultiplier` | 4.0 | both | Not currently used in computeHeight |
| `ridgeScale` | 0.001 | both | Present as uniform but unused in computeHeight |
| `continentScale` | 0.0005 | both | Frequency of continent basin |
| `warpScale` | 0.002 | both | Frequency of domain warp field |
| `flatnessFactor` | 0.2 | both | How flat the base terrain is |
| `hillHeightMultiplier` | 0.1 | both | How pronounced hills are |
| `mountainBaseScale` | 0.0003 (hardcoded) | both | Frequency of mountain base dome |
| `mountainBaseAmplitude` | 800 (hardcoded) | both | Max height of mountain base dome |
| `mountainRegionScale` | 0.0005 (hardcoded) | both | Frequency of range-placement noise |
| `RENDER_DISTANCE_HORIZON` | 100 | world.js | Furthest chunk ring (5000 units) |
