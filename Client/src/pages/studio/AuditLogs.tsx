import { useState } from "react";
import clsx from "clsx";
import { useAuditLogs, type AuditLogItem } from "@/api/audit";
import { Skeleton } from "@/components/Skeleton";

const ACTION_OPTIONS = [
  { label: "All Actions", value: "ALL" },
  { label: "Post Created (POST_CREATE)", value: "POST_CREATE" },
  { label: "Post Updated (POST_UPDATE)", value: "POST_UPDATE" },
  { label: "Post Deleted (POST_DELETE)", value: "POST_DELETE" },
  { label: "Post Restored (POST_RESTORE)", value: "POST_RESTORE" },
  { label: "Post Purged (POST_PURGE)", value: "POST_PURGE" },
  { label: "Admin Created (ADMIN_CREATE)", value: "ADMIN_CREATE" },
  { label: "Admin Deactivated (ADMIN_DEACTIVATE)", value: "ADMIN_DEACTIVATE" },
  { label: "Admin Password Reset (ADMIN_RESET_PASSWORD)", value: "ADMIN_RESET_PASSWORD" },
  { label: "Admin Password Changed (ADMIN_CHANGE_PASSWORD)", value: "ADMIN_CHANGE_PASSWORD" },
  { label: "Login (AUTH_LOGIN)", value: "AUTH_LOGIN" },
  { label: "Logout (AUTH_LOGOUT)", value: "AUTH_LOGOUT" },
  { label: "Media Uploaded (MEDIA_UPLOAD)", value: "MEDIA_UPLOAD" },
];

function actionBadgeClass(action: string): string {
  switch (action) {
    case "POST_CREATE":
    case "ADMIN_CREATE":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "POST_UPDATE":
    case "POST_RESTORE":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "POST_DELETE":
    case "POST_PURGE":
    case "ADMIN_DEACTIVATE":
      return "bg-red-50 text-red-700 border-red-200";
    case "ADMIN_RESET_PASSWORD":
    case "ADMIN_CHANGE_PASSWORD":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "AUTH_LOGIN":
    case "AUTH_LOGOUT":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "MEDIA_UPLOAD":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} ${d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  } catch {
    return iso;
  }
}

function renderDetails(item: AuditLogItem) {
  const d = item.details;
  if (!d) {
    return <span className="text-gray-400 italic">No details</span>;
  }

  const parts: string[] = [];
  if (d.title) parts.push(`Title: "${d.title}"`);
  if (d.slug) parts.push(`Slug: /${d.slug}`);
  if (d.targetEmail) parts.push(`Target: ${d.targetEmail}`);
  if (d.role) parts.push(`Role: ${d.role}`);
  if (d.mimeType) parts.push(`Type: ${d.mimeType}`);
  if (d.sizeBytes) parts.push(`${Math.round(Number(d.sizeBytes) / 1024)} KB`);
  if (d.mode) parts.push(`Mode: ${d.mode}`);

  if (parts.length === 0) {
    return (
      <span className="text-xs text-brand-muted font-mono">
        {JSON.stringify(d)}
      </span>
    );
  }

  return (
    <div className="text-xs space-y-0.5">
      {parts.map((p, i) => (
        <div key={i} className="text-brand-charcoal font-medium">
          {p}
        </div>
      ))}
      {item.ipAddress && (
        <div className="text-[11px] text-brand-muted">
          IP: {item.ipAddress}
        </div>
      )}
    </div>
  );
}

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("ALL");
  const limit = 20;

  const { data, isLoading, isError, error } = useAuditLogs(
    page,
    limit,
    actionFilter,
  );

  const logs = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-charcoal md:text-3xl">
            Audit Log
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            Track all administrative actions, content changes, and sign-ins.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="action-filter" className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
            Filter:
          </label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-charcoal shadow-sm focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {isLoading && (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="p-8 text-center text-sm text-red-600">
            {error instanceof Error ? error.message : "Failed to load audit logs"}
          </div>
        )}

        {!isLoading && !isError && logs.length === 0 && (
          <div className="p-12 text-center text-brand-muted text-sm">
            No audit logs found for the selected criteria.
          </div>
        )}

        {!isLoading && !isError && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((item) => (
                  <tr key={item.auditId} className="hover:bg-gray-50/70 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3.5 text-brand-muted font-mono text-[11px]">
                      {formatTimestamp(item.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-green/10 text-[10px] font-bold text-brand-green-dark uppercase">
                          {item.adminEmail.slice(0, 2)}
                        </div>
                        <span className="font-medium text-brand-charcoal">
                          {item.adminEmail}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={clsx(
                          "inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                          actionBadgeClass(item.action),
                        )}
                      >
                        {item.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-brand-muted">
                      <span className="font-semibold text-brand-charcoal">
                        {item.entityType}
                      </span>
                      {item.entityId && (
                        <span className="ml-1 text-[11px] text-gray-400">
                          #{item.entityId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 max-w-sm">
                      {renderDetails(item)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/50 px-4 py-3 text-xs text-brand-muted">
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of{" "}
              {total} events
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gray-300 bg-white px-2.5 py-1 font-medium text-brand-charcoal hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-1 font-medium text-brand-charcoal">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-gray-300 bg-white px-2.5 py-1 font-medium text-brand-charcoal hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
