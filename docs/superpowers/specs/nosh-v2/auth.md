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

## ADRs
- 2026-08-05: Full login instead of a shared passphrase
- 2026-08-06: Backend MVP — DB access, auth mechanism, and supporting libraries
- 2026-08-06: Login switched from email to username
- 2026-08-06: No minimum password length

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
| User menu (username, settings link, dark/light toggle, notifications toggle, version) | keep | The auth-related parts (username, log out, version) are criteria here; the other entries belong to their own areas. |
| Email address on the account | owner? | Stored and unique, but never used to log in and nothing is ever sent to it. Recommend keeping it as a stored field (the importer carries it) but deciding whether the new sign-up form should still ask for it. |
| Case-sensitive usernames | owner? | Today `Alice` and `alice` are two different accounts. Recommend case-insensitive uniqueness in the rewrite; see open questions. |
| Password reset / change password / delete account | drop | Do not exist today. Out of scope for the restart. |

## Acceptance criteria

### AUTH-01 Sign up creates an account and logs in
**Given** the server allows sign-ups and nobody is logged in **When** a visitor submits an email, a username and a password that pass validation **Then** an account is created, the response is 201 with the user's `id`, `email` and `username` (never the password or its hash), and the visitor is logged in immediately, so asking for the current user returns that account. The browser then lands on the home page.
Cites: `backend/src/routes/auth.test.ts` "signs a new user up and starts a session"

### AUTH-02 Sign-up is refused when the server disallows it
**Given** the server is configured with sign-ups off (the default) **When** anyone posts to the sign-up endpoint directly, with or without valid data **Then** the response is 403 "Sign-ups are disabled on this server", no account is created and no session starts.
Cites: `backend/src/routes/auth.ts`; design §9. Rate limits on sign-up are in SEC.

### AUTH-03 Username rules
**Given** a sign-up request **When** the username, after trimming surrounding spaces, is shorter than 3 or longer than 32 characters, or contains anything other than letters, digits and underscores **Then** the response is 400 with the message "Username must be at least 3 characters", "Username must be at most 32 characters" or "Username can only contain letters, numbers, and underscores" respectively, and nothing is stored. A valid username is stored trimmed.
Cites: `backend/src/routes/auth.test.ts` "rejects signup with an invalid username", ADR 2026-08-06 (Login switched from email to username)

### AUTH-04 Email must be well formed
**Given** a sign-up request **When** the email is missing or not a valid email address **Then** the response is 400 with a validation message and nothing is stored.
Cites: `backend/src/validation/auth.ts`

### AUTH-05 Any non-empty password is accepted
**Given** a sign-up request with otherwise valid fields **When** the password is any non-empty text, including a very short one such as two characters **Then** the account is created (201). **When** the password is empty **Then** the response is 400 "Password is required". There is no minimum length, no complexity rule and no maximum other than the server's request size limit.
Cites: `backend/src/routes/auth.test.ts` "accepts a short password (no minimum length enforced)", "rejects signup with an empty password", ADR 2026-08-06 (No minimum password length)

### AUTH-06 Duplicate email or username is refused
**Given** an account already exists **When** someone signs up with the same email **Then** the response is 409 "Email already registered". **When** they sign up with a new email but an existing username **Then** the response is 409 "Username already taken". The email check runs first. Nothing is created and no session starts in either case.
Cites: `backend/src/routes/auth.test.ts` "rejects signup with a duplicate email", "rejects signup with a duplicate username"

### AUTH-07 Log in with username and password
**Given** an account exists **When** the owner submits its username and the correct password **Then** the response is 200 with `id`, `email` and `username`, and the browser holds a session, so asking for the current user returns that account. The login form asks for "Username" and "Password" only, never email.
Cites: `backend/src/routes/auth.test.ts` "logs an existing user in", `frontend/src/pages/LoginPage.test.tsx` "submits the entered credentials", ADR 2026-08-06 (Login switched from email to username)

