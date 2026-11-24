# Security

## Purpose
The app-wide guards that let a private, single-owner app sit on the public internet: which requests the server accepts (origin check, session cookie, rate limits, signup switch), what it refuses to fetch on someone's behalf (the SSRF guard on page, photo, yt-dlp and push fetches), how errors look, and which settings must be right before the server will start. These are policies, not features; every one of them exists because a guard that is missing is a hole.

## Sources
- `backend/src/app.ts`
- `backend/src/app.test.ts`
- `backend/src/security.test.ts`
- `backend/src/config/env.ts`
- `backend/src/config/origins.ts`
- `backend/src/config/origins.test.ts`
- `backend/src/middleware/originCheck.ts`
- `backend/src/middleware/rateLimit.ts`
- `backend/src/middleware/rateLimit.test.ts`
- `backend/src/middleware/errorHandler.ts`
- `backend/src/middleware/requireAuth.ts`
- `backend/src/services/safeFetch.ts`
- `backend/src/services/safeFetch.test.ts`
- `backend/src/services/egressProxy.ts`
- `backend/src/services/egressProxy.test.ts`
- `backend/src/services/pushEndpoint.ts`

## ADRs
- 2026-08-05: No rate limiting / lockout for v1
- 2026-08-06: CORS added to the backend for the frontend's cross-origin session cookie
- 2026-08-06: No minimum password length
- 2026-08-06: Recipe images served through an authenticated route, not a static mount
- 2026-08-12: Post-implementation review fixes (backend security/correctness, frontend correctness/a11y)
- 2026-09-24: Public HTTPS behind Caddy — frontend nginx proxies /api; app-level hardening
- 2026-09-25: SSRF guard extended to yt-dlp and Web Push
- 2026-09-25: Tailscale retired — HTTPS-only, same-origin in dev and prod

## Features
| Feature | Verdict | Why |
|---|---|---|
| Origin check on state-changing requests (CSRF) | keep | Design §9. Same-origin `/api`, so no CORS; the check is CSRF protection, not CORS. |
| Hardened session cookie (`__Host-` prefix, Secure, HttpOnly, SameSite=Lax) | keep | Design §9. |
| Fresh session id on login and signup | keep | Session-fixation defence, cheap (ADR 2026-08-06). |
| Client IP and HTTPS taken from forwarded headers only when the peer is the trusted proxy (Caddy) | keep | Design §3 and §9. Changed from today: the trusted proxy is Caddy, not nginx. |
| Rate limits: login per IP, login failures per account, signup per IP | keep | Design §9; ADR 2026-09-24. |
| Rate limits: import start and photo-from-URL, per user | keep | Both spend quota or make the server fetch a URL. Per user as today, plus a per-IP import cap of 30 starts per hour (SEC-59), decided by the owner (index Q6) as design §9 asks. |
| Failed-login delay and equal timing for unknown usernames | keep | Stops username enumeration by timing. |
| In-memory rate-limit counters (reset on restart) | keep | Fine for one process; one fresh window per deploy is the accepted worst case. |
| Signup off by default (`ALLOW_SIGNUP`) | keep | Design §9. A reachable signup form lets anyone spend the Gemini quota and fill the uploads directory. |
| Every data endpoint requires a session; only health, signup, login, logout are public | keep | ADR 2026-09-24 audit. |
| Images served only through an authenticated, ownership-checked route | keep | Design §9; ADR 2026-08-06. |
| Uploaded and fetched photos checked by content (JPEG, PNG, WebP) | keep | Declared types are just strings the sender chose. |
| JSON error shape; 400/413 for bad bodies; 404 JSON; 500 without details | keep | Nothing about the stack leaks. |
| No framework advertisement header | keep | Cheap, no downside. |
| Page and photo fetch guard (blocked addresses, checked at connect time, redirects re-validated) | keep | Design §9. |
| yt-dlp egress guard | keep | Design §9. The owner kept the guard inside the app (index Q34); its exact mechanism is the builder's, and the refusals are the requirement. |
| Web Push endpoint allowlist and guarded send | keep | Design §9. |
| Boot-time config validation (origins, trusted proxy, VAPID set, database URL) | keep | Misconfiguration must stop the server at boot, not fail silently at login. |
| Session secret required in production | keep | Decided by the owner (index Q7): production refuses to start without one (SEC-57). |
| Basic response-hardening headers (`X-Content-Type-Options`, `Referrer-Policy`) | keep | Decided by the owner (index Q8): added now (SEC-60); CSP stays in the backlog. |
| Content-Security-Policy header | drop | Design §2 keeps CSP in the backlog, not the first release. |
| Demo-data seeding flag (`SEED_DEMO_DATA`) | drop | Dev convenience, not security; no demo seeding is part of the new build. |
| Gemini model settings in the environment | keep | Not a security matter; specified under the settings and import areas. |

## Acceptance criteria

