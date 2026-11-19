"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Large centred dialog, like a sub-page. Esc and a click on the backdrop close it.
 * Focus moves to the dialog on open and back to the opener on close.
 */
export default function Modal({
  open,
  onClose,
  title,
  chips,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Source chips next to the title. */
  chips?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="flex h-[85vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-edge bg-[#0b0b16] shadow-2xl outline-none"
      >
        <header className="flex h-12 flex-none items-center gap-2 border-b border-edge px-5">
          <h2 id="modal-title" className="text-[15px] font-semibold">
            {title}
          </h2>
          {chips}
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-lg text-muted hover:bg-white/[0.06] hover:text-[#e7e7f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            ×
          </button>
        </header>
        <div className="relative min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
