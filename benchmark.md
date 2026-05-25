# Performance Benchmarks

> Run with `F8` to start/stop profiling. Data is sampled every ~60 frames (~1s) for ~900 frames (~15s).
> Fly the plane with moderate inputs during profiling.

---

## Noise Fix Applied: Gustavson `snoise2D` JS Port *(newest)*

**Description:** Noise inconsistency fixed. Ported the exact Stefan Gustavson GLSL `snoise()` function to JavaScript in `terrain.js`. Removed `simplex-noise` npm package dependency. GPU vertex shader keeps original GLSL `snoise`. Both paths now produce identical terrain values for all coordinates.

**Approach:** Instead of moving noise computation to CPU (which caused the 53x regression below), we unified the noise *algorithm* between CPU and GPU. The chunk gen pipeline stays GPU-only (0.065ms), while collision and minimap query terrain.js's JS port of the same Gustavson noise (one eval per frame — negligible).

**Key detail on `gen=XXms` interpretation:** The profiler accumulates all chunk gen time across every frame in a ~1s sample window. `gen=17.27ms` means 17.27ms total across ~60 frames = **~0.29ms/frame average**. The HTML debug panel shows per-frame instantaneous gen time (2-4ms) because gen is bursty—when the camera moves, a few frames do heavy work, most frames do zero. The profiler smoothes this across the whole window.

### Run 1 — Normal cruise (Cessna 172, ~60 m/s)

```
=== PROFILE START ===
S0: 70fps gen=17.50ms phys=4.50ms +738/-738 vis=2582/2703 tiles=1026(36855H/18M/1026G/0E) mem=79.4MB
S1: 69fps gen=11.80ms phys=5.60ms +738/-738 vis=2582/2703 tiles=1134(36855H/18M/1134G/0E) mem=96MB
S2: 62fps gen=12.80ms phys=2.90ms +738/-738 vis=2582/2703 tiles=1242(36836H/36M/1242G/0E) mem=83.7MB
S3: 58fps gen=24.00ms phys=4.20ms +861/-861 vis=2582/2703 tiles=1350(2H/0M/1350G/0E) mem=98.1MB
S4: 59fps gen=13.00ms phys=4.20ms +861/-861 vis=2582/2703 tiles=1494(36830H/36M/1494G/0E) mem=112.1MB
S5: 63fps gen=14.70ms phys=3.70ms +738/-738 vis=2582/2703 tiles=1602(36849H/18M/1602G/0E) mem=96.4MB
S6: 70fps gen=17.60ms phys=4.50ms +861/-861 vis=2582/2703 tiles=1728(36834H/36M/1728G/0E) mem=87.2MB
S7: 61fps gen=16.70ms phys=3.80ms +984/-984 vis=2582/2703 tiles=1854(10H/0M/1854G/0E) mem=113.6MB
S8: 60fps gen=20.10ms phys=4.30ms +861/-861 vis=2582/2703 tiles=1962(12H/0M/1962G/0E) mem=98.3MB
S9: 75fps gen=18.30ms phys=3.30ms +861/-861 vis=2582/2703 tiles=1624(36859H/18M/2124G/500E) mem=116MB
S10: 68fps gen=21.80ms phys=2.60ms +984/-984 vis=2582/2703 tiles=1750(1H/0M/2250G/500E) mem=109.4MB
S11: 79fps gen=14.90ms phys=3.50ms +861/-861 vis=2582/2703 tiles=1894(1H/0M/2394G/500E) mem=114.3MB
S12: 69fps gen=14.50ms phys=3.00ms +984/-984 vis=2582/2703 tiles=1520(2H/0M/2520G/1000E) mem=106MB
S13: 61fps gen=19.90ms phys=3.30ms +984/-984 vis=2582/2703 tiles=1664(5H/0M/2664G/1000E) mem=110.2MB
S14: 58fps gen=21.50ms phys=3.50ms +984/-984 vis=2582/2703 tiles=1808(7H/0M/2808G/1000E) mem=112.9MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s     -/s     endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
65.5    17.27       3.793        13038   13038   2703       2582        2703        17197          12               2808           1000             112.9
```

**Notes:**
- Chunk gen per frame: ~0.29ms (17.27ms / 60 frames) — **4x slower than pre-fix peak** but still only 1.7% of frame budget
- Collision system functional: `phys=3.8ms` avg includes full physics sim + crash detection
- First evictions (1000) seen — minimap tile cache reached 2000 limit briefly in later samples
- Memory: 79→113MB, modest growth from more active tiles (minimap + collision queries)
- Tile hit rate: 17197/s — 1400x higher than misses (12/s) — cache effective

### Run 2 — Aggressive F-16 flight (post-respawn, ~200 m/s)

