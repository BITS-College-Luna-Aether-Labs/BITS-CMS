import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import { Client } from "pg";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsPath = path.join(rootDir, "migrations.sql");
const testDatabaseName = process.env.TEST_DB_NAME ?? "school_cms_test";
const defaultDbUser = process.env.TEST_DB_USER ?? process.env.DB_USER ?? process.env.USER ?? "nati.t";
const defaultDbPassword = process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "";
const defaultDbHost = process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? "localhost";
const defaultDbPort = Number(process.env.TEST_DB_PORT ?? process.env.DB_PORT ?? "5432");

const SUPERADMIN = {
  email: "superadmin@bits.edu.et",
  password: "Passw0rd!",
};

const ADMIN = {
  email: "admin@bits.edu.et",
  password: "Passw0rd!",
};

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export type RequestOptions = {
  method?: string;
  body?: JsonValue;
  headers?: Record<string, string>;
  cookie?: string;
  ip?: string;
};

type RuntimeModules = {
  app: import("express").Express;
  closePool: () => Promise<void>;
};

export class CmsTestHarness {
  private server: http.Server | null = null;
  private baseUrl = "";
  private requestCounter = 1;
  private runtime: RuntimeModules | null = null;

  configureEnvironment(): void {
    process.env.NODE_ENV = "test";
    process.env.PORT = "0";
    process.env.DB_HOST = defaultDbHost;
    process.env.DB_PORT = String(defaultDbPort);
    process.env.DB_USER = defaultDbUser;
    process.env.DB_PASSWORD = defaultDbPassword;
    process.env.DB_NAME = testDatabaseName;
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "integration-access-secret";
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ?? "integration-refresh-secret";
  }

