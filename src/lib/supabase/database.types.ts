// Typed mirror of supabase/migrations/*. Keep in sync when the schema changes
// (with the Supabase CLI: `supabase gen types typescript --local`).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string };

export type WorkspaceRole = "owner" | "admin" | "agent" | "marketing" | "viewer";

export type ProfileRow = Timestamps & {
  id: string;
  full_name: string | null;
  locale: "pl" | "en";
  updated_at: string;
};

export type WorkspaceRow = Timestamps & {
  id: string;
  name: string;
  industry: "real_estate";
  created_by: string | null;
  updated_at: string;
  onboarding: Json;
  onboarding_completed_at: string | null;
};

export type WorkspaceMemberRow = Timestamps & {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: "active" | "deactivated";
  deactivated_at: string | null;
  deactivated_by: string | null;
  media_rights_ack_at: string | null;
  invited_by: string | null;
};

export type WorkspaceInvitationRow = Timestamps & {
  id: string;
  workspace_id: string;
  email: string;
  role: "admin" | "agent" | "marketing" | "viewer";
  token_hash: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  last_sent_at: string;
};

export type SocialPlatform = "facebook_page" | "instagram" | "linkedin_org" | "linkedin_member" | "tiktok";
export type SocialStatus = "connected" | "limited" | "reauth_required" | "unavailable" | "error" | "disconnected";
export type SocialConnectionRow = Timestamps & {
  id: string;
  workspace_id: string;
  platform: SocialPlatform;
  external_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  parent_id: string | null;
  status: SocialStatus;
  capabilities: string[];
  granted_scopes: string[];
  missing_scopes: string[];
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  connected_by: string | null;
  updated_at: string;
};

export type PublicationFormat = "text" | "photo" | "photo_set" | "carousel" | "video" | "reel";
export type PublicationState = "draft" | "pending_approval" | "scheduled" | "queued" | "publishing" | "processing" | "published" | "failed" | "action_required" | "canceled";
export type PublicationMedia = { storage_path: string; mime: string; width: number | null; height: number | null; size_bytes: number; duration_ms?: number | null };
export type PublicationMediaSpec = { source: "graphic" | "photo" | "video"; ref: string; slide?: number };
export type PublicationRow = Timestamps & {
  id: string;
  metrics_checked_at: string | null;
  workspace_id: string;
  connection_id: string;
  schedule_entry_id: string | null;
  campaign_id: string | null;
  content_item_id: string | null;
  content_version: number | null;
  format: PublicationFormat;
  caption: string;
  link_url: string | null;
  media_spec: Json;
  media: Json;
  scheduled_at: string;
  state: PublicationState;
  requested_by: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approved_hash: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
  attempt_started_at: string | null;
  uncertain: boolean;
  idempotency_key: string;
  external_container_id: string | null;
  external_id: string | null;
  external_url: string | null;
  published_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
};
export type PublicationAttemptRow = Timestamps & {
  id: number;
  publication_id: string;
  workspace_id: string;
  attempt: number;
  action: "publish" | "check_status" | "verify_uncertain" | "cancel" | "approve" | "request" | "prepare";
  outcome: "ok" | "processing" | "retry" | "failed" | "action_required" | "uncertain" | "found" | "not_found";
  error_code: string | null;
  message: string | null;
  actor: string | null;
};
export type SocialCredentialRow = {
  connection_id: string;
  workspace_id: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  scopes: string[];
  updated_at: string;
};
export type OauthStateRow = Timestamps & {
  id: string;
  state_hash: string;
  provider: "meta" | "linkedin" | "tiktok";
  workspace_id: string;
  user_id: string;
  code_verifier_enc: string | null;
  redirect_uri: string;
  expires_at: string;
  used_at: string | null;
};
export type OauthGrantRow = Timestamps & {
  id: string;
  provider: "meta" | "linkedin" | "tiktok";
  workspace_id: string;
  user_id: string;
  user_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  granted_scopes: string[];
  discovered: Json;
  expires_at: string;
  used_at: string | null;
};
export type PublicationFileRow = Timestamps & {
  id: string;
  workspace_id: string;
  publication_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
};

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";

