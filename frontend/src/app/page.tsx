"use client";

import dynamic from "next/dynamic";

const Command = dynamic(() => import("@/components/command/Command"), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center text-muted">Loading map...</div>,
});

export default function CommandPage() {
  return <Command />;
}