  async start(): Promise<void> {
    this.configureEnvironment();
    await this.ensureDatabaseExists();
    this.runtime = await this.loadRuntime();

    await new Promise<void>((resolve) => {
      this.server = this.runtime!.app.listen(0, "127.0.0.1", () => {
        const address = this.server!.address();
        assert(address && typeof address !== "string");
        this.baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      this.server = null;
    }

    if (this.runtime) {
      await this.runtime.closePool();
      this.runtime = null;
    }
  }

  async resetDatabase(): Promise<void> {
    const client = await this.createClient(testDatabaseName);

    try {
      await client.query(`
        DROP TABLE IF EXISTS audit_log CASCADE;
        DROP TABLE IF EXISTS readmore_media CASCADE;
        DROP TABLE IF EXISTS readmore CASCADE;
        DROP TABLE IF EXISTS refresh_token CASCADE;
        DROP TABLE IF EXISTS post CASCADE;
        DROP TABLE IF EXISTS media CASCADE;
        DROP TABLE IF EXISTS admin CASCADE;
      `);
      const sql = await readFile(migrationsPath, "utf8");
      await client.query(sql);
    } finally {
      await client.end();
    }
  }

  async seedAdmins(): Promise<void> {
    const client = await this.createClient(testDatabaseName);

    try {
      const superadminHash = await bcrypt.hash(SUPERADMIN.password, 12);
      const adminHash = await bcrypt.hash(ADMIN.password, 12);

      await client.query(
        `
          INSERT INTO admin (email, passwordhashed, role)
          VALUES
            ($1, $2, 'superadmin'),
            ($3, $4, 'admin')
        `,
        [SUPERADMIN.email, superadminHash, ADMIN.email, adminHash],
      );
    } finally {
      await client.end();
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const client = await this.createClient(testDatabaseName);

    try {
      const result = await client.query<T>(sql, params);
      return result.rows;
    } finally {
      await client.end();
    }
  }

  async request(pathname: string, options: RequestOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers ?? {});
    const ip = options.ip ?? `10.0.0.${this.requestCounter++}`;
    headers.set("x-forwarded-for", ip);

    let body: string | undefined;

    if (options.cookie) {
      headers.set("Cookie", options.cookie);
    }

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    return fetch(`${this.baseUrl}${pathname}`, {
      method: options.method ?? "GET",
      headers,
      body,
    });
  }

  async upload(
    accessToken: string,
    file: {
      name: string;
      mimeType: string;
      content: Uint8Array;
    },
    ip?: string,
  ): Promise<Response> {
    const form = new FormData();
    form.set("file", new Blob([file.content], { type: file.mimeType }), file.name);

    return fetch(`${this.baseUrl}/api/media/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip ?? `10.1.0.${this.requestCounter++}`,
      },
      body: form,
    });
  }

  async loginAsSuperadmin(ip?: string): Promise<{
    accessToken: string;
    refreshCookie: string;
    response: Response;
    payload: {
      data: {
        accessToken: string;
        user: { adminId: number; email: string; role: string };
      };
      message: string;
    };
  }> {
    return this.login(SUPERADMIN.email, SUPERADMIN.password, ip);
  }

  async loginAsAdmin(ip?: string): Promise<{
    accessToken: string;
    refreshCookie: string;
    response: Response;
    payload: {
      data: {
        accessToken: string;
        user: { adminId: number; email: string; role: string };
      };
      message: string;
    };
  }> {
    return this.login(ADMIN.email, ADMIN.password, ip);
  }

  parseSetCookie(response: Response): string {
    const cookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter((value): value is string => Boolean(value));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith("refreshToken="));
    assert(refreshCookie, "Expected refresh token cookie");
    return refreshCookie.split(";")[0];
  }

  async json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
  }

  sampleImageContent(): Uint8Array {
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("fake-png-bits"),
    ]);
  }

  sampleVideoContent(): Uint8Array {
    return Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
      Buffer.from("fake-mp4-bits"),
    ]);
  }

  samplePdfContent(): Uint8Array {
    return Buffer.from("%PDF-fake");
  }

  oversizedContent(): Uint8Array {
    return Buffer.alloc(10 * 1024 * 1024 + 1, 1);
  }

  private async login(
    email: string,
    password: string,
    ip?: string,
  ): Promise<{
    accessToken: string;
    refreshCookie: string;
    response: Response;
    payload: {
      data: {
        accessToken: string;
        user: { adminId: number; email: string; role: string };
      };
      message: string;
    };
  }> {
    const response = await this.request("/api/auth/login", {
      method: "POST",
      body: { email, password },
      ip,
    });
    assert.equal(response.status, 200);
    const payload = await this.json<{
      data: {
        accessToken: string;
        user: { adminId: number; email: string; role: string };
      };
      message: string;
    }>(response.clone());

    return {
      accessToken: payload.data.accessToken,
      refreshCookie: this.parseSetCookie(response),
      response,
      payload,
    };
  }

  private async loadRuntime(): Promise<RuntimeModules> {
    const [{ default: app }, { closePool }] = await Promise.all([
      import("../../src/app.ts"),
      import("../../src/DB/client.ts"),
    ]);

    return { app, closePool };
  }

  private async ensureDatabaseExists(): Promise<void> {
    const safeDatabaseName = /^[a-zA-Z0-9_]+$/.test(testDatabaseName);
    assert.ok(safeDatabaseName, "Unsafe test database name");

    const client = await this.createClient("postgres");

    try {
      const existing = await client.query<{ exists: number }>(
        "SELECT 1 AS exists FROM pg_database WHERE datname = $1",
        [testDatabaseName],
      );

      if (existing.rowCount === 0) {
        await client.query(`CREATE DATABASE ${testDatabaseName}`);
      }
    } finally {
      await client.end();
    }
  }

  private async createClient(database: string): Promise<Client> {
    const client = new Client({
      host: defaultDbHost,
      port: defaultDbPort,
      user: defaultDbUser,
      password: defaultDbPassword,
      database,
    });

    await client.connect();
    return client;
  }
}

export { ADMIN, SUPERADMIN, testDatabaseName };
