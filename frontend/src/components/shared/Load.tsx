"use client";

import { useCallback, useEffect, useState } from "react";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  retry: () => void;
}

/** Loads once per key; ignores answers that arrive after the key changed or the page closed. */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    load()
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e: unknown) => {
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
