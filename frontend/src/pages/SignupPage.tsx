import { useCallback, useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/AuthLayout";
import { PasswordInput } from "../components/PasswordInput";
import { buttonClass, inputClass, labelClass } from "../styles";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSubmitting(true);
      signup(email, username, password)
        .then(() => navigate("/", { replace: true }))
        .catch((err: unknown) => {
          setError(err instanceof ApiError ? err.message : "Something went wrong");
        })
        .finally(() => setSubmitting(false));
    },
    [email, username, password, signup, navigate],
  );

  return (
    <AuthLayout
      title="Create your Nosh account"
      error={error}
      onSubmit={handleSubmit}
      footer={
        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-citrus-600 hover:text-citrus-700 dark:text-citrus-400">
            Log in
          </Link>
        </p>
      }
    >
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`mt-1 w-full ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="username" className={labelClass}>
          Username
        </label>
        <input
          id="username"
          required
          minLength={3}
          maxLength={32}
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={`mt-1 w-full ${inputClass}`}
        />
        <p className="mt-1 text-xs text-ink-faint">Letters, numbers, and underscores only.</p>
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <PasswordInput id="password" required autoComplete="new-password" value={password} onChange={setPassword} />
      </div>
      <button type="submit" disabled={submitting} className={`w-full ${buttonClass("primary")}`}>
        {submitting ? "Creating account…" : "Sign up"}
      </button>
    </AuthLayout>
  );
}