### SEC-01 State-changing requests from a configured origin are accepted
**Given** the allowed origins are `https://nosh.itsthomassito.com` and `http://localhost:5173` **When** a POST arrives with an `Origin` header equal to either value **Then** the request is processed normally (for example, a logout answers 204).
Cites: `backend/src/security.test.ts` "accepts a POST from configured origin %s", ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-02 State-changing requests from any other origin get 403
**Given** the same allowed origins **When** a POST arrives with an `Origin` of `https://evil.example`, a sibling subdomain, the right host with the wrong scheme (`http://nosh.itsthomassito.com`), the right host with an explicit default port (`https://nosh.itsthomassito.com:443`), or the literal `null` **Then** the response is 403 with body `{"error":"Request origin not allowed"}` and nothing is changed. The match is exact on scheme, host and port.
Cites: `backend/src/security.test.ts` "rejects a POST from %s", ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-03 With no Origin header, Sec-Fetch-Site decides
**Given** a state-changing request with no `Origin` header **When** `Sec-Fetch-Site` is `same-origin` or `none` **Then** it is accepted; **when** it is `cross-site` or `same-site` **Then** it gets 403 `{"error":"Request origin not allowed"}`.
Cites: `backend/src/security.test.ts` "rejects a POST with no Origin but Sec-Fetch-Site: %s", "accepts a POST with no Origin and Sec-Fetch-Site: %s"

### SEC-04 A request with neither header is let through to normal authentication
**Given** a state-changing request with no `Origin` and no `Sec-Fetch-Site` (curl, a script) **When** it arrives **Then** the origin check passes it on, and only the normal session rules apply.
Cites: `backend/src/security.test.ts` "accepts a POST with neither header (a non-browser client like curl)", ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-05 The check covers every state-changing method and no safe method
**Given** the allowed origins **When** a PUT, PATCH or DELETE carries a foreign `Origin` **Then** it gets 403. **When** a GET, HEAD or OPTIONS carries a foreign `Origin` (for example `GET /health`) **Then** it is not blocked, because safe methods cannot change state.
Cites: `backend/src/security.test.ts` "applies to PUT, PATCH and DELETE too", "doesn't apply to safe methods"

### SEC-06 No cross-origin access is offered
**Given** the browser only ever calls the API on the page's own origin **When** any request carrying an `Origin` header is answered **Then** the response has no `Access-Control-*` headers.
Cites: `backend/src/security.test.ts` "sends no CORS headers — the API is only ever called same-origin", ADR 2026-09-25: Tailscale retired

### SEC-07 The session cookie is not readable by scripts and is host-only
**Given** a successful login **When** the session cookie is set **Then** it is HttpOnly, SameSite=Lax, Path=/, has no Domain attribute (so sibling subdomains never receive it), and lives for one week.
Cites: `backend/src/security.test.ts` "is HttpOnly, SameSite=Lax, Path=/ and has no Domain", `backend/src/app.ts`, ADR 2026-09-25: Tailscale retired

### SEC-08 In production the session cookie is `__Host-` prefixed and Secure
**Given** the server runs in production behind the trusted proxy and the request arrived over HTTPS **When** a login succeeds **Then** the cookie's name starts with `__Host-`, it carries Secure and Path=/, and it has no Domain (the three things the prefix requires a browser to enforce).
Cites: `backend/src/security.test.ts` "is __Host-nosh.sid, Secure, Path=/ and has no Domain", ADR 2026-09-25: Tailscale retired

### SEC-09 The session cookie is never issued over plain HTTP
**Given** the server runs in production **When** a login succeeds but the request did not arrive over HTTPS (the trusted proxy reports `http`, or the request does not come from the trusted proxy at all and merely claims `https` in a forwarded header) **Then** the login is processed but no session cookie is set.
Cites: `backend/src/security.test.ts` "is never sent over plain HTTP", "ignores X-Forwarded-Proto from a peer that isn't a trusted proxy"

### SEC-10 Logout clears the cookie under the same name and attributes
**Given** a logged-in production session **When** the owner logs out **Then** the response is 204 and carries a clearing cookie with the same `__Host-` name, Secure and Path=/, so a browser actually drops it (a `__Host-` cookie cleared with fewer attributes is ignored).
Cites: `backend/src/security.test.ts` "is cleared under the same name on logout"

### SEC-11 In development the cookie works over plain http://localhost
**Given** the server is not in production (local dev, tests) **When** a login succeeds over `http://localhost` **Then** a cookie without the `__Host-` prefix and without Secure is set (a Secure-only cookie would never be stored there); all other attributes of SEC-07 still hold.
Cites: `backend/src/security.test.ts` "is named nosh.sid and not Secure in dev"

### SEC-12 Login and signup start a fresh session
**Given** a visitor holding a session identifier issued before login **When** they log in or sign up **Then** the session id changes, so an identifier planted before authentication cannot inherit the authenticated session. (Login behaviour itself belongs to the auth area.)
Cites: `backend/src/app.ts`, ADR 2026-08-06: Recipe images served through an authenticated route, not a static mount

### SEC-13 Client IP is taken from the forwarded header only when the request comes from Caddy
**Given** the only trusted proxy is Caddy (identified by its exact address on the shared proxy network, never a whole subnet) **When** a request arrives from Caddy with an `X-Forwarded-For` header **Then** the client IP used for rate limits is the address Caddy reports (the entry Caddy appended). **When** a request arrives from any other peer (another container, a direct connection) with an `X-Forwarded-For` header **Then** that header is ignored and the peer's own address is the client IP. A client therefore cannot dodge or poison a rate limit by sending its own forwarded header. **When** no trusted proxy is configured **Then** no forwarded header is believed.
Cites: `backend/src/security.test.ts` "limits each client IP (as reported by the trusted proxy) separately", "ignores X-Forwarded-For from an untrusted peer, so it can't be spoofed to dodge the limit", `backend/src/app.ts`, design §3 and §9, ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-14 HTTPS is believed only when Caddy says so
**Given** the trusted proxy is Caddy **When** a request carries `X-Forwarded-Proto` **Then** it is believed (and decides whether the session cookie may be issued, SEC-09) only if the request comes from Caddy; from any other peer it is ignored.
Cites: `backend/src/security.test.ts` "ignores X-Forwarded-Proto from a peer that isn't a trusted proxy", `backend/src/app.ts`

