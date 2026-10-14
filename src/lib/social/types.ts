import "server-only";
import type { PublicationMedia, PublicationRow, SocialConnectionRow, SocialPlatform, SocialStatus } from "@/lib/supabase/database.types";
import type { SocialError } from "./http";

/** An account found during OAuth that the user may choose to connect. */
export interface DiscoveredAccount {
  key: string;
  platform: SocialPlatform;
  external_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  /** Encrypted account-level token (e.g. a Facebook Page token); absent = use the grant's user token. */
  token_enc: string | null;
  parent_key: string | null;
  status: SocialStatus;
  missing_scopes: string[];
  note: string | null;
}

export interface GrantTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
}

export interface MediaFile extends PublicationMedia {
  /** Signed public URL the platform downloads from (Meta). */
  url: string;
  /** Bytes loader for platforms that take uploads (LinkedIn). */
  read: () => Promise<Buffer>;
}

export interface PublishInput {
  connection: SocialConnectionRow;
  token: string;
  pub: PublicationRow;
  media: MediaFile[];
}

export type PublishOutcome =
  | { kind: "published"; externalId: string; url: string | null }
  | { kind: "processing"; containerId: string | null; externalId: string | null; checkAfterMs: number };

export type CheckOutcome = PublishOutcome | { kind: "failed"; error: SocialError };

export interface ConnectionHealth {
  status: SocialStatus;
  missing_scopes: string[];
  name?: string;
  message?: string;
}

export interface PlatformAdapter {
  publish(input: PublishInput): Promise<PublishOutcome>;
  /** Follows platform-side processing (IG containers, FB video). */
  checkStatus(input: PublishInput): Promise<CheckOutcome>;
  /** After an uncertain write: looks for the post on the platform (created after `since`). */
  findExisting(input: PublishInput, since: Date): Promise<{ externalId: string; url: string | null } | null>;
  health(connection: SocialConnectionRow, token: string): Promise<ConnectionHealth>;
}
