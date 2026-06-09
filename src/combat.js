import * as THREE from 'three';
import { getHeightScaled } from './terrain.js';

const MAX_CRATERS = 64;
const craters = [];
const _craterVec4 = [];

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
        const c = craters[i] || null;
        _craterVec4.push(c ? c.x : 0, c ? c.z : 0, c ? c.radius : 1, c ? c.depth : 0);
    }
    return _craterVec4;
}

export function getCraterCount() {
    return craters.length;
}

let _projectiles = [];
let _entities = [];

export function update(dt) {

}

export function fireMachineGun(origin, direction) {

}

export function fireMissile(origin, target) {

}

export function getProjectiles() { return _projectiles; }
export function getEntities() { return _entities; }