### SEC-15 Signup is refused when disabled, and creates nothing
**Given** signup is not enabled (the default) **When** anyone posts to signup **Then** the response is 403 `{"error":"Sign-ups are disabled on this server"}`, no account is created, no session cookie is set, and a later login with those credentials gets 401. Existing accounts still log in normally. The switch is enforced by the server, not by hiding the signup link. The signup rate limit (SEC-20) is only reached when signup is enabled.
Cites: `backend/src/security.test.ts` "refuses signup when disabled, and creates no account", "still lets existing users log in when disabled", ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-16 Rate limits are fixed windows that answer 429 with Retry-After
**Given** any limited endpoint group (SEC-17 to SEC-22) **When** a key has used up its allowance within the window **Then** further requests get 429 `{"error":"Too many attempts — try again later"}` with a `Retry-After` header holding the whole seconds until the window ends (at least 1). Keys are independent of each other; once the window has passed the key starts afresh; a key's count can be cleared (login success does this for the account counter). Counters may live in memory and reset on restart. Limited endpoint groups:

| Group | Key | Limit | Window |
|---|---|---|---|
| Login attempts | client IP | 20 attempts | 15 minutes |
| Login failures | account (username, lower-cased) | 10 failures | 15 minutes |
| Signup | client IP | 5 attempts | 1 hour |
| Start an import | logged-in user | 30 starts | 1 hour |
| Photo from URL | logged-in user | 60 requests | 1 hour |
| Start an import (SEC-59) | client IP | 30 starts | 1 hour |

Cites: `backend/src/middleware/rateLimit.test.ts` "allows up to max hits in a window, then reports seconds until it resets", "starts a fresh window once the old one expires", "keeps keys independent", "forgets a key on reset", ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-17 Login attempts are limited per client IP
**Given** one client IP (as determined by SEC-13) **When** it makes more than 20 login attempts in 15 minutes, whatever usernames it tries **Then** the 21st gets 429; a different client IP is unaffected. Requests that fail body validation (400) do not count.
Cites: `backend/src/security.test.ts` "limits each client IP (as reported by the trusted proxy) separately", "ignores X-Forwarded-For from an untrusted peer, so it can't be spoofed to dodge the limit", `backend/src/routes/auth.ts`

### SEC-18 Login failures are limited per account, across all IPs
**Given** an existing account **When** 10 failed logins for it (username compared case-insensitively) occur within 15 minutes, from any mix of IPs **Then** the next attempt gets 429 with a positive `Retry-After`, even if the password is now correct. A successful login clears the account's failure count, so the real owner is only locked out while someone is actively guessing. Only failures count against the account.
Cites: `backend/src/security.test.ts` "locks an account after 10 failures, even spread across many IPs", "clears an account's failure count on a successful login", ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-19 Failed logins are slow and do not reveal which usernames exist
**Given** a login with a wrong password or an unknown username **When** it fails **Then** the response is 401 `{"error":"Invalid username or password"}` after an added delay of one second, and an unknown username costs as much work as a wrong password, so response time does not reveal which usernames are registered.
Cites: `backend/src/routes/auth.ts`, ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-20 Signup attempts are limited per client IP
**Given** signup is enabled **When** one client IP makes more than 5 signup attempts in an hour (valid or not) **Then** the 6th gets 429. Signup disabled (SEC-15) answers 403 before the limit is consulted.
Cites: `backend/src/routes/auth.ts`, ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-21 Starting an import is limited per user; polling is not
**Given** a logged-in user **When** they start more than 30 imports in an hour **Then** the 31st gets 429. A request with an invalid body still counts, because the limit is checked before any work is done. Reading a job's progress does not count: 40 progress reads followed by a new import are all served. Starting an import requires login (401 without a session).
Cites: `backend/src/security.test.ts` "rejects imports past 30 an hour for one user", "doesn't count polling a job's progress against the limit", "requires login", ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-22 Attaching a photo from a URL is limited per user
**Given** a logged-in user who owns a recipe **When** they ask the server to fetch a photo from a URL more than 60 times in an hour **Then** the 61st gets 429. Ownership is checked first.
Cites: `backend/src/routes/recipes.ts`, ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-23 Only health, signup, login and logout are public
**Given** no session **When** any other endpoint is called (recipes, collections, import, settings, push, the image route) **Then** the answer is 401 `{"error":"Not authenticated"}`. `GET /health` answers 200 `{"status":"ok"}` to anyone and returns nothing else.
Cites: `backend/src/app.test.ts` "returns ok status", `backend/src/security.test.ts` "requires login", `backend/src/middleware/requireAuth.ts`, ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-24 Photos are served only through an authenticated, ownership-checked route
**Given** a stored photo **When** anyone requests it without a session, or a logged-in user who does not own the recipe requests it **Then** it is refused. There is no public static mount of the uploads directory, and stored file names are server-generated and unguessable.
Cites: `backend/src/routes/recipes.ts`, `backend/src/routes/recipes.test.ts` "refuses to serve an image without a session", "refuses to serve another user's image", ADR 2026-08-06: Recipe images served through an authenticated route, not a static mount

