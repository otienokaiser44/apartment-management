import { cn } from "./cn";

const initialsOf = (label: string) => {
  const base = label.includes("@") ? label.split("@")[0] : label;
  const parts = base.replace(/[^\p{L}\s]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
};

/**
 * Profile picture, or initials when there is none. `version` is the stored picture path; it only serves as a cache
 * buster, because the image itself is streamed through /account/avatar (the storage bucket is private).
 */
export function Avatar({ label, version, className }: { label: string; version?: string | null; className?: string }) {
  if (version) {
    return (
      <span
        role="img"
        aria-label={label}
        className={cn("inline-block shrink-0 rounded-full bg-muted bg-cover bg-center", className)}
        style={{ backgroundImage: `url("/account/avatar?v=${encodeURIComponent(version)}")` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground", className)}
    >
      {initialsOf(label)}
    </span>
  );
}
