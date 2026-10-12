/** Joins class names, skipping falsy values. (A tiny stand-in for clsx; Tailwind classes here never conflict.) */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