export type WorkspaceSubscriptionRow = {
  workspace_id: string;
  plan: string;
  status: SubscriptionStatus;
  provider: "stripe" | "przelewy24" | "manual" | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_price_id: string | null;
  provider_synced_at: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  trial_used: boolean;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  limit_overrides: Json;
  updated_at: string;
};

export type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  price_tax_mode: "net" | "gross" | "unspecified";
  billing_interval: "month" | "year";
  stripe_price_id: string | null;
  is_public: boolean;
  is_active: boolean;
  sort: number;
  trial_days: number;
  max_users: number;
  max_properties: number;
  monthly_text_generations: number;
  monthly_graphic_exports: number;
  monthly_video_renders: number;
  storage_mb: number;
  max_social_accounts: number;
  max_parallel_jobs: number;
  features: string[];
  updated_at: string;
};

export type UsageLedgerRow = Timestamps & {
  id: number;
  workspace_id: string;
  metric: "text_generation" | "graphic_export" | "video_render" | "publication" | "ai_insight";
  quantity: number;
  user_id: string | null;
  ref_type: string | null;
  ref_id: string | null;
  idempotency_key: string;
  note: string | null;
};

export type BillingEventRow = {
  id: string;
  type: string;
  workspace_id: string | null;
  stripe_created: string;
  status: "received" | "processed" | "ignored" | "failed";
  error: string | null;
  received_at: string;
  processed_at: string | null;
};

export type BillingInvoiceRow = Timestamps & {
  id: string;
  workspace_id: string;
  number: string | null;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  amount_due: number;
  amount_paid: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string | null;
  period_end: string | null;
  updated_at: string;
};

export type UsageSummaryRow = {
  plan_id: string; plan_name: string; status: SubscriptionStatus; access: "full" | "read_only"; access_reason: string | null;
  trial_ends_at: string | null; current_period_end: string | null; cancel_at_period_end: boolean;
  text_used: number; text_limit: number; exports_used: number; exports_limit: number;
  renders_used: number; renders_limit: number; users_used: number; users_limit: number;
  properties_used: number; properties_limit: number; social_used: number; social_limit: number;
  storage_used_mb: number; storage_limit_mb: number; max_parallel_jobs: number;
};

export type BrandProfileRow = {
  workspace_id: string;
  company_name: string;
  tagline: string | null;
  logo_asset_id: string | null;
  colors: Json;
  heading_font: string;
  body_font: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  website: string | null;
  socials: Json;
  brand_style: "luxury" | "modern_minimal" | "elegant_corporate" | "warm_lifestyle" | "bold_contemporary";
  personality: string | null;
  target_audience: string | null;
  communication_style:
    | "professional_warm"
    | "expert_formal"
    | "friendly_direct"
    | "premium_restrained"
    | "energetic_modern";
  address_form: "ty" | "pan_pani" | "wy";
  emoji_policy: "none" | "sparing";
  preferred_phrases: string | null;
  avoided_phrases: string | null;
  extended: Json;
  approved_version: number | null;
  memory_enabled: boolean;
  memory_updated_at: string | null;
  updated_by: string | null;
  updated_at: string;
};
export type FeedbackKind =
  | "content_edited" | "variant_selected" | "variant_rejected" | "content_accepted"
  | "graphic_template" | "graphic_edited" | "graphic_accepted"
  | "material_approved" | "material_rejected";
export type BrandFeedbackEventRow = {
  id: string;
  workspace_id: string;
  kind: FeedbackKind;
  subject_type: "content_item" | "graphic" | "campaign" | "autopilot_item" | "publication";
  subject_id: string | null;
  data: Json;
  created_by: string | null;
  created_at: string;
};
export type MemoryKind = "cta" | "avoid" | "headline" | "headline_style" | "tone" | "template" | "color" | "rejected" | "example_text" | "note";
export type BrandMemoryRow = {
  id: string;
  workspace_id: string;
  level: "explicit" | "suggested";
  status: "active" | "dismissed";
  kind: MemoryKind;
  content: string;
  detail: Json;
  dedupe_key: string;
  source: "manual" | "decision" | "suggestion" | "approval";
  evidence_count: number;
  evidence: Json;
  created_by: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  last_used_at: string | null;
};

