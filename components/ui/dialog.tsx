"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  /** Renders the control that opens the dialog. */
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: string;
  /** Receives `close` so a form can dismiss the dialog when it succeeds. */
  children: (close: () => void) => ReactNode;
};

/**
 * Modal built on the native <dialog> element: focus is trapped, Escape closes it and the page behind is inert, with no
 * extra library. Clicking the dimmed backdrop also closes it. Use from client components only (it takes render props).
 *
 * Open/closed lives in state; an effect mirrors it onto the element (showModal/close), so refs are never read
 * while rendering.
 */
export function Dialog({ trigger, title, description, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    if (!isOpen && el.open) el.close();
  }, [isOpen]);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return (
    <>
      {trigger(open)}
      <dialog
        ref={ref}
        aria-label={title}
        onClose={close} // Escape key or form method=dialog
        onClick={(e) => {
          if (e.target === e.currentTarget) close(); // a click on the backdrop lands on the <dialog> itself
        }}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="p-5">{children(close)}</div>
      </dialog>
    </>
  );
}
