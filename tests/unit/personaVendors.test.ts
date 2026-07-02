// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

// The vendor API keys are read once at module-load time (matching the
// existing HERMES_API_KEY pattern in hermes-gateway-adapter.js), so tests
// must clear them from process.env AND reset the module registry before
// each import to get a hermetic, ambient-environment-independent result.
const VENDOR_KEY_NAMES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;
const savedEnv: Partial<Record<(typeof VENDOR_KEY_NAMES)[number], string>> = {};

describe("persona-vendors", () => {
  beforeEach(() => {
    for (const key of VENDOR_KEY_NAMES) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of VENDOR_KEY_NAMES) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("returns a clear error instead of throwing when no API key is configured", async () => {
    const { callPersonaVendor } = await import("../../server/persona-vendors.js");

    await expect(
      callPersonaVendor("openai", { systemPrompt: "test", history: [], userMessage: "hi", model: null })
    ).resolves.toEqual({ error: "OPENAI_API_KEY not configured" });

    await expect(
      callPersonaVendor("anthropic", { systemPrompt: "test", history: [], userMessage: "hi", model: null })
    ).resolves.toEqual({ error: "ANTHROPIC_API_KEY not configured" });

    await expect(
      callPersonaVendor("google", { systemPrompt: "test", history: [], userMessage: "hi", model: null })
    ).resolves.toEqual({ error: "GEMINI_API_KEY not configured" });
  });

  it("returns an error for an unknown vendor instead of throwing", async () => {
    const { callPersonaVendor } = await import("../../server/persona-vendors.js");

    // Deliberately out-of-contract input (e.g. a malformed registry entry at
    // runtime) — callPersonaVendor's JSDoc union type correctly rejects this
    // statically, so the cast is intentional, not a type gap.
    await expect(
      callPersonaVendor(
        "unknown-vendor" as never,
        { systemPrompt: null, history: [], userMessage: "hi", model: null }
      )
    ).resolves.toEqual({ error: "Unknown persona vendor: unknown-vendor" });
  });
});