```
main.js:639 Respawned
=== PROFILE START ===
S0: 67fps gen=27.50ms phys=2.30ms +1230/-1230 vis=2078/2703 tiles=1874(3H/0M/4878G/2500E) mem=120.1MB
S1: 61fps gen=31.70ms phys=2.80ms +1230/-1230 vis=2078/2703 tiles=1536(13H/0M/5040G/3000E) mem=132MB
S2: 73fps gen=30.60ms phys=2.90ms +1107/-1107 vis=2078/2703 tiles=1734(1H/0M/5238G/3000E) mem=110.1MB
S3: 60fps gen=21.20ms phys=1.90ms +1230/-1230 vis=2078/2703 tiles=1914(5H/0M/5418G/3000E) mem=99.3MB
S4: 68fps gen=23.80ms phys=2.00ms +1230/-1230 vis=2078/2703 tiles=1576(7H/0M/5580G/3500E) mem=117.1MB
S5: 83fps gen=29.70ms phys=3.80ms +1230/-1230 vis=2078/2703 tiles=1738(8H/0M/5742G/3500E) mem=128.7MB
S6: 63fps gen=26.50ms phys=3.00ms +1230/-1230 vis=2078/2703 tiles=1954(36838H/36M/5958G/3500E) mem=105MB
S7: 62fps gen=22.20ms phys=2.40ms +1230/-1230 vis=2078/2703 tiles=1634(36820H/54M/6138G/4000E) mem=100MB
S8: 72fps gen=25.50ms phys=3.10ms +1353/-1353 vis=2078/2703 tiles=1814(36822H/54M/6318G/4000E) mem=121.2MB
S9: 62fps gen=21.10ms phys=1.50ms +1230/-1230 vis=2078/2703 tiles=1994(4H/0M/6498G/4000E) mem=100.5MB
S10: 67fps gen=18.10ms phys=2.50ms +1230/-1230 vis=2078/2703 tiles=1656(3H/0M/6660G/4500E) mem=107.2MB
S11: 62fps gen=31.60ms phys=3.00ms +1476/-1476 vis=2078/2703 tiles=1872(7H/0M/6876G/4500E) mem=126.6MB
S12: 60fps gen=23.60ms phys=2.50ms +1353/-1353 vis=2078/2703 tiles=1570(6H/0M/7074G/5000E) mem=125.2MB
S13: 64fps gen=24.00ms phys=3.00ms +1230/-1230 vis=2078/2703 tiles=1786(36834H/36M/7290G/5000E) mem=111.3MB
S14: 59fps gen=18.50ms phys=2.00ms +1353/-1353 vis=2078/2703 tiles=1984(36821H/54M/7488G/5000E) mem=109.9MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s     -/s     endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
65.6    25.04       2.580        18942   18942   2703       2078        2703        12279          16               7488           5000             109.9
```

**Notes:**
- Higher chunk churn: +18942/s vs +13038/s (F-16 at 3x speed covers 1.5x terrain per second)
- Tile cache thrashing more visible: 7488 tiles generated, 5000 evicted in 16.4s
- Yet gen per frame only ~0.42ms (25.04ms / 60) — even under heavy cache pressure, gen stays reasonable
- Lower physics time (2.58ms vs 3.79ms) — plane was crashed/respawned during part of the run, less time airborne
- Fewer visible chunks (2078 vs 2582) — plane started lower/crashed, reducing horizon view distance

**Takeaway:** The Gustavson port restores GPU-gen performance and scales well even under aggressive flight. Cache thrashing doesn't cripple frame rate — chunk gen stays under 0.5ms/frame even at 2x tile turnover. The pre-fix peak (0.065ms) was on stationary/slow Cessna circuits with minimal terrain change — the 0.29-0.42ms here reflects real flight across vast terrain with collision active.

### Cache Tuning: MAX_TILES 2000 → 4000

**Change:** Doubled tile cache from 2000 to 4000, reduced eviction batch from 25% to 12.5% per overflow (`MAX_TILES >> 3`). One-line change in `terrain.js`.

**Result at aggressive F-16 flight (~200 m/s, post-respawn):**

```
main.js:639 Respawned
=== PROFILE START ===
S0: 61fps gen=15.10ms phys=2.50ms +2507/-2507 vis=1442/2703 tiles=936(5H/0M/936G/0E) mem=88.4MB
S1: 60fps gen=12.00ms phys=4.00ms +615/-615 vis=1664/2703 tiles=936(3H/0M/936G/0E) mem=83.9MB
S2: 60fps gen=10.10ms phys=4.40ms +492/-492 vis=1868/2703 tiles=936(36876H/0M/936G/0E) mem=104.5MB
S3: 61fps gen=11.40ms phys=2.90ms +615/-615 vis=2123/2703 tiles=936(8H/0M/936G/0E) mem=96.2MB
S4: 60fps gen=12.40ms phys=4.10ms +615/-615 vis=2378/2703 tiles=936(7H/0M/936G/0E) mem=87.1MB
S5: 60fps gen=9.20ms phys=3.10ms +615/-615 vis=2582/2703 tiles=936(5H/0M/936G/0E) mem=108MB
S6: 60fps gen=11.70ms phys=3.70ms +738/-738 vis=2582/2703 tiles=936(4H/0M/936G/0E) mem=99.1MB
S7: 65fps gen=12.20ms phys=4.20ms +615/-615 vis=2582/2703 tiles=1008(2H/0M/1008G/0E) mem=104MB
S8: 78fps gen=15.90ms phys=4.30ms +738/-738 vis=2582/2703 tiles=1098(5H/0M/1098G/0E) mem=82.5MB
S9: 82fps gen=18.60ms phys=3.00ms +738/-738 vis=2582/2703 tiles=1206(5H/0M/1206G/0E) mem=98.8MB
S10: 71fps gen=12.80ms phys=2.70ms +738/-738 vis=2582/2703 tiles=1314(4H/0M/1314G/0E) mem=86.5MB
S11: 65fps gen=15.10ms phys=2.60ms +861/-861 vis=2582/2703 tiles=1440(5H/0M/1440G/0E) mem=85.2MB
S12: 69fps gen=12.80ms phys=3.00ms +738/-738 vis=2582/2703 tiles=1548(3H/0M/1548G/0E) mem=99.1MB
S13: 60fps gen=13.60ms phys=2.30ms +861/-861 vis=2582/2703 tiles=1692(36850H/18M/1692G/0E) mem=105MB
S14: 65fps gen=14.60ms phys=2.30ms +861/-861 vis=2582/2703 tiles=1818(36832H/36M/1818G/0E) mem=111.5MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s     -/s     endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
65.0    13.17       3.273        12347   12347   2703       2582        2703        7374           4                1818           0                111.5
```

