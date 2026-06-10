import * as THREE from 'three';
import { getHeightScaled } from './terrain.js';

const MAX_CRATERS = 64;
const craters = [];
const _craterVec4 = [];
const MISSILE_SPEED = 400;
const MISSILE_LIFETIME = 8;
const BULLET_SPEED = 1050;
const BULLET_LIFETIME = 2.5;
const CONTINUOUS_FIRE_INTERVAL = 0.066;
const EXPLOSION_PARTICLES = 250;
const EXPLOSION_DURATION = 800;
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3(0, 0, -1);
const _enemyDir = new THREE.Vector3();
const _bulletMid = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
let _nextEnemyId = 0;

export function getMaxCraters() { return MAX_CRATERS; }

export function explode(pos, radius, depth) {
    const terrainY = getHeightScaled(pos.x, pos.z, 1.0);
    const h = pos.y - terrainY;
    if (h > radius * 2) return;
    craters.push({ x: pos.x, z: pos.z, radius, depth });
    if (craters.length > MAX_CRATERS) craters.splice(0, craters.length - MAX_CRATERS);
}

export function getCraterArray() {
    _craterVec4.length = 0;
    for (let i = 0; i < MAX_CRATERS; i++) {
        const c = craters[i];
        _craterVec4.push(c ? c.x : 0, c ? c.z : 0, c ? c.radius : 1, c ? c.depth : 0);
    }
    return _craterVec4;
}

export function getCraterCount() {
    return craters.length;
}

let _scene = null;
let _group = null;
let _explosions = [];

export function init(scene) {
    _scene = scene;
    _group = new THREE.Group();
    scene.add(_group);
}

// ---- Explosion visual ----
function spawnExplosion(pos, speed) {
    const count = EXPLOSION_PARTICLES;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];
    const spread = 20 + speed * 0.3;
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3] = pos.x + (Math.random() - 0.5) * 4;
        positions[i3 + 1] = pos.y + (Math.random() - 0.5) * 4;
        positions[i3 + 2] = pos.z + (Math.random() - 0.5) * 4;
        const b = 0.5 + Math.random() * 0.5;
        colors[i3] = 1;
        colors[i3 + 1] = 0.4 + Math.random() * 0.3;
        colors[i3 + 2] = 0;
        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * spread,
            Math.random() * spread * 0.8,
            (Math.random() - 0.5) * spread
        ));
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 5 + speed * 0.03,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.Points(geom, mat);
    mesh.userData.velocities = velocities;
    mesh.userData.start = performance.now();
    _group.add(mesh);
    _explosions.push(mesh);
}

// ---- Missiles ----
const _missileGeom = new THREE.ConeGeometry(0.8, 3, 6);
const _missileMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
let _missiles = [];

export function fireMissile(origin, direction, quaternion) {
    const mesh = new THREE.Mesh(_missileGeom, _missileMat);
    mesh.position.copy(origin);
    mesh.quaternion.copy(quaternion);
    _group.add(mesh);
    _missiles.push({ mesh, dir: direction.clone().normalize(), life: 0 });
}

// ---- Bullets (tracer streaks) ----
const _tracerGeom = new THREE.BoxGeometry(0.15, 0.15, 1.0);
const _tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffdd00,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const STREAK_LEN = 35;
let _bullets = [];
let _vHeld = false;
let _vFireTimer = 0;

export function setTriggerHeld(held) { _vHeld = held; }

export function fireMachineGun(origin, direction) {
    const mesh = new THREE.Mesh(_tracerGeom, _tracerMat);
    mesh.position.copy(origin);
    _group.add(mesh);
    _bullets.push({
        mesh,
        dir: direction.clone().normalize(),
        life: 0,
        tipPos: origin.clone()
    });
}

// ---- Enemy planes ----
const _enemyGeom = new THREE.BoxGeometry(4, 1, 8);
const _enemyMat = new THREE.MeshStandardMaterial({ color: 0xff3333, metalness: 0.2, roughness: 0.6 });
const _enemyTrailLen = 40;
let _enemies = [];

export function updateAutoFire(dt, origin, dir) {
    if (!_vHeld) { _vFireTimer = CONTINUOUS_FIRE_INTERVAL; return; }
    _vFireTimer -= dt;
    if (_vFireTimer <= 0) {
        _vFireTimer = CONTINUOUS_FIRE_INTERVAL;
        _v3.copy(dir);
        _v3.x += (Math.random() - 0.5) * 0.015;
        _v3.y += (Math.random() - 0.5) * 0.015;
        _v3.z += (Math.random() - 0.5) * 0.005;
        _v3.normalize();
        fireMachineGun(origin, _v3);
    }
}

export function spawnEnemy(position, heading) {
    const mesh = new THREE.Mesh(_enemyGeom, _enemyMat);
    mesh.position.copy(position);
    mesh.rotation.y = heading;
    _group.add(mesh);

    const trailPos = new Float32Array(_enemyTrailLen * 3);
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeom.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({
        color: 0xff6666, transparent: true, opacity: 0.3
    });
    const trailLine = new THREE.Line(trailGeom, trailMat);
    trailLine.frustumCulled = false;
    _group.add(trailLine);

    _enemies.push({
        mesh, trail: { line: trailLine, pos: trailPos, count: 0, head: 0 },
        heading, speed: 150 + Math.random() * 80, id: _nextEnemyId++
    });
}

