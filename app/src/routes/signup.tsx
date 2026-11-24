import { signUpBody } from "@nosh/shared";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import { safeRedirect, validateAuthSearch } from "@/auth/redirect";
import { useSignUp } from "@/auth/session";
import { AuthLayout, authInputClass } from "@/components/AuthLayout";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";

export const Route = createFileRoute("/signup")({
  validateSearch: validateAuthSearch,
  component: SignUpPage,
});

function SignUpPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const signUp = useSignUp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // The same rules as the server (AUTH-03), checked first so a typo costs no
  // request against the sign-up limit.
  const [invalid, setInvalid] = useState<string | null>(null);
  const usernameId = useId();
  const hintId = useId();
  const passwordId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signUpBody.safeParse({ username, password });
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? "Invalid request");
      return;
    }
    setInvalid(null);
    signUp.mutate(parsed.data, {
      // AUTH-01: the new account lands on home (or the address first asked for).
      onSuccess: () => void navigate({ href: safeRedirect(search.redirect), replace: true }),
    });
  }

  const error = invalid ?? (signUp.isError ? errorMessage(signUp.error) : null);

  return (
    <AuthLayout
      title="Sign up"
      error={error}
      footer={
        <>
          Have an account?{" "}
          <Link
            to="/login"
            search={search}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Log in
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
            minLength={3}
            maxLength={32}
            aria-describedby={hintId}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={authInputClass}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            Letters, numbers, and underscores only.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={passwordId} className="text-sm font-medium">
            Password
          </label>
          <PasswordInput
            id={passwordId}
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={setPassword}
            className={authInputClass}
          />
        </div>
        <Button
          type="submit"
          disabled={signUp.isPending}
          className="mt-2 h-11 rounded-full text-base focus-visible:ring-ring"
        >
          {signUp.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
