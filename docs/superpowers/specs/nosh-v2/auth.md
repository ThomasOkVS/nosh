# Auth (accounts, sign-up, login, sessions)

## Purpose
Lets the owner have a private account: create it (only when the server allows
sign-ups), log in with a username and password, stay logged in for a week,
and log out. Every recipe screen and every data call is closed to anyone who
is not logged in.

## Sources
- `backend/src/routes/auth.ts`
- `backend/src/routes/auth.test.ts`
- `backend/src/validation/auth.ts`
- `backend/src/repositories/users.ts`
- `backend/src/middleware/requireAuth.ts`
- `backend/migrations/1700000000000_create-users.js`
- `backend/migrations/1700000000007_add-username-to-users.js`
- `backend/src/app.ts`
- `frontend/src/api/auth.ts`
- `frontend/src/auth/AuthContext.ts`
- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/auth/RequireAuth.tsx`
- `frontend/src/auth/RequireAuth.test.tsx`
- `frontend/src/auth/useAuth.ts`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/LoginPage.test.tsx`
- `frontend/src/pages/SignupPage.tsx`
- `frontend/src/components/AuthLayout.tsx`
- `frontend/src/components/PasswordInput.tsx`
- `frontend/src/components/PasswordInput.test.tsx`
- `frontend/src/components/UserMenu.tsx`
- `frontend/src/components/UserMenu.test.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/App.tsx`

## ADRs
- 2026-08-05: Full login instead of a shared passphrase
- 2026-08-06: Backend MVP — DB access, auth mechanism, and supporting libraries
- 2026-08-06: Login switched from email to username
- 2026-08-06: No minimum password length
- 2026-08-05: Multi-user-ready schema
- 2026-08-19: Header consolidated into a `UserMenu` dropdown; app version shown via build-time commit SHA

## Features
| Feature | Verdict | Why |
|---|---|---|
| Accounts with username, email and password | keep | Parity (design §6 Auth). Single owner today, but the data model stays per-user. |
| Log in by username and password | keep | Existing login method; the owner must be able to log in after cutover with their current credentials (design §3, §6, §11). |
| Existing password hashes keep working | keep | Hard compatibility requirement for the data import; no forced password reset. |
| Sign-up form | keep | Needed to create the account; closed by default on the server. |
| Sign-up off unless the server enables it | keep | Design §9. Enforced by the API, not by hiding the link. |
| Session lasting one week, server-side revocable | keep | Logout really ends the session. Design §9 for cookie requirements. |
| Log out | keep | Parity. |
| Route protection (redirect to login, return to the page asked for) | keep | Parity. |
| Show/hide password toggle | keep | Small, useful, accessible. |
| Header user menu dropdown | drop | Design §7 replaces the header user menu with a settings icon top-right and a bottom nav pill. Its entries move to the Settings screen (owner, index Q9). |
| See who is logged in, log out, see the app version | keep | Parity (ADR 2026-08-19: the owner asked for a visible build identifier). Placed in an Account section on the Settings screen (owner, index Q9). |
| Manual dark/light toggle remembered per device | drop | Design §7 decided dark mode follows the system setting (PWA-32); confirmed by the owner (index Q9). |
| Notifications on/off entry (today in the user menu) | keep | Owned by PWA (PWA-27 to PWA-30); it moves to the Settings screen (owner, index Q9; SET-30). |
| App shell: one step to Home and to Settings from every signed-in screen; import dialog available app-wide | keep | Today the "Nosh" logo links Home and the user menu links Settings. Design §7 replaces both with the bottom nav pill (Library + "+") and a settings icon. |
| Header link to the weekly planner | drop | Planner dropped (design §5). |
| Old `/recipes` address redirects to the library, keeping `q` and `tag` | drop | The separate all-recipes page was retired on 2026-09-23. The rewrite defines its own addresses, nosh is private, and an unknown address already lands on Home (AUTH-16). |
| Email address on the account | keep | Decided by the owner (index Q19): kept as an optional, unique stored field so imported accounts keep theirs; the new sign-up form no longer asks for it. |
| Case-sensitive usernames | drop | Decided by the owner (index Q2): usernames are case-insensitive for uniqueness and login (AUTH-06, AUTH-07); the importer checks for collisions first. |
| Password reset / change password / delete account | drop | Do not exist today. Out of scope for the restart. |

