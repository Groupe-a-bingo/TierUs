"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/* ---------- pure rules (unit-tested) ---------- */

export const SWIPE_REPLY_PX = 60; // swipe right this far to reply
export const SWIPE_MAX_PX = 84; // the bubble never travels further
const LONG_PRESS_MS = 450;
export const DOUBLE_TAP_MS = 300;
const MOVE_SLOP_PX = 8; // finger jitter that still counts as a tap

type GestureEnd = "reply" | "tap" | "none";

/** What a finished touch means, from how far it moved. */
export function classifyRelease(dx: number, dy: number, longPressed: boolean): GestureEnd {
  if (longPressed) return "none";
  if (dx >= SWIPE_REPLY_PX && Math.abs(dy) < dx) return "reply";
  if (Math.abs(dx) <= MOVE_SLOP_PX && Math.abs(dy) <= MOVE_SLOP_PX) return "tap";
  return "none";
}

/** Second tap close enough in time to the first one. */
export const isDoubleTap = (prevTapAt: number, now: number) => prevTapAt > 0 && now - prevTapAt <= DOUBLE_TAP_MS;

/** Bubble offset while swiping: only to the right, capped, with resistance after the threshold. */
export function swipeOffset(dx: number): number {
  if (dx <= 0) return 0;
  if (dx <= SWIPE_REPLY_PX) return dx;
  return Math.min(SWIPE_MAX_PX, SWIPE_REPLY_PX + (dx - SWIPE_REPLY_PX) * 0.3);
}

/* ---------- hook ---------- */

/**
 * Messaging-app gestures on a chat bubble (touch only, mouse is ignored):
 * swipe right → reply · double tap → like · long press → actions menu.
 * `slide` is the element translated during the swipe, `hint` fades in (reply icon).
 */
export function useChatGestures(opts: {
  enabled: boolean;
  onReply: () => void;
  onDoubleTap: () => void;
  onLongPress: () => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLSpanElement>(null);
  // latest callbacks, without re-binding the listeners (written after render, not during it)
  const cb = useRef(opts);
  useLayoutEffect(() => {
    cb.current = opts;
  });

  useEffect(() => {
    const el = target.current;
    if (!el || !opts.enabled) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let horizontal = false;
    let longPressed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastTapAt = 0;

    const setOffset = (px: number, animate: boolean) => {
      const s = slide.current;
      if (s) {
        s.style.transition = animate ? "transform 180ms ease" : "none";
        s.style.transform = px ? `translateX(${px}px)` : "";
      }
      if (hint.current) hint.current.style.opacity = String(Math.min(1, px / SWIPE_REPLY_PX));
    };

    const down = (e: PointerEvent) => {
      // a second finger doesn't start (or restart) a gesture
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      clearTimeout(timer);
      tracking = true;
      horizontal = false;
      longPressed = false;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        longPressed = true;
        navigator.vibrate?.(12);
        cb.current.onLongPress();
      }, LONG_PRESS_MS);
    };

    const move = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > MOVE_SLOP_PX || Math.abs(dy) > MOVE_SLOP_PX) clearTimeout(timer);
      if (!horizontal && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > MOVE_SLOP_PX) {
        tracking = false; // vertical: let the page scroll
        setOffset(0, true);
        return;
      }
      if (dx > MOVE_SLOP_PX) horizontal = true;
      if (horizontal) setOffset(swipeOffset(dx), false);
    };

    const up = (e: PointerEvent) => {
      clearTimeout(timer);
      if (!tracking) return;
      tracking = false;
      const result = classifyRelease(e.clientX - startX, e.clientY - startY, longPressed);
      setOffset(0, true);
      if (result === "reply") {
        navigator.vibrate?.(8);
        cb.current.onReply();
      } else if (result === "tap") {
        const now = Date.now();
        if (isDoubleTap(lastTapAt, now)) {
          lastTapAt = 0;
          cb.current.onDoubleTap();
        } else lastTapAt = now;
      }
    };

    const cancel = () => {
      clearTimeout(timer);
      tracking = false;
      setOffset(0, true);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    // no native menu on long press (we show ours)
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", noMenu);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("contextmenu", noMenu);
    };
  }, [opts.enabled]);

  return { target, slide, hint };
}