### AUTH-08 Existing argon2 password hashes keep working
**Given** an account imported from the old app, whose stored password is an argon2 hash and whose username is the existing one **When** the owner logs in with their current username and current password **Then** login succeeds exactly as in AUTH-07, with no password reset, no re-hash prompt and no change to the password. A wrong password for the same account is refused as in AUTH-09. This must be proven by a test using a fixture account with a known argon2 hash, as design §6 and §11 require.
Cites: design §3, §6, §11; `backend/src/routes/auth.ts`; ADR 2026-08-06 (Backend MVP)

### AUTH-09 Bad credentials give one indistinguishable error
**Given** an existing account and an unknown username **When** someone logs in with the wrong password, or with a username that does not exist **Then** both get 401 "Invalid username or password" with identical bodies, no session starts, and the login form shows that message above the fields. The unknown-username case takes about as long as the wrong-password case, and every failure is delayed by about a second, so response time does not reveal which usernames exist and guessing is slow. Limits on repeated attempts (per client IP and per account) are in SEC.
Cites: `backend/src/routes/auth.test.ts` "rejects login with the wrong password", "rejects login for an unknown username", `frontend/src/pages/LoginPage.test.tsx` "shows the server's error message when login fails"

### AUTH-10 Login input is validated
**Given** a login request **When** the username is missing or breaks the username rules of AUTH-03, or the password is missing or empty **Then** the response is 400 with a validation message and no credential check happens (and no failure delay).
Cites: `backend/src/validation/auth.ts`. See open question 1 about old usernames that break the rules.

### AUTH-11 A fresh session on every login and sign-up
**Given** a browser that already holds a session identifier **When** it logs in or signs up **Then** the session identifier it holds afterwards is a new one, so an identifier planted earlier cannot be reused to inherit the authenticated session.
Cites: `backend/src/routes/auth.ts`; design §9

### AUTH-12 Session cookie and lifetime
**Given** a successful login or sign-up **When** the server sets the session cookie **Then** in production it is named with the `__Host-` prefix, is Secure, HttpOnly and SameSite, has Path=/ and no Domain, and expires after one week. The week runs from login and is not extended by later use. After expiry, the next request is treated as logged out. In local development over plain HTTP the cookie may drop the prefix and the Secure flag.
Cites: `backend/src/app.ts`; design §9. The full cookie requirements are owned by SEC.

### AUTH-13 Current-user lookup
**Given** a logged-in browser **When** it asks for the current user **Then** it gets 200 with `id`, `email` and `username`. **When** there is no session, or the session points at an account that no longer exists **Then** it gets 401 "Not authenticated".
Cites: `backend/src/routes/auth.test.ts` "rejects /auth/me without a session", `backend/src/routes/auth.ts`

### AUTH-14 Log out
**Given** a logged-in owner **When** they choose "Log out" in the user menu **Then** the server ends the session and clears the cookie (204), the menu closes, the browser goes to the login page, and the old session no longer works: asking for the current user returns 401. If the logout call fails, the owner stays on the current page and nothing is shown.
Cites: `backend/src/routes/auth.test.ts` "logs a user out and ends their session", `frontend/src/components/UserMenu.test.tsx` "logs out and navigates to /login"

### AUTH-15 Every data endpoint requires a session
**Given** no session **When** any request is made to a protected endpoint (recipes, collections, search, settings, import, images and the rest) **Then** the response is 401 "Not authenticated" and nothing is read or changed. Only sign-up, login, logout and the health check are open.
Cites: `backend/src/middleware/requireAuth.ts`

