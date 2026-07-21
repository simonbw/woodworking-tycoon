import assert from "node:assert";
import { describe, it } from "node:test";
import { LeadInOutVoice, MachineVoice } from "./machineVoice";

/** Records every phase the wrapper forwards. */
class RecordingVoice implements MachineVoice {
  readonly phases: string[] = [];
  disposed = false;
  setPhase(phase: string): void {
    this.phases.push(phase);
  }
  dispose(): void {
    this.disposed = true;
  }
}

const LEADS = { leadInMs: 20, leadOutMs: 20 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("LeadInOutVoice", () => {
  it("passes off → running through immediately", () => {
    const inner = new RecordingVoice();
    const voice = new LeadInOutVoice(inner, LEADS);
    voice.setPhase("running");
    assert.deepEqual(inner.phases, ["running"]);
  });

  it("idles at spin-up before engaging the cut from cold", async () => {
    const inner = new RecordingVoice();
    const voice = new LeadInOutVoice(inner, LEADS);
    voice.setPhase("cutting");
    assert.deepEqual(inner.phases, ["running"]);
    await wait(60);
    assert.deepEqual(inner.phases, ["running", "cutting"]);
  });

  it("unloads to idle before powering off from a cut", async () => {
    const inner = new RecordingVoice();
    const voice = new LeadInOutVoice(inner, LEADS);
    voice.setPhase("cutting");
    await wait(60);
    voice.setPhase("off");
    assert.deepEqual(inner.phases, ["running", "cutting", "running"]);
    await wait(60);
    assert.deepEqual(inner.phases, ["running", "cutting", "running", "off"]);
  });

  it("re-engages immediately when already idling", () => {
    const inner = new RecordingVoice();
    const voice = new LeadInOutVoice(inner, LEADS);
    voice.setPhase("running");
    voice.setPhase("cutting");
    assert.deepEqual(inner.phases, ["running", "cutting"]);
  });

  it("cancels a pending lead-in when the phase drops first", async () => {
    const inner = new RecordingVoice();
    const voice = new LeadInOutVoice(inner, LEADS);
    voice.setPhase("cutting");
    voice.setPhase("off");
    await wait(60);
    assert.ok(!inner.phases.includes("cutting"));
    assert.equal(inner.phases[inner.phases.length - 1], "off");
  });

  it("skips the wind-down when cutting resumes during the lead-out", async () => {
    const inner = new RecordingVoice();
    const voice = new LeadInOutVoice(inner, LEADS);
    voice.setPhase("cutting");
    await wait(60);
    voice.setPhase("off");
    voice.setPhase("cutting");
    await wait(60);
    assert.ok(!inner.phases.includes("off"));
    assert.equal(inner.phases[inner.phases.length - 1], "cutting");
  });

  it("dispose cancels pending transitions and disposes the inner voice", async () => {
    const inner = new RecordingVoice();
    const voice = new LeadInOutVoice(inner, LEADS);
    voice.setPhase("cutting");
    voice.dispose();
    await wait(60);
    assert.ok(inner.disposed);
    assert.ok(!inner.phases.includes("cutting"));
  });
});
