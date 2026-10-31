import { useEffect, useState } from "react";

import type { AeroRegionSnapshot } from "./desktop";

const LATENCY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_US_LATENCY_MS = 60;
const US_LATENCY_VARIANTS = 61;

let currentUsLatency = randomUsLatency();
let latencyTimer: number | null = null;
const latencySubscribers = new Set<(latency: number) => void>();

function randomUsLatency(previousLatency?: number): number {
  if (previousLatency === undefined) {
    return MIN_US_LATENCY_MS + Math.floor(Math.random() * US_LATENCY_VARIANTS);
  }

  const previousOffset = previousLatency - MIN_US_LATENCY_MS;
  const randomOffset = 1 + Math.floor(Math.random() * (US_LATENCY_VARIANTS - 1));
  return MIN_US_LATENCY_MS + ((previousOffset + randomOffset) % US_LATENCY_VARIANTS);
}

function startLatencyTimer() {
  if (latencyTimer !== null) return;

  latencyTimer = window.setInterval(() => {
    currentUsLatency = randomUsLatency(currentUsLatency);
    for (const subscriber of latencySubscribers) {
      subscriber(currentUsLatency);
    }
  }, LATENCY_UPDATE_INTERVAL_MS);
}

export function useUsNodeLatency(): number {
  const [latency, setLatency] = useState(currentUsLatency);

  useEffect(() => {
    latencySubscribers.add(setLatency);
    startLatencyTimer();
    setLatency(currentUsLatency);
    return () => {
      latencySubscribers.delete(setLatency);
    };
  }, []);

  return latency;
}

export function displayedLatencyMs(
  region: AeroRegionSnapshot,
  city: AeroRegionSnapshot["cities"][number],
  usNodeLatency: number,
): number {
  const isUnitedStates =
    region.code.toUpperCase() === "US" ||
    region.name.toLowerCase() === "united states" ||
    region.name === "美国";
  if (!isUnitedStates) return city.latencyMs;

  return usNodeLatency;
}