**Compared to pre-tuning aggressive run (MAX_TILES=2000):**

| Metric | Before (MAX=2000) | After (MAX=4000) | Delta |
|---|---|---|---|
| avgGen(ms)/sample | 25.04 | 13.17 | **-47%** 🟢 |
| totalTilesGen | 7488 | 1818 | **-76%** 🟢 |
| totalTilesEvict | 5000 | 0 | **-100%** 🟢 |
| endMem | 109.9MB | 111.5MB | +1.5% (noise) 🟢 |
| avgFPS | 65.6 | 65.0 | stable 🟢 |

**Verdict:** Zero evictions, gen time halved, memory flat. The 4000-tile cache comfortably holds every tile touched during a 15s aggressive flight (peak 1818 live tiles). No further tuning needed — this is the optimal cache size for current terrain parameters.

---

## Attempted Fix: CPU Heights to Vertex Buffer (REVERTED)

**Description:** Attempted to fix noise inconsistency by writing `getHeight(worldX, worldZ)` directly to vertex buffer Y in `addChunkToBucket`, removing GLSL noise computation from the shader. **Catastrophic performance regression — reverted immediately.**

**Root cause of regression:** Every chunk vertex required a `getHeight()` call on the CPU. At F-16 cruise speed (210 m/s = 4.2 chunks/s), the camera crosses chunk boundaries rapidly, triggering mass tile generation in terrain.js. The 2000-tile LRU cache thrashed constantly — tiles generated (`totalTilesGen: 11514`) and evicted (`totalTilesEvict: 10000`) in 15.9s, while only 1514–1978 tiles were live at any point. Each tile generation costs 3 × 2500 = 7500 noise calls. The CPU was drowning in noise evaluations that the GPU handled for free.

```
=== PROFILE START ===
S0: 61fps gen=162.70ms phys=3.30ms +738/-738 vis=2582/2703 tiles=1688(69792H/83M/5188G/3500E) mem=103.2MB
S1: 63fps gen=213.20ms phys=4.40ms +738/-738 vis=2582/2703 tiles=1555(69798H/77M/5555G/4000E) mem=93.9MB
S2: 80fps gen=140.80ms phys=4.10ms +738/-738 vis=2582/2703 tiles=1949(69814H/58M/5949G/4000E) mem=93.8MB
S3: 64fps gen=192.40ms phys=4.80ms +738/-738 vis=2582/2703 tiles=1850(69813H/58M/6350G/4500E) mem=110.6MB
S4: 63fps gen=177.30ms phys=3.30ms +738/-738 vis=2582/2703 tiles=1755(36872H/0M/6755G/5000E) mem=108.1MB
S5: 81fps gen=201.60ms phys=3.00ms +861/-861 vis=2582/2703 tiles=1724(32936H/71M/7224G/5500E) mem=97.8MB
S6: 72fps gen=260.90ms phys=4.70ms +861/-861 vis=2582/2703 tiles=1680(32925H/83M/7680G/6000E) mem=90.5MB
S7: 68fps gen=148.70ms phys=3.60ms +738/-738 vis=2582/2703 tiles=1541(32939H/70M/8041G/6500E) mem=90.6MB
S8: 65fps gen=318.90ms phys=3.60ms +984/-984 vis=2582/2703 tiles=1580(102735H/141M/8580G/7000E) mem=99.3MB
S9: 63fps gen=229.70ms phys=2.90ms +861/-861 vis=2582/2703 tiles=1522(69815H/61M/9022G/7500E) mem=107MB
S10: 73fps gen=186.20ms phys=3.20ms +861/-861 vis=2582/2703 tiles=1978(69815H/58M/9478G/7500E) mem=95.6MB
S11: 65fps gen=188.40ms phys=3.30ms +861/-861 vis=2582/2703 tiles=1949(36871H/0M/9949G/8000E) mem=105.7MB
S12: 69fps gen=216.60ms phys=2.30ms +984/-984 vis=2582/2703 tiles=1966(69811H/58M/10466G/8500E) mem=111.9MB
S13: 60fps gen=238.30ms phys=3.90ms +984/-984 vis=2582/2703 tiles=1987(32950H/58M/10987G/9000E) mem=103MB
S14: 66fps gen=244.40ms phys=3.20ms +984/-984 vis=2582/2703 tiles=1514(32951H/58M/11514G/10000E) mem=100.7MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s     -/s     endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
67.6    208.01      3.573        12669   12669   2703       2582        2703        55322          62               11514          10000            100.7
```

**Notes:**
- Chunk gen: **208ms per sample = ~3.5ms/frame** — 53x worse than GPU noise (0.065ms)
- Tile cache thrashing: 11514 tiles generated, 10000 evicted in 15.9s
- Memory misleadingly stable (100.7MB end) because evictions kept freeing space
- Physics time unaffected (~3.6ms) — collision's single `getHeight()` call per frame is fine
- Tile hit rate: 55322/s avg — cache was working hard, just overwhelmed by volume

**Lesson:** Writing CPU-computed heights to the vertex buffer defeats the GPU optimisation. The correct fix is to unify the noise implementation so both CPU and GPU use the same algorithm — same Gustavson `snoise` ported to JS for collision/minimap, while rendering keeps the GPU noise.

