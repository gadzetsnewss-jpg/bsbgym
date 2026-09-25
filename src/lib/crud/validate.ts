/**
 * Zod -> CRUD validator bridge.
 *
 * The generic form needs a simple `field -> message` map, while the app already
 * validates with zod. `fromZod` keeps the zod schemas as the single source of
 * truth without leaking zod types into the CRUD engine.
 */

import type { ZodType } from "zod";
import type { ResourceValues } from "@/lib/crud/types";

export type ResourceValidator = (values: ResourceValues) => Record<string, string>;

/** First message per field, mirroring how the member form surfaces issues. */
export function fromZod(schema: ZodType): ResourceValidator {
  return (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !errors[key]) {
        errors[key] = issue.message;
      }
    }
    return errors;
  };
}
