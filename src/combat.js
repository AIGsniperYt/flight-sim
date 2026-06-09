import * as THREE from 'three';
import { getHeightScaled } from './terrain.js';

const MAX_CRATERS = 64;
const craters = [];
const _craterVec4 = [];
const MISSILE_SPEED = 400;
const MISSILE_LIFETIME = 8;
const BULLET_SPEED = 1200;
const BULLET_LIFETIME = 2.5;
const AUTO_FIRE_INTERVAL = 0.1;
const EXPLOSION_PARTICLES = 250;
const EXPLOSION_DURATION = 800;

export function getMaxCraters() { return MAX_CRATERS; }
export let triggerHeld = false;

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

// ---- Bullets ----
const _bulletGeom = new THREE.SphereGeometry(0.3, 4, 4);
const _bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
let _bullets = [];
let _vHeld = false;
let _vFireTimer = 0;

export function setTriggerHeld(held) { _vHeld = held; }

export function fireMachineGun(origin, direction) {
    const mesh = new THREE.Mesh(_bulletGeom, _bulletMat);
    mesh.position.copy(origin);
    _group.add(mesh);
    _bullets.push({ mesh, dir: direction.clone().normalize(), life: 0 });
}

export function updateAutoFire(dt, origin, dir) {
    if (!_vHeld) { _vFireTimer = 0; return; }
    _vFireTimer -= dt;
    if (_vFireTimer <= 0) {
        _vFireTimer = AUTO_FIRE_INTERVAL;
        for (let i = 0; i < 3; i++) {
            const spread = new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.02,
                0
            );
            fireMachineGun(origin, dir.clone().add(spread).normalize());
        }
    }
}

export function update(dt) {
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

    // Bullets
    for (let i = _bullets.length - 1; i >= 0; i--) {
        const b = _bullets[i];
        b.life += dt;
        b.mesh.position.addScaledVector(b.dir, BULLET_SPEED * dt);
        const terrainY = getHeightScaled(b.mesh.position.x, b.mesh.position.z, 1.0);
        if (b.mesh.position.y < terrainY || b.life > BULLET_LIFETIME) {
            _group.remove(b.mesh);
            _bullets.splice(i, 1);
        }
    }

    // Explosion particles
    for (let i = _explosions.length - 1; i >= 0; i--) {
        const e = _explosions[i];
        const elapsed = performance.now() - e.userData.start;
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

export function getMissileCount() { return _missiles.length; }
export function getBulletCount() { return _bullets.length; }
