"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Copy, DotsThree, DownloadSimple, PencilSimple, Stack, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { deleteItem, duplicateItem, markChecked, updateItemMeta } from "@/app/(app)/library/actions";
import { slugify } from "@/lib/utils";
import { t } from "@/i18n/pl";
import { itemHref, type ItemKind } from "@/lib/routes";

type Status = "draft" | "review" | "ready";

export function LibraryItemActions({ item, text, editable }: { item: { id: string; kind: ItemKind; title: string; status: Status; stale?: boolean }; text: string | null; editable: boolean }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const href = itemHref(item);

  function exportText() {
    if (!text) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `${slugify(item.title) || "material"}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function setStatus(status: Status) {
    const r = await updateItemMeta(item.id, { status });
    if (r.ok) {
      toast.success(`Status: ${t.status[status]}`);
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Akcje: ${item.title}`}><DotsThree size={18} weight="bold" /></Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem asChild><Link href={href}><PencilSimple /> Otwórz i edytuj</Link></MenuItem>
          {item.kind === "text" && text && (
            <>
              <MenuItem onSelect={() => navigator.clipboard.writeText(text).then(() => toast.success(t.common.copied))}><Copy /> Kopiuj tekst</MenuItem>
              <MenuItem onSelect={exportText}><DownloadSimple /> Eksportuj (.txt)</MenuItem>
            </>
          )}
          {item.kind === "graphic" && (
            <>
              <MenuItem asChild><a href={`/api/graphics/${item.id}/export?slide=0`} download><DownloadSimple /> Pobierz PNG</a></MenuItem>
              <MenuItem asChild><a href={`/api/graphics/${item.id}/export?all=1`} download><DownloadSimple /> Pobierz wszystkie (ZIP)</a></MenuItem>
            </>
          )}
          {editable && (
            <>
              {item.stale && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={() => void markChecked(item.id).then((r) => { if (r.ok) { toast.success("Oznaczono jako sprawdzony."); router.refresh(); } else toast.error(r.error); })}><CheckCircle /> Sprawdzone, treść aktualna</MenuItem>
                </>
              )}
              <MenuSeparator />
              <MenuLabel>Status</MenuLabel>
              {(["draft", "review", "ready"] as const).filter((s) => s !== item.status).map((s) => <MenuItem key={s} onSelect={() => void setStatus(s)}>{t.status[s]}</MenuItem>)}
              <MenuSeparator />
              <MenuItem onSelect={() => void duplicateItem(item.id).then((r) => r && !r.ok && toast.error(r.error))}><Stack /> Duplikuj</MenuItem>
              <MenuItem danger onSelect={() => setConfirmOpen(true)}><Trash /> Usuń</MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Usunąć materiał?" description={`„${item.title}” zostanie usunięty razem z historią wersji. Tej operacji nie można cofnąć.`}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="secondary">Anuluj</Button></DialogClose>
            <Button
              variant="danger"
              loading={deleting}
              onClick={async () => {
                setDeleting(true);
                const r = await deleteItem(item.id);
                setDeleting(false);
                if (!r.ok) return toast.error(r.error);
                setConfirmOpen(false);
                toast.success("Usunięto materiał");
                router.refresh();
              }}
            >
              Usuń
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