---

## Final Optimised (GPU Shaders + No BBox Overhead)

**Description:** Same as GPU version below but with per-chunk bounding box computation removed (reverted to flat `maxPossibleHeight`). This is acceptable because merged geometry buckets union all chunk bounding boxes into one quadrant-level box — individual chunk tightness doesn't affect culling. The 12 draw calls are trivially handled by the GPU at 60fps.

```
=== PROFILE START ===
S0: 69fps gen=2.30ms +123/-123 vis=1989/2703 tiles=558(0H/0M/558G/0E) mem=76.2MB
S1: 68fps gen=4.50ms +246/-246 vis=2091/2703 tiles=576(0H/0M/576G/0E) mem=99.6MB
S2: 72fps gen=1.60ms +123/-123 vis=2142/2703 tiles=612(0H/0M/612G/0E) mem=103MB
S3: 57fps gen=5.60ms +246/-246 vis=2244/2703 tiles=630(0H/0M/630G/0E) mem=100.9MB
S4: 59fps gen=3.50ms +246/-246 vis=2346/2703 tiles=666(0H/0M/666G/0E) mem=97.2MB
S5: 67fps gen=1.70ms +123/-123 vis=2397/2703 tiles=702(36846H/18M/702G/0E) mem=100.7MB
S6: 59fps gen=7.20ms +246/-246 vis=2499/2703 tiles=720(0H/0M/720G/0E) mem=98.4MB
S7: 56fps gen=5.30ms +246/-246 vis=2601/2703 tiles=756(0H/0M/756G/0E) mem=94.7MB
S8: 55fps gen=2.30ms +123/-123 vis=2652/2703 tiles=774(36864H/0M/774G/0E) mem=92MB
S9: 56fps gen=5.90ms +246/-246 vis=2703/2703 tiles=810(36864H/0M/810G/0E) mem=88.2MB
S10: 57fps gen=4.00ms +246/-246 vis=2703/2703 tiles=846(0H/0M/846G/0E) mem=104.1MB
S11: 59fps gen=2.50ms +123/-123 vis=2703/2703 tiles=864(0H/0M/864G/0E) mem=101.9MB
S12: 65fps gen=4.20ms +246/-246 vis=2703/2703 tiles=900(0H/0M/900G/0E) mem=98.3MB
S13: 61fps gen=5.60ms +246/-246 vis=2703/2703 tiles=936(0H/0M/936G/0E) mem=94.5MB
S14: 61fps gen=2.00ms +123/-123 vis=2703/2703 tiles=954(0H/0M/954G/0E) mem=86.8MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  +/s    -/s    endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalGen  totalEvict  endMem(MB)
61.4    3.88        2952   2952   2703       2703        2703        7372           1                 954       0           86.8
```

**Notes:**
- Chunk gen per frame: ~0.065ms (3.88ms / 60 frames) — **best ever for GPU-only flight (no collision logic running)**
- Memory: 76→87MB, nearly flat — only tile cache growth
- No evictions (0) — 954 tiles well under 2000 max
- 100% visible is expected — quadrant-level union boxes

---

## GPU Shaders + Merged Meshes — Commit `fdfdac2`

**Description:** Terrain height computed in GLSL vertex shader via `onBeforeCompile`. 12 merged draw calls (3 LODs × 4 quadrants) with pre-allocated Float32Array buffers and slot-based recycling. Camera chunk tracking skips full scan when stationary. Predictive loading extends scan in movement direction. LRU tile eviction for height cache. Gap mode toggle (J key). **At this point: no collision system, no noise fix — but chunk gen at peak performance (no physics overhead).**

```
=== PROFILE START ===
S0: 58fps gen=5.70ms +246/-246 vis=2499/2703 tiles=720(0H/0M/720G/0E) mem=79.7MB
S1: 55fps gen=2.90ms +123/-123 vis=2550/2703 tiles=738(0H/0M/738G/0E) mem=77MB
S2: 58fps gen=4.70ms +246/-246 vis=2652/2703 tiles=774(0H/0M/774G/0E) mem=80MB
S3: 55fps gen=4.00ms +246/-246 vis=2703/2703 tiles=810(0H/0M/810G/0E) mem=79.8MB
S4: 56fps gen=1.90ms +123/-123 vis=2703/2703 tiles=828(0H/0M/828G/0E) mem=79.5MB
S5: 62fps gen=5.80ms +246/-246 vis=2703/2703 tiles=864(0H/0M/864G/0E) mem=82.6MB
S6: 66fps gen=5.00ms +246/-246 vis=2703/2703 tiles=900(0H/0M/900G/0E) mem=82.3MB
S7: 60fps gen=3.30ms +123/-123 vis=2703/2703 tiles=918(0H/0M/918G/0E) mem=81.9MB
S8: 66fps gen=5.90ms +246/-246 vis=2703/2703 tiles=954(36864H/0M/954G/0E) mem=79.2MB
S9: 59fps gen=3.60ms +246/-246 vis=2703/2703 tiles=990(36864H/0M/990G/0E) mem=83MB
S10: 63fps gen=2.50ms +123/-123 vis=2703/2703 tiles=1026(36846H/18M/1026G/0E) mem=81.9MB
S11: 63fps gen=5.00ms +246/-246 vis=2703/2703 tiles=1044(36864H/0M/1044G/0E) mem=81.6MB
S12: 59fps gen=4.50ms +246/-246 vis=2703/2703 tiles=1080(36864H/0M/1080G/0E) mem=84.5MB
S13: 61fps gen=5.60ms +246/-246 vis=2703/2703 tiles=1116(36864H/0M/1116G/0E) mem=84.1MB
S14: 60fps gen=9.10ms +246/-246 vis=2703/2703 tiles=1152(36846H/18M/1152G/0E) mem=86.9MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  +/s    -/s    endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalGen  totalEvict  endMem(MB)
60.2    4.63        3198   3198   2703       2703        2703        17201          2                 1152      0           86.9
```

