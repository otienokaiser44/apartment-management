import { FileText } from "lucide-react";
import type { TicketAttachment } from "@/lib/services/maintenance";

/** Thumbnails for photos and tiles for PDFs. Links are short-lived signed URLs from the private bucket. */
export function AttachmentGrid({ attachments }: { attachments: TicketAttachment[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {attachments.map((a) => (
        <li key={a.id}>
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="group block">
              {a.isImage ? (
                <span
                  role="img"
                  aria-label={a.name}
                  className="block aspect-square rounded-lg border border-border bg-muted bg-cover bg-center transition-opacity group-hover:opacity-80"
                  style={{ backgroundImage: `url("${a.url}")` }}
                />
              ) : (
                <span className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted text-xs text-muted-foreground transition-colors group-hover:bg-muted/70">
                  <FileText className="size-6" aria-hidden />
                  {a.name}
                </span>
              )}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">{a.name} (unavailable)</span>
          )}
        </li>
      ))}
    </ul>
  );
}
