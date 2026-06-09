import * as THREE from 'three';
import { getHeightScaled } from './terrain.js';

const MAX_CRATERS = 64;
const craters = [];
const _craterVec4 = [];
const MISSILE_SPEED = 400;
const MISSILE_LIFETIME = 6;
const MISSILE_FUSE = 3;

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
let _missiles = [];
let _group = null;

export function init(scene) {
    _scene = scene;
    _group = new THREE.Group();
    scene.add(_group);
}

const _missileGeom = new THREE.ConeGeometry(0.8, 3, 6);
const _missileMat = new THREE.MeshBasicMaterial({ color: 0x888888 });

export function update(dt) {
    for (let i = _missiles.length - 1; i >= 0; i--) {
        const m = _missiles[i];
        m.life += dt;
        m.mesh.position.addScaledVector(m.dir, MISSILE_SPEED * dt);
        const terrainY = getHeightScaled(m.mesh.position.x, m.mesh.position.z, 1.0);
        if (m.mesh.position.y < terrainY || m.life > MISSILE_LIFETIME + MISSILE_FUSE) {
            explode(m.mesh.position, 25, 12);
            _group.remove(m.mesh);
            _missiles.splice(i, 1);
        }
    }
}

export function fireMissile(origin, direction, quaternion) {
    const mesh = new THREE.Mesh(_missileGeom, _missileMat);
    mesh.position.copy(origin);
    mesh.quaternion.copy(quaternion);
    _group.add(mesh);
    _missiles.push({
        mesh,
        dir: direction.clone().normalize(),
        life: 0
    });
}

export function getMissileCount() { return _missiles.length; }
