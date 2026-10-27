import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/lib/api";

export default function Login() {
  const { user, login, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from =
    (location.state as { from?: string } | null)?.from ?? "/studio/posts";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-brand-muted">
        Loading…
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Sign in failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            to="/studio"
            className="text-3xl font-extrabold tracking-tight text-brand-charcoal"
          >
            Bi<span className="text-brand-green">T</span>S
            <span className="ml-2 text-base font-medium text-brand-muted">
              Studio
            </span>
          </Link>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-gray-100 bg-white p-8 shadow-card"
        >
          <h1 className="text-2xl font-bold text-brand-charcoal">Sign in</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Manage news and events for BITS College.
          </p>

          {error && (
            <div className="mt-6 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
            />
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="mt-7 w-full rounded-pill bg-brand-green py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-brand-muted">
          <Link to="/news" className="hover:text-brand-charcoal">
            ← Back to BITS College
          </Link>
        </p>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  type: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
}

function Field({ label, type, autoComplete, value, onChange }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-brand-charcoal">
        {label}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-brand-charcoal placeholder-brand-muted shadow-sm transition-colors focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
      />
    </label>
  );
}
