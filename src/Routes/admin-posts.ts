import { Router } from "express";
import {
  createPost,
  getPostById,
  hardDeletePost,
  listAdminPosts,
  countAdminPosts,
  restorePost,
  softDeletePost,
  updatePost,
  type DeletedFilter,
} from "../DB/post.js";
import { authenticate } from "../Middleware/auth.js";
import { validateBody } from "../Middleware/validate.js";
import { parsePostBody } from "../Schemas/post.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { badRequest, notFound } from "../Utils/errors.js";

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

function parseDeletedFilter(value: string | string[] | undefined): DeletedFilter {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || candidate === "false") {
    return "false";
  }

  if (candidate === "true" || candidate === "all") {
    return candidate;
  }

  throw badRequest("deleted must be one of true, false, or all");
}

function parseId(value: string | string[] | undefined, field: string): number {
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
  asyncHandler(async (req, res) => {
    const page = parsePositiveInteger(req.query.page as string | undefined, 1, "page");
    const limit = Math.min(
      parsePositiveInteger(req.query.limit as string | undefined, 10, "limit"),
      50,
    );
    const deleted = parseDeletedFilter(req.query.deleted as string | undefined);
    const [posts, total] = await Promise.all([
      listAdminPosts(deleted, page, limit),
      countAdminPosts(deleted),
    ]);

    res.json({
      data: posts,
      pagination: {
        page,
        limit,
        total,
      },
      message: "OK",
    });
  }),
);

router.post(
  "/",
  authenticate,
  validateBody(parsePostBody),
  asyncHandler(async (req, res) => {
    const post = await createPost({
      ...(req.body as ReturnType<typeof parsePostBody>),
      adminId: req.user!.sub,
    });

    res.status(201).json({
      data: post,
      message: "OK",
    });
  }),
);

router.put(
  "/:id",
  authenticate,
  validateBody(parsePostBody),
  asyncHandler(async (req, res) => {
    const postId = parseId(req.params.id, "id");
    const updated = await updatePost(postId, req.body as ReturnType<typeof parsePostBody>);

    if (!updated) {
      throw notFound("Post not found");
    }

    res.json({
      data: updated,
      message: "OK",
    });
  }),
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const postId = parseId(req.params.id, "id");
    const post = await getPostById(postId, true);

    if (!post) {
      throw notFound("Post not found");
    }

    res.json({
      data: post,
      message: "OK",
    });
  }),
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const postId = parseId(req.params.id, "id");
    const deleted = await softDeletePost(postId);

    if (!deleted) {
      throw notFound("Post not found");
    }

    res.status(204).send();
  }),
);

router.post(
  "/:id/restore",
  authenticate,
  asyncHandler(async (req, res) => {
    const postId = parseId(req.params.id, "id");
    const restored = await restorePost(postId);

    if (!restored) {
      throw notFound("Post not found or not deleted");
    }

    const post = await getPostById(postId, true);
    res.json({ data: post, message: "OK" });
  }),
);

router.delete(
  "/:id/permanent",
  authenticate,
  asyncHandler(async (req, res) => {
    const postId = parseId(req.params.id, "id");
    const result = await hardDeletePost(postId);

    if (!result.deleted) {
      throw notFound(
        "Post not found or not soft-deleted. Soft-delete it first.",
      );
    }

    res.json({
      data: { postId, mediaRemoved: result.mediaRemoved },
      message: "OK",
    });
  }),
);

export default router;
