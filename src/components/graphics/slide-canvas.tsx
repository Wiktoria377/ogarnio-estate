"use client";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/button";
import type { GraphicDesign } from "@/core/graphics/design";
import { cn } from "@/lib/utils";

/** Mirrors LayoutElement from the server renderer (kept here to stay client-safe). */
export interface CanvasElement {
  key: string;
  kind: "text" | "photo" | "logo" | "badge" | "decor" | "pager";
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlideRenderState {
  image: string | null;
  layout: CanvasElement[];
  warnings: string[];
  width: number;
  height: number;
  loading: boolean;
  error: string | null;
}

/**
 * Renders one slide on the server (same code as the export) and returns the
 * image together with element boxes, so the browser can draw selection,
 * drag and resize handles without a second rendering engine.
 */
export function useSlideRender(design: GraphicDesign, slide: number, delay = 250): SlideRenderState {
  const [state, setState] = useState<SlideRenderState>({ image: null, layout: [], warnings: [], width: 1080, height: 1350, loading: true, error: null });
  const payload = JSON.stringify({ design, slide, width: 1080, mode: "json" });
  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/graphics/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: ctrl.signal });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j) throw new Error(j?.error ?? "Nie udało się wygenerować podglądu.");
        setState({ image: j.image, layout: j.layout, warnings: j.warnings, width: j.width, height: j.height, loading: false, error: null });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Błąd podglądu." }));
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [payload, delay]);
  return state;
}

type Gesture =
  | { type: "move"; key: string; sx: number; sy: number; dx: number; dy: number; moved: boolean }
  | { type: "resize"; key: string; sx: number; base: number; w: number; scale: number }
  | { type: "pan"; key: string; sx: number; sy: number; dx: number; dy: number; moved: boolean };

interface Props {
  render: SlideRenderState;
  alt: string;
  editable: boolean;
  selected: string | null;
  editableTextKeys: Set<string>;
  textOf: (key: string) => string;
  scaleOf: (key: string) => number;
  onSelect: (key: string | null) => void;
  /** Commit a move in design pixels. */
  onMove: (key: string, dx: number, dy: number) => void;
  onScale: (key: string, scale: number) => void;
  /** Pan a photo crop by a fraction of its box. */
  onPan: (key: string, fdx: number, fdy: number) => void;
  onText: (key: string, value: string) => void;
  onNudge: (key: string, dx: number, dy: number) => void;
  onHide: (key: string) => void;
  maxHeight?: string;
}

