const axisSources = {
    pitch: { keyboard: 0, touch: 0 },
    roll: { keyboard: 0, touch: 0 },
    yaw: { keyboard: 0, touch: 0 },
    throttle: { keyboard: 0, touch: 0 }
};

const touchState = {
    throttleActive: false,
    throttleValue: 0
};

const inputState = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleAxis: 0,
    throttleTarget: null,
    airbrake: false
};

let inputInitialized = false;

function clamp(value, min = -1, max = 1) {
    return Math.max(min, Math.min(max, value));
}

function recomputeAxes() {
    inputState.pitch = clamp(axisSources.pitch.keyboard + axisSources.pitch.touch);
    inputState.roll = clamp(axisSources.roll.keyboard + axisSources.roll.touch);
    inputState.yaw = clamp(axisSources.yaw.keyboard + axisSources.yaw.touch);
    inputState.throttleAxis = clamp(axisSources.throttle.keyboard + axisSources.throttle.touch);
    inputState.throttleTarget = touchState.throttleActive ? clamp(touchState.throttleValue, 0, 1) : null;
}

function onKeyboardAxis(code, pressed) {
    switch (code) {
        case 'KeyW': axisSources.pitch.keyboard = pressed ? 1 : 0; break;
        case 'KeyS': axisSources.pitch.keyboard = pressed ? -1 : 0; break;
        case 'KeyA': axisSources.roll.keyboard = pressed ? 1 : 0; break;
        case 'KeyD': axisSources.roll.keyboard = pressed ? -1 : 0; break;
        case 'KeyQ': axisSources.yaw.keyboard = pressed ? 1 : 0; break;
        case 'KeyE': axisSources.yaw.keyboard = pressed ? -1 : 0; break;
        case 'ArrowUp':
            axisSources.throttle.keyboard = pressed ? 1 : 0;
            if (pressed) touchState.throttleActive = false;
            break;
        case 'ArrowDown':
            axisSources.throttle.keyboard = pressed ? -1 : 0;
            if (pressed) touchState.throttleActive = false;
            break;
        case 'Space': inputState.airbrake = pressed; break;
        default: return;
    }
    recomputeAxes();
}

function handleKeyDown(event) {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        event.preventDefault();
    }
    onKeyboardAxis(event.code, true);
}

function handleKeyUp(event) {
    onKeyboardAxis(event.code, false);
}

export function initInput() {
    if (typeof document === 'undefined' || inputInitialized) return;
    document.addEventListener('keydown', handleKeyDown, { passive: false });
    document.addEventListener('keyup', handleKeyUp);
    inputInitialized = true;
}

export function getInputState() {
    return inputState;
}

export function setInputValue(field, value, source = 'touch') {
    if (field === 'throttle') {
        if (source === 'touch') {
            touchState.throttleActive = true;
            touchState.throttleValue = clamp(value, 0, 1);
        } else if (source === 'keyboard') {
            axisSources.throttle.keyboard = clamp(value);
            touchState.throttleActive = false;
        }
        recomputeAxes();
        return;
    }

    if (field in axisSources) {
        if (source === 'keyboard' || source === 'touch') {
            axisSources[field][source] = clamp(value);
            if (field === 'throttle' && source === 'keyboard') {
                touchState.throttleActive = false;
            }
        }
        recomputeAxes();
        return;
    }
    if (field === 'airbrake') {
        inputState.airbrake = !!value;
    }
}

export function resetInputState() {
    axisSources.pitch.touch = 0;
    axisSources.roll.touch = 0;
    axisSources.yaw.touch = 0;
    axisSources.throttle.touch = 0;
    axisSources.pitch.keyboard = 0;
    axisSources.roll.keyboard = 0;
    axisSources.yaw.keyboard = 0;
    axisSources.throttle.keyboard = 0;
    touchState.throttleActive = false;
    touchState.throttleValue = 0;
    inputState.pitch = 0;
    inputState.roll = 0;
    inputState.yaw = 0;
    inputState.throttleAxis = 0;
    inputState.throttleTarget = null;
    inputState.airbrake = false;
    recomputeAxes();
}
