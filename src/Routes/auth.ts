// Login
// Verifies email + password
// Issues an access token for API requests
// Issues a refresh token and stores it securely


// Token refresh
// Reads the refresh token from an HTTP-only cookie
// Verifies it against the database
// Rotates it: old refresh token is replaced with a new one
// Returns a fresh access token


// Logout
// Revokes the stored refresh token
// Clears the cookie
// Ends the session on the browser side

import bcrypt from "bcrypt";
import { Router, type Response } from "express";
import { withTransaction } from "../DB/client.js";
import {
  findAdminByEmail,
  findAdminById,
  findRefreshTokenByHash,
  revokeRefreshToken,
  storeRefreshToken,
  touchRefreshToken,
} from "../DB/admin.js";
import { createAuditLog } from "../DB/audit.js";
import { authenticate } from "../Middleware/auth.js";
import { validateBody } from "../Middleware/validate.js";
import { parseLoginBody } from "../Schemas/auth.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { env } from "../Utils/env.js";
import { unauthorized } from "../Utils/errors.js";
import {
  getRefreshExpiryDate,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../Utils/tokens.js";

const router = Router();

function readCookie(header: string | undefined, cookieName: string): string | null {
  if (!header) {
    return null;
  }

  for (const pair of header.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function setRefreshCookie(response: Response, token: string): void {
  response.cookie(env.refreshCookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    maxAge: env.refreshTokenTtlSeconds * 1000,
    path: "/api/auth",
  });
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(env.refreshCookieName, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

router.post(
  "/login",
  validateBody(parseLoginBody),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as ReturnType<typeof parseLoginBody>;
    const admin = await findAdminByEmail(email);

    if (!admin || !admin.isActive) {
      throw unauthorized("Invalid credentials");
    }

    const isValidPassword = await bcrypt.compare(password, admin.passwordHashed);

    if (!isValidPassword) {
      throw unauthorized("Invalid credentials");
    }

    const accessToken = signAccessToken({
      sub: admin.adminId,
      email: admin.email,
      role: admin.role,
    });
    const refreshToken = signRefreshToken({
      sub: admin.adminId,
      email: admin.email,
      role: admin.role,
    });

    await storeRefreshToken({
      adminId: admin.adminId,
      tokenHash: hashToken(refreshToken),
      expiresAt: getRefreshExpiryDate(),
    });

    setRefreshCookie(res, refreshToken);

    void createAuditLog({
      adminId: admin.adminId,
      adminEmail: admin.email,
      action: "AUTH_LOGIN",
      entityType: "AUTH",
      entityId: String(admin.adminId),
      details: { role: admin.role, userAgent: req.get("user-agent") },
      ipAddress: req.ip,
    }).catch(console.error);

    res.json({
      data: {
        accessToken,
        user: {
          adminId: admin.adminId,
          email: admin.email,
          role: admin.role,
        },
      },
      message: "OK",
    });
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = readCookie(req.headers.cookie, env.refreshCookieName);

    if (!refreshToken) {
      throw unauthorized("No refresh token");
    }

    const payload = verifyRefreshToken(refreshToken);
    const currentTokenHash = hashToken(refreshToken);
    const storedToken = await findRefreshTokenByHash(currentTokenHash);

    if (!storedToken || storedToken.revokedAt) {
      throw unauthorized("Refresh token is invalid");
    }

    if (new Date(storedToken.expiresAt).getTime() <= Date.now()) {
      throw unauthorized("Refresh token is expired");
    }

    const admin = await findAdminById(payload.sub);

    if (!admin || !admin.isActive) {
      throw unauthorized("Refresh token is invalid");
    }

    const newAccessToken = signAccessToken({
      sub: admin.adminId,
      email: admin.email,
      role: admin.role,
    });
    const newRefreshToken = signRefreshToken({
      sub: admin.adminId,
      email: admin.email,
      role: admin.role,
    });
    const newRefreshTokenHash = hashToken(newRefreshToken);

    await withTransaction(async (client) => {
      await touchRefreshToken(currentTokenHash, client);
      await revokeRefreshToken(currentTokenHash, newRefreshTokenHash, client);
      await storeRefreshToken(
        {
          adminId: admin.adminId,
          tokenHash: newRefreshTokenHash,
          expiresAt: getRefreshExpiryDate(),
        },
        client,
      );
    });

    setRefreshCookie(res, newRefreshToken);

    res.json({
      data: {
        accessToken: newAccessToken,
      },
      message: "OK",
    });
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = readCookie(req.headers.cookie, env.refreshCookieName);

    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        void createAuditLog({
          adminId: typeof payload.sub === "number" ? payload.sub : Number(payload.sub),
          adminEmail: payload.email,
          action: "AUTH_LOGOUT",
          entityType: "AUTH",
          entityId: String(payload.sub),
          ipAddress: req.ip,
        }).catch(console.error);
        await revokeRefreshToken(hashToken(refreshToken));
      } catch {
        // Silently continue if token is already revoked or malformed
      }
    }

    clearRefreshCookie(res);
    res.status(204).send();
  }),
);

export default router;
