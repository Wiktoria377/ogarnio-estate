"use client";
import { useState } from "react";
import { toast } from "sonner";

const MAX = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
export const RIGHTS_TEXT = "Potwierdzam, że biuro ma prawo używać przesyłanych zdjęć i grafik w materiałach marketingowych (własne zdjęcia, licencja albo zgoda autora i osób widocznych na zdjęciach). Potwierdzenie zapisujemy raz dla tego biura.";

/** Uploads files one by one to /api/uploads; reports per-file errors as toasts. */
export function useUpload<T>(fields: Record<string, string>, pick: (json: Record<string, unknown>) => T) {
  const [busy, setBusy] = useState(0);
  async function upload(files: FileList | File[]): Promise<T[]> {
    const list = Array.from(files);
    const done: T[] = [];
    setBusy(list.length);
    for (const file of list) {
      if (!TYPES.includes(file.type)) {
        toast.error(`${file.name}: obsługiwane formaty to JPG, PNG i WebP.`);
        setBusy((b) => b - 1);
        continue;
      }
      if (file.size > MAX) {
        toast.error(`${file.name}: plik jest większy niż 10 MB.`);
        setBusy((b) => b - 1);
        continue;
      }
      const body = new FormData();
      body.set("file", file);
      for (const [k, v] of Object.entries(fields)) body.set(k, v);
      try {
        let res = await fetch("/api/uploads", { method: "POST", body });
        let json = (await res.json()) as Record<string, unknown>;
        if (res.status === 409 && json.code === "rights_required") {
          // One-time, explicit confirmation per office (stored with the date on the server).
          if (!window.confirm(RIGHTS_TEXT)) {
            toast.error("Bez potwierdzenia praw do zdjęć nie możemy ich przesłać.");
            setBusy(0);
            return done;
          }
          body.set("rights", "yes");
          res = await fetch("/api/uploads", { method: "POST", body });
          json = (await res.json()) as Record<string, unknown>;
        }
        if (!res.ok) toast.error(`${file.name}: ${String(json.error ?? "nie udało się przesłać pliku.")}`);
        else done.push(pick(json));
      } catch {
        toast.error(`${file.name}: brak połączenia z serwerem.`);
      }
      setBusy((b) => b - 1);
    }
    return done;
  }
  return { upload, busy: busy > 0, remaining: busy };
}
