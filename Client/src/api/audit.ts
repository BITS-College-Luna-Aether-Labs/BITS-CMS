import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaginatedEnvelope } from "./types";

export interface AuditLogItem {
  auditId: number;
  adminId: number | null;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export function useAuditLogs(page = 1, limit = 20, action = "ALL") {
  return useQuery({
    queryKey: ["audit-logs", page, limit, action],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (action && action !== "ALL") {
        params.set("action", action);
      }
      return api<PaginatedEnvelope<AuditLogItem[]>>(
        `/api/admin/audit-logs?${params.toString()}`,
        { auth: true },
      );
    },
  });
}