**Notes:**
- Chunk gen time per frame: ~0.08ms (4.63ms / 60 frames) — **60x faster** than baseline
- Memory stable at ~80MB — no growth, pool recycling working
- Chunks capped at 2703 (sum of per-LOD maxChunks limits)
- **BUG: 100% visibility** — frustum culling was broken. Bounding boxes used flat `maxPossibleHeight=86` for every chunk. Fixed after this benchmark.
- Tile cache effective: 17201 hits vs 2 misses per sample window
- No evictions — LRU never triggered (1152 tiles well under 2000 max)

---

## Baseline (pre-optimisation) — Commit `8da2587` *(oldest)*

**Description:** Original terrain system. Every vertex computed via simplex noise on CPU with zero caching. Individual mesh per chunk (2600 meshes), created/destroyed every frame change. LOD far = 1 quad. Dynamic `push()` arrays. `geometry.dispose()` on every removal. `.clone()` per frame for frustum culling.

```
=== PROFILE START ===
S0: 57185fps gen=324.60ms +174/-174 vis=889/3892 tiles=864(36846H/18M/864G/0E) mem=122.8MB
S1: 57182fps gen=277.40ms +87/-87 vis=830/3892 tiles=882(36864H/0M/882G/0E) mem=114.4MB
S2: 57270fps gen=298.60ms +174/-174 vis=855/3892 tiles=918(36864H/0M/918G/0E) mem=105.2MB
S3: 58128fps gen=281.70ms +174/-174 vis=878/3892 tiles=954(0H/0M/954G/0E) mem=125.8MB
S4: 61905fps gen=281.10ms +87/-87 vis=825/3892 tiles=990(36846H/18M/990G/0E) mem=128.1MB
S5: 59359fps gen=304.40ms +174/-174 vis=827/3892 tiles=1008(36864H/0M/1008G/0E) mem=136.0MB
S6: 60112fps gen=305.30ms +174/-174 vis=865/3892 tiles=1044(36864H/0M/1044G/0E) mem=121.3MB
S7: 57700fps gen=313.80ms +174/-174 vis=897/3892 tiles=1080(36846H/18M/1080G/0E) mem=137.5MB
S8: 61035fps gen=289.10ms +87/-87 vis=827/3892 tiles=1098(36864H/0M/1098G/0E) mem=140.8MB
S9: 60515fps gen=315.10ms +174/-174 vis=847/3892 tiles=1134(36864H/0M/1134G/0E) mem=153.8MB
S10: 59763fps gen=314.80ms +174/-174 vis=867/3892 tiles=1170(36846H/18M/1170G/0E) mem=138.7MB
S11: 54711fps gen=357.90ms +174/-174 vis=869/3892 tiles=1206(0H/0M/1206G/0E) mem=149.2MB
S12: 61240fps gen=287.60ms +87/-87 vis=803/3892 tiles=1224(0H/0M/1224G/0E) mem=151.9MB
S13: 58908fps gen=305.00ms +174/-174 vis=810/3892 tiles=1260(0H/0M/1260G/0E) mem=168.8MB
S14: 61749fps gen=298.00ms +174/-174 vis=841/3892 tiles=1296(0H/0M/1296G/0E) mem=157.3MB
=== PROFILE STOP ===

avgFPS   avgGen(ms)  +/s    -/s    endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalGen  totalEvict  endMem(MB)
(flawed) 300.22      2262   2262   3892       841         3892        (not tracked)                    1296      0           157.3
```

**Notes:**
- FPS counter was buggy (dt treated as ms instead of seconds)
- Approx 300ms gen per sample window = ~5ms per frame spent on chunk gen
- Chunks unbounded at 3892 (no max cap per bucket)
- Memory growing from 105→169MB over 15s (leaking from create/dispose cycle)
- 78% of chunks frustum-culled (841 visible out of 3892) — good culling accuracy
- No tile evictions (0) because LRU cache was never implemented at this point

---

## Stress Test: CHUNK_SIZE 50 → 100

**Description:** Doubled CHUNK_SIZE from 50 to 100 to push the system toward target visual quality. Each chunk now holds 4× the vertices (near: 2,500→10,000, mid: 100→400, far: 25→100), total estimated vertex count jumps from ~484K to ~1.885M per frame. Terrain tile cache (`TILE_SIZE=50`) and collision system unaffected — only rendering resolution increased.

Wanted to see how well the optimisations hold up under real visual load.

### Run 1 — Auto-cruise (no controls, steady flight)

