"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Books, Buildings, Compass, Lightbulb, RocketLaunch, ChartLineUp, ChatCircleText, CalendarBlank, PaperPlaneTilt, PlugsConnected, CaretUpDown, FilePdf, FilmSlate, Megaphone, Check, Gear, House, ImageSquare, List, PaintBrushBroad, Plus, SignOut, Sparkle, SquaresFour, TextAa, Warning, X,
} from "@phosphor-icons/react/dist/ssr";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { switchWorkspace } from "@/app/workspace-actions";
import { t } from "@/i18n/pl";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: t.nav.dashboard, icon: SquaresFour },
  { href: "/director", label: t.nav.director, icon: Compass },
  { href: "/autopilot", label: t.nav.autopilot, icon: RocketLaunch },
  { href: "/recommendations", label: t.nav.recommendations, icon: Lightbulb },
  { href: "/campaigns", label: t.nav.campaigns, icon: Megaphone },
  { href: "/studio", label: t.nav.studio, icon: TextAa },
  { href: "/graphics", label: t.nav.graphics, icon: ImageSquare },
  { href: "/video", label: t.nav.video, icon: FilmSlate },
  { href: "/brochures", label: t.nav.brochures, icon: FilePdf },
  { href: "/planner", label: t.nav.planner, icon: CalendarBlank },
  { href: "/publications", label: t.nav.publications, icon: PaperPlaneTilt },
  { href: "/analytics", label: t.nav.analytics, icon: ChartLineUp },
  { href: "/leads", label: t.nav.leads, icon: ChatCircleText },
  { href: "/library", label: t.nav.library, icon: Books },
  { href: "/properties", label: t.nav.properties, icon: House },
  { href: "/brand", label: t.nav.brand, icon: PaintBrushBroad },
];
const NAV_BOTTOM = [
  { href: "/connections", label: t.nav.connections, icon: PlugsConnected },
  { href: "/skills", label: t.nav.skills, icon: Sparkle },
  { href: "/settings", label: t.nav.settings, icon: Gear },
];

interface Props {
  user: { name: string; email: string };
  workspace: { id: string; name: string; logoUrl: string | null; role: string };
  workspaces: { id: string; name: string }[];
  banner: string | null;
  /** Plan problem (trial over, payment failed): shown above every page with a link to billing. */
  planAlert?: { text: string; tone: "danger" | "warning"; href: string; cta: string } | null;
  children: React.ReactNode;
}

function NavLink({ href, label, hint, icon: Icon, onClick }: { href: string; label: string; hint?: string; icon: typeof House; onClick?: () => void }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
        active ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-line" : "text-ink-2 hover:bg-[#efede9] hover:text-ink",
      )}
    >
      <Icon size={17} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 rounded bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent-ink">{hint}</span>}
    </Link>
  );
}

function WorkspaceSwitcher({ workspace, workspaces }: Pick<Props, "workspace" | "workspaces">) {
  const [pending, start] = useTransition();
  return (
    <Menu>
      <MenuTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#efede9] data-[state=open]:bg-[#efede9]" disabled={pending}>
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface">
          {workspace.logoUrl ? <img src={workspace.logoUrl} alt="" className="size-full object-contain p-0.5" /> : <Buildings size={16} className="text-ink-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{workspace.name}</span>
          <span className="block text-[11.5px] text-ink-3 capitalize">{roleLabel(workspace.role)}</span>
        </span>
        <CaretUpDown size={14} className="text-ink-3" />
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>{t.nav.workspaces}</MenuLabel>
        {workspaces.map((w) => (
          <MenuItem key={w.id} onSelect={() => w.id !== workspace.id && start(() => switchWorkspace(w.id))}>
            <Buildings />
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === workspace.id && <Check className="!text-accent" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/onboarding">
            <Plus /> {t.nav.newWorkspace}
          </Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function roleLabel(role: string) {
  return ({ owner: "właściciel", admin: "administrator", agent: "agent", viewer: "podgląd" } as Record<string, string>)[role] ?? role;
}

function SidebarContent(props: Props & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-4 pb-3">
        <WorkspaceSwitcher workspace={props.workspace} workspaces={props.workspaces} />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        <Button asChild className="w-full justify-start" size="md">
          <Link href="/campaigns/new" onClick={props.onNavigate}>
            <Megaphone weight="bold" /> {t.nav.campaignsHint}
          </Link>
        </Button>
        <Button asChild variant="secondary" className="w-full justify-start" size="md">
          <Link href="/studio/new" onClick={props.onNavigate}>
            <Plus weight="bold" /> {t.nav.create}
          </Link>
        </Button>
      </div>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Główna nawigacja">
        {NAV.map((n) => (
          <NavLink key={n.href} {...n} onClick={props.onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 px-3 pb-2">
        {NAV_BOTTOM.map((n) => (
          <NavLink key={n.href} {...n} onClick={props.onNavigate} />
        ))}
      </div>
      <div className="border-t border-line px-3 py-3">
        <Menu>
          <MenuTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[#efede9] data-[state=open]:bg-[#efede9]">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{(props.user.name || props.user.email).slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{props.user.name}</span>
              <span className="block truncate text-[11.5px] text-ink-3">{props.user.email}</span>
            </span>
          </MenuTrigger>
          <MenuContent align="start" className="w-56">
            <MenuItem asChild>
              <Link href="/settings">
                <Gear /> {t.nav.settings}
              </Link>
            </MenuItem>
            <MenuSeparator />
            <form action="/auth/signout" method="post">
              <MenuItem asChild>
                <button type="submit" className="w-full">
                  <SignOut /> {t.nav.signOut}
                </button>
              </MenuItem>
            </form>
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}

export function AppShell(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 border-r border-line bg-[#f5f4f1] lg:block">
        <SidebarContent {...props} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/25 animate-in fade-in-0" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[272px] border-r border-line bg-[#f5f4f1] shadow-lg animate-in slide-in-from-left-4">
            <button className="absolute top-4 right-3 rounded-md p-1.5 text-ink-3 hover:bg-sunken" onClick={() => setOpen(false)} aria-label="Zamknij menu">
              <X size={16} />
            </button>
            <SidebarContent {...props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur-sm lg:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Otwórz menu">
            <List size={18} />
          </Button>
          <BrandMark />
        </header>
        {props.planAlert && (
          <div data-testid="plan-alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-6 py-2.5 text-[13px]", props.planAlert.tone === "danger" ? "border-danger/15 bg-danger-soft text-danger" : "border-warning/15 bg-warning-soft text-warning")} role="status">
            <Warning size={16} weight="fill" className="shrink-0" />
            <p className="min-w-0 flex-1">{props.planAlert.text}</p>
            <Link href={props.planAlert.href} className="font-medium underline underline-offset-2">{props.planAlert.cta}</Link>
          </div>
        )}
        {props.banner && (
          <div className="flex items-start gap-2.5 border-b border-warning/15 bg-warning-soft px-6 py-2.5 text-[13px] text-warning" role="status">
            <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
            <p>{props.banner}</p>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{props.children}</main>
      </div>
    </div>
  );
}
