import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import { safeRedirect, validateAuthSearch } from "@/auth/redirect";
import { useLogIn } from "@/auth/session";
import { AuthLayout, authInputClass } from "@/components/AuthLayout";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";

export const Route = createFileRoute("/login")({
  validateSearch: validateAuthSearch,
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const logIn = useLogIn();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const usernameId = useId();
  const passwordId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    logIn.mutate(
      { username, password },
      // AUTH-16: back to the address first asked for, or home.
      { onSuccess: () => void navigate({ href: safeRedirect(search.redirect), replace: true }) },
    );
  }

  return (
    <AuthLayout
      title="Log in"
      error={logIn.isError ? errorMessage(logIn.error) : null}
      footer={
        <>
          No account?{" "}
          <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={usernameId} className="text-sm font-medium">
            Username
          </label>
          <Input
            id={usernameId}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={authInputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={passwordId} className="text-sm font-medium">
            Password
          </label>
          <PasswordInput
            id={passwordId}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
            className={authInputClass}
          />
        </div>
        <Button
          type="submit"
          disabled={logIn.isPending}
          className="mt-2 h-11 rounded-full text-base focus-visible:ring-ring"
        >
          {logIn.isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
