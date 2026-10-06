"use client";

import { useRef, useState } from "react";
import { MINUTES_IN_DAY } from "@/lib/time";

type Edge = "move" | "top" | "bottom";

interface Options {
  start: number;
  end: number;
  pxPerMinute: number;
  snap?: number;
  /** Column under a clientX, for moving across days (week view). */
  column?: number;
  columnAt?: (clientX: number) => number;
  onCommit: (start: number, end: number, column?: number) => void;
}

const MOVE_THRESHOLD = 4;
const LONG_PRESS_MS = 350;

function preventScroll(e: TouchEvent) {
  e.preventDefault();
}

/**
 * Vertical move/resize for timeline blocks. Mouse drags start after a few
 * pixels; touch drags need a long press so normal scrolling keeps working.
 */
export function useBlockDrag({ start, end, pxPerMinute, snap = 5, column, columnAt, onCommit }: Options) {
  const [preview, setPreview] = useState<{ start: number; end: number; column?: number } | null>(null);
  const [active, setActive] = useState<Edge | null>(null);
  const suppressClick = useRef(false);

  const begin = (edge: Edge, e: React.PointerEvent) => {
    if (e.button !== 0) {
      return;
    }

    e.stopPropagation();
    const touch = e.pointerType === "touch";
    const originY = e.clientY;
    const originX = e.clientX;
    let started = !touch && edge !== "move";
    let armed = !touch;
    let cur: { start: number; end: number; column?: number } = { start, end, column };
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (started) {
      e.preventDefault();
      setActive(edge);
    }

    const startDrag = () => {
      started = true;
      setActive(edge);
      if (touch) {
        window.addEventListener("touchmove", preventScroll, { passive: false });
        navigator.vibrate?.(10);
      }
    };

    if (touch) {
      timer = setTimeout(() => {
        armed = true;
        startDrag();
      }, LONG_PRESS_MS);
    }

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - originY;
      const moved = Math.max(Math.abs(dy), Math.abs(ev.clientX - originX));
      if (!started) {
        if (!armed) {
          if (moved > 8 && timer) {
            clearTimeout(timer);
            timer = null;
            cleanup();
          }

          return;
        }

        if (moved < MOVE_THRESHOLD) {
          return;
        }

        startDrag();
      }

      const delta = Math.round(dy / pxPerMinute / snap) * snap;
      if (edge === "move") {
        const d = Math.max(-start, Math.min(MINUTES_IN_DAY - end, delta));
        cur = { start: start + d, end: end + d, column: columnAt ? columnAt(ev.clientX) : column };
      } else if (edge === "top") {
        cur = { start: Math.max(0, Math.min(end - snap, start + delta)), end, column };
      } else {
        cur = { start, end: Math.max(start + snap, Math.min(MINUTES_IN_DAY, end + delta)), column };
      }

      setPreview(cur);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", preventScroll);
    };

    const onUp = () => {
      if (timer) {
        clearTimeout(timer);
      }

      cleanup();
      if (started && (cur.start !== start || cur.end !== end || cur.column !== column)) {
        suppressClick.current = true;
        onCommit(cur.start, cur.end, cur.column);
      } else if (started && touch) {
        suppressClick.current = true;
      }

      setPreview(null);
      setActive(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  /** Call from onClick: true when the click is the tail of a drag. */
  const consumeClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return true;
    }

    return false;
  };

  return {
    start: preview?.start ?? start,
    end: preview?.end ?? end,
    column: preview?.column ?? column,
    dragging: active !== null,
    moving: active === "move",
    begin,
    consumeClick,
  };
}
