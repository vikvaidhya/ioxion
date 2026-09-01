"use client";

import { useEffect, useRef, useState } from "react";
import { playSound, isSoundEnabled, enableSound, disableSound, loadSoundPreference } from "@/lib/sound-effects";

interface Watched {
  lotId: string | null;
  highBidAmount: number | null;
  secondsLeft: number | null;
  soldJustNow: boolean;
  unsoldJustNow: boolean;
}

/** Wire this into any screen that shows live auction state — owner,
 * auctioneer, or public view — to get consistent sound-effect behavior
 * without duplicating the transition-detection logic three times. */
export function useAuctionSoundEffects(watched: Watched) {
  const [soundOn, setSoundOn] = useState(false);
  const prevLotId = useRef<string | null>(null);
  const prevHighBid = useRef<number | null>(null);
  const prevSeconds = useRef<number | null>(null);

  useEffect(() => {
    loadSoundPreference();
    setSoundOn(isSoundEnabled());
  }, []);

  const toggleSound = () => {
    if (soundOn) {
      disableSound();
      setSoundOn(false);
    } else {
      enableSound();
      setSoundOn(true);
      setTimeout(() => playSound("bid"), 50);
    }
  };

  useEffect(() => {
    if (watched.lotId && watched.lotId !== prevLotId.current) {
      if (prevLotId.current !== null) playSound("playerIntro");
      prevLotId.current = watched.lotId;
      prevHighBid.current = null;
    }
  }, [watched.lotId]);

  useEffect(() => {
    if (watched.highBidAmount !== null && watched.highBidAmount !== prevHighBid.current) {
      if (prevHighBid.current !== null) playSound("bid");
      prevHighBid.current = watched.highBidAmount;
    }
  }, [watched.highBidAmount]);

  useEffect(() => {
    if (
      watched.secondsLeft !== null &&
      watched.secondsLeft <= 5 &&
      watched.secondsLeft > 0 &&
      watched.secondsLeft !== prevSeconds.current
    ) {
      playSound("urgentTick");
    }
    prevSeconds.current = watched.secondsLeft;
  }, [watched.secondsLeft]);

  useEffect(() => {
    if (watched.soldJustNow) playSound("sold");
  }, [watched.soldJustNow]);

  useEffect(() => {
    if (watched.unsoldJustNow) playSound("unsold");
  }, [watched.unsoldJustNow]);

  return { soundOn, toggleSound };
}
