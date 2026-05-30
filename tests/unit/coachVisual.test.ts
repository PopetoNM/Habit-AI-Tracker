// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyCoachTopic,
  createCoachOrbitParticles,
  createCoachOrbParticles,
  getCoachTopicPalette,
} from "../../src/renderer/src/coach/visual";

describe("coach visual helpers", () => {
  it("classifies the requested color topics", () => {
    expect(classifyCoachTopic("I ate junk food and sugar")).toBe("food");
    expect(classifyCoachTopic("I need a deep work focus block")).toBe("focus");
    expect(classifyCoachTopic("My mindset and motivation feel low")).toBe(
      "mentality",
    );
    expect(classifyCoachTopic("What should I do next?")).toBe("neutral");
  });

  it("maps topics to the requested visual colors", () => {
    expect(getCoachTopicPalette("food").primary).toBe("#ff3b36");
    expect(getCoachTopicPalette("focus").primary).toBe("#1e9bff");
    expect(getCoachTopicPalette("mentality").primary).toBe("#2fe66f");
  });

  it("creates deterministic bounded orb geometry", () => {
    const first = createCoachOrbParticles({ count: 64, radius: 1.4 });
    const second = createCoachOrbParticles({ count: 64, radius: 1.4 });

    expect(first).toEqual(second);
    expect(first).toHaveLength(64 * 3);
    expect(Math.max(...first)).toBeLessThan(1.8);
    expect(Math.min(...first)).toBeGreaterThan(-1.8);
  });

  it("creates an orbit particle ring", () => {
    const positions = createCoachOrbitParticles({ count: 32, radius: 2 });

    expect(positions).toHaveLength(32 * 3);
    expect(positions[0]).toBeCloseTo(2, 1);
    expect(positions[2]).toBeCloseTo(0, 1);
  });
});
