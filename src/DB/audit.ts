import { query, type QueryExecutor } from "./client.js";

export type AuditLogRecord = {
  auditId: number;
  adminId: number | null;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

type AuditLogRow = {
  auditid: number;
  adminid: number | null;
  adminemail: string;
  action: string;
  entitytype: string;
  entityid: string | null;
  details: Record<string, unknown> | null;
  ipaddress: string | null;
  createdat: Date | string;
};

const database: QueryExecutor = { query };

function mapAuditRow(row: AuditLogRow): AuditLogRecord {
  return {
    auditId: row.auditid,
    adminId: row.adminid,
    adminEmail: row.adminemail,
    action: row.action,
    entityType: row.entitytype,
    entityId: row.entityid,
    details: row.details,
    ipAddress: row.ipaddress,
    createdAt: new Date(row.createdat).toISOString(),
  };
}

export async function createAuditLog(
  input: {
    adminId?: number | null;
    adminEmail: string;
    action: string;
    entityType: string;
    entityId?: string | number | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  },
  executor: QueryExecutor = database,
): Promise<AuditLogRecord> {
  const result = await executor.query<AuditLogRow>(
    `
      INSERT INTO audit_log (
        adminid,
        adminemail,
        action,
        entitytype,
        entityid,
        details,
        ipaddress
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        auditid,
        adminid,
        adminemail,
        action,
        entitytype,
        entityid,
        details,
        ipaddress,
        createdat
    `,
    [
      input.adminId ?? null,
      input.adminEmail,
      input.action,
      input.entityType,
      input.entityId ? String(input.entityId) : null,
      input.details ? JSON.stringify(input.details) : null,
      input.ipAddress ?? null,
    ],
  );

  return mapAuditRow(result.rows[0]);
}

export async function listAuditLogs(
  page: number,
  limit: number,
  actionFilter?: string,
  executor: QueryExecutor = database,
): Promise<AuditLogRecord[]> {
  const offset = (page - 1) * limit;
  const whereClause = actionFilter && actionFilter !== "ALL"
    ? `WHERE action = $3`
    : "";
  const params: unknown[] = [limit, offset];
  if (whereClause) {
    params.push(actionFilter);
  }

  const result = await executor.query<AuditLogRow>(
    `
      SELECT
        auditid,
        adminid,
        adminemail,
        action,
        entitytype,
        entityid,
        details,
        ipaddress,
        createdat
      FROM audit_log
      ${whereClause}
      ORDER BY createdat DESC
      LIMIT $1 OFFSET $2
    `,
    params,
  );

  return result.rows.map(mapAuditRow);
}

export async function countAuditLogs(
  actionFilter?: string,
  executor: QueryExecutor = database,
): Promise<number> {
  const whereClause = actionFilter && actionFilter !== "ALL"
    ? `WHERE action = $1`
    : "";
  const params: unknown[] = [];
  if (whereClause) {
    params.push(actionFilter);
  }

  const result = await executor.query<{ total: string }>(
    `
      SELECT COUNT(*)::TEXT AS total
      FROM audit_log
      ${whereClause}
    `,
    params,
  );

  return Number(result.rows[0]?.total ?? 0);
}
