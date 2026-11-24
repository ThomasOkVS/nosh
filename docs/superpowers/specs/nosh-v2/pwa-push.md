# PWA and push notifications

## Purpose
nosh is used mostly as an app installed on the owner's iPhone home screen. This area covers what makes it installable (name, icons, colours, standalone display), how the offline shell and updates behave, and the opt-in "import finished" notification that reaches the phone even when the app is closed.

## Sources
- `backend/src/routes/push.ts`
- `backend/src/routes/push.test.ts`
- `backend/src/validation/push.ts`
- `backend/src/repositories/pushSubscriptions.ts`
- `backend/src/services/pushNotifier.ts`
- `backend/src/services/pushNotifier.test.ts`
- `backend/src/services/pushEndpoint.ts`
- `frontend/src/api/push.ts`
- `frontend/src/push/*`
- `frontend/src/sw.ts`
- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/public/*`
- `frontend/src/main.tsx`
- `backend/migrations/1700000000014_create-import-jobs-and-push-subscriptions.js`

## ADRs
- 2026-09-24: Imports become server-side jobs, with push notifications when they finish
- 2026-09-25: SSRF guard extended to yt-dlp and Web Push
- 2026-09-24: Public HTTPS behind Caddy — frontend nginx proxies /api; app-level hardening
- 2026-08-19: Production white-screen fixed — `crypto.randomUUID()` needs a secure-context fallback
- 2026-08-08: Design polish follow-ups
- 2026-08-08: Deployment group finished — production images, Compose file, CI publish, runbook

## Features
| Feature | Verdict | Why |
|---|---|---|
| Installable app (manifest, icons, standalone) | keep | The owner's main way of using nosh (design §1). |
| Offline app shell (precache) | keep | Cheap, and keeps the app opening with a bad connection. |
| Automatic update on deploy | keep | Single owner, no reason to hold an old version. |
| No offline API/data caching | keep | Deliberate: never serve a stale auth response or an API URL as the app page. |
| Push notification when an import finishes or fails | keep | Core to the "start an import, lock the phone" flow. |
| Opt-in prompt in the import screen | keep | Asked at the moment it is useful; required to be a tap on iOS. |
| Notifications on/off control outside the import screen | keep | Today it is an entry in the user menu, which design §7 removes. Its new home is open question 3 (recommended: the Settings screen). SET and AUTH defer to this row. |
| Push off when server has no VAPID keys | keep | Same "feature off, app still works" pattern as a missing Gemini key. |
| Push endpoint allowlist | keep | SSRF defence (design §9); see SEC. |
| Push subscriptions kept across cutover | keep | Same origin and VAPID keys so existing devices keep working (design §3, §11). |
| Theme and background colour from the new palette | keep | Today's colours are the retired red/paper brand. Resolved against the style log (P4, design §7) in the consistency pass; see PWA-04 and Rationale. |
| Light and dark appearance follow the device setting | keep | Design §7 (decided): dark mode is derived from P4 and follows the system setting. |
| Manual dark/light override remembered per device | drop | Today a user-menu toggle overrides the system setting. Design §7 says dark mode follows the system; it can come back if the owner asks (open question 3). |
| Icons | owner? | Current icons are old-brand art; the restyle probably wants new ones. |

## Acceptance criteria

### PWA-01 App is installable with its identity
**Given** the app is served over HTTPS **When** a browser reads its web app manifest **Then** the manifest declares the name "Nosh", short name "Nosh", description "A self-hosted recipe manager", start URL `/`, and display mode `standalone` (no browser chrome when launched from the home screen).
Cites: `frontend/vite.config.ts`, ADR 2026-08-08 Deployment group finished

### PWA-02 Manifest icons
**Given** the manifest **When** a browser picks an icon **Then** it offers a scalable SVG icon, a 192x192 PNG and a 512x512 PNG (purpose "any"), and a 512x512 PNG with purpose "maskable" so Android can crop it to a shape.
Cites: `frontend/vite.config.ts`, `frontend/public/*`, ADR 2026-08-08 Design polish follow-ups

### PWA-03 iPhone home-screen metadata
**Given** the owner uses "Add to Home Screen" in Safari **When** the page head is read **Then** it provides an Apple touch icon (PNG), declares the page as a standalone-capable web app, and titles it "Nosh"; the page also has a favicon (SVG) and a viewport that covers the full screen including the notch area.
Cites: `frontend/index.html`, `frontend/public/*`

### PWA-04 Manifest colours
**Given** the manifest and page head **When** the app is installed or opened **Then** the manifest provides a background colour (shown on the launch splash) and a theme colour (shown in the OS UI), and the page head declares a theme colour too. Both come from the locked P4 palette (design §7): the manifest's background and theme colours are both chalk paper; the page head declares chalk paper as the theme colour for light appearance (the same value as the manifest) and the dark-mode paper for dark appearance.
Cites: `frontend/vite.config.ts`, `frontend/index.html`, design §7, `docs/restart/style-log.md` (Round 5, P4)

### PWA-05 Manifest, service worker and app page are always fresh
**Given** a new deploy **When** a browser re-checks the manifest, the service worker script or the app's start page (the HTML shell every screen loads) **Then** none of these is ever served from a stale cache, so a new release is noticed on the next visit, while content-hashed assets may be cached long-term.
Cites: ADR 2026-08-08 Deployment group finished

### PWA-06 Service worker registers on load
**Given** a browser with service worker support on a secure origin **When** the app loads **Then** it registers its service worker immediately; on an insecure origin or a browser without support, registration is skipped silently and the app still works (install, offline shell and auto-update are inert).
Cites: `frontend/src/main.tsx`, ADR 2026-08-19 Production white-screen fixed

### PWA-07 Offline app shell
**Given** the app has been loaded once online **When** the phone later opens it with no or poor connection **Then** the built app shell (pages, scripts, styles, icons) loads from the local cache.
Cites: `frontend/src/sw.ts`

### PWA-08 No offline data and no navigation fallback for the API
**Given** the service worker is active **When** the app requests anything under `/api`, or the browser navigates directly to an `/api/...` URL (for example opening a photo) **Then** the request always goes to the network: API responses are never cached and the app page is never substituted for an API URL.
Cites: `frontend/src/sw.ts`, ADR 2026-09-24 Public HTTPS behind Caddy

### PWA-09 New release takes over immediately
**Given** a new version has been deployed **When** the installed app next checks for updates **Then** the new service worker activates straight away and takes control of open pages without waiting for all tabs to close, and caches left by older builds are removed.
Cites: `frontend/src/sw.ts`, ADR 2026-09-24 Imports become server-side jobs

### PWA-10 Push is off when the server has no keys
**Given** the server has no push keys configured **When** a signed-in user calls any push endpoint (public key, subscribe, unsubscribe) **Then** it answers 503 "Push notifications are not configured on this server", and the app shows no notification controls; imports still work and finish without notifying.
Cites: `backend/src/routes/push.test.ts` "answers 503 everywhere when VAPID keys aren't configured", ADR 2026-09-24 Imports become server-side jobs

### PWA-11 Push endpoints require sign-in
**Given** no session **When** any push endpoint is called **Then** it answers 401.
Cites: `backend/src/routes/push.test.ts` "rejects requests with no session"

### PWA-12 Public key served at runtime
**Given** push keys are configured **When** a signed-in client requests the push public key **Then** the server returns `{ "publicKey": "<key>" }`, so changing the key needs a server config change only, not a rebuilt frontend.
Cites: `backend/src/routes/push.test.ts` "serves the public key", ADR 2026-09-24 Imports become server-side jobs

### PWA-13 Subscribe stores or replaces a device subscription
**Given** a signed-in user **When** they POST a subscription (an `endpoint` URL plus `keys.p256dh` 1-200 chars and `keys.auth` 1-100 chars) **Then** it is stored in `push_subscriptions` for that user and the server answers 204. Posting the same endpoint again replaces its keys (no duplicate row), and if another account posts an endpoint already stored, the subscription moves to that account.
Cites: `backend/src/routes/push.test.ts` "upserts a subscription on its endpoint", `backend/src/repositories/pushSubscriptions.ts`, `backend/migrations/1700000000014_create-import-jobs-and-push-subscriptions.js`

### PWA-14 Subscribe rejects malformed input
**Given** a signed-in user **When** they POST a subscription whose endpoint is not a URL, or whose keys are missing, empty or over their length caps **Then** the server answers 400 with the first validation message and stores nothing.
Cites: `backend/src/validation/push.ts`

### PWA-15 Only real push services are accepted (security)
**Given** a signed-in user **When** they POST a subscription **Then** the endpoint is accepted only if it uses https, the default port 443, carries no username or password, and its host is one of: `web.push.apple.com` or any `*.push.apple.com`; exactly `fcm.googleapis.com`; `*.push.services.mozilla.com`; `*.notify.windows.com`. Anything else answers 400 "Not a recognized push service endpoint" and stores nothing. This includes unknown hosts, internal addresses (https or plain http), plain http on a real push host, lookalike hosts such as `fcm.googleapis.com.evil.example`, non-443 ports on a real host, embedded credentials, and other Google hosts such as `storage.googleapis.com`.
Cites: `backend/src/routes/push.test.ts` "rejects an endpoint that isn't a real push service", `backend/src/services/pushNotifier.test.ts` "isAllowedPushEndpoint", ADR 2026-09-25 SSRF guard extended to yt-dlp and Web Push. Cross-reference: SEC (SSRF guard).

### PWA-16 Each major browser's push service is accepted
**Given** realistic endpoints handed out by Safari/iOS, Chrome (both `/fcm/send/...` and `/wp/...` shapes), Firefox and Edge/Windows **When** each is subscribed **Then** each answers 204.
Cites: `backend/src/routes/push.test.ts` "accepts each major browser's push service", `backend/src/services/pushNotifier.test.ts` "isAllowedPushEndpoint"

### PWA-17 Allowlist is re-checked before every send (security)
**Given** a stored subscription whose endpoint is not on the allowlist (stored before the rule, or the list later shrank) **When** the server would send it a notification **Then** nothing is sent to it, no connection is made, and that subscription is deleted. The log records the host only, never the full endpoint (its path is the device's push token).
Cites: `backend/src/services/pushNotifier.test.ts` "refuses an endpoint off the allowlist without connecting anywhere", `backend/src/services/pushNotifier.ts`. Cross-reference: SEC (SSRF guard).

### PWA-18 Allowlisted host resolving to an internal address is refused (security)
**Given** an allowlisted push host whose DNS answer is a private, loopback, link-local or similar blocked address **When** the server sends a notification **Then** the connection is refused at lookup, nothing is posted, and that subscription is deleted. Every send opens a fresh connection that re-checks the address (no reuse of an already-open socket).
Cites: `backend/src/services/pushNotifier.test.ts` "refuses an allowlisted host whose DNS answer is an internal address", ADR 2026-09-25 SSRF guard extended to yt-dlp and Web Push. Cross-reference: SEC (SSRF guard, same address rules as import).

### PWA-19 Unsubscribe is scoped to the caller
**Given** a stored subscription **When** its owner sends DELETE with the endpoint in the body **Then** it is removed and the server answers 204; when a different signed-in user sends the same request, nothing is removed. A missing or non-URL endpoint answers 400.
Cites: `backend/src/routes/push.test.ts` "unsubscribes only the caller's own subscription", `backend/src/validation/push.ts`

### PWA-20 Notification when an import succeeds
**Given** a user with one or more subscribed devices **When** an import job finishes successfully **Then** every one of their devices is sent a notification titled "Recipe ready" with the recipe title and "tap to review and save it", which opens `/recipes/new?importId=<job id>`.
Cites: `backend/src/services/pushNotifier.ts`, ADR 2026-09-24 Imports become server-side jobs

### PWA-21 Notification when an import fails
**Given** a user with subscribed devices **When** an import job fails **Then** their devices are sent "Import failed" with the job's error message (or "Couldn't import that recipe." if none), which opens `/`; the app restores the failed job on launch and shows the error. A failed import is never silent.
Cites: `backend/src/services/pushNotifier.ts`, ADR 2026-09-24 Imports become server-side jobs

### PWA-22 Notifications are delivered for up to a day
**Given** a device is off or unreachable **When** the server sends a notification **Then** the push service is asked to hold it for at most 24 hours.
Cites: `backend/src/services/pushNotifier.ts`

### PWA-23 Dead subscriptions are cleaned up; other failures are not fatal
**Given** sending to a device **When** the push service answers 404 or 410 **Then** that subscription is deleted (for whichever user owns it). Any other send failure is logged and the subscription is kept. A failing device never stops the others from being notified, and a notification failure never changes the import's result.
Cites: `backend/src/services/pushNotifier.ts`

### PWA-24 Every push shows a visible notification
**Given** the service worker receives a push **When** the app is open or closed **Then** it always shows a system notification (title, body, app icon), never silently suppressing it; a missing or malformed payload falls back to title "Nosh", empty body and target `/`.
Cites: `frontend/src/sw.ts`, ADR 2026-09-24 Imports become server-side jobs

### PWA-25 Tapping a notification opens the right screen
**Given** a shown notification **When** the owner taps it **Then** it closes, and an already open app window is focused and navigated to the notification's in-app path; if there is none, or navigating it fails, the app is launched at that path. A target that is not an in-app path (not starting with `/`) is replaced by `/`.
Cites: `frontend/src/sw.ts`

### PWA-26 Push controls only appear where push can work
**Given** the browser lacks a secure origin, service workers, push or notifications (for example a plain Safari tab on iOS rather than the home-screen app), or the server has push off **When** the owner views the import screen or the notifications toggle **Then** no notification controls are rendered. While the initial check runs, nothing is shown.
Cites: `frontend/src/push/pushNotifications.ts`, `frontend/src/push/usePushNotifications.ts`, `frontend/src/api/push.ts`

### PWA-27 Four notification states
**Given** push can work here **When** the owner views a notification control **Then** it reflects one of three states (the fourth, "unsupported", is PWA-26): on (this device has a push subscription and notification permission is granted; offers to disable); denied (permission refused; the control is replaced by a message that notifications are blocked and must be allowed in device settings); off (every other case: permission never asked, the permission prompt dismissed without an answer, or permission granted but this device has no subscription; offers to enable).
Cites: `frontend/src/push/pushNotifications.ts`, `frontend/src/components/UserMenu.tsx`

### PWA-28 Enabling is a tap-driven opt-in
**Given** state "off" **When** the owner taps "Notify me when it's done" (import screen, shown while an import runs) or the settings toggle **Then** the browser permission prompt appears directly from that tap (never on page load), and on grant the device subscribes (reusing an existing browser subscription if there is one) and sends it to the server. If permission is denied the state becomes denied; if the prompt is dismissed it stays off; if saving fails the state falls back to off.
Cites: `frontend/src/push/pushNotifications.ts`, `frontend/src/push/usePushNotifications.ts`, `frontend/src/import/ImportDialog.tsx`

### PWA-29 Confirmation while an import runs
**Given** state "on" **When** the import screen shows a running import **Then** it tells the owner they'll be notified when it's done and can close the app.
Cites: `frontend/src/import/ImportDialog.tsx`

### PWA-30 Disabling removes the subscription
**Given** state "on" **When** the owner turns notifications off **Then** the server subscription is deleted (a failure of that call is ignored), the browser subscription is cancelled, and the state becomes off. Controls are disabled while an enable or disable is in progress.
Cites: `frontend/src/push/pushNotifications.ts`, `frontend/src/push/usePushNotifications.ts`

### PWA-31 Existing subscriptions survive cutover
**Given** devices subscribed before the rewrite **When** the new app is deployed on the same origin with the same push keys **Then** their stored subscriptions still receive notifications without re-subscribing. Subscriptions belong to a user and are deleted with that user.
Cites: `backend/migrations/1700000000014_create-import-jobs-and-push-subscriptions.js`, design §3, §11

### PWA-32 Light and dark follow the device
**Given** the device is set to light or dark appearance **When** the app opens, or the device setting changes while it is open **Then** the app shows the matching appearance (the P4 palette or its dark derivative, design §7) without any setting in the app. Today a choice stored on the device overrides the system setting; that override is dropped (see Features).
Cites: `frontend/index.html` (today: stored choice, else the system setting), design §7

## Rationale
- PWA-05/06/08/09: these four came from the 2026-08-08 deploy work and the 2026-09-24 hardening: a stale manifest or worker hides new deploys; a navigation fallback or runtime cache would answer `/api/...` page loads with the app shell or serve a stale auth response.
- PWA-06: on an insecure origin the worker cannot register, which once made install/offline silently inert (ADR 2026-08-19). On HTTPS (since 2026-09-24) it works.
- PWA-15, 17, 18: the server POSTs to whatever URL a device supplies, so a signed-in user could aim it at internal hosts. An allowlist is stricter than an address blocklist and free, because real subscriptions only point at these services; the address guard is a second layer (ADR 2026-09-25). The checks run at store time and again at send time so old rows and a shrinking list are caught.
- PWA-24: subscriptions are created "user visible only"; Safari revokes the subscription of a site whose pushes don't visibly notify, so no "skip it while the app is open" shortcut.
- PWA-28: iOS only shows the permission prompt in response to a tap; asking inside the import flow also puts the question where the owner is deciding whether to wait or leave.
- PWA-12: runtime public key lets keys be rotated with a config change only.
- PWA-31: the same origin and keys are required because a subscription is bound to the origin and the key it was created with.
- PWA-04: today the manifest says `#f6f1e7` background and `#b23a2e` theme, and the page head says `#1C1814`; the two theme colours disagree and both belong to the retired brand. The style log fixes the palette but not the OS-chrome colour, so the consistency pass chose the paper colour: it keeps the top of the screen as clean as the page (style log round 3) and gives one value in both places for light appearance. The manifest takes a single theme and a single background colour, so both are chalk paper and the splash is chalk paper in either appearance; only the page head can vary by appearance, so it adds the dark-mode paper for dark. The owner can override this at spec review. Exact dark values are the builder's (design §13).

## Tests not carried
- `backend/src/routes/push.test.ts` "rejects an endpoint that isn't a real push service (the Docker host's dockge port)" and "(an internal URL over plain http)": folded into PWA-15 as "internal addresses"; the specific Docker addresses are deployment detail.
- `backend/src/services/pushNotifier.test.ts` "createWebPushSender" cases are carried as PWA-17 and PWA-18; the injectable resolver they use is an implementation detail.
- No sibling tests exist for `frontend/src/sw.ts`, `frontend/src/push/*` or `frontend/vite.config.ts`; their behaviour above comes from the code and ADRs, so the rewrite needs new tests for PWA-07 to PWA-09 and PWA-24 to PWA-30.

## Open questions for the owner
1. Resolved in the consistency pass, no answer needed: theme and background colours come from the P4 palette (PWA-04). The style log does not name an OS-chrome colour, so the paper colour was chosen; say so if you want ink instead.
2. Icons and splash: the current icons are old-brand art. Recommend new icons (SVG, 192, 512, maskable 512, Apple touch) in the new style at cutover. Note an installed iPhone app only refreshes its home-screen icon on reinstall.
3. Where do the user menu's entries live once it is gone (design §7: settings is an icon top-right)? It holds the notifications toggle, your username, "Log out", the app version and a dark/light override. Recommend an Account section on the Settings screen with the username, "Log out" and the version at the bottom, a Notifications toggle on the same screen, and keeping the "Notify me" prompt in the import screen. The dark/light override is dropped because dark mode follows the device (design §7, PWA-32); say if you want it back. (Merged with AUTH open question 6 and SET open question 3.)
4. Notification wording and icon: "Recipe ready" / "Import failed" and the 192 icon. Keep as is?
5. Should tapping a failed-import notification open the failed job directly (today it opens `/` and the app restores it on launch)?
6. If the job queue changes (design §6), who sends the notification when a job finishes is an implementation detail, but the criteria (PWA-20 to PWA-23) must still hold, including for jobs that finish while the app is closed.
