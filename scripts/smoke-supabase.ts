import { createHash } from "node:crypto";

import { SupabaseStorage } from "../apps/server/src/processing/storage-supabase";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "gitleap-artifacts";
if (!url || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run the live storage smoke");
}

const body = new TextEncoder().encode(`gitleap-storage-smoke:${crypto.randomUUID()}`);
const checksum = createHash("sha256").update(body).digest("hex");
const objectKey = `smoke/${crypto.randomUUID()}.tar.gz`;
const storage = new SupabaseStorage({ url, serviceRoleKey, bucket });

try {
  await storage.put({ objectKey, body, checksum, contentType: "application/gzip" });
  const signed = await storage.createDownloadUrl(objectKey, 60);
  const response = await fetch(signed.url);
  if (!response.ok) throw new Error(`signed download failed: ${response.status}`);
  const downloaded = new Uint8Array(await response.arrayBuffer());
  const downloadedChecksum = createHash("sha256").update(downloaded).digest("hex");
  if (downloadedChecksum !== checksum) throw new Error("signed download checksum mismatch");
  console.log(JSON.stringify({ bucket, objectKey, checksum, expiresAt: signed.expiresAt }));
} finally {
  await storage.delete(objectKey);
}
