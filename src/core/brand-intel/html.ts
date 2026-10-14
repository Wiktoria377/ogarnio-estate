import { parse, type DefaultTreeAdapterTypes } from "parse5";

/**
 * Extracts brand signals from one HTML page. The page is UNTRUSTED data: it is
 * only parsed (parse5, no scripts run, nothing is rendered) and reduced to plain
 * strings and URLs that later steps validate again.
 */
type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export interface PageImage {
  src: string;
  alt: string;
  hint: string;
  inHeader: boolean;
  width: number | null;
  height: number | null;
}

export interface PageExtract {
  url: string;
  lang: string | null;
  title: string | null;
  description: string | null;
  themeColor: string | null;
  ogImage: string | null;
  icons: string[];
  headings: { level: number; text: string }[];
  paragraphs: string[];
  /** Button and link labels that read like calls to action. */
  ctas: string[];
  navLinks: { href: string; text: string }[];
  images: PageImage[];
  logoCandidates: string[];
  stylesheets: string[];
  inlineCss: string[];
  styleAttrs: string[];
  googleFonts: string[];
  emails: string[];
  phones: string[];
  /** All visible text (bounded), used for evidence checks and statistics. */
  text: string;
}

const SKIP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "canvas", "head"]);
const MAX_TEXT = 60_000;

function attr(el: Element, name: string): string | null {
  return el.attrs.find((a) => a.name === name)?.value ?? null;
}

function isElement(n: Node): n is Element {
  return "tagName" in n;
}

function textOf(n: Node, out: string[] = []): string[] {
  if (n.nodeName === "#text") out.push((n as DefaultTreeAdapterTypes.TextNode).value);
  else if (isElement(n) && SKIP.has(n.tagName)) return out;
  if ("childNodes" in n) for (const c of n.childNodes) textOf(c, out);
  if (isElement(n) && n.tagName === "template") return out;
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function resolve(href: string | null, base: string): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("data:") || h.startsWith("javascript:") || h.startsWith("#")) return null;
  try {
    const u = new URL(h, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const CTA_RE = /\b(umów|umow|zadzwoń|zadzwon|napisz|skontaktuj|kontakt|zapytaj|sprawdź|sprawdz|zobacz|poznaj|wyceń|wycen|zamów|zamow|pobierz|zapisz|odbierz|sprzedaj|kup|wynajmij|zgłoś|zglos|wyślij|wyslij|dowiedz)/i;

export function extractPage(html: string, url: string): PageExtract {
  const doc = parse(html.slice(0, 3_000_000));
  const out: PageExtract = {
    url, lang: null, title: null, description: null, themeColor: null, ogImage: null, icons: [], headings: [], paragraphs: [],
    ctas: [], navLinks: [], images: [], logoCandidates: [], stylesheets: [], inlineCss: [], styleAttrs: [], googleFonts: [],
    emails: [], phones: [], text: "",
  };
  const texts: string[] = [];
  let textLen = 0;

  // Text in menus, headers and footers repeats on every page and says little about the voice.
  const walk = (n: Node, inHeader: boolean, inNav: boolean, inChrome = false) => {
    if (!isElement(n)) {
      if (n.nodeName === "#text" && !inChrome && textLen < MAX_TEXT) {
        const v = (n as DefaultTreeAdapterTypes.TextNode).value;
        texts.push(v);
        textLen += v.length;
      }
      // The #document root (and fragments) carry children but no tag name.
      if (n.nodeName !== "#text" && n.nodeName !== "#comment" && "childNodes" in n) for (const c of n.childNodes) walk(c, inHeader, inNav, inChrome);
      return;
    }
    const tag = n.tagName;
    if (tag === "html") out.lang = attr(n, "lang");
    if (tag === "title") {
      out.title ??= clean(textOf(n).join(" ")).slice(0, 200) || null;
      return;
    }
    if (tag === "meta") {
      const name = (attr(n, "name") ?? attr(n, "property") ?? "").toLowerCase();
      const content = attr(n, "content");
      if (content) {
        if (name === "description" || name === "og:description") out.description ??= clean(content).slice(0, 400);
        if (name === "theme-color") out.themeColor = content.trim().slice(0, 40);
        if (name === "og:image") out.ogImage = resolve(content, url);
      }
    }
    if (tag === "link") {
      const rel = (attr(n, "rel") ?? "").toLowerCase();
      const href = resolve(attr(n, "href"), url);
      if (href && rel.split(/\s+/).includes("stylesheet")) {
        if (/fonts\.googleapis\.com/.test(href)) out.googleFonts.push(...googleFamilies(href));
        else out.stylesheets.push(href);
      }
      if (href && /icon/.test(rel)) out.icons.push(href);
    }
    if (tag === "style" && out.inlineCss.length < 20) out.inlineCss.push(n.childNodes.map((c) => (c.nodeName === "#text" ? (c as DefaultTreeAdapterTypes.TextNode).value : "")).join("").slice(0, 200_000));
    if (SKIP.has(tag) && tag !== "head") return;
    const style = attr(n, "style");
    if (style && out.styleAttrs.length < 300) out.styleAttrs.push(style.slice(0, 500));

    const header = inHeader || tag === "header" || /header|navbar|top-?bar/i.test(attr(n, "class") ?? "") || /header/i.test(attr(n, "id") ?? "");
    const nav = inNav || tag === "nav";
    if (/^h[1-3]$/.test(tag)) {
      const t = clean(textOf(n).join(" "));
      if (t && out.headings.length < 60) out.headings.push({ level: Number(tag[1]), text: t.slice(0, 200) });
    }
    if (tag === "p" || tag === "li") {
      const t = clean(textOf(n).join(" "));
      if (t.length >= 40 && out.paragraphs.length < 80) out.paragraphs.push(t.slice(0, 600));
    }
    if (tag === "a" || tag === "button" || (tag === "input" && /submit|button/.test(attr(n, "type") ?? ""))) {
      const href = attr(n, "href") ?? "";
      if (href.startsWith("mailto:")) out.emails.push(decodeURIComponent(href.slice(7).split("?")[0]!).trim());
      if (href.startsWith("tel:")) out.phones.push(href.slice(4).replace(/[^\d+ ]/g, "").trim());
      const t = clean(tag === "input" ? attr(n, "value") ?? "" : textOf(n).join(" "));
      // Menu items ("Kontakt" in the nav bar) are navigation, not calls to action.
      if (t && t.length <= 60 && CTA_RE.test(t) && !nav && out.ctas.length < 60) out.ctas.push(t);
      const abs = resolve(href, url);
      if (tag === "a" && abs && t && t.length <= 60 && (nav || header) && out.navLinks.length < 80) out.navLinks.push({ href: abs, text: t });
    }
    if (tag === "img" || (tag === "source" && attr(n, "srcset"))) {
      const src = resolve(attr(n, "src") ?? attr(n, "data-src") ?? (attr(n, "srcset") ?? "").split(/[\s,]/)[0] ?? null, url);
      if (src && out.images.length < 120) {
        const hint = `${attr(n, "class") ?? ""} ${attr(n, "id") ?? ""} ${src.split("/").pop() ?? ""}`.toLowerCase();
        const alt = clean(attr(n, "alt") ?? "");
        const w = Number(attr(n, "width")) || null;
        const h = Number(attr(n, "height")) || null;
        out.images.push({ src, alt: alt.slice(0, 160), hint: hint.slice(0, 200), inHeader: header, width: w, height: h });
        if (/logo/.test(hint) || /logo/i.test(alt)) out.logoCandidates.push(src);
      }
    }
    const chrome = inChrome || tag === "nav" || tag === "header" || tag === "footer";
    for (const c of n.childNodes) walk(c, header, nav, chrome);
  };
  walk(doc as unknown as Node, false, false);

  // Header images come next when nothing is explicitly called "logo".
  if (!out.logoCandidates.length) out.logoCandidates.push(...out.images.filter((i) => i.inHeader).slice(0, 2).map((i) => i.src));
  out.text = clean(texts.join(" ")).slice(0, MAX_TEXT);
  out.ctas = [...new Set(out.ctas)];
  out.emails = [...new Set(out.emails.filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)))].slice(0, 5);
  out.phones = [...new Set(out.phones.filter((p) => p.replace(/\D/g, "").length >= 9))].slice(0, 5);
  out.logoCandidates = [...new Set(out.logoCandidates)].slice(0, 4);
  out.googleFonts = [...new Set(out.googleFonts)];
  return out;
}