### SEC-25 A photo's type is decided by its content, not its declared type
**Given** a photo upload, or a photo fetched from a URL **When** its first bytes are not an accepted image type (JPEG, PNG or WebP; for uploads also HEIC/HEIF, which is converted to JPEG, REC-14), or they do not match the declared type (HTML sent as `image/png`; a PNG sent as `image/jpeg`) **Then** it is refused and nothing is stored: an upload answers 400, a photo fetched from a URL answers 422 (REC-19). A PNG uploaded as `image/png` is accepted (201). (The 5 MB size cap and the rest of upload behaviour belong to the recipes area.)
Decision: owner 2026-11-24, index Q13 (v1 accepted only JPEG, PNG and WebP uploads)
Cites: `backend/src/security.test.ts` "rejects HTML declared as image/png", "rejects a PNG declared as image/jpeg", "accepts a PNG declared as image/png", `backend/src/routes/recipes.ts` (422 for a fetched photo), ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-26 A malformed request body gets 400, not 500, and is not echoed
**Given** a request whose JSON body cannot be parsed **When** it reaches any endpoint **Then** the response is 400 `{"error":"Invalid request"}`; the message never quotes the body.
Cites: `backend/src/security.test.ts` "returns 400, not 500, for a malformed JSON body — without echoing it", `backend/src/middleware/errorHandler.ts`

### SEC-27 An oversized request body gets 413
**Given** a JSON body over the server's size limit (100 KB today) **When** it is sent **Then** the response is 413 `{"error":"Request body too large"}`. Any other client-side body error answers with its 4xx status and `{"error":"Invalid request"}`.
Cites: `backend/src/middleware/errorHandler.ts`, ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-28 Unknown routes get a JSON 404
**Given** a request to a path that does not exist **When** it is answered **Then** the response is 404 `{"error":"Not found"}`, never an HTML error page naming the framework.
Cites: `backend/src/security.test.ts` "returns JSON for an unknown route rather than an HTML page"

### SEC-29 Unexpected failures answer 500 without details
**Given** an unexpected error while handling a request **When** it is answered **Then** the response is 500 `{"error":"Internal server error"}`, with no stack trace, file path or message in the body; the detail goes to the server log only.
Cites: `backend/src/middleware/errorHandler.ts`

### SEC-30 Responses do not advertise the framework
**Given** any response **When** its headers are inspected **Then** there is no `X-Powered-By` header.
Cites: `backend/src/security.test.ts` "doesn't advertise the framework", `backend/src/app.ts`

### SEC-31 Private, loopback, link-local and reserved addresses are never connected to
**Given** any server-side fetch of a user-supplied or third-party destination **When** the destination address is in any of these ranges **Then** the connection is refused: IPv4 `0.0.0.0/8`, `10/8`, `100.64/10` (CGNAT and overlay VPNs), `127/8`, `169.254/16` (link-local, cloud metadata), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, multicast `224/4`, reserved `240/4` (including broadcast); IPv6 unspecified `::`, loopback `::1`, deprecated IPv4-compatible `::/96`, `100::/64`, Teredo `2001::/32`, documentation `2001:db8::/32`, unique-local `fc00::/7`, link-local `fe80::/10`, multicast `ff00::/8`.
Cites: `backend/src/services/safeFetch.test.ts` "blocks %s (%s)", ADR 2026-09-25: SSRF guard extended to yt-dlp and Web Push

### SEC-32 Public addresses, including range edges, are allowed
**Given** the blocklist of SEC-31 **When** the destination is `93.184.215.14`, `8.8.8.8`, `172.32.0.1` (just above `172.16/12`), `100.128.0.1` (just above CGNAT) or `2606:4700::1111` **Then** it is not blocked.
Cites: `backend/src/services/safeFetch.test.ts` "allows public address %s"

### SEC-33 Disguised private addresses and non-addresses are blocked
**Given** an IPv6 form that embeds a private IPv4 address **When** it is the destination (IPv4-mapped in dotted form `::ffff:172.28.0.1` or hex form `::ffff:ac1c:1`; NAT64 `64:ff9b::a00:1`; 6to4 `2002:c0a8:101::1`; or any of these in brackets such as `[::1]`) **Then** it is treated as the embedded IPv4 address and blocked. Anything that is not a valid IP address at the point of checking is also blocked (fail closed).
Cites: `backend/src/services/safeFetch.test.ts` "blocks %s (%s)"

### SEC-34 URLs naming a blocked address, or not http(s), are rejected before any request
**Given** a URL submitted for import or photo fetching **When** its host is a blocked IP literal in any spelling (`http://172.28.0.1:5001/`, the single decimal number `http://2887516161/`, hex shorthand `http://0x7f.1/`, mapped `http://[::ffff:172.28.0.1]:5001/`, CGNAT `http://100.64.0.1/`, unique-local `http://[fd00::1]/`, or `http://localhost./`) **Then** it is rejected as "This URL cannot be imported". **When** its scheme is not http or https (`ftp:`, `file:`, `gopher:`) **Then** it is rejected as "Only http/https URLs are supported". **When** it is not a URL at all **Then** "Not a valid URL". A hostname that is not an IP literal passes this pre-check; its addresses are checked at connect time (SEC-36).
Cites: `backend/src/services/safeFetch.test.ts` "rejects %s", "rejects non-http(s) scheme %s", "lets a hostname through — its addresses are checked at connect time instead"

