import { Router } from "express";
import { authenticate, requireRole } from "../Middleware/auth.js";
import { countAuditLogs, listAuditLogs } from "../DB/audit.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { badRequest } from "../Utils/errors.js";

const router = Router();

function parsePositiveInteger(
  value: string | string[] | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${field} must be a positive integer`);
  }

  return parsed;
}

router.get(
  "/",
  authenticate,
  requireRole("superadmin"),
  asyncHandler(async (req, res) => {
    const page = parsePositiveInteger(req.query.page as string | undefined, 1, "page");
    const limit = Math.min(
      parsePositiveInteger(req.query.limit as string | undefined, 20, "limit"),
      100,
    );
    const actionFilter = typeof req.query.action === "string" ? req.query.action.trim() : undefined;

    const [logs, total] = await Promise.all([
      listAuditLogs(page, limit, actionFilter),
      countAuditLogs(actionFilter),
    ]);

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
      },
      message: "OK",
    });
  }),
);

export default router;
