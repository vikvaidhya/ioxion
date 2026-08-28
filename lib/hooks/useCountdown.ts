"use client";

import { useEffect, useState } from "react";

/** Returns whole seconds remaining until `closesAt`, ticking every 250ms for a smooth display. Null input -> null output. */
export function useCountdown(closesAt: string | null): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!closesAt) {
      setSecondsLeft(null);
      return;
    }
    const target = new Date(closesAt).getTime();

    const tick = () => {
      const diff = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setSecondsLeft(diff);
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [closesAt]);

  return secondsLeft;
}