### SEC-35 Starting an import with a blocked literal answers 400 and creates no job
**Given** a logged-in user **When** they start an import with a URL rejected by SEC-34 **Then** the response is 400 with that message and no import job is recorded.
Cites: `backend/src/routes/import.ts`, ADR 2026-09-25: SSRF guard extended to yt-dlp and Web Push

### SEC-36 A hostname that resolves to a blocked address is refused at connect time
**Given** a hostname that passes SEC-34 but whose DNS answer is a blocked address **When** the server fetches it **Then** no connection is made, nothing reaches the target, and the import fails with "This URL cannot be imported" (the import job ends with error status 400). Allowed addresses connect normally.
Cites: `backend/src/services/safeFetch.test.ts` "refuses to connect when a hostname resolves to a private address", "connects when the resolved address is allowed (control for the test above)"

### SEC-37 One blocked address refuses the whole name
**Given** a hostname resolving to several addresses, one public and one blocked **When** the server fetches it **Then** the whole name is refused, whichever address would have been tried first.
Cites: `backend/src/services/safeFetch.test.ts` "refuses the whole name if any one of its addresses is blocked", "returns the array form when Node asks for all addresses", "returns a single address otherwise"

### SEC-38 The address that was checked is the address connected to
**Given** a DNS server that answers "public" the first time and "private" the second **When** the server fetches the name **Then** it resolves once per connection and connects to exactly the checked address; each new request opens a fresh connection and is checked again (no reused connection skips the check), so DNS rebinding has no second lookup to win.
Cites: `backend/src/services/safeFetch.test.ts` "checks the exact answer it connects with, so DNS rebinding has no second lookup to win"

### SEC-39 Every redirect hop is re-checked, up to 5 hops
**Given** an imported page or photo URL that redirects **When** a hop points at a blocked IP literal or at a hostname resolving to a blocked address **Then** the import is refused with "This URL cannot be imported", and the internal destination is never contacted (only the first hop reached a server). Redirects are followed by hand, at most 5 hops; more fails with "That page redirected too many times" (page) or "The image URL redirected too many times" (photo).
Cites: `backend/src/services/safeFetch.test.ts` "rejects a redirect to a hostname that resolves privately", "rejects a redirect to a private IP literal", ADR 2026-08-12: Post-implementation review fixes (backend security/correctness, frontend correctness/a11y)

### SEC-40 Fetch failures do not reveal which hosts and ports answer
**Given** a page or photo fetch that fails at the network level (refused, unreachable, blocked) **When** the failure is reported to the user **Then** the message is generic ("Couldn't reach that page", "Couldn't fetch that image", or the timeout wording) and never contains the raw socket error, address or port; the raw error goes to the server log only.
Cites: `backend/src/services/recipeExtraction.ts`, `backend/src/services/imageFromUrl.ts`, ADR 2026-09-25: SSRF guard extended to yt-dlp and Web Push

### SEC-41 Fetches are bounded in time and size
**Given** a page or photo fetch **When** it runs **Then** a page is abandoned after 15 seconds and read for at most 2,000,000 bytes (a declared larger size fails with "That page is too large to import"), and a photo after 10 seconds and at most 5 MB. (Wording and the rest of import behaviour belong to the import area.)
Cites: `backend/src/services/recipeExtraction.ts`, `backend/src/services/imageFromUrl.ts`

### SEC-42 Compressed pages are read normally
**Given** a page served with gzip, deflate or brotli compression **When** the guarded fetch reads it **Then** the body arrives decompressed and readable.
Cites: `backend/src/services/safeFetch.test.ts` "decodes a gzip-encoded body"

### SEC-43 Every connection yt-dlp makes goes through the address guard
**Given** a Reel or TikTok import **When** yt-dlp contacts any host (page, API, redirect target, CDN media) **Then** the destination is checked with the same blocklist and the same rules as SEC-31 to SEC-33, resolving once and connecting to the checked address. A destination that resolves to a blocked address, whether by name, by one blocked record among public ones, or as an IP literal (`10.0.0.1`, `127.0.0.1`, `::1`, `[::ffff:10.0.0.1]`), is refused, and the import fails.
Cites: `backend/src/services/egressProxy.test.ts` "refuses a CONNECT to %s, which resolves to %s", "refuses a CONNECT to the IP literal %s", ADR 2026-09-25: SSRF guard extended to yt-dlp and Web Push

### SEC-44 yt-dlp may reach only web ports
**Given** a yt-dlp connection to a public address **When** the port is anything but 80 or 443 **Then** it is refused, and the refusal is logged with host and port.
Cites: `backend/src/services/egressProxy.test.ts` "refuses a CONNECT to a non-web port, even on a public IP"

### SEC-45 Unresolvable names and malformed requests are refused
**Given** yt-dlp traffic, mediated by a forward proxy as today (the mechanism may change; the guard stays inside the app, index Q34; then the equivalent refusals apply) **When** the destination name does not resolve **Then** it is refused (403). **When** a tunnel request has no port, a scheme, or a path (`example.com`, `http://example.com:443`, `example.com:443/path`) **Then** it is refused as malformed (400). **When** a plain request is not in proxy form (a relative path) **Then** it is refused (400). Bracketed IPv6 destinations with a port (`[2606:4700::1111]:443`) are understood.
Cites: `backend/src/services/egressProxy.test.ts` "refuses a name that doesn't resolve", "refuses a request that isn't in proxy (absolute) form", "parses %s", "rejects %s"

