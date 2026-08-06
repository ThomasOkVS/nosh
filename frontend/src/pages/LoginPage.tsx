import { useCallback, useState, type SubmitEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/AuthLayout";
import { PasswordInput } from "../components/PasswordInput";
import { buttonClass, inputClass, labelClass } from "../styles";

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSubmitting(true);
      login(username, password)
        .then(() => {
          const from = (location.state as LocationState | null)?.from?.pathname ?? "/";
          navigate(from, { replace: true });
        })
        .catch((err: unknown) => {
          setError(err instanceof ApiError ? err.message : "Something went wrong");
        })
        .finally(() => setSubmitting(false));
    },
    [username, password, login, navigate, location],
  );

  return (
    <AuthLayout
      title="Log in to Nosh"
      error={error}
      onSubmit={handleSubmit}
      footer={
        <p className="text-center text-sm text-ink-muted">
          No account?{" "}
          <Link to="/signup" className="font-medium text-citrus-600 hover:text-citrus-700 dark:text-citrus-400">
            Sign up
          </Link>
        </p>
      }
    >
      <div>
        <label htmlFor="username" className={labelClass}>
          Username
        </label>
        <input
          id="username"
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={`mt-1 w-full ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <PasswordInput id="password" required autoComplete="current-password" value={password} onChange={setPassword} />
      </div>
      <button type="submit" disabled={submitting} className={`w-full ${buttonClass("primary")}`}>
        {submitting ? "Logging in…" : "Log in"}
      </button>
    </AuthLayout>
  );
}