## Acceptance criteria

### AUTH-01 Sign up creates an account and logs in
**Given** the server allows sign-ups and nobody is logged in **When** a visitor submits a username and a password that pass validation **Then** an account is created; the sign-up form asks only for a username and a password, and no email is asked for or shown. The response is 201 and identifies the new account by its id and username; it never contains the password or its hash. The visitor is logged in immediately, so asking for the current user returns that account. The browser then lands on the home page.
Decision: owner 2026-11-24, index Q19 (v1 required an email on sign-up)
Cites: `backend/src/routes/auth.test.ts` "signs a new user up and starts a session"

### AUTH-02 Sign-up is refused when the server disallows it
**Given** the server is configured with sign-ups off (the default) **When** anyone posts to the sign-up endpoint directly, with or without valid data **Then** the response is 403 "Sign-ups are disabled on this server", no account is created and no session starts.
Cites: `backend/src/routes/auth.ts`; design §9. Rate limits on sign-up are in SEC.

### AUTH-03 Username rules
**Given** a sign-up request **When** the username, after trimming surrounding spaces, is shorter than 3 or longer than 32 characters, or contains anything other than letters, digits and underscores **Then** the response is 400 with the message "Username must be at least 3 characters", "Username must be at most 32 characters" or "Username can only contain letters, numbers, and underscores" respectively, and nothing is stored. A valid username is stored trimmed.
Cites: `backend/src/routes/auth.test.ts` "rejects signup with an invalid username", ADR 2026-08-06 (Login switched from email to username)

### AUTH-04 ~~Email must be well formed~~
Struck by the owner's decision (index Q19, 2026-11-24): the sign-up form no longer asks for an email, so there is no email input to validate. Accounts imported from v1 keep their stored email (AUTH-23).
Decision: owner 2026-11-24, index Q19 (v1 required a well-formed email on sign-up)
Cites: none (struck)

### AUTH-05 Any non-empty password is accepted
**Given** a sign-up request with otherwise valid fields **When** the password is any non-empty text, including a very short one such as two characters **Then** the account is created (201). **When** the password is empty **Then** the response is 400 "Password is required". There is no minimum length, no complexity rule and no maximum other than the server's request size limit.
Cites: `backend/src/routes/auth.test.ts` "accepts a short password (no minimum length enforced)", "rejects signup with an empty password", ADR 2026-08-06 (No minimum password length)

### AUTH-06 Duplicate username is refused, ignoring case
**Given** an account already exists **When** someone signs up with the same username, in any mix of upper and lower case (`Alice` when `alice` exists) **Then** the response is 409 "Username already taken", nothing is created and no session starts.
Decision: owner 2026-11-24, index Q2 and Q19 (v1 compared usernames case-sensitively and also refused a duplicate email with 409 "Email already registered")
Cites: `backend/src/routes/auth.test.ts` "rejects signup with a duplicate username"

### AUTH-07 Log in with username and password
**Given** an account exists **When** the owner submits its username, in any letter case, and the correct password **Then** the response is 200 and identifies the account by its id and its username as stored (never the password or its hash), and the browser holds a session, so asking for the current user returns that account. The login form asks for "Username" and "Password" only, never email, and no email is shown for an account that has none.
Decision: owner 2026-11-24, index Q2 (v1 matched the username case-sensitively)
Cites: `backend/src/routes/auth.test.ts` "logs an existing user in", `frontend/src/pages/LoginPage.test.tsx` "submits the entered credentials", ADR 2026-08-06 (Login switched from email to username)

### AUTH-08 Existing argon2 password hashes keep working
**Given** an account imported from the old app, whose stored password is an argon2 hash and whose username is the existing one **When** the owner logs in with their current username and current password **Then** login succeeds exactly as in AUTH-07, with no password reset, no re-hash prompt and no change to the password. A wrong password for the same account is refused as in AUTH-09. This must be proven by a test using a fixture account with a known argon2 hash, as design §6 and §11 require.
Cites: design §3, §6, §11; `backend/src/routes/auth.ts`; ADR 2026-08-06 (Backend MVP)