### AUTH-16 Protected screens redirect to login and return afterwards
**Given** a logged-out visitor **When** they open any screen other than login and sign-up (for example a recipe link) **Then** they are sent to the login page, and after logging in they land on the page they first asked for. If they came to login directly they land on the home page. An unknown address sends a logged-in owner to the home page.
Cites: `frontend/src/auth/RequireAuth.test.tsx` "redirects to /login when there is no active session", `frontend/src/pages/LoginPage.tsx`

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
**Given** the login and sign-up forms **When** a password manager inspects them **Then** the login fields are marked as username and current password, and the sign-up fields as email, username and new password, so saving and autofill work.
Cites: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/SignupPage.tsx`

### AUTH-21 User menu shows who is logged in
**Given** a logged-in owner **When** they look at the app header **Then** they see their username on a menu button (truncated if long on small screens). Pressing it opens a menu whose entries include Settings, a dark/light mode switch, "Log out", and the app version at the bottom (a short commit identifier in production builds, "dev" otherwise, with the full commit on hover). **Given** nobody is logged in **Then** the menu is not shown at all.
Cites: `frontend/src/components/UserMenu.test.tsx` "renders nothing while unauthenticated", "shows the username and opens the menu on click, with the version at the bottom"

### AUTH-22 User menu behaviour
**Given** the user menu is open **When** the owner clicks outside it, or presses Escape **Then** it closes. **When** they choose Settings **Then** the settings screen opens and the menu closes. **When** they toggle dark/light mode **Then** the theme switches at once, the choice is remembered on this device, the entry's label flips ("Dark mode" / "Light mode") and the menu stays open.
Cites: `frontend/src/components/UserMenu.test.tsx` "toggles the dark class on <html> and updates the label without closing the menu", "closes when clicking outside", "closes on Escape", "opens the settings page and closes the menu"

### AUTH-23 Stored account data
**Given** the data model **When** an account exists **Then** it stores an id, a unique email, a unique username, a password hash, and the creation time, plus the per-user settings owned by other areas. Usernames that were missing when the username column was introduced were backfilled as the email's local part plus `_` plus the id; those placeholder names are valid logins only if they pass the login rules (see open question 1).
Cites: `backend/migrations/1700000000000_create-users.js`, `backend/migrations/1700000000007_add-username-to-users.js`, `backend/src/repositories/users.ts`

## Rationale
- **AUTH-05:** the owner asked for no minimum so they can pick any password for their own instance (ADR 2026-08-06, No minimum password length). Empty is still refused so a form mistake can't create a passwordless account.
- **AUTH-06:** the API tells a caller which of email or username is taken. That is acceptable only because sign-up is off by default and the app is single-owner.
- **AUTH-08:** the owner's real password hash comes across in the one-time data import. A forced reset would lock out the only user if email delivery or a reset flow were not built. The format is named here only because it is stored data the new login must verify (design §6, §11).
- **AUTH-09:** same message and similar timing for both failures so usernames cannot be enumerated; the fixed delay makes each guess cost time even inside the rate limit.
- **AUTH-11:** guards against session fixation.
- **AUTH-02:** enforced in the API because the API is reachable directly; hiding the sign-up link alone would not be a control (design §9).
- **AUTH-16:** the sign-up screen is reachable even when sign-ups are off; the server then answers 403. Not worth hiding the page.
- **Login by username, not email (AUTH-07):** ADR 2026-08-06 (Login switched from email to username). Real accounts rather than a shared passphrase: ADR 2026-08-05 (Full login instead of a shared passphrase). Server-side, revocable sessions rather than stateless tokens: ADR 2026-08-06 (Backend MVP).

## Tests not carried
- `backend/src/app.test.ts` "returns ok status": tests the health check, not auth; the health endpoint is plumbing for SEC/ops
- `frontend/src/components/UserMenu.test.tsx` "shows the username and opens the menu on click, with the version at the bottom": carried (AUTH-21); the push-notification entry of the menu is covered by the PWA area, not here.

## Open questions for the owner
1. Old usernames that break the rules: the backfill produced names like `john.doe_3` for rows that had none, and login rejects names with a dot with a 400. Does your account have such a name? Recommendation: in the rewrite, let login accept any stored username (non-empty text) and apply the format rules to sign-up only, so no existing account can be locked out.
2. Case sensitivity: `Alice` and `alice` are different accounts today. Recommendation: make usernames case-insensitive for both uniqueness and login; check your own import for collisions first.
3. Should the new sign-up form keep asking for an email, given nothing uses it? Recommendation: keep it as an optional-looking stored field only if the importer needs it; otherwise ask for username and password only. It is currently unique and required.
4. Remember-me or a longer or sliding session than a fixed week? Recommendation: keep the fixed week, since you log in rarely and it matches today.
