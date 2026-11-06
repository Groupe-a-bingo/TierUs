import { describe, expect, it } from "vitest";
import { classifyRelease, isDoubleTap, swipeOffset, SWIPE_MAX_PX, SWIPE_REPLY_PX, DOUBLE_TAP_MS } from "@/components/board/chat-gestures";

describe("chat gestures", () => {
  it("swipe right past the threshold replies", () => {
    expect(classifyRelease(SWIPE_REPLY_PX, 4, false)).toBe("reply");
    expect(classifyRelease(SWIPE_REPLY_PX - 1, 0, false)).toBe("none");
  });

  it("a mostly vertical move never replies (scrolling)", () => {
    expect(classifyRelease(70, 90, false)).toBe("none");
  });

  it("swiping left does nothing", () => {
    expect(classifyRelease(-120, 0, false)).toBe("none");
  });

  it("small jitter counts as a tap, a long press is never a tap or a reply", () => {
    expect(classifyRelease(3, -4, false)).toBe("tap");
    expect(classifyRelease(0, 0, true)).toBe("none");
    expect(classifyRelease(100, 0, true)).toBe("none");
  });

  it("double tap window", () => {
    expect(isDoubleTap(0, 100)).toBe(false); // no previous tap
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(true);
    expect(isDoubleTap(1000, 1001 + DOUBLE_TAP_MS)).toBe(false);
  });

  it("bubble offset follows the finger, then resists and caps", () => {
    expect(swipeOffset(-30)).toBe(0);
    expect(swipeOffset(40)).toBe(40);
    expect(swipeOffset(SWIPE_REPLY_PX + 10)).toBeCloseTo(SWIPE_REPLY_PX + 3);
    expect(swipeOffset(1000)).toBe(SWIPE_MAX_PX);
  });
});
