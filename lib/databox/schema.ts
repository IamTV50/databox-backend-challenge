import { z } from "zod";

export const DataboxPushRequest = z.object({
  records: z.array(z.record(z.string(), z.unknown())),
});

export const DataboxPushSuccess = z.object({
  requestId: z.string(),
  status: z.literal("success"),
  ingestionId: z.string(),
  message: z.string().optional(),
});

export const DataboxPushErrorItem = z.object({
  code: z.string().nullable().optional(),
  message: z.string(),
  field: z.string().optional(),
  type: z.string().optional(),
});

export const DataboxPushError = z.object({
  requestId: z.string().optional(),
  status: z.literal("error"),
  errors: z.array(DataboxPushErrorItem).default([]),
});

export type DataboxPushSuccessT = z.infer<typeof DataboxPushSuccess>;
export type DataboxPushErrorT = z.infer<typeof DataboxPushError>;
