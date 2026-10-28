import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { useAuth } from "@/auth/AuthContext";
import {
  useAdmins,
  useCreateAdmin,
  useDeactivateAdmin,
  useResetAdminPassword,
} from "@/api/admins";
import type { AdminAccount, Role } from "@/api/types";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import Field, { inputClass } from "@/components/studio/Field";
import PasswordInput from "@/components/studio/PasswordInput";
import { Skeleton } from "@/components/Skeleton";
import { useConfirm } from "@/ui/ConfirmDialog";
import { useToast } from "@/ui/Toast";

export default function Admins() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useAdmins();
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-charcoal md:text-3xl">
            Admins
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            Manage who can sign in to the studio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-pill bg-brand-green px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dark"
        >
          + Add admin
        </button>
      </div>

      <div className="mt-8">
        {isLoading && <ListSkeleton />}

        {isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-700">Couldn't load admins.</p>
            <p className="mt-1 text-sm text-red-600">
              {error instanceof Error ? error.message : "Try refreshing."}
            </p>
          </div>
        )}

        {data && data.data.length > 0 && (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
            {data.data.map((admin) => (
              <AdminRow
                key={admin.adminId}
                admin={admin}
                isCurrentUser={user?.adminId === admin.adminId}
                onResetPassword={() => setResetTarget(admin)}
              />
            ))}
          </ul>
        )}

        {data && data.data.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white p-16 text-center">
            <p className="text-lg font-semibold text-brand-charcoal">
              No admins yet.
            </p>
            <p className="mt-2 text-sm text-brand-muted">
              That's odd — you should be in this list.
            </p>
          </div>
        )}
      </div>

      {createOpen && <CreateAdminModal onClose={() => setCreateOpen(false)} />}
      {resetTarget && (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}

function AdminRow({
  admin,
  isCurrentUser,
  onResetPassword,
}: {
  admin: AdminAccount;
  isCurrentUser: boolean;
  onResetPassword: () => void;
}) {
  const deactivate = useDeactivateAdmin();
  const confirm = useConfirm();
  const toast = useToast();

  async function onDeactivate() {
    const ok = await confirm({
      title: `Deactivate ${admin.email}?`,
      message:
        "They will be signed out and won't be able to log in. This can't be undone via the UI.",
      confirmLabel: "Deactivate",
      danger: true,
    });
    if (!ok) return;
    try {
      await deactivate.mutateAsync(admin.adminId);
      toast.success(`Deactivated ${admin.email}.`);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't deactivate.",
      );
    }
  }

  return (
    <li
      className={clsx(
        "flex items-center gap-4 p-4 hover:bg-brand-bg",
        !admin.isActive && "opacity-60",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green-blob text-sm font-semibold uppercase text-brand-green-dark">
        {admin.email.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-brand-charcoal">
            {admin.email}
          </span>
          {isCurrentUser && (
            <span className="rounded-pill bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-green-dark">
              You
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-brand-muted">
          <RoleBadge role={admin.role} />
          <span>·</span>
          <span>Joined {formatDate(admin.createdAt)}</span>
          {!admin.isActive && (
            <>
              <span>·</span>
              <span className="font-medium text-red-600">Deactivated</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {!isCurrentUser && admin.isActive && (
          <button
            type="button"
            onClick={onResetPassword}
            className="text-sm font-medium text-brand-green-dark transition-colors hover:text-brand-green"
          >
            Reset password
          </button>
        )}
        {admin.isActive && !isCurrentUser && (
          <button
            type="button"
            onClick={onDeactivate}
            disabled={deactivate.isPending}
            className="text-sm font-medium text-brand-muted transition-colors hover:text-red-600 disabled:opacity-50"
          >
            Deactivate
          </button>
        )}
        {isCurrentUser && (
          <span className="text-xs text-brand-muted">
            (manage your own account in Profile)
          </span>
        )}
      </div>
    </li>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={clsx(
        "rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        role === "superadmin"
          ? "bg-brand-green/10 text-brand-green-dark"
          : "bg-gray-100 text-brand-charcoal",
      )}
    >
      {role}
    </span>
  );
}

function CreateAdminModal({ onClose }: { onClose: () => void }) {
  const create = useCreateAdmin();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setTopError(null);

    const local: Record<string, string> = {};
    if (!email.includes("@") || !email.includes(".")) {
      local.email = "Enter a valid email address";
    }
    if (password.length < 6) {
      local.password = "Password must be at least 6 characters";
    }
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    try {
      await create.mutateAsync({ email, password, role: "admin" });
      toast.success(`Added ${email}.`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setTopError(err.message);
        if (err.fieldErrors) {
          const m: Record<string, string> = {};
          for (const fe of err.fieldErrors) m[fe.field] = fe.message;
          setErrors(m);
        }
      } else {
        setTopError("Couldn't create admin. Please try again.");
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
      >
        <form onSubmit={onSubmit}>
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-bold text-brand-charcoal">
              Add an admin
            </h2>
            <p className="mt-0.5 text-xs text-brand-muted">
              They'll be able to sign in immediately with the password you set.
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            {topError && (
              <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {topError}
              </div>
            )}

            <Field label="Email" required error={errors.email}>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field
              label="Password"
              required
              hint="At least 6 characters."
              error={errors.password}
            >
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={Boolean(errors.password)}
                placeholder="At least 6 characters"
              />
            </Field>

            <p className="text-xs text-brand-muted">
              New accounts are created with the <strong>Admin</strong> role.
              They can create and edit posts; only the seeded superadmin can
              manage admins.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-brand-muted transition-colors hover:text-brand-charcoal"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-pill bg-brand-green px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
            >
              {create.isPending ? "Adding…" : "Add admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  target,
  onClose,
}: {
  target: AdminAccount;
  onClose: () => void;
}) {
  const reset = useResetAdminPassword();
  const toast = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setTopError(null);

    if (newPassword.length < 6) {
      setErrors({ newPassword: "At least 6 characters" });
      return;
    }

    try {
      await reset.mutateAsync({ id: target.adminId, newPassword });
      toast.success(`Password reset for ${target.email}.`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setTopError(err.message);
        if (err.fieldErrors) {
          const m: Record<string, string> = {};
          for (const fe of err.fieldErrors) m[fe.field] = fe.message;
          setErrors(m);
        }
      } else {
        setTopError("Couldn't reset password. Please try again.");
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
      >
        <form onSubmit={onSubmit}>
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-bold text-brand-charcoal">
              Reset password
            </h2>
            <p className="mt-0.5 text-xs text-brand-muted">
              For <span className="font-medium">{target.email}</span>. They
              will be signed out of all sessions and must use the new password
              on next login.
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            {topError && (
              <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {topError}
              </div>
            )}

            <Field
              label="New password"
              required
              hint="At least 6 characters."
              error={errors.newPassword}
            >
              <PasswordInput
                autoComplete="new-password"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={Boolean(errors.newPassword)}
                placeholder="New password"
              />
            </Field>

            <p className="text-xs text-brand-muted">
              Share this password with the admin securely. They can change it
              again from their Profile after signing in.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-brand-muted transition-colors hover:text-brand-charcoal"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reset.isPending || newPassword.length < 6}
              className="rounded-pill bg-brand-green px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
            >
              {reset.isPending ? "Resetting…" : "Reset password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 bg-white">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
