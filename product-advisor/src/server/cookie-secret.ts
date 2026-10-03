import { randomBytes, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function cookieSecret(
  path: string,
  supplied?: string,
): Promise<string> {
  if (supplied) {
    if (supplied.length < 32)
      throw new Error("cookie_secret_requires_32_characters");
    return supplied;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, randomBytes(32).toString("hex"), {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await rm(temporary);
  }
  const secret = (await readFile(path, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new Error("invalid_saved_cookie_secret");
  return secret;
}
