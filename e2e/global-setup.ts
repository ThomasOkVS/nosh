import { resetAccounts } from "./reset-db";

export default async function globalSetup(): Promise<void> {
  await resetAccounts();
}
