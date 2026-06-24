import * as THREE from 'three';
import { getInputState, setInputValue } from './input.js';
import * as combat from './combat.js';
import { getPlane } from './physics.js';

const TOUCH_UI_ID = 'touchscreen-control-layer';
let uiRoot = null;
let joystickRoot = null;
let joystickKnob = null;
let btnFire = null;
let btnLock = null;
let btnAirbrake = null;
let settingsButton = null;
let settingsOverlay = null;
let lockModeActive = false;
let showSettingsTimeout = null;
let hasTouch = false;
let activePointers = new Map();

function createElement(tag, attrs = {}, style = {}) {
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    Object.assign(el.style, style);
    return el;
}

function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    const hasTouchPoints = navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    if (!hasTouchPoints) return false;
    if (window.matchMedia) {
        return window.matchMedia('(pointer: coarse)').matches;
    }
    return true;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getTouchPosition(event, element) {
    const rect = element.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function updateJoystickState(dx, dy, radius) {
    const normalizedX = clamp(dx / radius, -1, 1);
    const normalizedY = clamp(dy / radius, -1, 1);
    setInputValue('roll', -normalizedX);
    setInputValue('pitch', -normalizedY);
}

function resetJoystick() {
    if (!joystickKnob) return;
    joystickKnob.style.transform = 'translate3d(0px, 0px, 0px)';
    setInputValue('roll', 0);
    setInputValue('pitch', 0);
}

function onJoystickPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const origin = { x: event.clientX, y: event.clientY };
    activePointers.set(pointerId, origin);
    joystickRoot.setPointerCapture(pointerId);
    updateJoystickPointer(event);
}

function updateJoystickPointer(event) {
    if (!joystickRoot || !joystickKnob) return;
    const rect = joystickRoot.getBoundingClientRect();
    const radius = rect.width * 0.35;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const limitedDistance = Math.min(distance, radius);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * limitedDistance;
    const knobY = Math.sin(angle) * limitedDistance;
    joystickKnob.style.transform = `translate3d(${knobX}px, ${knobY}px, 0)`;
    updateJoystickState(knobX, knobY, radius);
}

