import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import type { Config } from "../config/env.js";
import type { AppEnv } from "../http/context.js";

type CookieConfig = Pick<Config, "isProduction">;

/**
 * SEC-08, SEC-11: `__Host-` makes the browser enforce Secure, Path=/ and no
 * Domain; plain http://localhost in dev cannot store such a cookie.
 */
export function sessionCookieName(isProduction: boolean): string {
  return isProduction ? "__Host-nosh.sid" : "nosh.sid";
}

/** SEC-07, SEC-08, SEC-11: the attributes every set and clear carries. */
function baseOptions(config: CookieConfig): CookieOptions {
  return { httpOnly: true, sameSite: "Lax", path: "/", secure: config.isProduction };
}

/**
 * SEC-07, AUTH-12: expires with the session, a week from login. SEC-09: in
 * production a request that did not arrive over HTTPS gets no cookie at all.
 */
export function setSessionCookie(
  c: Context<AppEnv>,
  token: string,
  expiresAt: Date,
  config: CookieConfig,
): void {
  if (config.isProduction && !c.var.client.isHttps) return;
  setCookie(c, sessionCookieName(config.isProduction), token, {
    ...baseOptions(config),
    expires: expiresAt,
  });
}

/** SEC-10: same name and attributes, or the browser ignores the clear. */
export function clearSessionCookie(c: Context<AppEnv>, config: CookieConfig): void {
  deleteCookie(c, sessionCookieName(config.isProduction), baseOptions(config));
}

export function readSessionToken(c: Context<AppEnv>, config: CookieConfig): string | undefined {
  const token = getCookie(c, sessionCookieName(config.isProduction));
  return token === undefined || token === "" ? undefined : token;
}
