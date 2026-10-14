"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, MagicWand, Star, Trash } from "@phosphor-icons/react/dist/ssr";
import { Dropzone } from "@/components/common/dropzone";
import { useUpload } from "@/components/common/use-upload";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { analyzePhotos, deletePhoto, reorderPhotos, updatePhoto } from "@/app/(app)/properties/actions";
import { Button } from "@/components/ui/button";
import type { PhotoReport } from "@/core/creative/photos";
import { cn } from "@/lib/utils";

export interface Photo {
  id: string;
  url: string;
  width: number;
  height: number;
  is_visualization: boolean;
  analysis?: PhotoReport | null;
}

const ORIENT = { landscape: "pozioma", portrait: "pionowa", square: "kwadrat" } as const;

function QualityBadge({ a }: { a: PhotoReport }) {
  const worst = a.issues.some((i) => i.severity === "problem") ? "problem" : a.issues.some((i) => i.severity === "warning") ? "warning" : "ok";
  const cls = worst === "problem" ? "bg-danger text-white" : worst === "warning" ? "bg-warning text-white" : "bg-success text-white";
  const label = worst === "ok" ? "Jakość OK" : `Uwagi: ${a.issues.filter((i) => i.severity !== "info").length}`;
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)} title={a.issues.map((i) => i.message).join("\n") || "Bez uwag technicznych"} data-testid="photo-quality">{label}</span>;
}

function Tile({ photo, index, editable, onDelete, onToggleVis, onCover }: { photo: Photo; index: number; editable: boolean; onDelete: () => void; onToggleVis: () => void; onCover: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id, disabled: !editable });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("group relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-sunken", isDragging && "z-10 shadow-lg ring-2 ring-accent")}>
      <img src={photo.url} alt={`Zdjęcie ${index + 1}`} className="size-full object-cover" draggable={false} />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5">
        {index === 0 ? <span className="rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-medium text-white">Okładka</span> : <span />}
        {photo.is_visualization && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">Wizualizacja</span>}
      </div>
      {photo.analysis && <div className="absolute bottom-1.5 left-1.5 group-hover:opacity-0"><QualityBadge a={photo.analysis} /></div>}
      {editable && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/50 to-transparent p-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button {...attributes} {...listeners} className="cursor-grab rounded-md bg-surface/95 p-1.5 text-ink-2 active:cursor-grabbing" aria-label={`Przeciągnij, aby zmienić kolejność zdjęcia ${index + 1}`}>
            <DotsSixVertical size={14} weight="bold" />
          </button>
          <Menu>
            <MenuTrigger className="rounded-md bg-surface/95 px-2 py-1 text-[12px] font-medium text-ink-2">Opcje</MenuTrigger>
            <MenuContent>
              {index > 0 && <MenuItem onSelect={onCover}><Star /> Ustaw jako okładkę</MenuItem>}
              <MenuItem onSelect={onToggleVis}><MagicWand /> {photo.is_visualization ? "To jest zdjęcie (nie wizualizacja)" : "Oznacz jako wizualizację"}</MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={onDelete}><Trash /> Usuń zdjęcie</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}
    </li>
  );
}