export type BrandVersionStatus = "draft" | "approved" | "superseded" | "discarded";
export type BrandProfileVersionRow = {
  id: string;
  workspace_id: string;
  version: number;
  status: BrandVersionStatus;
  source: "initial" | "manual" | "analysis" | "restore";
  snapshot: Json;
  confidence: Json;
  analysis_id: string | null;
  restored_from: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
};
export type BrandAnalysisRow = {
  id: string;
  workspace_id: string;
  url: string;
  status: "queued" | "running" | "succeeded" | "failed";
  consent_text: string;
  consent_version: string;
  consented_by: string;
  consented_at: string;
  use_references: boolean;
  job_id: string | null;
  pages: Json;
  result: Json | null;
  version_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};
export type BrandReferenceRow = {
  id: string;
  workspace_id: string;
  kind: "pdf" | "post" | "description";
  title: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number;
  pages: number | null;
  text_content: string;
  extraction_note: string | null;
  created_by: string | null;
  created_at: string;
};

export type BrandAssetRow = Timestamps & {
  id: string;
  workspace_id: string;
  kind: "logo" | "reference";
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  label: string | null;
  created_by: string | null;
};

export type PropertyRow = Timestamps & {
  id: string;
  workspace_id: string;
  title: string;
  property_type: "apartment" | "house" | "plot" | "commercial" | "office" | "premises" | "garage" | "room" | "other";
  market: "primary" | "secondary" | null;
  transaction_type: "sale" | "rent";
  city: string | null;
  district: string | null;
  street: string | null;
  show_street: boolean;
  area_m2: number | null;
  rooms: number | null;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  price: number | null;
  currency: "PLN" | "EUR" | "USD";
  price_per_m2: number | null;
  description: string | null;
  features: string[];
  amenities: string[];
  agent_id: string | null;
  status: "draft" | "active" | "reserved" | "sold" | "rented" | "archived";
  created_by: string | null;
  source_id: string | null;
  external_ref: string | null;
  external_hash: string | null;
  last_synced_at: string | null;
  public_slug: string | null;
  public_enabled: boolean;
  updated_at: string;
};

export type PropertyPhotoRow = Timestamps & {
  id: string;
  workspace_id: string;
  property_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  position: number;
  caption: string | null;
  is_visualization: boolean;
  source_url: string | null;
  created_by: string | null;
  analysis: Json | null;
  analyzed_at: string | null;
};

export type ContentItemRow = Timestamps & {
  id: string;
  workspace_id: string;
  property_id: string | null;
  kind: "text" | "graphic" | "video" | "document";
  content_type: string;
  title: string;
  platform: string | null;
  status: "draft" | "review" | "ready";
  current_version: number;
  params: Json;
  stale_reason: string | null;
  stale_since: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
  /** Last QA report (written by the server only), for version qa_version. */
  qa: Json | null;
  qa_version: number | null;
  qa_at: string | null;
};

export type ContentVersionRow = Timestamps & {
  id: string;
  item_id: string;
  workspace_id: string;
  version: number;
  body: Json;
  source: "ai_generate" | "ai_refine" | "manual" | "template" | "duplicate";
  operation: string | null;
  skills_used: Json;
  quality: Json | null;
  model: string | null;
  created_by: string | null;
};

export type AiUsageEventRow = Timestamps & {
  id: number;
  workspace_id: string;
  user_id: string | null;
  operation: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  status: "ok" | "error" | "rejected";
  error_code: string | null;
  latency_ms: number | null;
  process_type: string | null;
  process_id: string | null;
  prompt_version: string | null;
};