export function SlideCanvas({ render, alt, editable, selected, editableTextKeys, textOf, scaleOf, onSelect, onMove, onScale, onPan, onText, onNudge, onHide, maxHeight = "70vh" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<Gesture | null>(null);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const { width: W, height: H } = render;
  const k = () => (box.current ? box.current.getBoundingClientRect().width / W : 1);
  const pick = render.layout.filter((e) => e.kind !== "decor");
  // Smaller elements win when boxes overlap (e.g. a price on top of a photo).
  const ordered = [...pick].sort((a, b) => b.w * b.h - a.w * a.h);
  const sel = render.layout.find((e) => e.key === selected) ?? null;

  useEffect(() => {
    if (editing && !render.layout.some((e) => e.key === editing.key)) setEditing(null);
  }, [render.layout, editing]);

  function down(e: React.PointerEvent, el: CanvasElement, resize = false) {
    if (!editable || editing) return;
    e.stopPropagation();
    onSelect(el.key);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (resize) setG({ type: "resize", key: el.key, sx: e.clientX, base: scaleOf(el.key), w: el.w, scale: scaleOf(el.key) });
    else if (el.kind === "photo") setG({ type: "pan", key: el.key, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false });
    else setG({ type: "move", key: el.key, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false });
  }
  function move(e: React.PointerEvent) {
    if (!g) return;
    const s = k();
    if (g.type === "resize") {
      const d = (e.clientX - g.sx) / s;
      const scale = Math.max(0.5, Math.min(2, Math.round(g.base * ((g.w + d * 2) / g.w) * 100) / 100));
      setG({ ...g, scale });
    } else {
      const dx = (e.clientX - g.sx) / s;
      const dy = (e.clientY - g.sy) / s;
      setG({ ...g, dx, dy, moved: g.moved || Math.abs(dx) + Math.abs(dy) > 3 });
    }
  }
  function up() {
    if (!g) return;
    if (g.type === "resize" && g.scale !== g.base) onScale(g.key, g.scale);
    if (g.type === "move" && g.moved) onMove(g.key, Math.round(g.dx), Math.round(g.dy));
    if (g.type === "pan" && g.moved) {
      const el = render.layout.find((x) => x.key === g.key);
      if (el) onPan(g.key, -g.dx / (el.w * 1.6), -g.dy / (el.h * 1.6));
    }
    setG(null);
  }
  function key(e: React.KeyboardEvent) {
    if (!editable || !selected || editing) return;
    const step = e.shiftKey ? 25 : 5;
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key] && sel && sel.kind !== "photo") {
      e.preventDefault();
      onNudge(selected, ...map[e.key]!);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onHide(selected);
    } else if (e.key === "Escape") onSelect(null);
    else if (e.key === "Enter" && sel && editableTextKeys.has(sel.key)) {
      e.preventDefault();
      setEditing({ key: sel.key, value: textOf(sel.key) });
    }
  }
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const commitEdit = () => {
    if (editing && editing.value !== textOf(editing.key)) onText(editing.key, editing.value);
    setEditing(null);
  };

  return (
    <div
      ref={box}
      tabIndex={0}
      onKeyDown={key}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setG(null)}
      onPointerDown={() => !editing && onSelect(null)}
      className="relative w-full touch-none overflow-hidden rounded-md bg-sunken shadow-sm outline-none select-none focus-visible:ring-3 focus-visible:ring-accent/30"
      style={{ aspectRatio: `${W} / ${H}`, maxWidth: `min(100%, calc(${maxHeight} * ${W / H}))` }}
      aria-label={`${alt}. Kliknij element, aby go zaznaczyć. Przeciągnij, aby przesunąć; strzałki przesuwają o 5 px, Delete ukrywa, Enter edytuje tekst.`}
      role="application"
    >
      {render.image && <img src={render.image} alt={alt} className="pointer-events-none size-full" draggable={false} data-testid="graphic-preview" />}

      {/* Live drag preview: the element's pixels follow the pointer until the server re-renders. */}
      {g?.type === "move" && g.moved && (() => {
        const el = render.layout.find((x) => x.key === g.key);
        if (!el || !render.image) return null;
        return (
          <div
            className="pointer-events-none absolute outline-2 outline-accent outline-dashed"
            style={{ left: pct(el.x + g.dx, W), top: pct(el.y + g.dy, H), width: pct(el.w, W), height: pct(el.h, H), backgroundImage: `url(${render.image})`, backgroundSize: `${(W / el.w) * 100}% ${(H / el.h) * 100}%`, backgroundPosition: `${(el.x / (W - el.w || 1)) * 100}% ${(el.y / (H - el.h || 1)) * 100}%` }}
          />
        );
      })()}

      {editable &&
        ordered.map((el) => {
          const isSel = el.key === selected;
          const scaleNow = g?.type === "resize" && g.key === el.key ? g.scale / g.base : 1;
          const w = el.w * scaleNow;
          const h = el.h * scaleNow;
          return (
            <div
              key={el.key}
              data-element={el.key}
              onPointerDown={(e) => down(e, el)}
              onDoubleClick={() => editableTextKeys.has(el.key) && setEditing({ key: el.key, value: textOf(el.key) })}
              title={`${el.label}${editableTextKeys.has(el.key) ? " · dwuklik: edytuj tekst" : el.kind === "photo" ? " · przeciągnij: kadr" : ""}`}
              className={cn(
                "absolute rounded-[2px]",
                el.kind === "photo" ? "cursor-grab" : "cursor-move",
                isSel ? "outline-2 outline-accent" : "hover:outline-1 hover:outline-accent/60 hover:outline-dashed",
              )}
              style={{ left: pct(el.x + el.w / 2 - w / 2, W), top: pct(el.y + el.h / 2 - h / 2, H), width: pct(w, W), height: pct(h, H) }}
            >
              {isSel && (
                <span className="pointer-events-none absolute -top-6 left-0 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white">
                  {el.label}
                  {scaleNow !== 1 && ` · ${Math.round((g as { scale: number }).scale * 100)}%`}
                </span>
              )}
              {isSel && el.kind !== "photo" && (
                <span
                  role="slider"
                  aria-label={`Rozmiar: ${el.label}`}
                  aria-valuenow={Math.round(scaleOf(el.key) * 100)}
                  aria-valuemin={50}
                  aria-valuemax={200}
                  onPointerDown={(e) => down(e, el, true)}
                  className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-[2px] border-2 border-accent bg-white"
                />
              )}
            </div>
          );
        })}

      {editing && (() => {
        const el = render.layout.find((x) => x.key === editing.key);
        if (!el) return null;
        return (
          <div className="absolute z-10" style={{ left: pct(Math.max(0, el.x - 8), W), top: pct(Math.max(0, el.y - 8), H), width: pct(Math.min(W - el.x + 8, Math.max(el.w + 16, W * 0.45)), W) }} onPointerDown={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              aria-label={`Edytuj: ${el.label}`}
              value={editing.value}
              maxLength={400}
              rows={Math.min(8, Math.max(2, editing.value.split("\n").length + 1))}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") setEditing(null);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitEdit();
              }}
              className="w-full resize-none rounded-md border-2 border-accent bg-surface/95 px-2 py-1.5 text-[14px] leading-snug text-ink shadow-lg outline-none"
            />
            <span className="mt-1 inline-block rounded bg-ink/75 px-1.5 py-0.5 text-[11px] text-white">Ctrl+Enter lub kliknięcie obok zapisuje, Esc anuluje</span>
          </div>
        );
      })()}

      {render.loading && (
        <span className={cn("pointer-events-none absolute inset-x-0 bottom-3 flex justify-center", !render.image && "inset-0 items-center skeleton")}>
          <span className="flex items-center gap-2 rounded-full bg-surface/90 px-3 py-1.5 text-[12.5px] text-ink-2 shadow-sm"><Spinner /> Odświeżam podgląd</span>
        </span>
      )}
      {render.error && !render.loading && <span className="absolute inset-0 flex items-center justify-center bg-canvas/70 p-6 text-center text-[13px] text-danger">{render.error}</span>}
    </div>
  );
}
