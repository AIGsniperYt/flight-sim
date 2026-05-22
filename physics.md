A plane is not “moving forward and turning”, as initially implemented with linear forces and acceleration
It is a rigid body with forces acting on it constantly
where these forces create motion

# Fundamental forces:

# Lift (upward force):

Good — this is exactly the right mindset. If you understand the physics, you won’t just *code a flight sim*, you’ll actually *own it*.

We’ll build this properly, but I’ll layer it so you:

* understand the real aerodynamics
* then map it directly into code

---

# ✈️ CORE IDEA (what flight actually is)

A plane is NOT “moving forward and turning”.

It is:

> A rigid body with forces acting on it every frame

Those forces are what create motion.

---

# The 4 fundamental forces

## 1. Lift (upward force)

$L = \tfrac{1}{2} \rho v^2 S C_L$

### What each term means:

* $\rho$ = air density
* $v$ = airspeed (VERY important → squared)
* $S$ = wing area
* $C_L$ = lift coefficient (depends on angle)

---

### Intuition:

* Faster → MUCH more lift (because of $v^2$)
* Tilt nose up → more lift (until stall)

---

## 2. Drag (air resistance)

$D = \tfrac{1}{2} \rho v^2 S C_D$

* Opposes motion  
* Also grows with $v^2$

---

## 4. Weight (gravity)

$W = mg$


# Key concepts to understand

---

## 1. Velocity is NOT direction of the plane

* Plane might point ↑
* But velocity might still be → forward

> Lift depends on **velocity direction**, NOT where nose points

---

## 2. Angle of Attack (AoA)

This is EVERYTHING.

> AoA = angle between:

* velocity vector
* wing direction (forward of plane)

---

### Why it matters:

* Small AoA → normal lift
* Higher AoA → more lift
* Too high → **STALL**

---

## 3. Lift direction

Lift is:

* perpendicular to airflow (velocity)

NOT always “up”

This is why planes can:

* fly upside down
* turn using banking

---

## 4. Banking = turning

Planes don’t turn like boats and steer left or right.

They:

1. Roll (tilt wings)
2. Lift tilts sideways
3. Sideways lift = turning force

---

# 🧩 NOW → HOW THIS MAPS TO CODE

We build a real system:

---

## STEP 1 — Replace fake movement

### Add:

```js
let velocity = new THREE.Vector3();
let acceleration = new THREE.Vector3();
```

---

## STEP 2 — Get directions from plane

```js
const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(plane.quaternion);
const up = new THREE.Vector3(0, 1, 0).applyQuaternion(plane.quaternion);
const right = new THREE.Vector3(1, 0, 0).applyQuaternion(plane.quaternion);
```

---

## STEP 3 — Airspeed

```js
const speed = velocity.length();
```

---

## STEP 4 — Angle of Attack (KEY)

```js
const velDir = velocity.clone().normalize();
const aoa = Math.acos(THREE.MathUtils.clamp(velDir.dot(forward), -1, 1));
```

---

## STEP 5 — Lift coefficient (nonlinear)

Real aircraft:

* lift increases with AoA
* then drops after stall

Simple realistic curve:

```js
const stallAngle = THREE.MathUtils.degToRad(15);

let Cl;
if (aoa < stallAngle) {
    Cl = aoa * 5; // linear region
} else {
    Cl = stallAngle * 5 * Math.max(0, 1 - (aoa - stallAngle));
}
```

---

## STEP 6 — Lift force

```js
const rho = 1.225; // air density
const wingArea = 20;

const liftMag = 0.5 * rho * speed * speed * wingArea * Cl;

// direction: perpendicular to velocity, along wing "up"
const liftDir = up.clone().projectOnPlane(velDir).normalize();

const lift = liftDir.multiplyScalar(liftMag);
```

---

## STEP 7 — Drag

```js
const Cd = 0.02 + Cl * Cl * 0.04; // induced drag

const dragMag = 0.5 * rho * speed * speed * wingArea * Cd;

const drag = velDir.clone().multiplyScalar(-dragMag);
```

---

## STEP 8 — Thrust

```js
const thrustForce = forward.clone().multiplyScalar(throttle * 500);
```

---

## STEP 9 — Gravity

```js
const gravity = new THREE.Vector3(0, -9.81 * 50, 0);
```

(scale it for game feel)

---

## STEP 10 — Combine forces

```js
acceleration.set(0, 0, 0);
acceleration.add(lift);
acceleration.add(drag);
acceleration.add(thrustForce);
acceleration.add(gravity);
```

---

## STEP 11 — Integrate motion

```js
velocity.add(acceleration.clone().multiplyScalar(dt));
plane.position.add(velocity.clone().multiplyScalar(dt));
```

---

# RESULT

Once this is in:

You will instantly feel:

* Speed matters
* Turning feels natural
* Climbing requires speed
* Stall = falling out of sky

---

.
