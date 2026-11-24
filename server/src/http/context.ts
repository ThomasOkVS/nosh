import type { AuthUser } from "../auth/service.js";
import type { ClientInfo } from "./clientInfo.js";

/** Per-request variables shared by every middleware and router. */
export type AppEnv = {
  Variables: {
    client: ClientInfo;
    /** Set by requireAuth. */
    user?: AuthUser;
    /** Set by requireAuth: the raw session token from the cookie. */
    sessionToken?: string;
  };
};
