/** AUTH-21: the build's commit as shown on Settings; "dev" when there is none. */
export function appVersion(sha: string | undefined): { short: string; full: string } {
  if (sha === undefined || sha === "") return { short: "dev", full: "dev" };
  return { short: sha.slice(0, 7), full: sha };
}