### SEC-46 Allowed yt-dlp traffic passes through intact
**Given** a destination that passes the guard, with today's forward-proxy mechanism (the mechanism may change; the guard stays inside the app, index Q34) **When** yt-dlp opens an HTTPS tunnel or makes a plain HTTP request **Then** the tunnel opens and carries traffic end to end, and a plain request is forwarded with its original `Host` header and path and query, one fresh upstream connection per request, each checked separately. An upstream that fails before connecting answers 502; idle connections are dropped after 60 seconds.
Cites: `backend/src/services/egressProxy.test.ts` "tunnels a CONNECT to a public host", "forwards a plain-HTTP request with the original Host header"

### SEC-47 The yt-dlp guard is reachable from inside the server only and logs no secrets
**Given** the mechanism that mediates yt-dlp traffic **When** it is running **Then** nothing outside the server can use it (today's proxy listens only on the loopback address), and every refusal is logged with host, port and reason only, never a path or query string (they can carry tokens).
Cites: `backend/src/services/egressProxy.test.ts` "listens on loopback only", "refuses plain-HTTP requests to blocked hosts and ports, and logs only the host"

### SEC-48 yt-dlp cannot route around the guard, and fails closed
**Given** a Reel or TikTok import **When** yt-dlp runs **Then** it cannot bypass the guard: every invocation is pointed at the guard; proxy-related environment settings are not passed to it, in any letter case (one of them was observed to make it ignore an explicit proxy); no yt-dlp config file is read; only single-file formats that yt-dlp downloads with its own network stack are used, with no external downloader or post-processing step (those make their own connections and ignore the guard); and the generic page-crawling extractor is disabled so only site-specific extractors run. **When** the guard is unavailable **Then** the Reel or TikTok import fails with 503 rather than running unguarded, and the server does not start if the guard cannot start.
Cites: `backend/src/services/socialVideo.ts`, `backend/src/services/socialVideo.test.ts` "routes every yt-dlp invocation through the egress proxy", "drops every proxy variable, in either case, and keeps the rest", `backend/src/services/socialVideo.runner.test.ts` "runs /usr/bin/yt-dlp with --proxy and an environment with no proxy variables", `backend/src/services/recipeExtraction.test.ts` "fails closed with no downloader rather than running yt-dlp without the egress proxy", ADR 2026-09-25: SSRF guard extended to yt-dlp and Web Push

### SEC-49 Push subscriptions must point at a recognised push service
**Given** a push subscription **When** its endpoint is not `https`, has a port other than 443, has embedded credentials, or its host is not one of `*.push.apple.com`, `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com` (for example an IP literal, a look-alike such as `web.push.apple.com.evil.example`, or `storage.googleapis.com`) **Then** it is not stored; subscribing answers 400 "Not a recognized push service endpoint".
Cites: `backend/src/services/pushEndpoint.ts`, `backend/src/services/pushNotifier.test.ts` "refuses %s", ADR 2026-09-25: SSRF guard extended to yt-dlp and Web Push

### SEC-50 Push endpoints are re-checked and guarded on every send
**Given** a stored subscription **When** a notification is about to be sent **Then** the endpoint is checked against the allowlist again (catching rows stored before the rule, or after the list shrinks), and the connection to the push service goes through the address guard, so an allowed name resolving to an internal address is refused. A refused or failing subscription is deleted and logged by host only (the path is the device's push token).
Cites: `backend/src/services/pushNotifier.test.ts` "refuses an endpoint off the allowlist without connecting anywhere", "refuses an allowlisted host whose DNS answer is an internal address", ADR 2026-09-25: SSRF guard extended to yt-dlp and Web Push

### SEC-51 Allowed origins are configured as exact browser origins
**Given** the allowed-origins setting is a comma-separated list **When** the server starts **Then** whitespace around entries is trimmed and a trailing slash is stripped; an entry with an explicit default port (`https://host:443`), a path (`https://host/api`), or that is not a URL (`host`) stops the server with an error naming the offending value and, where there is one, the correct spelling; an empty list stops the server.
Cites: `backend/src/config/origins.test.ts` "splits a comma-separated list and trims whitespace", "strips a trailing slash", "refuses an explicit default port, since browsers never send one", "refuses a value with a path", "refuses something that isn't a URL", "refuses an empty list"

### SEC-52 Production refuses to start without allowed origins
**Given** the server is started in production **When** the allowed-origins setting is unset or empty **Then** it stops at boot with an error naming the missing allowed-origins setting (today "FRONTEND_ORIGINS must be set in production"), instead of 403-ing every request later.
Cites: `backend/src/config/origins.test.ts` "refuses FRONTEND_ORIGINS=%j", `backend/src/config/env.ts`, ADR 2026-09-25: Tailscale retired

### SEC-53 Production refuses to start without a trusted proxy
**Given** the server is started in production **When** no trusted proxy is configured **Then** it stops at boot saying the trusted-proxy setting must be set (without it the server never believes the request was HTTPS, never issues the Secure cookie, and nobody can log in). The setting is a comma-separated list of exact IP addresses; an empty value means trust none. In the new topology the one entry is Caddy.
Cites: `backend/src/config/origins.test.ts` "refuses an empty TRUSTED_PROXIES", "parses a comma-separated list, and empty means trust none", "accepts origins and a trusted proxy", `backend/src/config/env.ts`, ADR 2026-09-25: Tailscale retired

### SEC-54 Development has working defaults
**Given** the server is not in production **When** no allowed origin is configured **Then** `http://localhost:5173` is the allowed origin and no trusted proxy is assumed; the server listens on port 3001 unless told otherwise, and stores uploads under an `uploads` directory unless told otherwise.
Cites: `backend/src/config/env.ts`, `backend/src/app.ts`

### SEC-55 Push keys are set together or not at all
**Given** the three push settings (public key, private key, contact subject) **When** all are unset **Then** push is disabled (the push endpoints answer 503 and imports finish without notifying). **When** only some are set **Then** the server stops at boot saying they must be set together. **When** the subject is not a `mailto:` or `https://` URL **Then** the server stops at boot.
Cites: `backend/src/config/env.ts`, `backend/src/app.ts`

### SEC-56 The server will not start without a database address
**Given** the server is started **When** the database connection setting is missing **Then** it stops at boot with an error naming the missing setting (today "Missing required environment variable: DATABASE_URL").
Cites: `backend/src/config/env.ts`

### SEC-57 Production refuses to start without a session secret
**Given** the server is started in production **When** no session secret is configured **Then** it stops at boot with an error naming the missing setting.
Decision: owner 2026-11-24, index Q7 (v1 silently used a built-in development secret)
Cites: `backend/src/config/env.ts`, ADR 2026-08-06: Recipe images served through an authenticated route, not a static mount

### SEC-58 Signup is enabled only by an explicit "true"
**Given** the signup setting **When** it is unset, empty, or anything other than the exact value `true` **Then** signup is disabled (SEC-15).
Cites: `backend/src/config/env.ts`, ADR 2026-09-24: Public HTTPS behind Caddy

### SEC-59 Starting an import is also limited per client IP
**Given** any number of logged-in users behind one client IP (as determined by SEC-13) **When** more than 30 import starts arrive from that IP within an hour **Then** the 31st gets 429 with `Retry-After`, under the same window rules as SEC-16, in addition to the per-user cap of SEC-21.
Decision: owner 2026-11-24, index Q6 (v1 capped import starts per user only; design §9 asks for a client-IP key)
Cites: design §9, `backend/src/routes/import.ts` (today: per-user cap only)

### SEC-60 Responses carry basic hardening headers
**Given** any response from the app (API answers, the app page, static files and photos) **When** its headers are inspected **Then** it carries `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`. There is no Content-Security-Policy header in the first release (backlog, design §2).
Decision: owner 2026-11-24, index Q8 (v1 sent neither header)
Cites: `backend/src/app.ts`, design §2

## Rationale

### §9 bullet to criterion IDs

| Design §9 bullet | Criteria |
|---|---|
| SSRF guard on every server-side fetch (URL import page and photo fetch, yt-dlp, Web Push), including after redirects and DNS | SEC-31 to SEC-42 (page and photo), SEC-43 to SEC-48 (yt-dlp), SEC-49 and SEC-50 (Web Push) |
| Session cookie named `__Host-`, Secure, Path=/, no Domain, HttpOnly, SameSite | SEC-07 to SEC-11 (SEC-12 and SEC-14 support it) |
| Origin check on state-changing requests against the configured allowed origins | SEC-01 to SEC-06, SEC-51 and SEC-52 |
| Rate limits on login, signup and import, keyed by client IP; client IP from `X-Forwarded-For` only when the peer is the trusted proxy (Caddy) | SEC-13, SEC-16 to SEC-22, SEC-53, SEC-59 (import is keyed per user and, by the owner's decision, per client IP) |
| Signup off by default (env flag) | SEC-15, SEC-58 |
| Images served through an authenticated route, never a public static mount | SEC-24 (SEC-25 covers what may be stored) |

Cross-references for other areas. Limited endpoint groups (all in SEC-16): login per IP 20 per 15 minutes (SEC-17); login failures per account 10 per 15 minutes (SEC-18); signup per IP 5 per hour (SEC-20); import start per user 30 per hour (SEC-21) and per client IP 30 per hour (SEC-59); photo from URL per user 60 per hour (SEC-22). The auth area should cite SEC-12, SEC-15, SEC-17 to SEC-20; the import area SEC-21, SEC-59, SEC-34 to SEC-36, SEC-39 to SEC-41, SEC-43 to SEC-48.

### Why the origin check, and why no CORS (SEC-01 to SEC-06)
CORS decides whether a page may read a response; a cross-site form POST still runs. The check is therefore CSRF protection by `Origin`, chosen over a token because every supported browser sends it (ADR 2026-09-24). Without `Origin`, `Sec-Fetch-Site` decides; with neither it is not a browser, and CSRF is a browser attack, so it falls to normal authentication. The match is exact because a browser sends `https://host` and never a default port or path (SEC-02, SEC-51). CORS was removed when the app became same-origin (ADR 2026-09-25: Tailscale retired); the old CORS entry is superseded.

### Why the cookie is built this way (SEC-07 to SEC-12)
The `__Host-` prefix makes the browser itself enforce Secure, Path=/ and no Domain, so the cookie cannot travel over plain HTTP and a sibling subdomain (the same wildcard certificate covers others, such as a map site) cannot plant or overwrite it. Because of that, clearing it needs the same attributes (SEC-10), and dev needs the plain name (SEC-11). Session regeneration on login is a low-cost fix against fixation (ADR 2026-08-06).

### Why the trusted proxy is Caddy and pinned to an exact address (SEC-13, SEC-14, SEC-53)
Design §3: the new app is one container that joins Caddy's network directly, so the trusted proxy becomes Caddy instead of nginx's fixed IP. Today's rule is kept: an exact address, never a subnet, because any container on a trusted subnet could claim to be any client; and Caddy's network can reach admin tools such as dockge. Get this wrong in either direction and rate limits break: trusting nothing makes every request come from Caddy (one shared bucket for everybody); trusting too much lets a client choose its own bucket. The same setting decides whether a request counts as HTTPS, which is why production refuses to start without it (SEC-53, ADR 2026-09-25).

### Why two login limits (SEC-17, SEC-18)
Per IP alone lets a botnet spread guesses at one account over many IPs; per account alone lets one IP try a few passwords against every account. The account counter counts failures only and resets on success so the owner is locked out only while someone is guessing (ADR 2026-09-24). This supersedes the 2026-08-05 "no rate limiting" decision, which relied on Tailscale being the only way in.

### Why the SSRF guard is built as it is (SEC-31 to SEC-50)
The app is public, and its containers can reach the Docker host, the LAN and the tailnet; "import this URL" would otherwise let any account holder make requests from inside. Two layers cover each other's holes: a literal-address pre-check before any request (an IP literal never triggers DNS) and a check of every resolved address at connect time (a name can point inward). Checking the very address the socket connects to leaves nothing for DNS rebinding to answer differently (SEC-38). The whole name is refused if any record is blocked (SEC-37). Redirects are followed by hand so each hop passes the same check (SEC-39). yt-dlp does its own networking, so a proxy that applies the same guard sits in front of it (SEC-43 to SEC-48): what matters is that every yt-dlp connection passes the guard, not that it is a proxy. SEC-48 records that `NO_PROXY=*` in the environment made yt-dlp ignore an explicit proxy, and that ffmpeg (which yt-dlp hands HLS/DASH downloads and merges to) makes its own connections and ignores the proxy; today this is enforced with `--ignore-config`, `--downloader native`, `--fixup never`, pre-merged formats and `--ies default,-generic`. SEC-31's `172.16/12` covers every Docker bridge network, including today's Docker host gateway `172.28.0.1`, which is why that address recurs in the test examples (SEC-33, SEC-34, SEC-43). One shared guard serves all callers so the blocklist cannot drift (ADR 2026-09-25: SSRF). The Web Push allowlist is deliberately narrower than "all of googleapis.com", because that includes storage hosts (SEC-49).

### Other notes
- SEC-45, SEC-46: "the equivalent refusals apply" if the guard mechanism changes. The builder's plan names the mechanism it keeps (today's forward proxy or another in-app guard) and tests these criteria against that one.
- SEC-19, SEC-25, SEC-27: timing equalisation, content sniffing and the fixed 413/400 messages come from ADRs 2026-09-24 and 2026-08-12.
- SEC-23: the ADR 2026-09-24 audit found every data route behind a session check; the public routes are only those named.
- Reverse-proxy matters from today's topology (nginx's 6 MB body limit for 5 MB photos, per-request name resolution, a unique backend alias) disappear with the single container. The single app now has to accept 5 MB photos itself (recipes area) and answer the 413 of SEC-27 for JSON bodies.
- HSTS and TLS are Caddy's job (wildcard certificate), not the app's, and are therefore not criteria here.
- SEC-57 is a new guard, decided by the owner (index Q7), because a production server silently running with a published development secret is the kind of regression the design warns about; with Better Auth, the equivalent is its own secret.
- SEC-60: `nosniff` stops a browser from reading an uploaded file as something other than its declared type; `same-origin` keeps the app's addresses (which carry recipe and import ids) out of the Referer sent to recipe sites the owner opens. CSP stays in the backlog (design §2). Do not "harden" it to `no-referrer`: under that policy browsers send `Origin: null` on the app's own non-CORS same-origin POSTs, which SEC-02 rejects, so the app would refuse itself with 403; `same-origin` keeps the real `Origin`.

### Owner decisions (2026-11-24)
The owner accepted every default in index.md on 2026-11-24.
- Q6 rate-limit key: per-user caps kept; import starts also capped at 30 per client IP per hour. SEC-16 (table), SEC-59 (now a requirement).
- Q7 session secret: production refuses to start without one. SEC-57 (now a requirement).
- Q8 response-hardening headers: `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin` on every response; CSP stays in the backlog. SEC-60 (new).
- Q13 HEIC uploads: accepted and converted to JPEG, so the content check admits HEIC/HEIF for uploads. SEC-25.
- Q34 yt-dlp guard and login limit: the guard stays inside the app; 20 login attempts per IP per 15 minutes stays. No criterion behaviour changed (SEC-17, SEC-43 to SEC-48; SEC-45 and SEC-46 only had their question reference updated).
- Group E note: whether Caddy appends to or overwrites `X-Forwarded-For` is checked by the builder when the skeleton is deployed (SEC-13). No change.

## Tests not carried
- `backend/src/services/safeFetch.test.ts` "returns a null-body response for 204": tests the fetch client's handling of a response with no body (an implementation detail of the in-house client).
- `backend/src/services/safeFetch.test.ts` "returns the array form when Node asks for all addresses", "returns a single address otherwise": the two lookup call styles are carried only for their observable effect (SEC-37); the call shapes are internal.
- `backend/src/services/egressProxy.test.ts` "parses %s" for the exact string forms: carried as behaviour in SEC-45; the parser function itself is internal.

## Open questions for the owner
All answered by the owner on 2026-11-24 (accepted defaults); see Rationale, Owner decisions.
