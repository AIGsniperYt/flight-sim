import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { updateChunks, getChunkStats } from './src/world.js';
import { initPhysics, updatePlane, updateCamera, getPlane } from './src/physics.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0005);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100000);
camera.position.y = 10;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0x87ceeb);

const controls = new PointerLockControls(camera, renderer.domElement);
document.addEventListener('click', () => controls.lock());

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 100, 50).normalize();
scene.add(light);

initPhysics(scene);

const frustum = new THREE.Frustum();
const viewProjectionMatrix = new THREE.Matrix4();

let debugVisible = true;
const debugDiv = document.createElement('div');
debugDiv.style.position = 'fixed';
debugDiv.style.top = '10px';
debugDiv.style.left = '10px';
debugDiv.style.padding = '10px';
debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
debugDiv.style.color = '#0f0';
debugDiv.style.fontFamily = 'monospace';
debugDiv.style.fontSize = '14px';
debugDiv.style.borderRadius = '8px';
debugDiv.style.display = 'block';
debugDiv.style.zIndex = '9999';
document.body.appendChild(debugDiv);

document.addEventListener('keydown', (event) => {
    if (event.code === 'F5') {
        event.preventDefault();
        debugVisible = !debugVisible;
        debugDiv.style.display = debugVisible ? 'block' : 'none';
    }
});

let lastFrameTime = performance.now();
let fps = 0;
let lastDebugUpdate = 0;
const DEBUG_INTERVAL = 200;

function updateDebug(dt) {
    const now = performance.now();
    if (now - lastDebugUpdate < DEBUG_INTERVAL) return;
    lastDebugUpdate = now;

    fps = Math.round(1000 / (dt || 16.67));
    let memUsage = 'N/A';
    if (performance.memory) {
        const usedMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
        const totalMB = (performance.memory.totalJSHeapSize / 1048576).toFixed(2);
        memUsage = `${usedMB} / ${totalMB} MB`;
    }
    if (debugVisible) {
        const stats = getChunkStats();
        const plane = getPlane();
        debugDiv.innerHTML = `
            <b>Debug Stats</b><br>
            FPS: ${fps}<br>
            Visible Chunks: ${stats.visibleChunks}/${stats.totalChunks}<br>
            Camera: (${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})<br>
            Plane: (${plane.position.x.toFixed(1)}, ${plane.position.y.toFixed(1)}, ${plane.position.z.toFixed(1)})<br>
            Memory: ${memUsage}
        `;
    }
}

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    camera.updateMatrixWorld();
    viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjectionMatrix);

    updateChunks(scene, camera, frustum);
    updatePlane(dt);
    updateCamera(camera);
    updateDebug(dt * 1000);

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
