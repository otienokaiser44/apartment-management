import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/** Shared look for text-like controls: zinc border, soft focus ring, readable placeholder. */
export const controlClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm outline-none transition " +
  "placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:opacity-50 aria-[invalid=true]:border-destructive";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, "pr-8", className)} {...props} />;
}

/** Input with a prefix and/or suffix addon, e.g. `KES [ 200 ]` or `[ 55 ] per m³`. */
export function InputGroup({ prefix, suffix, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; suffix?: ReactNode }) {
  const addon = "flex items-center bg-muted px-3 text-xs font-medium text-muted-foreground";
  return (
    <div className="flex overflow-hidden rounded-lg border border-input shadow-sm transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
      {prefix ? <span className={cn(addon, "border-r border-input")}>{prefix}</span> : null}
      <input
        className={cn("min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70", className)}
        {...props}
      />
      {suffix ? <span className={cn(addon, "border-l border-input")}>{suffix}</span> : null}
    </div>
  );
}

/** Label + control + hint/error, wired for accessibility. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted-foreground">(optional)</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