function onJoystickPointerMove(event) {
    if (!activePointers.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    updateJoystickPointer(event);
}

function onJoystickPointerUp(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    joystickRoot.releasePointerCapture(event.pointerId);
    resetJoystick();
}

function toggleLockMode() {
    lockModeActive = !lockModeActive;
    if (btnLock) {
        btnLock.style.backgroundColor = lockModeActive ? 'rgba(255,180,0,0.95)' : 'rgba(0,0,0,0.4)';
        btnLock.textContent = lockModeActive ? 'LOCK 🔒' : 'LOCK';
    }
    combat.setPlayerLockTarget(lockModeActive ? combat.getPlayerLockTargetId() : null);
}

function onFireButton(event) {
    event.preventDefault();
    event.stopPropagation();
    const plane = getPlane();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(plane.quaternion);
    const origin = plane.position.clone().addScaledVector(dir, 10);
    const lockState = combat.getPlayerLockState();
    const lockTargetId = combat.getPlayerLockTargetId();
    let missileTarget = null;
    let missileLockType = 'none';
    if (lockTargetId !== null && lockState !== 'none') {
        missileTarget = { enemyId: lockTargetId };
        missileLockType = lockState;
    }
    combat.fireMissile(origin, dir, plane.quaternion.clone(), missileTarget, missileLockType);
}

function createTouchUI() {
    uiRoot = createElement('div', { id: TOUCH_UI_ID }, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '10001'
    });

    const controlsLayer = createElement('div', {}, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
    });
    uiRoot.appendChild(controlsLayer);

    // Joystick container
    const joystickContainer = createElement('div', {}, {
        position: 'absolute',
        left: '18px',
        bottom: '18px',
        width: '150px',
        height: '150px',
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.18)',
        border: '1px solid rgba(255,255,255,0.18)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
        touchAction: 'none'
    });
    joystickRoot = joystickContainer;
    controlsLayer.appendChild(joystickContainer);

    joystickKnob = createElement('div', {}, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '64px',
        height: '64px',
        marginLeft: '-32px',
        marginTop: '-32px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)',
        border: '2px solid rgba(255,255,255,0.85)',
        boxShadow: '0 0 18px rgba(255,255,255,0.12)',
        transition: 'transform 120ms ease-out'
    });
    joystickContainer.appendChild(joystickKnob);

    joystickContainer.addEventListener('pointerdown', onJoystickPointerDown);
    joystickContainer.addEventListener('pointermove', onJoystickPointerMove);
    joystickContainer.addEventListener('pointerup', onJoystickPointerUp);
    joystickContainer.addEventListener('pointercancel', onJoystickPointerUp);
    joystickContainer.addEventListener('lostpointercapture', onJoystickPointerUp);

    // Right-side controls
    const rightGroup = createElement('div', {}, {
        position: 'absolute',
        right: '18px',
        bottom: '18px',
        display: 'grid',
        gridTemplateColumns: 'auto',
        gap: '12px',
        pointerEvents: 'none'
    });
    controlsLayer.appendChild(rightGroup);

    btnFire = createElement('button', { type: 'button', innerHTML: 'FIRE' }, {
        width: '96px',
        height: '56px',
        borderRadius: '18px',
        border: 'none',
        background: 'rgba(255, 40, 40, 0.9)',
        color: '#fff',
        fontWeight: '700',
        fontSize: '16px',
        pointerEvents: 'auto',
        touchAction: 'manipulation'
    });
    rightGroup.appendChild(btnFire);
    btnFire.addEventListener('pointerdown', onFireButton);

    btnLock = createElement('button', { type: 'button', innerHTML: 'LOCK' }, {
        width: '96px',
        height: '56px',
        borderRadius: '18px',
        border: 'none',
        background: 'rgba(0,0,0,0.4)',
        color: '#fff',
        fontWeight: '700',
        fontSize: '16px',
        pointerEvents: 'auto',
        touchAction: 'manipulation'
    });
    rightGroup.appendChild(btnLock);
    btnLock.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleLockMode();
    });

    btnAirbrake = createElement('button', { type: 'button', innerHTML: 'BRAKE' }, {
        width: '96px',
        height: '56px',
        borderRadius: '18px',
        border: 'none',
        background: 'rgba(0,0,0,0.4)',
        color: '#fff',
        fontWeight: '700',
        fontSize: '16px',
        pointerEvents: 'auto',
        touchAction: 'manipulation'
    });
    rightGroup.appendChild(btnAirbrake);
    btnAirbrake.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setInputValue('airbrake', !getInputState().airbrake);
        btnAirbrake.style.background = getInputState().airbrake ? 'rgba(255,180,0,0.95)' : 'rgba(0,0,0,0.4)';
    });

    settingsButton = createElement('button', { type: 'button', innerHTML: '⚙' }, {
        position: 'absolute',
        top: '18px',
        right: '18px',
        width: '52px',
        height: '52px',
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(0,0,0,0.4)',
        color: '#fff',
        fontSize: '22px',
        pointerEvents: 'auto',
        touchAction: 'manipulation',
        boxShadow: '0 0 24px rgba(255,255,255,0.12)'
    });
    controlsLayer.appendChild(settingsButton);
    settingsButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSettingsOverlay();
    });

    settingsOverlay = createElement('div', {}, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '10002',
        padding: '18px',
        boxSizing: 'border-box',
        pointerEvents: 'auto'
    });
    settingsOverlay.addEventListener('pointerdown', (event) => {
        if (event.target === settingsOverlay) toggleSettingsOverlay(false);
    });

    const overlayContent = createElement('div', {}, {
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'rgba(10, 10, 10, 0.96)',
        borderRadius: '20px',
        padding: '24px',
        boxSizing: 'border-box',
        boxShadow: '0 0 32px rgba(0,0,0,0.35)'
    });
    settingsOverlay.appendChild(overlayContent);

    const title = createElement('h2', { innerText: 'Controls & Touch Settings' }, {
        margin: '0 0 14px 0',
        fontSize: '26px',
        letterSpacing: '0.03em'
    });
    overlayContent.appendChild(title);

    const description = createElement('p', { innerText: 'Use the left joystick for pitch/roll and the buttons for fire, lock, and brake. Throttle is handled by keyboard controls on desktop; touchscreen uses only the simplified HUD controls.' }, {
        margin: '0 0 18px 0',
        lineHeight: '1.55',
        color: 'rgba(255,255,255,0.78)'
    });
    overlayContent.appendChild(description);

    const keybindSection = createElement('div', {}, {
        marginBottom: '18px'
    });
    keybindSection.innerHTML = `
        <h3 style="margin:0 0 10px 0;font-size:20px;">Keyboard Shortcuts</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);width:32%;"><b>W/S</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Pitch up / down</td></tr>
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);"><b>A/D</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Roll left / right</td></tr>
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);"><b>Q/E</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Yaw left / right</td></tr>
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);"><b>Arrow Up / Down</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Increase / decrease throttle</td></tr>
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);"><b>Space</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Airbrake</td></tr>
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);"><b>F</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Fire missile</td></tr>
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);"><b>L</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Toggle lock mode</td></tr>
            <tr><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);"><b>C</b></td><td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);">Toggle freecam</td></tr>
        </table>
    `;
    overlayContent.appendChild(keybindSection);

    const note = createElement('p', { innerText: 'Advanced toggles like HUD, debug, wireframe, and trail are available through desktop keys or the settings panel on larger screens.' }, {
        margin: '0',
        lineHeight: '1.5',
        color: 'rgba(255,255,255,0.72)'
    });
    overlayContent.appendChild(note);

    const closeButton = createElement('button', { type: 'button', innerText: 'Close' }, {
        position: 'absolute',
        top: '18px',
        right: '18px',
        border: 'none',
        borderRadius: '50%',
        width: '42px',
        height: '42px',
        fontSize: '20px',
        background: 'rgba(255,255,255,0.08)',
        color: '#fff',
        pointerEvents: 'auto'
    });
    overlayContent.appendChild(closeButton);
    closeButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSettingsOverlay(false);
    });

    document.body.appendChild(uiRoot);
    document.body.appendChild(settingsOverlay);
    animateSettingsButton();
}

