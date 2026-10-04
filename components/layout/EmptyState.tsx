export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 p-8 text-center dark:border-white/20">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}
