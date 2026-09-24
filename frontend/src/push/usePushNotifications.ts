import { useCallback, useEffect, useState } from "react";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "./pushNotifications";

export interface PushNotificationsState {
  /** null while the initial check is still running. */
  status: PushStatus | null;
  busy: boolean;
  enable: () => void;
  disable: () => void;
}

/** Current push opt-in state plus actions to change it — shared by the
 * import dialog's "Notify me" prompt and the user menu's toggle. */
export function usePushNotifications(): PushNotificationsState {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback((action: () => Promise<PushStatus>) => {
    setBusy(true);
    action()
      .then(setStatus)
      .catch(() => setStatus("off"))
      .finally(() => setBusy(false));
  }, []);

  const enable = useCallback(() => run(enablePush), [run]);
  const disable = useCallback(() => run(disablePush), [run]);

  return { status, busy, enable, disable };
}
