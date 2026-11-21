import { Rng } from "./rng.ts";

export const FIXED_TICK_MS = 1000 / 60;
export const MAX_SPEED = 6;
export const ACCEL = 14;
export const RESET_PENALTY_S = 5;
export const COLLISION_PENALTY_S = 2;
export const GHOST_SAMPLE_CAP = 60 * 60; // 60 seconds of ticks

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Gate {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface Obstacle {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface Course {
  id: number;
  gates: Gate[];
  obstacles: Obstacle[];
  medals: { bronze: number; silver: number; gold: number };
}

export const COURSES: readonly Course[] = [
  {
    id: 0,
    gates: [
      { x: 10, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 20, y: 4, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 30, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 40, y: -3, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 50, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 60, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
    ],
    obstacles: [{ x: 25, y: 2, z: 0, radius: 1.5 }, { x: 45, y: -1, z: 0, radius: 1.5 }],
    medals: { bronze: 45, silver: 35, gold: 28 },
  },
  {
    id: 1,
    gates: [
      { x: 10, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 20, y: -4, z: 2, nx: 1, ny: 0, nz: 0 },
      { x: 30, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 40, y: 4, z: -2, nx: 1, ny: 0, nz: 0 },
      { x: 50, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 60, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
    ],
    obstacles: [{ x: 22, y: 0, z: 0, radius: 1.8 }, { x: 42, y: 0, z: 0, radius: 1.8 }],
    medals: { bronze: 50, silver: 40, gold: 32 },
  },
  {
    id: 2,
    gates: [
      { x: 10, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 20, y: 5, z: 3, nx: 1, ny: 0, nz: 0 },
      { x: 30, y: -3, z: -2, nx: 1, ny: 0, nz: 0 },
      { x: 40, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
      { x: 50, y: 2, z: -3, nx: 1, ny: 0, nz: 0 },
      { x: 60, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
    ],
    obstacles: [{ x: 18, y: 1, z: 1, radius: 1.6 }, { x: 35, y: 0, z: 0, radius: 2 }, { x: 52, y: -1, z: 0, radius: 1.6 }],
    medals: { bronze: 55, silver: 45, gold: 36 },
  },
];

export interface DroneSnapshot {
  courseId: number;
  gateIndex: number;
  position: Vec3;
  velocity: Vec3;
  ticks: number;
  penaltySeconds: number;
  finished: boolean;
  bestSamples: Vec3[];
  bestTime: number | null;
  handling: { sensitivity: number };
  rngState: number;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export class DroneCircuitSession {
  readonly rng: Rng;
  courseId = 0;
  gateIndex = 0;
  position: Vec3 = { x: 0, y: 0, z: 0 };
  velocity: Vec3 = { x: 0, y: 0, z: 0 };
  ticks = 0;
  penaltySeconds = 0;
  finished = false;
  bestSamples: Vec3[] = [];
  bestTime: number | null = null;
  handling = { sensitivity: 1 };
  throttle: Vec3 = { x: 0, y: 0, z: 0 };
  private accumulatorMs = 0;
  private currentSamples: Vec3[] = [];

  constructor(seed: string | number = "drone-circuit", courseId = 0, snapshot?: DroneSnapshot) {
    this.rng = new Rng(seed);
    if (snapshot !== undefined) validateSnapshot(snapshot);
    this.courseId = courseId;
    if (snapshot !== undefined) this.applySnapshot(snapshot);
  }

  get course(): Course {
    return COURSES[this.courseId];
  }

  setThrottle(axis: "x" | "y" | "z", value: number): void {
    this.throttle[axis] = Math.min(1, Math.max(-1, value));
  }

  advance(deltaMs: number): void {
    const step = Math.min(Math.max(0, deltaMs), 250); // stalls clamp catch-up
    this.accumulatorMs += step;
    while (this.accumulatorMs >= FIXED_TICK_MS && !this.finished) {
      this.accumulatorMs -= FIXED_TICK_MS;
      this.tick(FIXED_TICK_MS / 1000);
    }
  }

  private tick(dtSeconds: number): void {
    this.velocity.x += this.throttle.x * ACCEL * this.handling.sensitivity * dtSeconds;
    this.velocity.y += this.throttle.y * ACCEL * this.handling.sensitivity * dtSeconds;
    this.velocity.z += this.throttle.z * ACCEL * this.handling.sensitivity * dtSeconds;
    const speed = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      this.velocity.x *= scale;
      this.velocity.y *= scale;
      this.velocity.z *= scale;
    }
    const previous = { ...this.position };
    this.position.x += this.velocity.x * dtSeconds;
    this.position.y += this.velocity.y * dtSeconds;
    this.position.z += this.velocity.z * dtSeconds;
    this.ticks += 1;
    this.currentSamples.push({ ...this.position });
    if (this.currentSamples.length > GHOST_SAMPLE_CAP) this.currentSamples.shift();

    for (const obstacle of this.course.obstacles) {
      const delta = sub(this.position, obstacle);
      if (Math.hypot(delta.x, delta.y, delta.z) < obstacle.radius) {
        this.penaltySeconds += COLLISION_PENALTY_S;
        this.velocity = { x: 0, y: 0, z: 0 };
        const away = Math.hypot(delta.x, delta.y, delta.z) || 1;
        this.position.x = obstacle.x + (delta.x / away) * obstacle.radius;
        this.position.y = obstacle.y + (delta.y / away) * obstacle.radius;
        this.position.z = obstacle.z + (delta.z / away) * obstacle.radius;
      }
    }

    const gate = this.course.gates[this.gateIndex];
    if (gate !== undefined) {
      const normal = { x: gate.nx, y: gate.ny, z: gate.nz };
      const before = sub(previous, gate);
      const after = sub(this.position, gate);
      const crossed = dot(before, normal) <= 0 && dot(after, normal) > 0;
      const forward = dot(this.velocity, normal) > 0;
      if (crossed && forward && Math.hypot(after.y, after.z) <= 2) {
        this.gateIndex += 1;
        if (this.gateIndex >= this.course.gates.length) this.finish();
      }
    }
  }

  /** Reset returns to the last valid gate and applies exactly one penalty. */
  reset(): void {
    if (this.finished) return;
    this.penaltySeconds += RESET_PENALTY_S;
    this.velocity = { x: 0, y: 0, z: 0 };
    if (this.gateIndex === 0) {
      this.position = { x: 0, y: 0, z: 0 };
    } else {
      this.position = {
        x: this.course.gates[this.gateIndex - 1].x,
        y: this.course.gates[this.gateIndex - 1].y,
        z: this.course.gates[this.gateIndex - 1].z,
      };
    }
  }

  private finish(): void {
    this.finished = true;
    const time = this.ticks / 60 + this.penaltySeconds;
    if (this.bestTime === null || time < this.bestTime) {
      this.bestTime = time;
      this.bestSamples = this.currentSamples.map((sample) => ({ ...sample }));
    }
  }

  medal(): "gold" | "silver" | "bronze" | null {
    if (this.bestTime === null) return null;
    if (this.bestTime <= this.course.medals.gold) return "gold";
    if (this.bestTime <= this.course.medals.silver) return "silver";
    if (this.bestTime <= this.course.medals.bronze) return "bronze";
    return null;
  }

  snapshot(): DroneSnapshot {
    return {
      courseId: this.courseId,
      gateIndex: this.gateIndex,
      position: { ...this.position },
      velocity: { ...this.velocity },
      ticks: this.ticks,
      penaltySeconds: this.penaltySeconds,
      finished: this.finished,
      bestSamples: this.bestSamples.map((sample) => ({ ...sample })),
      bestTime: this.bestTime,
      handling: { ...this.handling },
      rngState: this.rng.getState(),
    };
  }

  applySnapshot(snapshot: DroneSnapshot): void {
    this.courseId = snapshot.courseId;
    this.gateIndex = snapshot.gateIndex;
    this.position = { ...snapshot.position };
    this.velocity = { ...snapshot.velocity };
    this.ticks = snapshot.ticks;
    this.penaltySeconds = snapshot.penaltySeconds;
    this.finished = snapshot.finished;
    this.bestSamples = snapshot.bestSamples.map((sample) => ({ ...sample }));
    this.bestTime = snapshot.bestTime;
    this.handling = { ...snapshot.handling };
    this.rng.setState(snapshot.rngState);
  }
}

export const SAVE_FORMAT = "ksu.game.save";
export const SAVE_APP_ID = "drone-circuit";

export class SaveError extends Error {
  constructor(reason: string) {
    super(`drone-circuit save rejected: ${reason}`);
    this.name = "SaveError";
  }
}

export function encodeSave(session: DroneCircuitSession): string {
  return JSON.stringify({
    format: SAVE_FORMAT,
    schemaVersion: 1,
    appId: SAVE_APP_ID,
    kind: "logical-snapshot",
    gameBuild: "unbound",
    contentVersion: "1",
    payload: session.snapshot(),
  });
}

export function decodeSave(text: string, maxBytes = 8 * 1024 * 1024): { payload: DroneSnapshot } {
  if (text.length > maxBytes) throw new SaveError("document exceeds the size limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError("document is not valid JSON");
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== SAVE_FORMAT || envelope.schemaVersion !== 1 || envelope.appId !== SAVE_APP_ID || envelope.kind !== "logical-snapshot" || envelope.contentVersion !== "1") {
    throw new SaveError("wrong envelope");
  }
  const payload = envelope.payload as DroneSnapshot;
  validateSnapshot(payload);
  return { payload };
}

function validVec(value: Vec3): boolean {
  return value !== null && typeof value === "object" &&
    [value.x, value.y, value.z].every(Number.isFinite);
}

function validateSnapshot(payload: DroneSnapshot): void {
  if (payload === null || typeof payload !== "object") throw new SaveError("missing payload");
  if (!Number.isInteger(payload.courseId) || payload.courseId < 0 || payload.courseId >= COURSES.length) {
    throw new SaveError("invalid course");
  }
  if (!Number.isInteger(payload.gateIndex) || payload.gateIndex < 0 || payload.gateIndex > COURSES[payload.courseId].gates.length) {
    throw new SaveError("invalid gate progress");
  }
  if (!validVec(payload.position) || !validVec(payload.velocity)) throw new SaveError("invalid pose");
  if (!Number.isSafeInteger(payload.ticks) || payload.ticks < 0 ||
      !Number.isFinite(payload.penaltySeconds) || payload.penaltySeconds < 0 ||
      typeof payload.finished !== "boolean") {
    throw new SaveError("invalid counters");
  }
  if (!Array.isArray(payload.bestSamples) || payload.bestSamples.length > GHOST_SAMPLE_CAP ||
      !payload.bestSamples.every(validVec)) {
    throw new SaveError("ghost sample budget exceeded");
  }
  if (!(payload.bestTime === null || (Number.isFinite(payload.bestTime) && payload.bestTime >= 0))) {
    throw new SaveError("invalid best time");
  }
  if (!payload.handling || !Number.isFinite(payload.handling.sensitivity) ||
      payload.handling.sensitivity < 0.25 || payload.handling.sensitivity > 3) {
    throw new SaveError("invalid handling");
  }
  if (!Number.isInteger(payload.rngState) || payload.rngState < 0 || payload.rngState > 0xffffffff) {
    throw new SaveError("invalid RNG state");
  }
}

export function sessionFromSave(envelope: { payload: DroneSnapshot }): DroneCircuitSession {
  return new DroneCircuitSession("restore", envelope.payload.courseId, envelope.payload);
}
