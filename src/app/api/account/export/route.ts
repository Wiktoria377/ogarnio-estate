import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { authorize } from "@/lib/session";

export const maxDuration = 120;

/**
 * RODO data export (art. 15/20): the user's profile and every workspace they
 * belong to, read with the user's own RLS-scoped client. Files are listed by
 * path; they can be downloaded from the app while the account exists.
 */
export async function GET() {
  try {
    const ctx = await authorize("member");
    const sb = ctx.supabase;
    const { data: profile } = await sb.from("profiles").select("*").eq("id", ctx.userId).maybeSingle();
    const workspaces = [];
    for (const m of ctx.memberships) {
      const ws = m.workspace.id;
      const [brand, assets, properties, photos, items, versions, usage, subscription, campaigns, schedule, connections, publications, leads, links, sources, brandVersions, brandAnalyses, brandRefs, brandMemory, brandDecisions, strategies, autopilotRuns, autopilotItems, recoStates] = await Promise.all([
        sb.from("brand_profiles").select("*").eq("workspace_id", ws).maybeSingle(),
        sb.from("brand_assets").select("*").eq("workspace_id", ws),
        sb.from("properties").select("*").eq("workspace_id", ws),
        sb.from("property_photos").select("*").eq("workspace_id", ws),
        sb.from("content_items").select("*").eq("workspace_id", ws),
        sb.from("content_versions").select("*").eq("workspace_id", ws).order("version"),
        sb.from("ai_usage_events").select("*").eq("workspace_id", ws).eq("user_id", ctx.userId).order("created_at"),
        sb.from("workspace_subscriptions").select("plan, status, trial_ends_at, current_period_end, cancel_at_period_end").eq("workspace_id", ws).maybeSingle(),
        sb.from("campaigns").select("*").eq("workspace_id", ws),
        sb.from("schedule_entries").select("*").eq("workspace_id", ws),
        // Accounts without tokens: credentials never leave the server.
        sb.from("social_connections").select("id, platform, name, status, external_id, created_at").eq("workspace_id", ws),
        sb.from("publications").select("id, connection_id, format, caption, link_url, scheduled_at, state, published_at, external_url, error_code").eq("workspace_id", ws),
        // Leads only as far as the user's role sees them (RLS).
        sb.from("leads").select("*").eq("workspace_id", ws),
        sb.from("tracked_links").select("*").eq("workspace_id", ws),
        sb.from("property_sources").select("id, kind, name, status, last_sync_at, created_at").eq("workspace_id", ws),
        sb.from("brand_profile_versions").select("*").eq("workspace_id", ws).order("version"),
        sb.from("brand_analyses").select("id, url, status, consent_text, consent_version, consented_by, consented_at, pages, result, error_message, created_at, finished_at").eq("workspace_id", ws),
        sb.from("brand_references").select("id, kind, title, pages, size_bytes, text_content, created_at").eq("workspace_id", ws),
        sb.from("brand_memory").select("*").eq("workspace_id", ws),
        sb.from("brand_feedback_events").select("*").eq("workspace_id", ws).order("created_at"),
        sb.from("marketing_strategies").select("*").eq("workspace_id", ws).order("created_at"),
        sb.from("autopilot_runs").select("*").eq("workspace_id", ws).order("created_at"),
        sb.from("autopilot_items").select("*").eq("workspace_id", ws).order("position"),
        sb.from("recommendation_states").select("key, status, hidden_until, reco_version, decided_by, decided_at").eq("workspace_id", ws),
      ]);
      workspaces.push({
        workspace: m.workspace,
        role: m.role,
        subscription: subscription.data,
        brand: brand.data,
        brandAssets: assets.data ?? [],
        properties: properties.data ?? [],
        propertyPhotos: photos.data ?? [],
        contentItems: (items.data ?? []).map((i) => ({ ...i, versions: (versions.data ?? []).filter((v) => v.item_id === i.id) })),
        myAiUsage: usage.data ?? [],
        campaigns: campaigns.data ?? [],
        scheduleEntries: schedule.data ?? [],
        socialAccounts: connections.data ?? [],
        publications: publications.data ?? [],
        leads: leads.data ?? [],
        trackedLinks: links.data ?? [],
        crmSources: sources.data ?? [],
        brandVersions: brandVersions.data ?? [],
        brandAnalyses: brandAnalyses.data ?? [],
        brandReferences: brandRefs.data ?? [],
        brandMemory: brandMemory.data ?? [],
        brandDecisions: brandDecisions.data ?? [],
        strategies: strategies.data ?? [],
        autopilotPlans: (autopilotRuns.data ?? []).map((r) => ({ ...r, items: (autopilotItems.data ?? []).filter((i) => i.run_id === r.id) })),
        recommendationDecisions: recoStates.data ?? [],
      });
    }
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: ctx.userId, email: ctx.userEmail, profile }, workspaces }, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="ogarnio-estate-dane-${date}.json"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
