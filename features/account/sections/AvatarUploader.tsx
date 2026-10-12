"use client";

import { Camera } from "lucide-react";
import { startTransition, useActionState, useRef, useState } from "react";
import { ActionButton } from "@/components/forms/ActionButton";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/types/forms";
import { removeAvatarAction, uploadAvatarAction } from "../actions";

const MAX_PICK_BYTES = 10 * 1024 * 1024;

/** Centre-crops to a square and shrinks to 512 px, so uploads are small and always a sensible shape. */
async function toSquareImage(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", 0.85),
  );
}

export function AvatarUploader({ name, version }: { name: string; version: string | null }) {
  const [state, action, pending] = useActionState(uploadAvatarAction, initialFormState);
  const [localError, setLocalError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setLocalError(null);
    if (!file.type.startsWith("image/")) return setLocalError("Choose an image file (PNG, JPEG or WebP).");
    if (file.size > MAX_PICK_BYTES) return setLocalError("That image is too large. Choose one under 10 MB.");
    setProcessing(true);
    try {
      const blob = await toSquareImage(file);
      const fd = new FormData();
      fd.set("avatar", blob, "avatar.webp");
      startTransition(() => action(fd));
    } catch {
      setLocalError("We could not read that image. Try a different one.");
    } finally {
      setProcessing(false);
    }
  }

  const message = localError ?? (state.status !== "idle" ? state.message : undefined);
  const isError = !!localError || state.status === "error";

  return (
    <div className="flex flex-wrap items-center gap-5">
      <Avatar label={name} version={version} className="size-20 text-2xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={Camera} loading={pending || processing} loadingText="Uploading…" onClick={() => input.current?.click()}>
            {version ? "Change picture" : "Upload picture"}
          </Button>
          {version ? <ActionButton label="Remove" confirm="Remove your profile picture?" action={removeAvatarAction} /> : null}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload profile picture" onChange={onPick} />
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG or WebP. It is cropped to a square. Only you can see it.</p>
        {message ? <Alert variant={isError ? "error" : "success"}>{message}</Alert> : null}
      </div>
    </div>
  );
}
