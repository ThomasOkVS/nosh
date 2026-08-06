import { apiFetch } from "./client";
import type { User } from "./types";

export function signup(email: string, username: string, password: string): Promise<User> {
  return apiFetch<User>("/auth/signup", { method: "POST", body: { email, username, password } });
}

export function login(username: string, password: string): Promise<User> {
  return apiFetch<User>("/auth/login", { method: "POST", body: { username, password } });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/auth/me");
}