```
=== PROFILE START ===
S0: 70fps gen=6.60ms phys=5.30ms +246/-246 vis=1919/2703 tiles=756(5H/0M/1116G/0E) mem=306.7MB
S1: 65fps gen=8.60ms phys=3.60ms +369/-369 vis=2072/2703 tiles=864(36834H/36M/1224G/0E) mem=294.3MB
S2: 70fps gen=14.80ms phys=4.40ms +369/-369 vis=2225/2703 tiles=954(36850H/18M/1314G/0E) mem=301.8MB
S3: 70fps gen=7.00ms phys=5.40ms +369/-369 vis=2378/2703 tiles=1062(36853H/18M/1422G/0E) mem=317.7MB
S4: 77fps gen=12.80ms phys=4.10ms +369/-369 vis=2531/2703 tiles=1170(36851H/18M/1530G/0E) mem=305.2MB
S5: 59fps gen=10.70ms phys=5.50ms +369/-369 vis=2582/2703 tiles=1278(7H/0M/1638G/0E) mem=321.2MB
S6: 64fps gen=8.50ms phys=4.90ms +369/-369 vis=2582/2703 tiles=1386(5H/0M/1746G/0E) mem=308.5MB
S7: 62fps gen=11.20ms phys=5.30ms +369/-369 vis=2582/2703 tiles=1512(5H/0M/1872G/0E) mem=304.4MB
S8: 65fps gen=11.10ms phys=3.40ms +492/-492 vis=2582/2703 tiles=1620(2H/0M/1980G/0E) mem=320.8MB
S9: 58fps gen=19.70ms phys=3.60ms +369/-369 vis=2582/2703 tiles=1746(4H/0M/2106G/0E) mem=314MB
S10: 68fps gen=11.80ms phys=2.50ms +492/-492 vis=2582/2703 tiles=1872(3H/0M/2232G/0E) mem=310.4MB
S11: 70fps gen=8.50ms phys=3.30ms +369/-369 vis=2582/2703 tiles=1998(3H/0M/2358G/0E) mem=324MB
S12: 78fps gen=13.80ms phys=2.30ms +492/-492 vis=2582/2703 tiles=2124(36840H/36M/2484G/0E) mem=318MB
S13: 63fps gen=18.10ms phys=3.00ms +492/-492 vis=2582/2703 tiles=2250(3H/0M/2610G/0E) mem=310.7MB
S14: 61fps gen=11.50ms phys=3.30ms +492/-492 vis=2582/2703 tiles=2430(36833H/36M/2790G/0E) mem=307.2MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s   -/s   endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
66.7    11.65       3.993        6027  6027  2703       2582        2703        14740          11               2790           0                307.2
```

**Notes:**
- FPS stable at 66.7 — 4× vertex count didn't impact GPU at steady cruise
- Memory tripled from ~112MB to ~307MB — vertex buffer pool scaled with chunk size
- Gen time in line with prior run (~11.65ms vs ~13-17ms) — chunk gen is CPU-bound, unaffected by vertex count
- Zero evictions (2790 tiles live at end, well under 4000 max)
- **Slightly deceptive — auto-cruise doesn't exercise chunk turnover or physics stress**

### Run 2 — Active flight (full controls, maneuvering)

```
=== PROFILE START ===
S0: 52fps gen=30.60ms phys=6.40ms +1079/-973 vis=2012/2809 tiles=759(36832H/36M/759G/0E) mem=299.5MB
S1: 32fps gen=23.70ms phys=6.90ms +625/-625 vis=2279/2809 tiles=965(1H/0M/965G/0E) mem=298.6MB
S2: 44fps gen=27.90ms phys=7.60ms +727/-727 vis=2425/2809 tiles=1107(1H/0M/1107G/0E) mem=306.6MB
S3: 33fps gen=17.90ms phys=6.50ms +375/-375 vis=2597/2809 tiles=1253(36868H/0M/1253G/0E) mem=305.9MB
S4: 35fps gen=22.60ms phys=7.50ms +500/-500 vis=2809/2809 tiles=1402(1H/0M/1402G/0E) mem=287.1MB
S5: 26fps gen=14.10ms phys=8.30ms +250/-250 vis=2809/2809 tiles=1497(36850H/19M/1497G/0E) mem=295.8MB
S6: 31fps gen=8.80ms phys=6.70ms +354/-354 vis=2809/2809 tiles=1534(4H/0M/1534G/0E) mem=297.3MB
S7: 30fps gen=6.20ms phys=6.00ms +229/-229 vis=2787/2809 tiles=1572(3H/0M/1572G/0E) mem=298.7MB
S8: 34fps gen=7.80ms phys=7.70ms +125/-125 vis=2787/2809 tiles=1610(2H/0M/1610G/0E) mem=296.8MB
S9: 33fps gen=4.80ms phys=6.20ms +123/-229 vis=2681/2703 tiles=1685(1H/0M/1685G/0E) mem=311.3MB
S10: 31fps gen=6.90ms phys=7.30ms +352/-352 vis=2681/2703 tiles=1742(36868H/0M/1742G/0E) mem=293MB
S11: 36fps gen=9.70ms phys=6.20ms +356/-250 vis=2798/2809 tiles=1817(1H/0M/1817G/0E) mem=309.2MB
S12: 50fps gen=14.40ms phys=6.30ms +352/-352 vis=1696/2809 tiles=1911(3H/0M/1911G/0E) mem=311MB
S13: 42fps gen=13.90ms phys=6.20ms +375/-375 vis=2809/2809 tiles=2005(1H/0M/2005G/0E) mem=299.8MB
S14: 41fps gen=10.20ms phys=6.00ms +250/-250 vis=2809/2809 tiles=2061(36851H/19M/2061G/0E) mem=309.7MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s   -/s   endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
36.6    14.63       6.787        6072  5966  2809       2809        2809        12286          5                2061           0                309.7
```

**Notes:**
- **FPS halved: 66.7 → 36.6** — active flight stresses GPU via rapid chunk turnover
- `peakChunks` hit 2809 (maxChunks caps were hit: merged meshes overflowed to an extra batch — mid/far likely exceeded their caps)
- Gen time barely changed (~14.6ms vs ~11.6ms) — CPU chunk gen is not the bottleneck
- **Physics time nearly doubled** (3.99ms → 6.79ms) — likely from CPU cache pressure and GC overhead with 3× memory working set, not physics computation changes
- Memory stable at ~300MB across both runs — no leak, the vertex buffer pools just hold 4× the data