export type AutopilotRunRow = {
  id: string;
  workspace_id: string;
  title: string;
  status: "planned" | "generating" | "ready" | "archived";
  input: Json;
  rationale: Json;
  data_snapshot: Json;
  strategy_id: string | null;
  ai_limit: number;
  ai_used: number;
  plan_version: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutopilotItemStatus = "proposed" | "generating" | "ready" | "failed" | "accepted" | "rejected" | "scheduled";
export type AutopilotItemRow = {
  id: string;
  run_id: string;
  workspace_id: string;
  position: number;
  kind: "post" | "carousel" | "promo_graphic" | "video_script" | "ad_proposal";
  platform: "instagram" | "facebook" | "linkedin" | "tiktok";
  pillar: string;
  goal: string;
  property_id: string | null;
  content_type: string;
  format: "square" | "carousel" | "story" | null;
  planned_at: string;
  topic: string;
  rationale: string;
  status: AutopilotItemStatus;
  content_item_id: string | null;
  schedule_entry_id: string | null;
  generations: number;
  error: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingStrategyRow = {
  id: string;
  workspace_id: string;
  title: string;
  status: "draft" | "accepted" | "archived";
  input: Json;
  data_snapshot: Json;
  output: Json;
  warnings: Json;
  prompt_version: string;
  model: string;
  skills: Json;
  created_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignGoal = "buyers" | "new_listing" | "price_drop" | "premium" | "open_house" | "agent_brand";
export type CampaignStyle = "brand" | "premium" | "warm" | "expert" | "direct" | "energetic";

export type CampaignRow = Timestamps & {
  id: string;
  workspace_id: string;
  property_id: string | null;
  name: string;
  goal: CampaignGoal;
  audience: string;
  style: CampaignStyle;
  platforms: string[];
  deliverables: string[];
  options: Json;
  brief: Json | null;
  brief_version: string | null;
  status: "draft" | "active" | "archived";
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type CampaignAssetRow = Timestamps & {
  id: string;
  workspace_id: string;
  campaign_id: string;
  deliverable: string;
  content_item_id: string | null;
};

export type JobKind = "campaign_brief" | "campaign_asset" | "video_render" | "import_fetch" | "import_photos" | "brand_analysis" | "autopilot_item";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type GenerationJobRow = Timestamps & {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  content_item_id: string | null;
  kind: JobKind;
  deliverable: string | null;
  label: string;
  payload: Json;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  manual_retries: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  progress: number;
  result: Json | null;
  error_message: string | null;
  error_code: string | null;
  instructions_version: string | null;
  dedupe_key: string | null;
  created_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

export type RenderedFileRow = Timestamps & {
  id: string;
  workspace_id: string;
  content_item_id: string;
  version: number;
  kind: "video_mp4" | "brochure_pdf";
  storage_path: string;
  mime_type: "video/mp4" | "application/pdf";
  size_bytes: number;
  meta: Json;
  job_id: string | null;
  created_by: string | null;
};

export type MediaAssetRow = Timestamps & {
  id: string;
  workspace_id: string;
  kind: "audio";
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  label: string;
  rights_confirmed_at: string;
  rights_note: string | null;
  created_by: string | null;
};

export type SchedulePlanRow = Timestamps & {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  name: string;
  start_date: string;
  days: 7 | 14 | 30;
  posts_per_week: number;
  channels: string[];
  created_by: string | null;
};

export type ScheduleStatus = "idea" | "in_progress" | "for_approval" | "ready" | "published";
export type ScheduleChannel = "instagram" | "facebook" | "tiktok" | "linkedin" | "meta_ads" | "email" | "website" | "other";

export type ScheduleEntryRow = Timestamps & {
  id: string;
  workspace_id: string;
  plan_id: string | null;
  campaign_id: string | null;
  content_item_id: string | null;
  title: string;
  channel: ScheduleChannel;
  scheduled_at: string;
  status: ScheduleStatus;
  notes: string | null;
  published_at: string | null;
  publish_provider: "manual" | "meta" | "tiktok" | "linkedin" | null;
  external_post_id: string | null;
  external_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type ExportEventRow = Timestamps & {
  id: number;
  workspace_id: string;
  content_item_id: string | null;
  user_id: string | null;
  format: "png" | "jpg" | "pdf" | "zip" | "mp4" | "txt" | "md";
  version: number | null;
  size_bytes: number | null;
};

export type DesignTemplateRow = Timestamps & {
  id: string;
  workspace_id: string;
  name: string;
  base_template: string;
  format: string;
  design: Json;
  created_by: string | null;
};

export type AppErrorRow = Timestamps & {
  id: number;
  workspace_id: string | null;
  user_id: string | null;
  area: string;
  code: string | null;
  message: string;
  context: Json;
};

export type ImportSourceKind = "csv" | "feed_xml" | "feed_json" | "asari" | "esticrm";
export type PropertySourceRow = {
  id: string;
  workspace_id: string;
  kind: ImportSourceKind;
  name: string;
  config: Json;
  sync_policy: "review";
  status: "active" | "error" | "disabled";
  last_sync_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type PropertySourceSecretRow = { source_id: string; workspace_id: string; secret_enc: string; updated_at: string };
export type ImportBatchRow = {
  id: string;
  workspace_id: string;
  source_id: string;
  kind: ImportSourceKind;
  label: string;
  status: "preview" | "importing" | "completed" | "failed" | "discarded";
  headers: string[];
  mapping: Json;
  options: Json;
  total_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
  expires_at: string;
};
export type ImportRowAction = "create" | "update" | "skip" | "invalid" | "unchanged";
export type ImportRowRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  row_number: number;
  raw: Json;
  normalized: Json | null;
  issues: Json;
  external_ref: string | null;
  photo_urls: string[];
  match_property_id: string | null;
  match_kind: "external_ref" | "fingerprint" | "file" | null;
  action: ImportRowAction;
  selected: boolean;
  result: "created" | "updated" | "skipped" | "failed" | "change_pending" | null;
  result_message: string | null;
  property_id: string | null;
};
export type PropertyChangeRow = {
  id: string;
  workspace_id: string;
  property_id: string;
  source_id: string | null;
  batch_id: string | null;
  changes: Json;
  incoming: Json;
  incoming_hash: string;
  photo_urls: string[];
  status: "pending" | "applied" | "dismissed" | "superseded";
  price_changed: boolean;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export type PublicationMetricsRow = {
  id: string;
  workspace_id: string;
  publication_id: string;
  fetched_at: string;
  source: "meta" | "linkedin" | "mock";
  metrics: Json;
  unavailable: string[];
  note: string | null;
};
export type TrackedLinkRow = {
  id: string;
  workspace_id: string;
  slug: string;
  label: string;
  target: "offer_page" | "external";
  target_url: string | null;
  property_id: string | null;
  campaign_id: string | null;
  publication_id: string | null;
  channel: string | null;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
};
export type WebEventRow = {
  id: number;
  workspace_id: string;
  kind: "click" | "page_view";
  link_id: string | null;
  property_id: string | null;
  visitor_hash: string;
  is_bot: boolean;
  referrer_host: string | null;
  created_at: string;
};
export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "spam";
export type LeadRow = {
  id: string;
  workspace_id: string;
  property_id: string | null;
  link_id: string | null;
  campaign_id: string | null;
  channel: string | null;
  utm: Json;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  consent_contact: boolean;
  consent_text: string;
  consent_version: string;
  consent_at: string;
  visitor_hash: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type LeadEventRow = {
  id: number;
  lead_id: string;
  workspace_id: string;
  kind: "created" | "status" | "assigned" | "note";
  detail: Json;
  actor: string | null;
  created_at: string;
};
export type RecommendationStateRow = {
  id: string;
  workspace_id: string;
  key: string;
  status: "dismissed" | "done";
  hidden_until: string;
  reco_version: string;
  decided_by: string | null;
  decided_at: string;
};
export type AnalyticsInsightRow = {
  id: string;
  workspace_id: string;
  period_from: string;
  period_to: string;
  insights: Json;
  dropped: Json;
  model: string;
  version: string;
  created_by: string | null;
  created_at: string;
};

export type PlatformAdminRow = { user_id: string; role: "admin" | "viewer"; note: string | null; created_by: string | null; created_at: string };
export type AdminAuditRow = {
  id: number;
  actor: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  workspace_id: string | null;
  reason: string | null;
  detail: Json;
  ip: string | null;
  created_at: string;
};
export type AdminWorkspaceRow = {
  id: string;
  name: string;
  created_at: string;
  onboarding_completed_at: string | null;
  plan: string | null;
  status: SubscriptionStatus | null;
  provider: "stripe" | "przelewy24" | "manual" | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  members: number;
  properties: number;
  content_items: number;
  exports: number;
  published: number;
  last_activity: string | null;
};
export type ContactMessageRow = { id: string; name: string; email: string; company: string | null; topic: "demo" | "pricing" | "integration" | "other"; message: string; consent_text: string; consent_version: string; visitor_hash: string | null; status: "new" | "answered" | "spam"; created_at: string };
export type SiteEventRow = { id: number; path: string; referrer_host: string | null; utm_source: string | null; utm_campaign: string | null; visitor_hash: string; created_at: string };
export type CostRateKind = "ai_input_mtok" | "ai_output_mtok" | "video_render_minute" | "storage_gb_month";
export type CostRateRow = { id: string; kind: CostRateKind; model: string; amount: number; currency: "USD" | "PLN" | "EUR"; note: string | null; updated_by: string | null; updated_at: string };
export type PlatformBudgetRow = { category: "ai" | "video_render"; monthly_limit: number; currency: "USD" | "PLN" | "EUR"; alert_pct: number; enabled: boolean; updated_by: string | null; updated_at: string };

type Table<Row, Required extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Omit<Row, Generated>> & Pick<Row, Required>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      workspaces: Table<WorkspaceRow, "name">;
      workspace_members: Table<WorkspaceMemberRow, "workspace_id" | "user_id" | "role">;
      workspace_subscriptions: Table<WorkspaceSubscriptionRow, "workspace_id">;
      brand_profiles: Table<BrandProfileRow, "workspace_id" | "company_name">;
      brand_profile_versions: Table<BrandProfileVersionRow, "workspace_id" | "version" | "status" | "source" | "snapshot">;
      brand_analyses: Table<BrandAnalysisRow, "workspace_id" | "url" | "consent_text" | "consent_version" | "consented_by">;
      brand_references: Table<BrandReferenceRow, "workspace_id" | "kind" | "title">;
      brand_feedback_events: Table<BrandFeedbackEventRow, "workspace_id" | "kind" | "subject_type">;
      brand_memory: Table<BrandMemoryRow, "workspace_id" | "level" | "kind" | "content" | "dedupe_key" | "source">;
      brand_assets: Table<
        BrandAssetRow,
        "workspace_id" | "kind" | "storage_path" | "mime_type" | "size_bytes"
      >;
      properties: Table<PropertyRow, "workspace_id" | "title" | "property_type", "price_per_m2">;
      property_photos: Table<
        PropertyPhotoRow,
        "workspace_id" | "property_id" | "storage_path" | "mime_type" | "size_bytes" | "width" | "height"
      >;
      content_items: Table<ContentItemRow, "workspace_id" | "kind" | "content_type" | "title">;
      content_versions: Table<ContentVersionRow, "item_id" | "workspace_id" | "version" | "body" | "source">;
      ai_usage_events: Table<AiUsageEventRow, "workspace_id" | "operation" | "status", "id">;
      marketing_strategies: Table<MarketingStrategyRow, "id" | "workspace_id" | "title" | "input" | "output" | "prompt_version" | "model">;
      autopilot_runs: Table<AutopilotRunRow, "id" | "workspace_id" | "title" | "input" | "ai_limit" | "plan_version">;
      autopilot_items: Table<AutopilotItemRow, "run_id" | "workspace_id" | "position" | "kind" | "platform" | "pillar" | "goal" | "content_type" | "planned_at" | "rationale">;
      campaigns: Table<CampaignRow, "workspace_id" | "name" | "goal" | "audience" | "style" | "platforms" | "deliverables">;
      campaign_assets: Table<CampaignAssetRow, "workspace_id" | "campaign_id" | "deliverable">;
      generation_jobs: Table<GenerationJobRow, "workspace_id" | "kind" | "label">;
      rendered_files: Table<RenderedFileRow, "workspace_id" | "content_item_id" | "version" | "kind" | "storage_path" | "mime_type" | "size_bytes">;
      media_assets: Table<MediaAssetRow, "workspace_id" | "kind" | "storage_path" | "mime_type" | "size_bytes" | "label" | "rights_confirmed_at">;
      schedule_plans: Table<SchedulePlanRow, "workspace_id" | "name" | "start_date" | "days" | "posts_per_week" | "channels">;
      schedule_entries: Table<ScheduleEntryRow, "workspace_id" | "title" | "channel" | "scheduled_at">;
      export_events: Table<ExportEventRow, "workspace_id" | "format", "id">;
      design_templates: Table<DesignTemplateRow, "workspace_id" | "name" | "base_template" | "format" | "design">;
      app_errors: Table<AppErrorRow, "area" | "message", "id">;
      workspace_invitations: Table<WorkspaceInvitationRow, "workspace_id" | "email" | "role" | "token_hash">;
      plans: Table<PlanRow, "id" | "name" | "max_users" | "max_properties" | "monthly_text_generations" | "monthly_graphic_exports" | "monthly_video_renders" | "storage_mb" | "max_social_accounts">;
      usage_ledger: Table<UsageLedgerRow, "workspace_id" | "metric" | "quantity" | "idempotency_key", "id">;
      billing_events: Table<BillingEventRow, "id" | "type" | "stripe_created">;
      billing_invoices: Table<BillingInvoiceRow, "id" | "workspace_id" | "status" | "currency">;
      social_connections: Table<SocialConnectionRow, "workspace_id" | "platform" | "external_id" | "name">;
      social_credentials: Table<SocialCredentialRow, "connection_id" | "workspace_id" | "access_token_enc">;
      oauth_states: Table<OauthStateRow, "state_hash" | "provider" | "workspace_id" | "user_id" | "redirect_uri">;
      oauth_grants: Table<OauthGrantRow, "provider" | "workspace_id" | "user_id" | "user_token_enc">;
      publications: Table<PublicationRow, "workspace_id" | "connection_id" | "format" | "scheduled_at">;
      publication_attempts: Table<PublicationAttemptRow, "publication_id" | "workspace_id" | "attempt" | "action" | "outcome", "id">;
      publication_files: Table<PublicationFileRow, "workspace_id" | "publication_id" | "storage_path" | "mime_type" | "size_bytes">;
      property_sources: Table<PropertySourceRow, "workspace_id" | "kind" | "name">;
      property_source_secrets: Table<PropertySourceSecretRow, "source_id" | "workspace_id" | "secret_enc">;
      import_batches: Table<ImportBatchRow, "workspace_id" | "source_id" | "kind" | "label">;
      import_rows: Table<ImportRowRow, "batch_id" | "workspace_id" | "row_number" | "raw">;
      property_changes: Table<PropertyChangeRow, "workspace_id" | "property_id" | "changes" | "incoming" | "incoming_hash">;
      publication_metrics: Table<PublicationMetricsRow, "workspace_id" | "publication_id" | "source">;
      tracked_links: Table<TrackedLinkRow, "workspace_id" | "slug" | "label" | "target" | "utm_source" | "utm_medium" | "utm_campaign">;
      web_events: Table<WebEventRow, "workspace_id" | "kind" | "visitor_hash", "id">;
      leads: Table<LeadRow, "workspace_id" | "name" | "consent_contact" | "consent_text" | "consent_version">;
      lead_events: Table<LeadEventRow, "lead_id" | "workspace_id" | "kind", "id">;
      platform_admins: Table<PlatformAdminRow, "user_id" | "role">;
      admin_audit_log: Table<AdminAuditRow, "action", "id">;
      cost_rates: Table<CostRateRow, "kind" | "amount">;
      platform_budgets: Table<PlatformBudgetRow, "category" | "monthly_limit">;
      contact_messages: Table<ContactMessageRow, "name" | "email" | "message" | "consent_text" | "consent_version">;
      site_events: Table<SiteEventRow, "path" | "visitor_hash", "id">;
      recommendation_states: Table<RecommendationStateRow, "workspace_id" | "key" | "status" | "hidden_until" | "reco_version", "id">;
      analytics_insights: Table<AnalyticsInsightRow, "workspace_id" | "period_from" | "period_to" | "insights" | "model" | "version">;
    };
    Views: { [_ in never]: never };
    Functions: {
      ai_usage_month: { Args: { p_from?: string | null; p_to?: string | null }; Returns: { workspace_id: string; operation: string; model: string; calls: number; errors: number; input_tokens: number; output_tokens: number }[] };
      render_seconds: { Args: { p_from?: string | null; p_to?: string | null }; Returns: { workspace_id: string; renders: number; failed: number; seconds: number }[] };
      run_retention: { Args: Record<string, never>; Returns: Json };
      record_brand_version: { Args: { p_ws: string; p_source: string; p_note?: string | null; p_restored_from?: number | null }; Returns: number };
      approve_brand_version: { Args: { p_version: string }; Returns: number };
      create_brand_draft: { Args: { p_ws: string; p_source: string; p_snapshot: Json; p_confidence: Json; p_analysis: string | null; p_note: string | null; p_author: string; p_restored_from?: number | null }; Returns: string };
      brand_profile_snapshot: { Args: { p_ws: string }; Returns: Json };
      clear_brand_memory: { Args: { p_ws: string }; Returns: Json };
      admin_workspaces: { Args: Record<string, never>; Returns: AdminWorkspaceRow[] };
      storage_by_workspace: { Args: Record<string, never>; Returns: { workspace_id: string; bytes: number }[] };
      create_workspace: { Args: { p_name: string }; Returns: string };
      rate_limit_hit: { Args: { p_key: string; p_window_seconds: number; p_max: number }; Returns: boolean };
      month_start_warsaw: { Args: Record<string, never>; Returns: string };
      accept_invitation: { Args: { p_token: string }; Returns: string };
      workspace_limits: { Args: { p_ws: string }; Returns: { plan_id: string; plan_name: string; status: string; access: "full" | "read_only"; access_reason: string | null; max_users: number; max_properties: number; monthly_text_generations: number; monthly_graphic_exports: number; monthly_video_renders: number; storage_mb: number; max_social_accounts: number; max_parallel_jobs: number; trial_ends_at: string | null }[] };
      claim_publications: { Args: { p_worker: string; p_limit?: number; p_stale_seconds?: number }; Returns: PublicationRow[] };
      acknowledge_media_rights: { Args: { p_ws: string }; Returns: undefined };
      can_edit_property: { Args: { p_property: string }; Returns: boolean };
      usage_summary: { Args: { p_ws: string }; Returns: UsageSummaryRow[] };
      consume_usage: { Args: { p_ws: string; p_metric: string; p_quantity: number; p_key: string; p_ref_type?: string | null; p_ref_id?: string | null }; Returns: { used: number; monthly_limit: number | null }[] };
      refund_usage: { Args: { p_ws: string; p_key: string; p_note?: string | null }; Returns: boolean };
      is_workspace_member: { Args: { ws: string }; Returns: boolean };
      has_workspace_role: { Args: { ws: string; roles: string[] }; Returns: boolean };
      reorder_property_photos: { Args: { p_property: string; p_ids: string[] }; Returns: undefined };
      add_content_version: {
        Args: {
          p_item: string;
          p_body: Json;
          p_source: string;
          p_operation?: string | null;
          p_skills?: Json;
          p_quality?: Json | null;
          p_model?: string | null;
        };
        Returns: number;
      };
      ai_quota_status: { Args: { p_ws: string }; Returns: { used: number; monthly_limit: number }[] };
      render_quota_status: { Args: { p_ws: string }; Returns: { used: number; monthly_limit: number }[] };
      claim_generation_job: { Args: { p_worker: string; p_stale_seconds?: number }; Returns: GenerationJobRow[] };
      retry_generation_job: { Args: { p_job: string }; Returns: undefined };
      cancel_generation_job: { Args: { p_job: string }; Returns: undefined };
      add_content_version_as: {
        Args: {
          p_actor: string;
          p_item: string;
          p_body: Json;
          p_source: string;
          p_operation?: string | null;
          p_skills?: Json;
          p_quality?: Json | null;
          p_model?: string | null;
        };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
