import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/auth/AuthContext";
import { useChangePassword } from "@/api/profile";
import { ApiError } from "@/lib/api";
import Field from "@/components/studio/Field";
import PasswordInput from "@/components/studio/PasswordInput";
import { useToast } from "@/ui/Toast";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const change = useChangePassword();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setTopError(null);

    const local: Record<string, string> = {};
    if (!currentPassword) local.currentPassword = "Required";
    if (newPassword.length < 6)
      local.newPassword = "At least 6 characters";
    if (newPassword === currentPassword)
      local.newPassword = "Must be different from current password";
    if (newPassword !== confirmPassword)
      local.confirmPassword = "Passwords don't match";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    try {
      await change.mutateAsync({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated. Signing you out…");
      setTimeout(async () => {
        await logout();
        navigate("/studio/login", { replace: true });
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setTopError(err.message);
        if (err.fieldErrors) {
          const m: Record<string, string> = {};
          for (const fe of err.fieldErrors) m[fe.field] = fe.message;
          setErrors(m);
        }
      } else {
        setTopError("Couldn't update password. Try again.");
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-charcoal md:text-3xl">
          Profile
        </h1>
        <p className="mt-1 text-sm text-brand-muted">Your account.</p>
      </div>

      <section className="mt-8 rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-blob text-base font-bold uppercase text-brand-green-dark">
            {user?.email.slice(0, 2)}
          </div>
          <div>
            <div className="text-base font-semibold text-brand-charcoal">
              {user?.email}
            </div>
            <div className="mt-0.5">
              <span
                className={clsx(
                  "rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  user?.role === "superadmin"
                    ? "bg-brand-green/10 text-brand-green-dark"
                    : "bg-gray-100 text-brand-charcoal",
                )}
              >
                {user?.role}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-brand-charcoal">
          Change password
        </h2>
        <p className="mt-1 text-xs text-brand-muted">
          You'll be signed out after a successful change and will need to log
          in again.
        </p>

        {success ? (
          <div className="mt-6 rounded-md border border-brand-green/30 bg-brand-green/5 px-4 py-3 text-sm text-brand-green-dark">
            Password updated. Signing you out…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {topError && (
              <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {topError}
              </div>
            )}

            <Field
              label="Current password"
              required
              error={errors.currentPassword}
            >
              <PasswordInput
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={Boolean(errors.currentPassword)}
              />
            </Field>

            <Field
              label="New password"
              required
              hint="At least 6 characters."
              error={errors.newPassword}
            >
              <PasswordInput
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={Boolean(errors.newPassword)}
              />
            </Field>

            <Field
              label="Confirm new password"
              required
              error={errors.confirmPassword}
            >
              <PasswordInput
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={Boolean(errors.confirmPassword)}
              />
            </Field>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={change.isPending}
                className="rounded-pill bg-brand-green px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
              >
                {change.isPending ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
