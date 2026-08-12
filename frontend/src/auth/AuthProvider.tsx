import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCurrentUser, login as loginRequest, logout as logoutRequest, signup as signupRequest } from "../api/auth";
import type { User } from "../api/types";
import { AuthContext, type AuthStatus } from "./AuthContext";

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch(() => {
        setStatus("unauthenticated");
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const loggedInUser = await loginRequest(username, password);
    setUser(loggedInUser);
    setStatus("authenticated");
  }, []);

  const signup = useCallback(async (email: string, username: string, password: string) => {
    const newUser = await signupRequest(email, username, password);
    setUser(newUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ user, status, login, signup, logout }),
    [user, status, login, signup, logout],
  );

  // React 19 renders the context object itself as the provider;
  // `<AuthContext.Provider>` is the pre-19 form and is on its way out.
  return <AuthContext value={value}>{children}</AuthContext>;
}