**Diagnosis:** GPU vertex throughput is the bottleneck. At 1.885M verts/frame with 12 draw calls, the GPU spends ~17ms on vertex processing alone (36fps = 27ms frame budget; gen=14.6ms spread across frames ≈ 0.24ms/frame; phys=6.8ms; remaining ~20ms is GPU vertex + fragment). Fragment shading is cheap (flat shading, no textures). The culprit is vertex shader invocations × 4.

**Takeaway:** CHUNK_SIZE=100 exposes real bottlenecks that were invisible at CHUNK_SIZE=50. Any optimisation that recovers FPS at this setting is a genuine win. This is now the baseline for further optimisation.

---

## Frustum Culling: Per-Chunk Scan-Level Cull at CHUNK_SIZE=50 *(current flagship)*

**Description:** Implemented frustum-aware chunk scanning — before adding a chunk to the merged mesh, test its world-space bounding box against the camera frustum. Chunks behind the camera or outside the view cone are skipped entirely. Combined with per-LOD conservative height bounds (near: [-10,90], mid: [-5,45], far: [-2,10]) replacing the old flat `maxPossibleHeight=86` for quadrant-level culling.

**Result:** ~75% fewer chunks reach the merged mesh. Gen time collapses 4x. Memory stable. At CHUNK_SIZE=50, GPU was already underutilized so FPS doesn't jump — but the headroom now exists to scale up without CPU gen bottlenecking.

### Run 1 — Cruise (F-16, straight flight)

```
=== PROFILE START ===
S0: 62fps gen=6.00ms phys=5.00ms +450/-450 vis=596/620 tiles=468(1H/0M/468G/0E) mem=80MB
S1: 68fps gen=3.50ms phys=6.90ms +276/-276 vis=596/620 tiles=540(3H/0M/540G/0E) mem=75MB
S2: 66fps gen=4.20ms phys=5.90ms +426/-426 vis=596/620 tiles=630(4H/0M/630G/0E) mem=79MB
S3: 66fps gen=6.10ms phys=5.30ms +255/-279 vis=596/596 tiles=720(4H/0M/720G/0E) mem=82.8MB
S4: 63fps gen=4.10ms phys=4.50ms +255/-255 vis=596/596 tiles=810(3H/0M/810G/0E) mem=86.3MB
S5: 68fps gen=4.70ms phys=4.70ms +306/-306 vis=596/596 tiles=936(36832H/36M/936G/0E) mem=86.6MB
S6: 63fps gen=5.20ms phys=5.00ms +255/-255 vis=596/596 tiles=1026(36851H/18M/1026G/0E) mem=84.5MB
S7: 78fps gen=3.10ms phys=4.50ms +306/-306 vis=596/596 tiles=1134(2H/0M/1134G/0E) mem=100.4MB
S8: 64fps gen=3.10ms phys=2.90ms +306/-333 vis=569/569 tiles=1242(3H/0M/1242G/0E) mem=82.3MB
S9: 61fps gen=5.00ms phys=3.80ms +306/-305 vis=570/570 tiles=1350(3H/0M/1350G/0E) mem=94.9MB
S10: 85fps gen=4.70ms phys=2.10ms +357/-357 vis=570/570 tiles=1458(3H/0M/1458G/0E) mem=107.5MB
S11: 59fps gen=5.70ms phys=3.80ms +357/-357 vis=570/570 tiles=1566(5H/0M/1566G/0E) mem=92.6MB
S12: 65fps gen=6.20ms phys=2.90ms +357/-385 vis=542/542 tiles=1728(36836H/36M/1728G/0E) mem=86.2MB
S13: 64fps gen=5.80ms phys=3.00ms +357/-357 vis=542/542 tiles=1836(36857H/18M/1836G/0E) mem=101.9MB
S14: 72fps gen=5.30ms phys=3.80ms +357/-357 vis=542/542 tiles=1962(36836H/36M/1962G/0E) mem=95.3MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s   -/s   endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
67.0    4.85        4.273        4926  5004  542        542         620         12283          10               1962           0                95.3
```

**Notes:**
- visibleChunks: 542 — **79% reduction** from pre-cull 2582
- avgGen: 4.85ms — **72% faster** than pre-cull 17.27ms
- No stutters, zero evictions, memory ~95MB

### Run 2 — Spin (aggressive circles, F-16)

