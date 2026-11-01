import { describe, expect, it } from "vitest";
import {
  DroneCircuitSession,
  RESET_PENALTY_S,
  decodeSave,
  encodeSave,
  sessionFromSave,
} from "../src/model/drone.js";

describe("DroneCircuitSession rules", () => {
  it("gates only score in sequence and with forward direction", () => {
    const session = new DroneCircuitSession("gates", 0);
    session.position = { x: 0, y: 0, z: 0 };
    // Crossing the first gate plane backward cannot score it.
    session.position.x = 11;
    session.velocity.x = -4;
    for (let elapsed = 0; elapsed < 1000; elapsed += 250) session.advance(250);
    expect(session.gateIndex).toBe(0);
    // Now cross forward through gate 0.
    session.position.x = 9;
    session.velocity.x = 4;
    for (let elapsed = 0; elapsed < 500; elapsed += 250) session.advance(250);
    expect(session.gateIndex).toBeGreaterThanOrEqual(1);
  });

  it("reset applies exactly one penalty and returns to the last gate", () => {
    const session = new DroneCircuitSession("reset", 0);
    session.setThrottle("x", 1);
    for (let elapsed = 0; elapsed < 2000; elapsed += 250) session.advance(250);
    expect(session.gateIndex).toBeGreaterThanOrEqual(1);
    const before = session.penaltySeconds;
    session.reset();
    expect(session.penaltySeconds).toBe(before + RESET_PENALTY_S);
    expect(session.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("simultaneous axes keep independent ownership", () => {
    const session = new DroneCircuitSession("axes", 0);
    session.setThrottle("x", 1);
    session.setThrottle("y", -0.5);
    session.setThrottle("z", 2); // clamps to 1
    expect(session.throttle).toEqual({ x: 1, y: -0.5, z: 1 });
  });

  it("ghost samples advance once per simulation tick and are capped", () => {
    const session = new DroneCircuitSession("ghost", 0);
    session.setThrottle("x", 1);
    for (let elapsed = 0; elapsed < 2000; elapsed += 250) session.advance(250);
    expect(session.ticks).toBeGreaterThan(0);
    expect(session.ticks).toBe(Math.round(2000 / (1000 / 60)));
  });

  it("a large frame stall clamps catch-up instead of teleporting", () => {
    const session = new DroneCircuitSession("stall", 0);
    session.setThrottle("x", 1);
    session.advance(5000); // internally processed at most 250 ms per slice
    expect(session.position.x).toBeLessThan(31);
  });

  it("save/load resumes the exact flight pose", () => {
    const session = new DroneCircuitSession("save", 1);
    session.setThrottle("x", 1);
    session.setThrottle("y", 0.4);
    session.advance(900);
    const restored = sessionFromSave(decodeSave(encodeSave(session)));
    expect(restored.position).toEqual(session.position);
    expect(restored.velocity).toEqual(session.velocity);
    expect(restored.gateIndex).toBe(session.gateIndex);
  });

  it("rejects malformed pose, course, counters and oversized ghosts", () => {
    const session = new DroneCircuitSession("invalid", 0);
    const document = decodeSave(encodeSave(session));
    for (const mutate of [
      (value: any) => { value.payload.courseId = 8; },
      (value: any) => { value.payload.position.x = Number.NaN; },
      (value: any) => { value.payload.ticks = -1; },
      (value: any) => { value.payload.bestSamples = Array(3601).fill({ x: 0, y: 0, z: 0 }); },
      (value: any) => { value.payload.rngState = -1; },
    ]) {
      const candidate = structuredClone(document);
      mutate(candidate);
      expect(() => sessionFromSave(candidate)).toThrow();
    }
  });
});
