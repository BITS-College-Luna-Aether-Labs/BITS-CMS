// Manage admin accounts (create, list, deactivate)
// Handle password updates
// Enforce authentication + role-based authorization
// Validate inputs and normalize query params

import bcrypt from "bcrypt";
import { Router } from "express";
import {
  createAdminAccount,
  deactivateAdmin,
  findAdminById,
  listAdminAccounts,
  revokeRefreshTokensForAdmin,
  updateAdminPassword,
} from "../DB/admin.js";
import { createAuditLog } from "../DB/audit.js";
import { authenticate, requireRole } from "../Middleware/auth.js";
import { validateBody } from "../Middleware/validate.js";
import {
  parseCreateAdminBody,
  parseChangePasswordBody,
  parseResetAdminPasswordBody,
} from "../Schemas/admin.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { badRequest, notFound, unauthorized } from "../Utils/errors.js";

const router = Router();
const SALT_ROUNDS = 12;

function parseId(value: string | string[] | undefined, field: string): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${field} must be a positive integer`);
  }

  return parsed;
}

router.post(
  "/admins",
  authenticate,
  requireRole("superadmin"),
  validateBody(parseCreateAdminBody),
  asyncHandler(async (req, res) => {
    const body = req.body as ReturnType<typeof parseCreateAdminBody>;
    const passwordHashed = await bcrypt.hash(body.password, SALT_ROUNDS);
    // Only the seeded superadmin is allowed; this endpoint always creates
    // a regular admin regardless of any role passed in the body.
    const admin = await createAdminAccount({
      email: body.email,
      passwordHashed,
      role: "admin",
    });

    void createAuditLog({
      adminId: req.user!.sub,
      adminEmail: req.user!.email,
      action: "ADMIN_CREATE",
      entityType: "ADMIN",
      entityId: String(admin.adminId),
      details: { targetEmail: admin.email, role: admin.role },
      ipAddress: req.ip,
    }).catch(console.error);

    res.status(201).json({
      data: admin,
      message: "OK",
    });
  }),
);

router.get(
  "/admins",
  authenticate,
  requireRole("superadmin"),
  asyncHandler(async (_req, res) => {
    const admins = await listAdminAccounts();

    res.json({
      data: admins,
      message: "OK",
    });
  }),
);

router.patch(
  "/admins/:id/password",
  authenticate,
  requireRole("superadmin"),
  validateBody(parseResetAdminPasswordBody),
  asyncHandler(async (req, res) => {
    const adminId = parseId(req.params.id, "id");
    const body = req.body as ReturnType<typeof parseResetAdminPasswordBody>;

    if (adminId === req.user!.sub) {
      throw badRequest(
        "Use the change-password endpoint for your own account",
      );
    }

    const target = await findAdminById(adminId);
    if (!target) {
      throw notFound("Admin not found");
    }

    const passwordHashed = await bcrypt.hash(body.newPassword, SALT_ROUNDS);
    await updateAdminPassword(adminId, passwordHashed);
    await revokeRefreshTokensForAdmin(adminId);

    void createAuditLog({
      adminId: req.user!.sub,
      adminEmail: req.user!.email,
      action: "ADMIN_RESET_PASSWORD",
      entityType: "ADMIN",
      entityId: String(adminId),
      details: { targetEmail: target.email },
      ipAddress: req.ip,
    }).catch(console.error);

    res.json({
      data: { adminId },
      message: "OK",
    });
  }),
);

router.patch(
  "/admins/:id/deactivate",
  authenticate,
  requireRole("superadmin"),
  asyncHandler(async (req, res) => {
    const adminId = parseId(req.params.id, "id");

    if (adminId === req.user!.sub) {
      throw badRequest("You cannot deactivate your own account");
    }

    const target = await findAdminById(adminId);
    if (!target) {
      throw notFound("Admin not found");
    }

    const deactivated = await deactivateAdmin(adminId);

    if (!deactivated) {
      throw notFound("Admin not found");
    }

    await revokeRefreshTokensForAdmin(adminId);

    void createAuditLog({
      adminId: req.user!.sub,
      adminEmail: req.user!.email,
      action: "ADMIN_DEACTIVATE",
      entityType: "ADMIN",
      entityId: String(adminId),
      details: { targetEmail: target.email },
      ipAddress: req.ip,
    }).catch(console.error);

    res.json({
      data: { adminId, isActive: false },
      message: "OK",
    });
  }),
);

router.patch(
  "/me/password",
  authenticate,
  validateBody(parseChangePasswordBody),
  asyncHandler(async (req, res) => {
    const body = req.body as ReturnType<typeof parseChangePasswordBody>;
    const admin = await findAdminById(req.user!.sub);

    if (!admin) {
      throw notFound("Admin not found");
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      body.currentPassword,
      admin.passwordHashed,
    );

    if (!isCurrentPasswordValid) {
      throw badRequest("Current password is incorrect");
    }

    const passwordHashed = await bcrypt.hash(body.newPassword, SALT_ROUNDS);
    await updateAdminPassword(admin.adminId, passwordHashed);
    await revokeRefreshTokensForAdmin(admin.adminId);

    void createAuditLog({
      adminId: admin.adminId,
      adminEmail: admin.email,
      action: "ADMIN_CHANGE_PASSWORD",
      entityType: "ADMIN",
      entityId: String(admin.adminId),
      ipAddress: req.ip,
    }).catch(console.error);

    res.json({
      data: { adminId: admin.adminId },
      message: "Password updated. Please log in again.",
    });
  }),
);

export default router;
