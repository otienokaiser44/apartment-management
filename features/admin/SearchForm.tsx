import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/** Plain GET form: the filters live in the URL so results can be linked and survive a refresh. */
export function SearchForm({
  placeholder,
  q,
  hidden = {},
  children,
}: {
  placeholder: string;
  q: string;
  /** Other filters to keep when searching (e.g. the active role tab). */
  hidden?: Record<string, string>;
  children?: React.ReactNode;
}) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input type="search" name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} className="max-w-xs" />
      {children}
      <Button type="submit" variant="secondary">
        <Search className="size-4" aria-hidden />
        Search
      </Button>
    </form>
  );
}
