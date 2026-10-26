import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { CopyCheckFields, LAUNCH_IMAGE_MAX_BYTES, LAUNCH_IMAGE_TYPES, type CopyCheck } from "@launchpad/contract";
import { checkCopies } from "../copies/check";
import { imageHash } from "../copies/imageHash";
import type { AppEnv } from "../env";
import { sniffImageType } from "../images";

/** Copy Protection (#120, ADR 0012): the launch form asks as the Creator types, and gets the verdict a prepare would give. */
export const copyRoutes = new Hono<AppEnv>();

copyRoutes.post("/launches/check", async (c) => {
  const form = await c.req.formData().catch(() => {
    throw new HTTPException(400, { message: "expected multipart/form-data" });
  });
  const fields = CopyCheckFields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!fields.success) return c.json({ error: "invalid check fields", details: fields.error.issues }, 400);
  const image = form.get("image");
  let hash: string | null | undefined;
  if (image instanceof File && image.size > 0) {
    if (image.size > LAUNCH_IMAGE_MAX_BYTES) return c.json({ error: "image is larger than 2 MB" }, 400);
    const bytes = new Uint8Array(await image.arrayBuffer());
    const contentType = sniffImageType(bytes);
    if (!contentType || !(LAUNCH_IMAGE_TYPES as readonly string[]).includes(contentType)) return c.json({ error: "image must be PNG, JPEG, WebP or GIF" }, 400);
    hash = await imageHash(bytes, contentType);
  }
  const cfg = c.get("cfg");
  const verdicts = await checkCopies(c.get("db"), cfg, { ...fields.data, imageHash: hash });
  const body: CopyCheck = { ...verdicts, protectionSeconds: cfg.copyProtectionSeconds };
  return c.json(body);
});