export function PhotoManager({ propertyId, initial, editable }: { propertyId: string; initial: Photo[]; editable: boolean }) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const { upload, busy, remaining } = useUpload({ purpose: "photo", propertyId }, (j) => j.photo as Photo);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  async function persist(next: Photo[], prev: Photo[]) {
    setPhotos(next);
    const res = await reorderPhotos(propertyId, next.map((p) => p.id));
    if (!res.ok) {
      setPhotos(prev);
      toast.error(res.error);
    } else router.refresh();
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = photos.findIndex((p) => p.id === e.active.id);
    const to = photos.findIndex((p) => p.id === e.over!.id);
    void persist(arrayMove(photos, from, to), photos);
  }

  return (
    <div className="flex flex-col gap-4">
      {photos.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((p, i) => (
                <Tile
                  key={p.id}
                  photo={p}
                  index={i}
                  editable={editable}
                  onCover={() => void persist([p, ...photos.filter((x) => x.id !== p.id)], photos)}
                  onToggleVis={async () => {
                    const res = await updatePhoto(p.id, { is_visualization: !p.is_visualization });
                    if (res.ok) setPhotos((x) => x.map((y) => (y.id === p.id ? { ...y, is_visualization: !y.is_visualization } : y)));
                    else toast.error(res.error);
                  }}
                  onDelete={async () => {
                    const res = await deletePhoto(p.id);
                    if (res.ok) {
                      setPhotos((x) => x.filter((y) => y.id !== p.id));
                      toast.success("Usunięto zdjęcie");
                      router.refresh();
                    } else toast.error(res.error);
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {editable && (
        <Dropzone
          multiple
          busy={busy}
          label={busy ? `Przesyłanie (${remaining})…` : "Dodaj zdjęcia"}
          hint="Przeciągnij pliki lub kliknij. JPG, PNG, WebP do 10 MB. Usuwamy dane EXIF i lokalizację GPS."
          onFiles={async (files) => {
            const added = await upload(files);
            if (added.length) {
              setPhotos((x) => [...x, ...added]);
              toast.success(added.length === 1 ? "Dodano zdjęcie" : `Dodano ${added.length} zdjęć`);
              router.refresh();
            }
          }}
        />
      )}
      {photos.length > 0 && <PhotoQuality propertyId={propertyId} photos={photos} editable={editable} onDone={() => router.refresh()} />}
      {photos.length > 1 && editable && <p className="text-[12.5px] text-ink-3">Przeciągnij zdjęcia, aby zmienić kolejność. Pierwsze zdjęcie jest okładką oferty i grafik. Wizualizacje dostają na grafikach widoczny podpis.</p>}
    </div>
  );
}

/** Technical check of every photo: shown to the user, used for composition; photos are never altered. */
function PhotoQuality({ propertyId, photos, editable, onDone }: { propertyId: string; photos: Photo[]; editable: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const missing = photos.filter((p) => !p.analysis).length;
  const withIssues = photos.map((p, i) => ({ p, i })).filter(({ p }) => p.analysis?.issues.length);
  return (
    <details className="rounded-md border border-line" data-testid="photo-quality-panel">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-[13px] font-medium text-ink">
        Jakość techniczna zdjęć
        <span className="font-normal text-ink-3">{missing ? `${photos.length - missing} z ${photos.length} sprawdzonych` : withIssues.length ? `uwagi przy ${withIssues.length} zdjęciach` : "bez uwag"}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-3 py-3 text-[12.5px] text-ink-2">
        {missing > 0 && editable && (
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" loading={busy} onClick={async () => {
              setBusy(true);
              const r = await analyzePhotos(propertyId);
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message ?? "Sprawdzono zdjęcia.");
              onDone();
            }}>Sprawdź jakość zdjęć</Button>
            <span className="text-ink-3">Nowe zdjęcia są sprawdzane automatycznie przy dodawaniu.</span>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {photos.map((p, i) => p.analysis ? (
            <li key={p.id} data-testid="photo-report">
              <span className="font-medium text-ink">Zdjęcie {i + 1}</span>
              <span className="text-ink-3"> · {p.analysis.width}×{p.analysis.height} ({p.analysis.megapixels} MP, {ORIENT[p.analysis.orientation]}) · jasność {Math.round(p.analysis.brightness * 100)}% · kontrast {Math.round(p.analysis.contrast * 100)}% · ostrość {Math.round(p.analysis.sharpness * 100)}% · wynik techniczny {p.analysis.score}/100</span>
              <span className="ml-1 inline-flex gap-0.5 align-middle">{p.analysis.colors.map((c) => <span key={c} className="inline-block size-3 rounded-sm border border-line" style={{ background: c }} title={c} />)}</span>
              {p.analysis.issues.length > 0 && <ul className="mt-0.5 list-disc pl-5">{p.analysis.issues.map((x) => <li key={x.code} className={x.severity === "problem" ? "text-danger" : x.severity === "warning" ? "text-warning" : "text-ink-3"}>{x.message}</li>)}</ul>}
            </li>
          ) : null)}
        </ul>
        <p className="text-ink-3">To ocena techniczna (piksele i wymiary), a nie ocena estetyczna. Zdjęcia nie są retuszowane ani zmieniane. Rozpoznawanie pomieszczeń (salon, kuchnia, elewacja) wymaga modelu wizualnego i nie jest jeszcze włączone.</p>
      </div>
    </details>
  );
}
