/** Where each material kind is opened and edited (client-safe). */
export type ItemKind = "text" | "graphic" | "video" | "document";

export function itemHref(item: { kind: string; id: string }): string {
  switch (item.kind) {
    case "graphic":
      return `/graphics/${item.id}`;
    case "video":
      return `/video/${item.id}`;
    case "document":
      return `/brochures/${item.id}`;
    default:
      return `/studio/${item.id}`;
  }
}

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  text: "Tekst",
  graphic: "Grafika",
  video: "Wideo",
  document: "Broszura PDF",
};
