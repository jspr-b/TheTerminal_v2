"use client";

import { useCallback, useEffect, useState } from "react";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  retry: () => void;
}

// A small shared cache for API answers, so moving between pages shows the last answer at once.
// Answers are kept in memory only (never stored), refreshed in the background on every visit, and requests for
// the same key that overlap share one fetch (also covers React's double effects in development).
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

/** Fetch once per key at a time; remembers the answer for the next visit. */
export function cachedLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load().then(
    (d) => {
      cache.set(key, d);
      inflight.delete(key);
      return d;
    },
    (e: unknown) => {
      inflight.delete(key);
      throw e;
    },
  );
  inflight.set(key, p);
  return p;
}

/** The last answer for this key, if any. */
export function cached<T>(key: string): T | null {
  return (cache.get(key) as T | undefined) ?? null;
}

/** Loads per key: shows the last answer at once, then refreshes it. Ignores answers that arrive after the key changed or the page closed. */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [data, setData] = useState<T | null>(() => cached<T>(key));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    setData(cached<T>(key));
    cachedLoad(key, load)
      .then((d) => {
        // an unchanged answer keeps the old object, so nothing downstream rebuilds (e.g. the 3D worlds)
        if (live) setData((prev) => (prev !== null && JSON.stringify(prev) === JSON.stringify(d) ? prev : d));
      })
      .catch((e: unknown) => {
        // keep showing the last answer if there is one; the error is still reported
        if (live) setError(e instanceof Error ? e.message : "Could not load.");
      });
    return () => {
      live = false;
    };
    // `load` is recreated each render; `key` names what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { data, error, retry };
}

export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="my-3 text-sm">
      <span className="text-[#f87171]">{message}</span>{" "}
      <button onClick={retry} className="text-muted underline-offset-2 hover:text-[#e7e7f0] hover:underline">
        Try again
      </button>
    </div>
  );
}

export function Skeleton({ className = "h-3 w-16" }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={`inline-block animate-pulse rounded bg-[#1f1f33] align-middle ${className}`} />;
}