function animateSettingsButton() {
    if (!settingsButton) return;
    settingsButton.style.transition = 'transform 180ms ease, box-shadow 180ms ease';
    settingsButton.style.boxShadow = '0 0 16px rgba(255,255,255,0.3)';
    settingsButton.style.transform = 'scale(1.05)';
    clearTimeout(showSettingsTimeout);
    showSettingsTimeout = setTimeout(() => {
        if (!settingsButton) return;
        settingsButton.style.transform = 'scale(1)';
        settingsButton.style.boxShadow = '0 0 8px rgba(255,255,255,0.12)';
    }, 1800);
}

function toggleSettingsOverlay(forceState) {
    if (!settingsOverlay) return;
    const isOpen = settingsOverlay.style.display === 'flex';
    const nextState = typeof forceState === 'boolean' ? forceState : !isOpen;
    settingsOverlay.style.display = nextState ? 'flex' : 'none';
}

export function initTouchscreen(force = false) {
    if (!force && !isTouchDevice()) return false;
    if (uiRoot) return true;
    hasTouch = true;
    createTouchUI();
    return true;
}

export function teardownTouchscreen() {
    if (!uiRoot) return;
    uiRoot.remove();
    uiRoot = null;
    if (settingsOverlay) {
        settingsOverlay.remove();
        settingsOverlay = null;
    }
    activePointers.clear();
}
