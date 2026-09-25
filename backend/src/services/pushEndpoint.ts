/**
 * Which Web Push endpoints the backend will ever POST to.
 *
 * A subscription's endpoint comes from the browser — i.e. from the client —
 * and the backend POSTs to it whenever an import finishes. Accepting any URL
 * would let a signed-in user point the server at arbitrary or internal hosts
 * (SSRF). An allowlist is stricter than the address blocklist and costs
 * nothing: a real subscription only ever points at one of these few push
 * services.
 *
 * Checked when a subscription is stored (validation/push.ts) and again right
 * before every send (pushNotifier.ts), so rows stored before this check
 * existed — or if the list ever shrinks — are caught too. The send also runs
 * the resolved address through safeFetch.ts's guard as a second layer.
 */
const PUSH_SERVICE_HOSTS: readonly RegExp[] = [
  /(^|\.)push\.apple\.com$/, // Safari / iOS home-screen apps (web.push.apple.com)
  // Chrome, Chromium-based browsers, Android. Deliberately not all of
  // *.googleapis.com: that also covers hosts like storage.googleapis.com,
  // and no browser hands out a push endpoint on anything but fcm.
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox (updates.push.services.mozilla.com)
  /(^|\.)notify\.windows\.com$/, // Edge / Windows push (WNS)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    // WHATWG URL reports the scheme's default port as "": this is "443 only".
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
  );
}
