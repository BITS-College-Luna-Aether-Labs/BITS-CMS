import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { CmsTestHarness } from "./helpers/harness.ts";

const harness = new CmsTestHarness();

before(async () => {
  await harness.start();
});

beforeEach(async () => {
  await harness.resetDatabase();
  await harness.seedAdmins();
});

after(async () => {
  await harness.stop();
});

test("1. database integration: schema and core constraints are applied", async () => {
  const tables = await harness.query<{ tablename: string }>(
    `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `,
  );

  assert.deepEqual(
    tables.map((row) => row.tablename),
    ["admin", "audit_log", "media", "post", "readmore", "readmore_media", "refresh_token"],
  );

  const postIndexes = await harness.query<{ indexname: string }>(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'post'
      ORDER BY indexname
    `,
  );

  assert.ok(postIndexes.some((row) => row.indexname === "idx_post_slug"));
  assert.ok(postIndexes.some((row) => row.indexname === "post_slug_key"));

  const adminRows = await harness.query<{ adminid: number }>("SELECT adminid FROM admin");
  assert.equal(adminRows.length, 2);

  await assert.rejects(
    () =>
      harness.query(
        `
          INSERT INTO post (adminid, title, content, mediatype, slug)
          VALUES ($1, 'Invalid', 'Broken', 'IMAGE', 'broken')
        `,
        [adminRows[0].adminid],
      ),
    /violates check constraint "post_check"/i,
  );
});

test("2. auth system: login, refresh rotation, protected access, and logout work", async () => {
  const login = await harness.loginAsSuperadmin();
  assert.equal(login.payload.data.user.email, "superadmin@bits.edu.et");
  assert.equal(login.payload.data.user.role, "superadmin");

  const protectedResponse = await harness.request("/api/admin/posts", {
    headers: {
      Authorization: `Bearer ${login.accessToken}`,
    },
  });
  assert.equal(protectedResponse.status, 200);

  const refreshResponse = await harness.request("/api/auth/refresh", {
    method: "POST",
    cookie: login.refreshCookie,
  });
  assert.equal(refreshResponse.status, 200);
  const rotatedCookie = harness.parseSetCookie(refreshResponse);
  assert.notEqual(rotatedCookie, login.refreshCookie);

  const replayResponse = await harness.request("/api/auth/refresh", {
    method: "POST",
    cookie: login.refreshCookie,
  });
  assert.equal(replayResponse.status, 401);

  const logoutResponse = await harness.request("/api/auth/logout", {
    method: "POST",
    cookie: rotatedCookie,
    headers: {
      Authorization: `Bearer ${login.accessToken}`,
    },
  });
  assert.equal(logoutResponse.status, 204);

  const refreshAfterLogout = await harness.request("/api/auth/refresh", {
    method: "POST",
    cookie: rotatedCookie,
  });
  assert.equal(refreshAfterLogout.status, 401);
});

test("3. create post: valid creation works and invalid media/slug cases fail correctly", async () => {
  const { accessToken } = await harness.loginAsSuperadmin();

  const imageUpload = await harness.upload(accessToken, {
    name: "primary.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  assert.equal(imageUpload.status, 201);
  const imagePayload = await harness.json<{ data: { mediaId: number } }>(imageUpload);

  const createResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      title: "Data Analytics Workshop",
      content: "Workshop summary",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: false,
    },
  });
  assert.equal(createResponse.status, 201);
  const created = await harness.json<{ data: { slug: string } }>(createResponse);
  assert.equal(created.data.slug, "data-analytics-workshop");

  const invalidMediaTypeResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      title: "Bad Video Mapping",
      content: "Invalid upload mapping",
      primaryMedia: {
        type: "VIDEO",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: false,
    },
  });
  assert.equal(invalidMediaTypeResponse.status, 400);

  const duplicateSlugResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      title: "Duplicate Slug Example",
      content: "Manual slug should conflict",
      slug: "data-analytics-workshop",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: false,
    },
  });
  assert.equal(duplicateSlugResponse.status, 409);

  const missingReadMoreResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      title: "Missing Read More",
      content: "Body",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: true,
    },
  });
  assert.equal(missingReadMoreResponse.status, 400);
});

test("4. get posts public: pagination excludes soft-deleted posts", async () => {
  const { accessToken } = await harness.loginAsSuperadmin();
  const imageUpload = await harness.upload(accessToken, {
    name: "list.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  const imagePayload = await harness.json<{ data: { mediaId: number } }>(imageUpload);

  const firstCreate = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      title: "Visible News",
      content: "Public content",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: false,
    },
  });
  const firstPost = await harness.json<{ data: { postId: number } }>(firstCreate);

  await harness.request("/api/admin/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      title: "Hidden News",
      content: "Will be deleted",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: false,
    },
  });

  const adminListBeforeDelete = await harness.request("/api/admin/posts", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const adminListPayload = await harness.json<{ data: Array<{ postId: number; slug: string }> }>(
    adminListBeforeDelete,
  );
  const deletedTarget = adminListPayload.data.find((post) => post.postId !== firstPost.data.postId);
  assert.ok(deletedTarget);

  const deleteResponse = await harness.request(`/api/admin/posts/${deletedTarget.postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(deleteResponse.status, 204);

  const publicListResponse = await harness.request("/api/posts?page=1&limit=10");
  assert.equal(publicListResponse.status, 200);
  const publicListPayload = await harness.json<{
    data: Array<{ postId: number; title: string }>;
    pagination: { total: number };
  }>(publicListResponse);
  assert.equal(publicListPayload.pagination.total, 1);
  assert.equal(publicListPayload.data[0].title, "Visible News");
});

test("5. get post by slug: the slug resolves the read-more page payload", async () => {
  const { accessToken } = await harness.loginAsSuperadmin();
  const imageUpload = await harness.upload(accessToken, {
    name: "cover.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  const galleryUpload = await harness.upload(accessToken, {
    name: "gallery.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  const imagePayload = await harness.json<{ data: { mediaId: number } }>(imageUpload);
  const galleryPayload = await harness.json<{ data: { mediaId: number } }>(galleryUpload);

  const createResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      title: "Retrospective Session",
      content: "Short summary",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: true,
      readMore: {
        title: "Retrospective Deep Dive",
        content: "Long-form retrospective content",
        media: [
          {
            type: "IMAGE",
            mediaId: galleryPayload.data.mediaId,
          },
          {
            type: "YOUTUBE",
            embedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        ],
      },
    },
  });
  const created = await harness.json<{ data: { slug: string } }>(createResponse);

  const bySlugResponse = await harness.request(`/api/posts/${created.data.slug}`);
  assert.equal(bySlugResponse.status, 200);
  const bySlugPayload = await harness.json<{
    data: {
      slug: string;
      readMore: {
        title: string;
        media: Array<{ type: string }>;
      };
    };
  }>(bySlugResponse);
  assert.equal(bySlugPayload.data.slug, created.data.slug);
  assert.equal(bySlugPayload.data.readMore.title, "Retrospective Deep Dive");
  assert.equal(bySlugPayload.data.readMore.media.length, 2);

  const missingResponse = await harness.request("/api/posts/does-not-exist");
  assert.equal(missingResponse.status, 404);
});

test("6. update post: core fields and extended content update together", async () => {
  const { accessToken } = await harness.loginAsSuperadmin();
  const imageUpload = await harness.upload(accessToken, {
    name: "old.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  const videoUpload = await harness.upload(accessToken, {
    name: "new.mp4",
    mimeType: "video/mp4",
    content: harness.sampleVideoContent(),
  });
  const galleryUpload = await harness.upload(accessToken, {
    name: "gallery.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  const imagePayload = await harness.json<{ data: { mediaId: number } }>(imageUpload);
  const videoPayload = await harness.json<{ data: { mediaId: number } }>(videoUpload);
  const galleryPayload = await harness.json<{ data: { mediaId: number } }>(galleryUpload);

  const createResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      title: "Update Me",
      content: "Original",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: false,
    },
  });
  const created = await harness.json<{ data: { postId: number } }>(createResponse);

  const updateResponse = await harness.request(`/api/admin/posts/${created.data.postId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      title: "Updated Post",
      content: "Updated body",
      slug: "updated-post",
      publishedDate: "2026-04-29",
      primaryMedia: {
        type: "VIDEO",
        mediaId: videoPayload.data.mediaId,
      },
      readMoreEnabled: true,
      readMore: {
        title: "Updated Read More",
        content: "Expanded body",
        media: [
          {
            type: "IMAGE",
            mediaId: galleryPayload.data.mediaId,
          },
        ],
      },
    },
  });
  assert.equal(updateResponse.status, 200);

  const getUpdatedResponse = await harness.request(`/api/admin/posts/${created.data.postId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const updated = await harness.json<{
    data: {
      title: string;
      slug: string;
      media: { type: string };
      readMore: { title: string; media: Array<unknown> };
    };
  }>(getUpdatedResponse);

  assert.equal(updated.data.title, "Updated Post");
  assert.equal(updated.data.slug, "updated-post");
  assert.equal(updated.data.media.type, "VIDEO");
  assert.equal(updated.data.readMore.title, "Updated Read More");
  assert.equal(updated.data.readMore.media.length, 1);
});

test("7. soft delete: deleted posts disappear from public endpoints and remain filterable in admin", async () => {
  const { accessToken } = await harness.loginAsSuperadmin();
  const imageUpload = await harness.upload(accessToken, {
    name: "delete.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  const imagePayload = await harness.json<{ data: { mediaId: number } }>(imageUpload);

  const createResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      title: "Delete Candidate",
      content: "Delete me",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: false,
    },
  });
  const created = await harness.json<{ data: { postId: number; slug: string } }>(createResponse);

  const deleteResponse = await harness.request(`/api/admin/posts/${created.data.postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(deleteResponse.status, 204);

  const publicFetch = await harness.request(`/api/posts/${created.data.slug}`);
  assert.equal(publicFetch.status, 404);

  const deletedListResponse = await harness.request("/api/admin/posts?deleted=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const deletedList = await harness.json<{ data: Array<{ postId: number }> }>(deletedListResponse);
  assert.ok(deletedList.data.some((post) => post.postId === created.data.postId));

  const secondDeleteResponse = await harness.request(`/api/admin/posts/${created.data.postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(secondDeleteResponse.status, 404);
});

test("8. file upload handling: upload, retrieval, invalid types, and size limits are enforced", async () => {
  const { accessToken } = await harness.loginAsSuperadmin();

  const uploadResponse = await harness.upload(accessToken, {
    name: "brochure.pdf",
    mimeType: "application/pdf",
    content: harness.samplePdfContent(),
  });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await harness.json<{ data: { mediaId: number; mimeType: string } }>(
    uploadResponse,
  );
  assert.equal(uploaded.data.mimeType, "application/pdf");

  const fetchMediaResponse = await harness.request(`/api/media/${uploaded.data.mediaId}`);
  assert.equal(fetchMediaResponse.status, 200);
  assert.equal(fetchMediaResponse.headers.get("content-type"), "application/pdf");
  const mediaBytes = new Uint8Array(await fetchMediaResponse.arrayBuffer());
  assert.deepEqual(Buffer.from(mediaBytes), Buffer.from(harness.samplePdfContent()));

  const invalidUploadResponse = await harness.upload(accessToken, {
    name: "script.exe",
    mimeType: "application/octet-stream",
    content: new Uint8Array([1, 2, 3]),
  });
  assert.equal(invalidUploadResponse.status, 400);

  const oversizedUploadResponse = await harness.upload(accessToken, {
    name: "huge.mp4",
    mimeType: "video/mp4",
    content: harness.oversizedContent(),
  });
  assert.equal(oversizedUploadResponse.status, 413);

  const unauthorizedUpload = await harness.upload("invalid-token", {
    name: "image.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  assert.equal(unauthorizedUpload.status, 401);
});

test("9. extended content and security: gallery limit, RBAC, rate limiting, and CORS behavior", async () => {
  const superadmin = await harness.loginAsSuperadmin();
  const admin = await harness.loginAsAdmin();
  const imageUpload = await harness.upload(superadmin.accessToken, {
    name: "gallery.png",
    mimeType: "image/png",
    content: harness.sampleImageContent(),
  });
  const imagePayload = await harness.json<{ data: { mediaId: number } }>(imageUpload);

  const sixMedia = Array.from({ length: 6 }, (_, index) => ({
    type: index % 2 === 0 ? "IMAGE" : "YOUTUBE",
    ...(index % 2 === 0
      ? { mediaId: imagePayload.data.mediaId }
      : { embedUrl: `https://youtu.be/dQw4w9WgXcQ?index=${index}` }),
  }));

  const validExtendedResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${superadmin.accessToken}` },
    body: {
      title: "Gallery Max",
      content: "Six media items",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: true,
      readMore: {
        title: "Full Gallery",
        content: "Extended content",
        media: sixMedia,
      },
    },
  });
  assert.equal(validExtendedResponse.status, 201);

  const invalidExtendedResponse = await harness.request("/api/admin/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${superadmin.accessToken}` },
    body: {
      title: "Gallery Overflow",
      content: "Seven media items",
      primaryMedia: {
        type: "IMAGE",
        mediaId: imagePayload.data.mediaId,
      },
      readMoreEnabled: true,
      readMore: {
        title: "Too Many",
        content: "Overflow",
        media: [
          ...sixMedia,
          {
            type: "IMAGE",
            mediaId: imagePayload.data.mediaId,
          },
        ],
      },
    },
  });
  assert.equal(invalidExtendedResponse.status, 400);

  const forbiddenResponse = await harness.request("/api/admin/admins", {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  assert.equal(forbiddenResponse.status, 403);

  let lastRateLimitedStatus = 0;
  for (let attempt = 1; attempt <= 21; attempt += 1) {
    const response = await harness.request("/api/auth/login", {
      method: "POST",
      ip: "198.51.100.10",
      body: {
        email: "superadmin@bits.edu.et",
        password: "wrong-password",
      },
    });
    lastRateLimitedStatus = response.status;
  }
  assert.equal(lastRateLimitedStatus, 429);

  const corsResponse = await harness.request("/api/posts", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(corsResponse.status, 204);
  assert.equal(corsResponse.headers.get("access-control-allow-origin"), "http://localhost:5173");
});

test("10. file signature validation: contents must match the declared type", async () => {
  const { accessToken } = await harness.loginAsSuperadmin();

  const mismatchedUpload = await harness.upload(accessToken, {
    name: "sneaky.png",
    mimeType: "image/png",
    content: harness.samplePdfContent(),
  });
  assert.equal(mismatchedUpload.status, 400);

  const garbageUpload = await harness.upload(accessToken, {
    name: "garbage.png",
    mimeType: "image/png",
    content: new Uint8Array([1, 2, 3, 4]),
  });
  assert.equal(garbageUpload.status, 400);

  const validJpegUpload = await harness.upload(accessToken, {
    name: "photo.jpg",
    mimeType: "image/jpeg",
    content: Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from("fake-jpeg-bits"),
    ]),
  });
  assert.equal(validJpegUpload.status, 201);
  const validJpeg = await harness.json<{ data: { mediaId: number; mimeType: string } }>(
    validJpegUpload,
  );
  assert.equal(validJpeg.data.mimeType, "image/jpeg");

  const detectedUpload = await harness.upload(accessToken, {
    name: "fake.pdf",
    mimeType: "application/pdf",
    content: harness.sampleImageContent(),
  });
  assert.equal(detectedUpload.status, 400);
});
