import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";

// Minimal in-memory localStorage so the store can load/persist under `tsx`
// (Node has no DOM). Installed before importing the module under test.
class MemStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage =
  new MemStorage();

const STORAGE_KEY = "woodworking-tycoon-audio";

import {
  getAudioSettings,
  setAudioSettings,
  subscribeAudioSettings,
} from "./audioSettings";

describe("audioSettings store", () => {
  beforeEach(() => {
    // Reset to a known baseline between tests.
    setAudioSettings({ master: 0.8, sfx: 1, music: 0.7, muted: false });
  });

  it("merges a partial patch, leaving other fields untouched", () => {
    setAudioSettings({ sfx: 0.5 });
    const s = getAudioSettings();
    assert.strictEqual(s.sfx, 0.5);
    assert.strictEqual(s.master, 0.8);
    assert.strictEqual(s.music, 0.7);
    assert.strictEqual(s.muted, false);
  });

  it("clamps volumes into the 0..1 range", () => {
    setAudioSettings({ master: 5, sfx: -2 });
    const s = getAudioSettings();
    assert.strictEqual(s.master, 1);
    assert.strictEqual(s.sfx, 0);
  });

  it("ignores non-finite volumes rather than corrupting state", () => {
    setAudioSettings({ music: NaN });
    assert.strictEqual(getAudioSettings().music, 0.7);
  });

  it("persists changes to localStorage", () => {
    setAudioSettings({ master: 0.3, muted: true });
    const raw = localStorage.getItem(STORAGE_KEY);
    assert.ok(raw);
    const parsed = JSON.parse(raw!);
    assert.strictEqual(parsed.master, 0.3);
    assert.strictEqual(parsed.muted, true);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    let calls = 0;
    const unsub = subscribeAudioSettings(() => {
      calls++;
    });
    setAudioSettings({ sfx: 0.9 });
    assert.strictEqual(calls, 1);
    unsub();
    setAudioSettings({ sfx: 0.4 });
    assert.strictEqual(calls, 1);
  });
});
