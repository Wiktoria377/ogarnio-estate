# Integration research: Polish RE CRMs, social publishing APIs, Stripe Billing (PL)

Research date: 2026-10-13. Sources are official docs unless marked otherwise. "niepotwierdzone" = I could not confirm it from an official source.
No scraping or unofficial APIs are recommended anywhere in this report.

---

## Part A: Polish real-estate CRMs and portal export formats

### A.1 Key finding: two legitimate integration paths

1. **Client-scoped CRM API** (the agency's own credentials, pasted into our SaaS). Confirmed for **ASARI** and **EstiCRM** only.
2. **Acting as a "portal" export target.** Every major CRM pushes a ZIP/XML package plus photos over **FTP** to portals. The agency adds our FTP account as an export in the CRM. This works for ASARI, Galactica Virgo, IMO and EstiCRM, but some vendors check or whitelist new portals first.
   - Evidence: OnGeo's (archived) setup guide covers Virgo, Asari, IMO, Esti, Agencja5000 and mediaRent, all via FTP credentials: https://blog.ongeo.pl/eksport-ofert-nieruchomosci
   - zaadresowani.pl accepts FTP ZIP packages in Otodom, Gratka or oferty.net/domy.pl XML: https://zaadresowani.pl/import/dokumentacja

Otodom's integrated CRMs are Asari, IMO, Esti CRM, VixCRM, mediaRent and LocumNet Online (https://partner.otodom.pl). nieruchomosci-online.pl lists Galactica Virgo, IMO, LocumNet, ASARI, Agencja5000/3000, mediaRent and EstiCRM (https://www.nieruchomosci-online.pl/polecane-oprogramowanie.html).

### A.2 System matrix

| System | Public/partner API | Auth | Access requirements | Formats | Portal-style export a client can point at a third party | Webhooks | Photos | Source |
|---|---|---|---|---|---|---|---|---|
| **ASARI CRM** | Yes. "Site API" at `https://api.asari.pro/site/`, plus an MLS API | Header `SiteAuth: userID:Token` | How a client gets userId/Token is not documented publicly (niepotwierdzone; likely issued by ASARI support or in settings) | JSON (`success`, `data`, `totalCount`). Dates `yyyy-MM-dd hh:mm:ss`. Money `{amount,currency}` | Yes. FTP export in **EbiuroV2** XML. A new portal must pass a test checklist, then contact ASARI DOK | None documented | `img.asariweb.pl/thumbnail/?id=` (180x120) and `/normal/?id=` (1024x768), public | https://asaricrm.atlassian.net/wiki/spaces/DOKU/pages/3770773/API+ASARI+CRM ; https://asaricrm.atlassian.net/wiki/spaces/DOKU/pages/3770812/Site |
| ASARI endpoints | `POST /exportedListingIdList` returns id + `lastUpdated` (diff it yourself; no since-filter). `POST /listing` (id). Also `listingFieldsMetadata`, `user/list`, `company/getCompanyData`. Write: `createListing`, `createSeeker`, `customer/create` | – | – | – | – | – | – | https://asaricrm.atlassian.net/wiki/spaces/DOKU/pages/3770812/Site |
| ASARI limits | 25 requests/min, 3–4 s spacing recommended. ASARI recommends caching data in your own DB | – | – | – | – | – | – | https://asaricrm.atlassian.net/wiki/spaces/DOKU/pages/3770773/API+ASARI+CRM |
| **EstiCRM** | Yes. **EstiAPI v1.5** at `https://app.esticrm.pl/apiClient` | `company` + `token` params (GET/POST). Found under Ustawienia → Dane firmowe. Admin users only | Client self-serve (the agency admin copies company ID and token). `POST /offer/store` must be unlocked via pomoc@esticrm.pl | JSON | Yes. "EstiCRM XML" export to "any external server" (offers XML + photos + `definitions.xml`). Field list published, no XSD | None documented | `send-picture` / `destroy-picture` endpoints. Photo URLs in offer data (exact field niepotwierdzone) | https://przetestuj.esticrm.pl/docs/EstiCRM-API-dokumentacja-techniczna.pdf ; https://przetestuj.esticrm.pl/help/esticrmxml |
| EstiCRM endpoints | `GET /offer/list` (skip/take, status), `/offer/basic-list`, `/offer/exported-list`, `/offer/archive-list`, `/offer/details?id=`, `/offer/dictionary`, `/offer/mapping`, `/user/exported-list`. Incremental sync via `updateDate` | – | – | – | – | – | – | same PDF |
| EstiCRM other | Separate Mobile API docs exist | niepotwierdzone | niepotwierdzone | – | – | – | – | https://docs.mobile-api.esticrm.pl/ |
| **IMO (imo.pl)** | No public API found (niepotwierdzone) | – | Unlisted portals are requested via IMO Helpdesk | ZIP package: XML + JPG | Yes. FTP export with per-portal templates. Full export at setup and about every 30 days, diff export within about 60 min. New portals added on request | None | JPGs inside the ZIP | https://instrukcja.imo.pl/index.php/Konfiguracja_eksport%C3%B3w ; https://www.imo.pl/pomoc/imo/najczesciej-zadawane-pytania-na-temat-programu-imo/ |
| **Galactica Virgo** | No public API found (niepotwierdzone) | – | Exports to "a server of your choice in a format of your choice" only after Galactica checks the portal. Contact kontakt@galactica.pl | "A dozen-plus" formats (names not published) | Yes. FTP, real-time, 24/7, with event logs | None mentioned | Inside the export package (niepotwierdzone) | https://virgo.galactica.pl/eksporty-na-portale |
| **WebEstate** | Nothing official found (niepotwierdzone) | – | – | – | – | – | – | none found |
| **Agencja5000/3000** | No API found (niepotwierdzone) | – | – | Has an "FTP account, Gratka.pl format" export option | Yes, FTP in Gratka format | – | – | https://blog.ongeo.pl/eksport-ofert-nieruchomosci |

### A.3 Portal-side APIs and formats (import into portals)

| Item | Facts | Source |
|---|---|---|
| **Otodom / OLX Group RE API** | Partner API covering Otodom (PL), Imovirtual (PT) and Storia (RO). OAuth2 `authorization_code` + `refresh_token`. The user authorizes at `https://<site>/<locale>/crm/authorization/`. Token endpoint `https://api.olxgroup.com/oauth/v1/token` with Basic auth + `X-API-KEY` header. Auth code lasts 60 s, access token 1 h. Refresh rotates the refresh token. No PKCE | https://developer.olxgroup.com/docs/authorization-flow |
| Access | Register as a developer (company, sites, integration description). OLX approves the account, which "may take a few days". Then create an app (callback + notification URLs) to get Client ID/Secret and an API key | https://developer.olxgroup.com/docs/request-an-application |
| Capabilities | Advert API to publish, edit, delete and (de)activate adverts. Taxonomy mapping required. Webhook notifications for advert status (ack quickly or deliveries are retried a few times) | https://developer.olxgroup.com/docs ; https://developer.olxgroup.com/docs/webhooks |
| Relevance | This API is for **pushing** adverts into Otodom. It does **not** read a CRM's listings. Only useful if our SaaS itself publishes to Otodom | same |
| **Otodom XML** | Legacy. Docs only for remaining partners. Otodom told agencies to move to the API (EstiCRM set a 2.12.2024 deadline). Version "170130" is still accepted by some third-party importers | https://developer.olxgroup.com/docs/xml-otodom-poland ; https://www.otodom.pl/wiadomosci/profesjonalisci/api-klucz-do-eksportu-danych-na-otodom ; https://zaadresowani.pl/import/dokumentacja |
| **Gratka XML** | Widely supported CRM export format (ISO-8859-2). No official public schema found (niepotwierdzone) | https://zaadresowani.pl/import/dokumentacja |
| **oferty.net / domy.pl XML** | Spec v0.4.x referenced by importers. No official public schema found (niepotwierdzone) | https://zaadresowani.pl/import/dokumentacja |
| **EbiuroV2 (ASARI)** | Spec PDF + `asari.WEB_definictions.xml` linked from the ASARI wiki. FTP server must comply with RFC 3659. Upload order: definitions → photos → `*_NNN.xml` → `*_CFG.xml`. `<DELETE>` lists offer numbers only. Encodings UTF-8, WIN1250, ISO8859-2 | https://asaricrm.atlassian.net/wiki/spaces/DOKU/pages/3769771/Procedura+integracji+ASARI+z+portalami |
| **nieruchomosci-online, Gratka, Domy.pl official partner import docs** | Not found publicly (niepotwierdzone) | – |

**Recommendation:** build native adapters for ASARI Site API and EstiAPI first, since both are client-key and self-serve-ish. Then add a generic **FTP receiver** that parses EbiuroV2, EstiCRM XML, Gratka XML and Otodom-legacy XML packages to cover IMO, Virgo and the long tail. Each vendor must approve or whitelist us as an export target, so plan for business-development contact.

---

## Part B: Social publishing APIs (2026)

### B.0 Versions

| Platform | Current version | Source |
|---|---|---|
| Meta Graph API | **v26.0** (released 2026-07-29). v25.0 released 2026-02-18. v20 removed 2026-09-24, v21 removed 2027-01-21 | https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/ ; https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25 |
| LinkedIn Marketing | `LinkedIn-Version: 202609` (docs moniker li-lms-2026-09). Header format YYYYMM plus `X-Restli-Protocol-Version: 2.0.0`. 202510 sunsets 2026-10-15 | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api |
| TikTok | Content Posting API v2 (`/v2/post/publish/...`) | https://developers.tiktok.com/doc/content-posting-api-get-started |

### B.1 Facebook Pages (Graph API)

| Topic | Facts | Source |
|---|---|---|
| Permissions | `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` (+ `pages_manage_engagement`, `pages_read_user_engagement`; `publish_video` for video). User needs the CREATE_CONTENT task on the Page. Use a **Page access token** | https://developers.facebook.com/docs/pages-api/posts ; https://developers.facebook.com/docs/graph-api/reference/page/videos |
| Text/link | `POST /{page-id}/feed` with `message`, `link` | https://developers.facebook.com/docs/pages-api/posts |
| Photo | `POST /{page-id}/photos` with `url`. Formats jpeg, bmp, png, gif, tiff. Max 10 MB | https://developers.facebook.com/docs/graph-api/reference/page/photos |
| Multi-photo | Upload each photo with `published=false`, then `POST /feed` with `attached_media[n]={"media_fbid":...}`. Unpublished photos are deleted after about 24 h. For scheduled posts use `temporary=true` | same |
| Scheduled post | `published=false` + `scheduled_publish_time` (unix/ISO). Window **10 min – 30 days**. Multi-photo also needs `unpublished_content_type=SCHEDULED` | https://developers.facebook.com/docs/pages-api/posts |
| Video | `POST /{page-id}/videos` (`file_url`, or chunked `upload_phase` start/transfer/finish). Scheduling window is "10 mins – **6 months**". The 75-day figure from the brief is not confirmed | https://developers.facebook.com/docs/graph-api/reference/page/videos |
| Tokens | Long-lived user token lasts about 60 days. Page tokens derived from it have no fixed expiry | https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived |
| App Review | Advanced Access is needed for non-role users. Each permission goes through App Review, **Business Verification is required**, and there is an annual Data Use Checkup | https://developers.facebook.com/docs/graph-api/overview/access-levels/ |
| Insights (2026) | Page/post `*_impressions_*`, video impressions and 3-second views are deprecated around June 2026. Replacements: `page_total_media_view_unique`, `post_total_media_view_unique`, `page_media_view`, `post_media_view` ("Viewers" replaces reach) | https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25 |

### B.2 Instagram (professional accounts)

| Topic | Facts | Source |
|---|---|---|
| Two login paths | **Instagram Login**: host `graph.instagram.com`, IG User token, scopes `instagram_business_basic`, `instagram_business_content_publish`. **Facebook Login for Business**: host `graph.facebook.com`, Page token, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`. Resumable video upload works only with Facebook Login. Old `business_*` scope values were deprecated 2025-01-27 | https://developers.facebook.com/docs/instagram-platform/content-publishing ; https://developers.secure.facebook.com/docs/instagram/platform/instagram-api/business-login |
| Flow | 1) `POST /{ig-id}/media` (`image_url`/`video_url`, which must be public URLs; `media_type` = REELS / STORIES / CAROUSEL). 2) Poll `GET /{container}?fields=status_code`: EXPIRED, ERROR, FINISHED, IN_PROGRESS, PUBLISHED. Poll once a minute for at most 5 minutes; containers expire after 24 h. 3) `POST /{ig-id}/media_publish` with `creation_id` | https://developers.facebook.com/docs/instagram-platform/content-publishing |
| Carousel | Up to **10** items (image/video mix; no reels). Items are cropped to the first item's ratio | same ; https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media |
| Rate limit | **100 API-published posts per rolling 24 h** (carousel counts as 1). Check `GET /{ig-id}/content_publishing_limit`. The doc also says 50 in the carousel section, an internal inconsistency | https://developers.facebook.com/docs/instagram-platform/content-publishing |
| Image spec | **JPEG only**. Max 8 MB. Aspect ratio **4:5 to 1.91:1**. Width 320–1440 px. sRGB | https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media |
| Reels spec | MOV/MP4 with moov atom at the front, H.264/HEVC, AAC ≤48 kHz, 23–60 fps, width ≤1920, 9:16 recommended, ≤25 Mbps. **3 s – 15 min**, ≤300 MB. Cover: JPEG ≤8 MB | same |
| Stories | Image: JPEG ≤8 MB. Video: 3–60 s, ≤100 MB | same |
| Native scheduling | Not offered. The guide only tells apps that schedule to enforce the rate limit themselves, so scheduling must be done on our side (no official statement saying "unsupported") | https://developers.facebook.com/docs/instagram-platform/content-publishing |
| Insights | Available: `views`, `reach`, `saved`, `shares`, `likes`, `comments`, `total_interactions`, `follows`, `profile_visits`, `ig_reels_avg_watch_time`, `reels_skip_rate`, `reposts`, etc. Deprecated 2025-04-21: `impressions`, `plays`, `clips_replays_count`, `ig_reels_aggregated_all_plays_count`. `video_views` is also deprecated | https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/ ; https://developers.facebook.com/blog/post/2025/01/21/making-it-easier-to-build-integrations-across-the-instagram-api-and-marketing-api/ |
| Tokens (IG Login) | Exchange for a long-lived token (`ig_exchange_token`), valid 60 days. Refresh via `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` when the token is ≥24 h old and unexpired. Auth code is valid 1 h | https://developers.facebook.com/documentation/instagram-platform/reference/refresh_access_token.md ; https://developers.secure.facebook.com/docs/instagram/platform/instagram-api/business-login |

### B.3 LinkedIn

| Topic | Facts | Source |
|---|---|---|
| Org posting | `POST https://api.linkedin.com/rest/posts` with `author=urn:li:organization:{id}`. Needs `w_organization_social`; the member must be ADMINISTRATOR, CONTENT_ADMIN or DSC poster. Returns 201 and `x-restli-id`. Organic support: text, image, video, document, article (no URL scraping), MultiImage, poll | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api |
| Community Management API access | Registered legal organizations with commercial use cases only. Needs a verified business email and Page super-admin verification. **Development tier** limits: 500 calls/app/day, 100/member/day, no webhooks, 12-month build window. **Standard tier** needs a separate form and a screencast. A rejection means creating a new app | https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review?view=li-lms-2026-06 ; https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access |
| Exclusive-product rule (CM API must be the only product on its app) | Widely reported but not stated on the pages I fetched (niepotwierdzone) | – |
| Personal posting | "Share on LinkedIn" is self-serve and grants `w_member_social`. The docs page still shows `/v2/ugcPosts`; `/rest/posts` also accepts `w_member_social`. Limits: 150 requests/member/day, 100k/app/day | https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin |
| Images | `POST /rest/images?action=initializeUpload` (owner URN) → PUT to `uploadUrl` → poll until `AVAILABLE`. JPG/GIF/PNG, <36,152,320 px | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api |
| MultiImage | 2–20 images, organic only | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api |
| Video | `initializeUpload` → PUT parts (keep ETags) → `finalizeUpload` → poll status. MP4, 3 s–30 min, API max 5 GB | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api |
| OAuth / tokens | Access token lasts 60 days. **Refresh tokens only for approved MDP partners**: 365-day fixed TTL that refreshing does not extend | https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens |
| PKCE | Only for **native apps** (loopback redirect, `/oauth/native-pkce/authorization`, S256), enabled per app by a LinkedIn contact. Web apps use the standard confidential code flow | https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native |
| Org analytics | `GET /rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:{id}`. Needs `rw_organization_admin` (ADMINISTRATOR role). Returns impressionCount, uniqueImpressionsCount, clickCount, likeCount, commentCount, shareCount, engagement. Rolling 12 months, DAY/MONTH granularity | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics?view=li-lms-2026-09 |

### B.4 TikTok Content Posting API

| Topic | Facts | Source |
|---|---|---|
| Direct Post | Call `creator_info/query` first. Video: `/v2/post/publish/video/init/` (FILE_UPLOAD or PULL_FROM_URL from a verified domain). Photo: `/v2/post/publish/content/init/`. Track with `/v2/post/publish/status/fetch/`. Scope `video.publish`; Direct Post must be enabled in the app | https://developers.tiktok.com/doc/content-posting-api-get-started |
| Upload to inbox | `/v2/post/publish/inbox/video/init/`, scope `video.upload`. Creates a draft the user finishes in the app. Max 5 pending shares per 24 h; 6 requests/min per token | https://developers.tiktok.com/doc/content-posting-api-reference-upload-video |
| Audit | Unaudited apps: all posts `SELF_ONLY`, max 5 users per 24 h, accounts must be private. An audit lifts this. About 15 Direct Posts per creator per day, shared across clients. Strict UX rules: no default privacy, interactions off by default, commercial disclosure, no watermarks | https://developers.tiktok.com/doc/content-sharing-guidelines |
| OAuth | `https://www.tiktok.com/v2/auth/authorize/`. Access token lasts 24 h, refresh token 365 days (may rotate). `code_verifier` (PKCE) is required **only for mobile/desktop**; web uses client secret + state | https://developers.tiktok.com/doc/login-kit-web ; https://developers.tiktok.com/doc/oauth-user-access-token-management |

### B.5 PKCE summary

| Provider | PKCE for a web SaaS? | Source |
|---|---|---|
| Facebook Login | Yes, for manually built flows: OIDC code flow with `code_challenge` (S256/plain) and `openid` scope; `client_secret` optional when `code_verifier` is sent. Marked "still in testing". Returns an access token + `id_token` | https://developers.facebook.com/documentation/facebook-login/guides/advanced/oidc-token.md |
| Instagram Login | Not mentioned in the docs (niepotwierdzone). Use a server-side confidential flow | https://developers.secure.facebook.com/docs/instagram/platform/instagram-api/business-login |
| LinkedIn | Native apps only, and LinkedIn must enable it per app | https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native |
| TikTok | Mobile/desktop only | https://developers.tiktok.com/doc/oauth-user-access-token-management |
| OLX/Otodom | No | https://developer.olxgroup.com/docs/authorization-flow |

---

## Part C: Stripe Billing for a Polish SaaS

| Topic | Facts | Source |
|---|---|---|
| API version | **`2026-09-30.endive`**. Pin it via the SDK or the `Stripe-Version` header | https://docs.stripe.com/upgrades |
| Checkout | `POST /v1/checkout/sessions` with `mode=subscription` and `line_items[].price` (recurring), `customer`, `success_url`. The BLIK recurring example uses exactly this | https://docs.stripe.com/payments/blik/recurring-payments |
| Customer Portal | Lets customers update billing and tax IDs, change payment methods, switch plans (max 10 products), cancel, and view or pay invoices. Polish UI is available. Sessions expire after 5 min, or 1 h after last activity. No iframe embedding. Created via the `billing_portal.sessions` API (endpoint page not fetched: https://docs.stripe.com/api/customer_portal/sessions/create) | https://docs.stripe.com/customer-management |
| Webhooks to handle | `checkout.session.completed`; `customer.subscription.created/updated/deleted` (+ `trial_will_end`, `paused`/`resumed`); `invoice.paid` (provision access only when the subscription is `active`); `invoice.payment_failed`; `invoice.payment_action_required`; `invoice.finalization_failed` (Stripe Tax location errors); plus `charge.dispute.created`, `charge.refunded`. Respond to `invoice.created` or finalization is delayed up to 72 h. Live retries continue up to 3 days | https://docs.stripe.com/billing/subscriptions/webhooks |
| Signature verification | `constructEvent(rawBody, Stripe-Signature header, whsec_...)`. The body must be the **unmodified UTF-8 raw body**. In Express, register the webhook route before `express.json()`; for Next.js see the stripe-node examples | https://docs.stripe.com/webhooks/signature |
| Stripe Tax PL | Poland is supported as both business and customer location (all product tax codes, VAT, since 2023-10-01) | https://docs.stripe.com/tax/supported-countries |
| **BLIK recurring** | **Supported.** Stripe uses BLIK Model O (flexible amount and schedule). Works with Checkout `mode=subscription`, the Subscriptions API (`charge_automatically`) and the Customer Portal. Needs both `blik_payments` and `blik_recurring_payments` capabilities. PLN only, max **2,000 PLN per charge**. Limited bank list (PKO, mBank, ING, Santander, Millennium, Alior, Credit Agricole, Nest, SGB). Telco, insurance, gambling and similar businesses are excluded. You must show mandate disclosures | https://docs.stripe.com/payments/blik ; https://docs.stripe.com/payments/blik/recurring-payments |
| **Przelewy24 recurring** | **Not supported.** No `setup_future_usage` or SetupIntents, no Customer Portal. Billing only with `collection_method=send_invoice` (a one-off P24 payment per invoice). **Prohibited categories include software MCCs, "information technology… services" and "real estate management and brokerage"**, so a PL real-estate SaaS may be ineligible altogether | https://docs.stripe.com/payments/p24 |
| Invoices / KSeF | Stripe invoices are **not** KSeF documents; no official Stripe KSeF support found (niepotwierdzone, vendor article only). KSeF is mandatory from 2026-02-01 for turnover >200 M PLN, from 2026-04-01 for most businesses, and from 2027-01-01 for the smallest. Plan to issue VAT invoices via a KSeF-integrated tool (e.g. Fakturownia API) triggered by `invoice.paid` | https://freemius.com/poland-ksef-stripe-saas-billing-compliance/ (vendor) ; https://fakturownia.pl/kalendarz-ksef ; https://ksef.podatki.gov.pl/wyjasnienia/obowiazkowy-ksef-odroczony-do-1-lutego-2026-r/ |

---

## Items not confirmed (niepotwierdzone)
- WebEstate CRM API, Agencja-online, Galactica Virgo and IMO public APIs: none found.
- Official XSDs for Gratka, domy.pl/oferty.net and Otodom-legacy XML.
- How an ASARI client obtains its Site API userId/Token.
- LinkedIn "CM API must be the only product on the app" rule.
- PKCE for Instagram Login.
- FB video scheduling "75 days": the docs say 6 months.
- Stripe KSeF support.
