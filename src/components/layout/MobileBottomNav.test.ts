import { describe, expect, it } from "vitest";
import {
  classifyIosScrubIntent,
  detectMobileNavPlatform,
  findClosestTabIndex,
  findContinuousTabPosition,
  findTabIndexWithHysteresis,
  supportsIphoneNavScrub,
} from "./mobile-nav-platform";

describe("detectMobileNavPlatform", () => {
  it("selects the Liquid Glass navigation treatment for iPhone and iPad", () => {
    expect(
      detectMobileNavPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        5,
      ),
    ).toBe("ios");
    expect(
      detectMobileNavPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        5,
      ),
    ).toBe("ios");
  });

  it("selects the Material navigation treatment for Android and desktop web", () => {
    expect(
      detectMobileNavPlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/128 Mobile",
        5,
      ),
    ).toBe("android");
    expect(
      detectMobileNavPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0),
    ).toBe("android");
  });

  it("enables scrub navigation for iPhone only", () => {
    expect(
      supportsIphoneNavScrub(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      ),
    ).toBe(true);
    expect(
      supportsIphoneNavScrub("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"),
    ).toBe(false);
    expect(
      supportsIphoneNavScrub(
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/128 Mobile",
      ),
    ).toBe(false);
  });

  it("selects the closest tab while the pointer scrubs in either layout direction", () => {
    const rects = [
      { left: 320, width: 72 },
      { left: 240, width: 72 },
      { left: 160, width: 72 },
      { left: 80, width: 72 },
      { left: 0, width: 72 },
    ];

    expect(findClosestTabIndex(350, rects)).toBe(0);
    expect(findClosestTabIndex(195, rects)).toBe(2);
    expect(findClosestTabIndex(18, rects)).toBe(4);
    expect(findClosestTabIndex(18, [])).toBe(-1);
  });

  it("starts horizontal scrubbing after a responsive 5px movement", () => {
    expect(classifyIosScrubIntent(4.9, 0)).toBe("pending");
    expect(classifyIosScrubIntent(5, 1)).toBe("horizontal");
    expect(classifyIosScrubIntent(-7, 3)).toBe("horizontal");
  });

  it("does not discard a tap until movement is decisively vertical", () => {
    expect(classifyIosScrubIntent(4, 21.9)).toBe("pending");
    expect(classifyIosScrubIntent(4, 22)).toBe("vertical");
    expect(classifyIosScrubIntent(10, 10)).toBe("pending");
  });

  it("uses a small 4px dead band around tab boundaries in RTL layouts", () => {
    const rects = [
      { left: 320, width: 72 },
      { left: 240, width: 72 },
      { left: 160, width: 72 },
      { left: 80, width: 72 },
      { left: 0, width: 72 },
    ];

    expect(findTabIndexWithHysteresis(315, rects, 0)).toBe(0);
    expect(findTabIndexWithHysteresis(311, rects, 0)).toBe(1);
    expect(findTabIndexWithHysteresis(317, rects, 1)).toBe(1);
    expect(findTabIndexWithHysteresis(321, rects, 1)).toBe(0);
    expect(findTabIndexWithHysteresis(200, [], 0)).toBe(-1);
  });

  it("maps the finger to a continuous fractional position across an RTL bar", () => {
    const rects = [
      { left: 320, width: 72 },
      { left: 240, width: 72 },
      { left: 160, width: 72 },
      { left: 80, width: 72 },
      { left: 0, width: 72 },
    ];

    expect(findContinuousTabPosition(356, rects)).toBe(0);
    expect(findContinuousTabPosition(316, rects)).toBe(0.5);
    expect(findContinuousTabPosition(196, rects)).toBe(2);
    expect(findContinuousTabPosition(400, rects)).toBe(0);
    expect(findContinuousTabPosition(0, rects)).toBe(4);
    expect(findContinuousTabPosition(200, [])).toBe(-1);
  });
});
