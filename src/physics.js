const planeGeometry = new THREE.BoxGeometry(4, 1, 8);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xff3aae, metalness: 0.2, roughness: 0.6 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);

let speed = 300;
let throttle = 1.0;
const pitchSpeed = THREE.MathUtils.degToRad(100);
const rollSpeed = THREE.MathUtils.degToRad(200);
const yawSpeed = THREE.MathUtils.degToRad(40);
const angularDamping = 2.0;

const angVel = new THREE.Vector3(0, 0, 0);

let targetBank = 0;
const maxAutoBank = THREE.MathUtils.degToRad(40);
const autoBankStrength = 1.2;
const bankLerpSpeed = 3.0;

const keyboard = {};

const cameraOffset = new THREE.Vector3(0, 5, 18);
const cameraLerp = 0.12;
const lookAtLerp = 0.25;

let cameraTargetPos = new THREE.Vector3();
let cameraLookAtPos = new THREE.Vector3();

export function initPhysics(scene) {
    scene.add(plane);
    plane.position.set(0, 60, 0);

    document.addEventListener('keydown', (event) => keyboard[event.code] = true);
    document.addEventListener('keyup', (event) => keyboard[event.code] = false);

    window.addEventListener("keydown", function(e) {
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) > -1) {
            e.preventDefault();
        }
    }, false);
}

export function updatePlane(dt) {
    const pitchInput = (keyboard['KeyW'] ? 1 : 0) + (keyboard['KeyS'] ? -1 : 0);
    const rollInput  = (keyboard['KeyA'] ? 1 : 0) + (keyboard['KeyD'] ? -1 : 0);
    const yawInput   = (keyboard['KeyQ'] ? 1 : 0) + (keyboard['KeyE'] ? -1 : 0);

    const desiredPitch = pitchInput * pitchSpeed;
    const desiredRoll  = rollInput  * rollSpeed;
    const desiredYaw   = yawInput   * yawSpeed;

    const angBlend = Math.min(1, 8 * dt);
    angVel.x += (desiredPitch - angVel.x) * angBlend;
    angVel.y += (desiredYaw   - angVel.y) * angBlend;
    angVel.z += (desiredRoll  - angVel.z) * angBlend;

    angVel.multiplyScalar(Math.max(0, 1 - angularDamping * dt));

    plane.rotateX(angVel.x * dt);
    plane.rotateY(angVel.y * dt);
    plane.rotateZ(angVel.z * dt);
    plane.translateZ(-speed * throttle * dt);

    if (plane.position.y < 2) plane.position.y = 2;
}

function normalizeAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
}

function shortestAngleDiff(a, b) {
    const diff = normalizeAngle(b - a);
    return diff;
}

export function updateCamera(camera, dt) {
    const worldOffset = cameraOffset.clone().applyQuaternion(plane.quaternion);
    camera.position.copy(plane.position).add(worldOffset);

    camera.quaternion.copy(plane.quaternion);
}

export function getPlane() {
    return plane;
}
