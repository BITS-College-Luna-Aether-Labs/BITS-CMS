import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { AppError, badRequest, conflict, payloadTooLarge } from "../Utils/errors.js";

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof SyntaxError && "status" in error && error.status === 400 && "body" in error) {
    const mapped = badRequest("Malformed JSON in request body");
    res.status(mapped.status).json({
      error: true,
      code: mapped.code,
      message: mapped.message,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const mapped =
      error.code === "LIMIT_FILE_SIZE"
        ? payloadTooLarge("File exceeds the 10 MB limit")
        : new AppError(400, "UPLOAD_ERROR", error.message);

    res.status(mapped.status).json({
      error: true,
      code: mapped.code,
      message: mapped.message,
      ...(mapped.errors ? { errors: mapped.errors } : {}),
    });
    return;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const pgCode = (error as { code?: string }).code;

    if (pgCode === "23505") {
      const mapped = conflict("A unique value already exists");
      res.status(mapped.status).json({
        error: true,
        code: mapped.code,
        message: mapped.message,
      });
      return;
    }

    if (pgCode === "23503") {
      const mapped = badRequest("Referenced record does not exist");
      res.status(mapped.status).json({
        error: true,
        code: mapped.code,
        message: mapped.message,
      });
      return;
    }

    if (pgCode === "23514") {
      const mapped = badRequest("Provided data violates validation constraints");
      res.status(mapped.status).json({
        error: true,
        code: mapped.code,
        message: mapped.message,
      });
      return;
    }

    if (pgCode === "22P02") {
      const mapped = badRequest("Invalid parameter format");
      res.status(mapped.status).json({
        error: true,
        code: mapped.code,
        message: mapped.message,
      });
      return;
    }
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: true,
      code: error.code,
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
    return;
  }

  console.error("[ERROR]", error);

  res.status(500).json({
    error: true,
    code: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};

export default errorHandler;
