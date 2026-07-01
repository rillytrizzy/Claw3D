import { describe, expect, it } from "vitest";

import { shouldShowPixelHotelBackdrop } from "@/features/retro-office/core/pixelHotelBackdrop";

describe("shouldShowPixelHotelBackdrop", () => {
  it("hides the backdrop once live agents are present", () => {
    expect(
      shouldShowPixelHotelBackdrop({
        immersiveOverlayActive: false,
        agentCount: 3,
      }),
    ).toBe(false);
  });

  it("shows the backdrop only for the empty non-immersive office shell", () => {
    expect(
      shouldShowPixelHotelBackdrop({
        immersiveOverlayActive: false,
        agentCount: 0,
      }),
    ).toBe(true);
  });

  it("never shows the backdrop during immersive overlays", () => {
    expect(
      shouldShowPixelHotelBackdrop({
        immersiveOverlayActive: true,
        agentCount: 0,
      }),
    ).toBe(false);
  });
});