/** Family names from a Google Fonts CSS URL (css and css2 APIs). */
export function googleFamilies(href: string): string[] {
  try {
    const u = new URL(href);
    return u.searchParams
      .getAll("family")
      .flatMap((f) => f.split("|"))
      .map((f) => f.split(":")[0]!.replace(/\+/g, " ").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Same-site links worth reading for brand voice (about, offers, contact). */
export function pickSubpages(page: PageExtract, origin: string, max = 4): string[] {
  const score = (l: { href: string; text: string }) => {
    const s = `${l.text} ${l.href}`.toLowerCase();
    if (/o-nas|o nas|about|kim jeste|zesp|team|firma/.test(s)) return 5;
    if (/ofert|nieruchomo|mieszka|domy|sprzeda|wynaj/.test(s)) return 4;
    if (/usług|uslug|oferujemy|dlaczego|why/.test(s)) return 3;
    if (/kontakt|contact/.test(s)) return 2;
    if (/blog|porad|aktualno/.test(s)) return 1;
    return 0;
  };
  const seen = new Set<string>();
  return page.navLinks
    .filter((l) => {
      try {
        const u = new URL(l.href);
        u.hash = "";
        if (u.origin !== origin || u.pathname === "/" || /\.(pdf|jpg|png|zip|docx?)$/i.test(u.pathname)) return false;
        const key = u.toString();
        if (seen.has(key)) return false;
        seen.add(key);
        return score(l) > 0;
      } catch {
        return false;
      }
    })
    .sort((a, b) => score(b) - score(a))
    .slice(0, max)
    .map((l) => {
      const u = new URL(l.href);
      u.hash = "";
      return u.toString();
    });
}