export function getEnemyData() {
    return _enemies.map(e => ({
        id: e.id,
        x: e.mesh.position.x,
        y: e.mesh.position.y,
        z: e.mesh.position.z
    }));
}

export function getProjectilePositions() {
    const out = [];
    for (const m of _missiles) out.push(m.mesh.position.clone());
    for (const b of _bullets) out.push(b.tipPos.clone());
    return out;
}

export function getMissileCount() { return _missiles.length; }
export function getBulletCount() { return _bullets.length; }
export function getEnemyCount() { return _enemies.length; }

// ---- Update ----
export function update(dt) {
    const now = performance.now();

    // Missiles
    for (let i = _missiles.length - 1; i >= 0; i--) {
        const m = _missiles[i];
        m.life += dt;
        m.mesh.position.addScaledVector(m.dir, MISSILE_SPEED * dt);
        const terrainY = getHeightScaled(m.mesh.position.x, m.mesh.position.z, 1.0);
        if (m.mesh.position.y < terrainY || m.life > MISSILE_LIFETIME) {
            if (m.mesh.position.y < terrainY) {
                explode(m.mesh.position, 40, 20);
                spawnExplosion(m.mesh.position, 100);
            }
            _group.remove(m.mesh);
            _missiles.splice(i, 1);
        }
    }

    // Bullets (tracer streaks)
    for (let i = _bullets.length - 1; i >= 0; i--) {
        const b = _bullets[i];
        b.life += dt;
        b.tipPos.addScaledVector(b.dir, BULLET_SPEED * dt);

        const trailLen = Math.min(STREAK_LEN, b.life * BULLET_SPEED);
        _bulletMid.copy(b.tipPos).addScaledVector(b.dir, -trailLen * 0.5);
        b.mesh.position.copy(_bulletMid);
        b.mesh.scale.z = trailLen;
        b.mesh.quaternion.setFromUnitVectors(_zAxis, b.dir);

        const terrainY = getHeightScaled(b.tipPos.x, b.tipPos.z, 1.0);
        if (b.tipPos.y < terrainY || b.life > BULLET_LIFETIME) {
            _group.remove(b.mesh);
            _bullets.splice(i, 1);
        }
    }

    // Enemies + their trails
    for (const e of _enemies) {
        const time = now * 0.001;
        _enemyDir.set(0, 0, -1).applyAxisAngle(_up, e.heading);

        const terrainY = getHeightScaled(e.mesh.position.x, e.mesh.position.z, 1.0);
        const targetAlt = terrainY + 200 + Math.sin(time * 0.7 + e.id * 3) * 40;
        const altDiff = targetAlt - e.mesh.position.y;
        e.mesh.position.y += altDiff * dt * 2;

        e.mesh.position.addScaledVector(_enemyDir, e.speed * dt);

        e.heading += Math.sin(time * 0.4 + e.id * 3) * 0.3 * dt;
        const pitch = Math.sin(time * 0.5 + e.id * 2) * 0.12;
        const roll = Math.sin(time * 0.6 + e.id * 4) * 0.08;
        e.mesh.quaternion.setFromEuler(new THREE.Euler(pitch, e.heading, roll));

        // Update trail (ring buffer)
        const tr = e.trail;
        tr.head = (tr.head + 1) % _enemyTrailLen;
        const i3 = tr.head * 3;
        tr.pos[i3] = e.mesh.position.x;
        tr.pos[i3 + 1] = e.mesh.position.y;
        tr.pos[i3 + 2] = e.mesh.position.z;
        if (tr.count < _enemyTrailLen) tr.count++;
        tr.line.geometry.attributes.position.needsUpdate = true;

        // Copy ring buffer to draw order
        const arr = tr.pos;
        const count = tr.count;
        if (count >= 2) {
            const drawArr = tr.line.geometry.attributes.position.array;
            for (let j = 0; j < count; j++) {
                const srcIdx = ((tr.head - j) % _enemyTrailLen + _enemyTrailLen) % _enemyTrailLen;
                drawArr[j * 3] = arr[srcIdx * 3];
                drawArr[j * 3 + 1] = arr[srcIdx * 3 + 1];
                drawArr[j * 3 + 2] = arr[srcIdx * 3 + 2];
            }
            tr.line.geometry.setDrawRange(0, count);
            tr.line.geometry.attributes.position.needsUpdate = true;
        }
    }

    // Explosion particles
    for (let i = _explosions.length - 1; i >= 0; i--) {
        const e = _explosions[i];
        const elapsed = now - e.userData.start;
        if (elapsed > EXPLOSION_DURATION) {
            _group.remove(e);
            e.geometry.dispose();
            e.material.dispose();
            _explosions.splice(i, 1);
            continue;
        }
        const progress = elapsed / EXPLOSION_DURATION;
        const pos = e.geometry.attributes.position;
        const vel = e.userData.velocities;
        for (let j = 0; j < pos.count; j++) {
            const dt2 = 1 / 60;
            pos.array[j * 3] += vel[j].x * dt2;
            pos.array[j * 3 + 1] += vel[j].y * dt2 - 5 * dt2;
            pos.array[j * 3 + 2] += vel[j].z * dt2;
        }
        pos.needsUpdate = true;
        e.material.opacity = 1 - progress;
    }
}