### AUTH-09 Bad credentials give one indistinguishable error
**Given** an existing account and an unknown username **When** someone logs in with the wrong password, or with a username that does not exist **Then** both get 401 "Invalid username or password" with identical bodies, no session starts, and the login form shows that message above the fields. The unknown-username case takes about as long as the wrong-password case, and every failure is delayed by about a second, so response time does not reveal which usernames exist and guessing is slow. Limits on repeated attempts (per client IP and per account) are in SEC.
Cites: `backend/src/routes/auth.test.ts` "rejects login with the wrong password", "rejects login for an unknown username", `frontend/src/pages/LoginPage.test.tsx` "shows the server's error message when login fails"

### AUTH-10 Login input is validated
**Given** a login request **When** the username is missing or empty after trimming, or the password is missing or empty **Then** the response is 400 with a validation message and no credential check happens (and no failure delay). The sign-up username rules of AUTH-03 do not apply to login, so every stored username, including backfilled names such as `john.doe_3`, can log in.
Decision: owner 2026-11-24, index Q1 (v1 applied the sign-up username rules to login and answered 400 for names such as `john.doe_3`)
Cites: `backend/src/validation/auth.ts`

### AUTH-11 A fresh session on every login and sign-up
**Given** a browser that already holds a session identifier **When** it logs in or signs up **Then** the session identifier it holds afterwards is a new one, so an identifier planted earlier cannot be reused to inherit the authenticated session.
Cites: `backend/src/routes/auth.ts`; design §9

### AUTH-12 Session cookie and lifetime
**Given** a successful login or sign-up **When** the server sets the session cookie **Then** in production it is named with the `__Host-` prefix, is Secure, HttpOnly and SameSite, has Path=/ and no Domain, and expires after one week. The week runs from login and is not extended by later use. After expiry, the next request is treated as logged out. In local development over plain HTTP the cookie may drop the prefix and the Secure flag.
Cites: `backend/src/app.ts`; design §9. The full cookie requirements are owned by SEC.

### AUTH-13 Current-user lookup
**Given** a logged-in browser **When** it asks for the current user **Then** it gets 200 identifying the account by its id and username, never containing the password or its hash. **When** there is no session, or the session points at an account that no longer exists **Then** it gets 401 "Not authenticated".
Cites: `backend/src/routes/auth.test.ts` "rejects /auth/me without a session", `backend/src/routes/auth.ts`

### AUTH-14 Log out
**Given** a logged-in owner **When** they choose "Log out" **Then** the server ends the session and clears the cookie (204), the browser goes to the login page, and the old session no longer works: asking for the current user returns 401. If the logout call fails, the owner stays on the current page and nothing is shown.
Cites: `backend/src/routes/auth.test.ts` "logs a user out and ends their session", `frontend/src/components/UserMenu.test.tsx` "logs out and navigates to /login"

### AUTH-15 Every data endpoint requires a session
**Given** no session **When** any request is made to a protected endpoint (recipes, collections, search, settings, import, images and the rest) **Then** the response is 401 "Not authenticated" and nothing is read or changed. Only sign-up, login, logout and the health check are open.
Cites: `backend/src/middleware/requireAuth.ts`

### AUTH-16 Protected screens redirect to login and return afterwards
**Given** a logged-out visitor **When** they open any screen other than login and sign-up (for example a recipe link) **Then** they are sent to the login page, and after logging in they land on the address they first asked for, with its path, query string and hash (a logged-out tap on `/recipes/new?importId=5` lands on `/recipes/new?importId=5`). If they came to login directly they land on the home page. An unknown address sends a logged-in owner to the home page.
Decision: owner 2026-11-24, index Q20 (v1 kept only the path and dropped the query and hash)
Cites: `frontend/src/auth/RequireAuth.test.tsx` "redirects to /login when there is no active session", `frontend/src/App.test.tsx` "redirects to /login when there is no active session", `frontend/src/pages/LoginPage.tsx`, `frontend/src/App.tsx`

### AUTH-17 Session check on load
**Given** the app opens **When** it is still asking the server whether a session exists **Then** a loading indicator labelled "Loading" is shown, not protected content and not the login form. **When** the check says a session exists **Then** the requested protected screen appears. **When** the check fails for any reason, including the network being down **Then** the visitor is treated as logged out and sent to the login page.
Cites: `frontend/src/auth/RequireAuth.test.tsx` "renders the protected route when the session check succeeds", "redirects to /login when there is no active session"