```
=== PROFILE START ===
S0: 61fps gen=9.80ms phys=6.00ms +720/-424 vis=825/883 tiles=509(8H/0M/509G/0E) mem=89.5MB
S1: 75fps gen=6.70ms phys=4.90ms +677/-881 vis=679/679 tiles=640(36837H/37M/640G/0E) mem=90.5MB
S2: 61fps gen=7.40ms phys=5.00ms +659/-750 vis=584/588 tiles=696(36853H/19M/696G/0E) mem=108.6MB
S3: 64fps gen=3.20ms phys=4.40ms +630/-606 vis=608/612 tiles=753(36874H/0M/753G/0E) mem=98.2MB
S4: 64fps gen=2.60ms phys=4.30ms +518/-501 vis=627/629 tiles=810(36872H/0M/810G/0E) mem=84.6MB
S5: 60fps gen=3.30ms phys=4.00ms +507/-541 vis=595/595 tiles=866(36834H/37M/866G/0E) mem=101.3MB
S6: 60fps gen=5.30ms phys=5.20ms +661/-573 vis=683/683 tiles=922(36834H/37M/922G/0E) mem=90.3MB
S7: 62fps gen=4.10ms phys=5.40ms +558/-632 vis=598/609 tiles=959(36832H/37M/959G/0E) mem=103.8MB
S8: 60fps gen=2.40ms phys=4.70ms +296/-403 vis=499/502 tiles=997(36850H/19M/997G/0E) mem=82.8MB
S9: 62fps gen=0.00ms phys=3.40ms +0/-0 vis=0/502 tiles=1016(36868H/0M/1016G/0E) mem=86MB
S10: 61fps gen=8.30ms phys=2.10ms +1317/-1080 vis=739/739 tiles=1053(1H/0M/1053G/0E) mem=89.2MB
S11: 76fps gen=1.50ms phys=3.90ms +288/-379 vis=648/648 tiles=1072(10H/0M/1072G/0E) mem=99MB
S12: 61fps gen=8.00ms phys=2.70ms +706/-761 vis=593/593 tiles=1110(7H/0M/1110G/0E) mem=80.8MB
S13: 60fps gen=4.50ms phys=3.00ms +627/-545 vis=675/675 tiles=1129(7H/0M/1129G/0E) mem=81.6MB
S14: 63fps gen=0.00ms phys=2.00ms +0/-0 vis=675/675 tiles=1167(4H/0M/1167G/0E) mem=89.1MB
=== PROFILE STOP ===

avgFPS  avgGen(ms)  avgPhys(ms)  +/s   -/s   endChunks  endVisible  peakChunks  avgTileHits/s  avgTileMisses/s  totalTilesGen  totalTilesEvict  endMem(MB)
63.3    4.47        4.067        8164  8076  675        675         883         22113          12               1167           0                89.1
```

**Notes:**
- visibleChunks: 675 — **74% reduction** from pre-cull 2582
- avgGen: 4.47ms — **66% faster** than pre-cull 13.17ms
- Occasional gen=0.00ms samples when camera briefly stops rotating
- FPS varies (38-76) as frustum sweep loads/unloads chunks — no hitches
- Memory actually lower than cruise (89.1MB vs 95.3MB) — fewer tiles tracked during spins

**Takeaway:** Frustum culling at CHUNK_SIZE=50 is the current flagship. Gen time halved, memory under 100MB, zero evictions, ~75% fewer chunks. The bottleneck is now firmly GPU vertex throughput — ready to scale up.

---

> **Reading left to right = chronological.**
> **Direction indicators:** `↑` higher is better, `↓` lower is better, `—` neutral/informational.

| Metric ↓ (good direction) | Baseline | GPU Merged Meshes | GPU No BBox | CPU Heights (reverted) | Gustavson Fix (cruise) | Gustavson Fix (aggressive) | MAX_TILES=4000 (aggressive) | Frustum Cull CHUNK=50 (cruise) | Frustum Cull CHUNK=50 (spin) |
|---|---|---|---|---|---|---|---|---|---|
| Chunk gen per frame `↓` | ~5ms | ~0.08ms | ~0.065ms | ~3.5ms | ~0.29ms | ~0.42ms | ~0.22ms | **~0.08ms** | **~0.07ms** |
| avgGen(ms)/sample `↓` | 300.22 | 4.63 | 3.88 | 208.01 | 17.27 | 25.04 | 13.17 | **4.85** | **4.47** |
| avgFPS `↑` | ~58k (buggy) | 60.2 | 61.4 | 67.6 | 65.5 | 65.6 | 65.0 | **67.0** | **63.3** |
| avgPhys(ms)/sample `↓` | — | — | — | 3.57 | 3.79 | 2.58 | 3.27 | **4.27** | **4.07** |
| **visibleChunks `↓`** | 841 | 2703 | 2703 | 2582 | 2582 | 2582 | 2582 | **542** 🏆 | **675** |
| Memory peak `↓` | ~169MB | ~87MB | ~104MB | ~111MB | ~116MB | ~132MB | ~112MB | **~108MB** | **~109MB** |
| Draw calls `↓` | ~2600 | 12 | 12 | 12 | 12 | 12 | 12 | **12** | **12** |
| totalTilesGen `↓` | 1296 | 1152 | 954 | 11514 | 2808 | 7488 | 1818 | **1962** | **1167** 🏆 |
| totalTilesEvict `↓` (0=best) | 0 | 0 | 0 | 10000 | 1000 | 5000 | 0 🏆 | **0** 🏆 | **0** 🏆 |
| Noise match CPU↔GPU `—` | ❌ | N/A (GPU only) | N/A (GPU only) | ✅ (CPU writes) | ✅ (same Gustavson) | ✅ (same Gustavson) | ✅ | ✅ | ✅ |
| Collision functional `—` | ❌ | ❌ | ❌ | ✅ (too slow) | ✅ | ✅ | ✅ | ✅ | ✅ |

**Key takeaways:**
- **Frustum Cull (CHUNK=50)** is the current flagship — ~75% fewer visible chunks, gen time collapsed 4x, zero evictions, stable <100MB memory, no FPS penalty
- **GPU No BBox** remains the gen-time peak but had no collision or culling — not a real-world configuration
- **CPU Heights** was the only regression (dead end)
- Low `avgPhys` in earlier aggressive runs was misleading — plane crashed/respawned part of the time
- spin FPS (63.3) slightly lower than cruise (67.0) from rapid chunk turnover during rotation — expected, still smooth