### AUTH-18 Auth forms: errors, busy state, links
**Given** the login or sign-up form **When** it is submitted **Then** the submit button is disabled and changes its label ("Logging in…" / "Creating account…") until the server answers. If the server rejects it, its message is shown in an alert above the fields and keyboard focus moves to that alert. If the failure is not a server message, "Something went wrong" is shown. Login links to sign-up ("No account? Sign up") and sign-up links to login. Sign-up also tells the owner "Letters, numbers, and underscores only." and constrains the username field to 3 to 32 characters.
Cites: `frontend/src/pages/LoginPage.test.tsx` "shows the server's error message when login fails", `frontend/src/components/AuthLayout.tsx`

### AUTH-19 Show/hide password
**Given** any password field **When** the owner types **Then** the characters are hidden by default and the typed value is reported as it changes. **When** they press "Show password" **Then** the text becomes visible and the control is relabelled "Hide password"; pressing it again hides the text.
Cites: `frontend/src/components/PasswordInput.test.tsx` "hides the value by default and reveals it when the toggle is clicked", "calls onChange as the user types"

### AUTH-20 Browser password-manager hints
**Given** the login and sign-up forms **When** a password manager inspects them **Then** the login fields are marked as username and current password, and the sign-up fields as username and new password, so saving and autofill work.
Decision: owner 2026-11-24, index Q19 (v1's sign-up form also had an email field)
Cites: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/SignupPage.tsx`

### AUTH-21 The Settings screen shows who is logged in and which build is running
**Given** a logged-in owner **When** they open the Settings screen **Then** an Account section shows their username (truncated if long on small screens) and a "Log out" action (AUTH-14), and the app version appears at the bottom of the screen: a short commit identifier in production builds, "dev" otherwise, with the full commit available on request (for example on hover).
Decision: owner 2026-11-24, index Q9 (v1 showed these in a menu under the username in the header)
Cites: `frontend/src/components/UserMenu.test.tsx` "shows the username and opens the menu on click, with the version at the bottom", ADR 2026-08-19 (Header consolidated into a `UserMenu` dropdown)

### AUTH-22 ~~User menu behaviour~~
Struck in the consistency pass. The header user menu is replaced by the design §7 navigation, so its open and close behaviour has no successor. Reaching Settings is AUTH-24. The manual dark/light toggle is dropped because dark mode follows the system (PWA-32). Its tests are listed under Tests not carried.
Cites: none (struck)

### AUTH-23 Stored account data
**Given** the data model **When** an account exists **Then** it stores an id, an optional email (unique when present; accounts imported from v1 keep theirs, new accounts have none), a username that is unique ignoring letter case, a password hash, and the creation time, plus the per-user settings owned by other areas. Usernames that were missing when the username column was introduced were backfilled as the email's local part plus `_` plus the id; they stay valid logins (AUTH-10). The data import refuses to proceed if two v1 usernames differ only in letter case, so the owner can resolve the collision first.
Decision: owner 2026-11-24, index Q1, Q2 and Q19 (v1 required a unique email and compared usernames case-sensitively)
Cites: `backend/migrations/1700000000000_create-users.js`, `backend/migrations/1700000000007_add-username-to-users.js`, `backend/src/repositories/users.ts`, ADR 2026-08-05 (Multi-user-ready schema)

### AUTH-24 Home and Settings are one step away from every screen that shows the app nav
**Given** a logged-in owner on any signed-in screen that shows the app nav (every screen except the recipe page, where design §7 hides it) **When** they want the library or their settings **Then** one control takes them to Home and one takes them to the Settings screen. On the recipe page, the page's own back link returns to the library (REC-20), so Settings is two steps away. The import dialog and its completion and failure notices belong to the whole app, not to one screen, so an import that finishes while the owner is on a recipe or on Settings is still announced (IMP-41, IMP-42). Starting a new recipe or an import is offered on the library screens today (COL-21); design §7 moves it to the "+" of the bottom nav. Today Home is reached through the "Nosh" logo in the header and Settings through the user menu. Design §7 replaces both with the bottom nav pill and a settings icon top-right.
Cites: `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx`, design §7

## Rationale
- **AUTH-05:** the owner asked for no minimum so they can pick any password for their own instance (ADR 2026-08-06, No minimum password length). Empty is still refused so a form mistake can't create a passwordless account.
- **AUTH-06:** the API tells a caller that a username is taken. That is acceptable only because sign-up is off by default and the app is single-owner.
- **AUTH-08:** the owner's real password hash comes across in the one-time data import. A forced reset would lock out the only user if email delivery or a reset flow were not built. The format is named here only because it is stored data the new login must verify (design §6, §11).
- **AUTH-09:** same message and similar timing for both failures so usernames cannot be enumerated; the fixed delay makes each guess cost time even inside the rate limit.
- **AUTH-11:** guards against session fixation.
- **AUTH-02:** enforced in the API because the API is reachable directly; hiding the sign-up link alone would not be a control (design §9).
- **AUTH-16:** the sign-up screen is reachable even when sign-ups are off; the server then answers 403. Not worth hiding the page.
- **AUTH-21:** the owner asked for a visible way to tell which build is deployed. The short commit id is used because every published image is already tagged with it (ADR 2026-08-19).
- **AUTH-23:** every table that belongs to a user carries its owner from the start, so the app stays multi-user-ready although it is single-user in practice (ADR 2026-08-05, Multi-user-ready schema). The ownership checks in every area (REC-08, COL-02, IMP-32) follow from it.
- **AUTH-01, AUTH-07, AUTH-13 (no email on the wire):** the criteria pin what the owner and the client see (no email asked for or shown, the account identified by id and username, never a password or hash), not whether an `email` field is present in the response; that shape is the builder's.
- **Auth-library fit check:** Q19 adds "accounts may have no email" (new accounts have none; imported ones keep theirs, AUTH-23) to the design §6 Better Auth fit check, next to username login, case-insensitive usernames and argon2 verification. The builder weighs it in that check; design §6 names hand-rolled sessions as the fallback.
- **Login by username, not email (AUTH-07):** ADR 2026-08-06 (Login switched from email to username). Real accounts rather than a shared passphrase: ADR 2026-08-05 (Full login instead of a shared passphrase). Server-side, revocable sessions rather than stateless tokens: ADR 2026-08-06 (Backend MVP).

### Owner decisions (2026-11-24)
The owner accepted every default in index.md on 2026-11-24.
- Q1 old usernames that break the rules: login accepts any stored non-empty username; the format rules apply to sign-up only. AUTH-10, AUTH-23.
- Q2 case-insensitive usernames: uniqueness and login ignore letter case; the importer stops on a case collision. AUTH-06, AUTH-07, AUTH-23.
- Q9 user menu entries: username, "Log out" and the version move to an Account section on the Settings screen; the manual dark/light toggle is dropped. AUTH-21 (AUTH-22 stays struck).
- Q19 email on sign-up: not asked any more; stored, optional and unique for imported accounts. AUTH-01, AUTH-04 (struck), AUTH-06, AUTH-07, AUTH-20, AUTH-23.
- Q20 return after login: the full path, query and hash are kept. AUTH-16.
- Q27 session length: a fixed week, as today. No criterion changed (AUTH-12).

## Tests not carried
- `backend/src/app.test.ts` "returns ok status": tests the health check, not auth; the health endpoint is plumbing for SEC/ops
- `frontend/src/App.test.tsx` "redirects the old /recipes page to the library, keeping its search": the legacy `/recipes` redirect is dropped (see Features).
- `frontend/src/components/UserMenu.test.tsx` "toggles the dark class on <html> and updates the label without closing the menu": the manual theme toggle is dropped; dark mode follows the system (design §7, PWA-32).
- `frontend/src/components/UserMenu.test.tsx` "closes when clicking outside": open and close mechanics of the header user menu, which design §7 replaces.
- `frontend/src/components/UserMenu.test.tsx` "closes on Escape": same reason.
- `frontend/src/components/UserMenu.test.tsx` "opens the settings page and closes the menu": reaching Settings is carried by AUTH-24; closing the menu has no successor.
- `frontend/src/components/UserMenu.test.tsx` "renders nothing while unauthenticated": the Settings screen is protected (AUTH-16), so there is no logged-out state in which the Account section could appear.
- `backend/src/routes/auth.test.ts` "rejects signup with a duplicate email": the sign-up form no longer takes an email (owner, index Q19), so there is no duplicate-email case.

## Open questions for the owner
All answered by the owner on 2026-11-24 (accepted defaults); see Rationale, Owner decisions.
