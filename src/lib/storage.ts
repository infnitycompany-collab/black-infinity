import { mkdir, writeFile, readFile, rm, open } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
const root = () => path.resolve(process.env.DATA_DIR || ".data", "objects");
const objectKey = (media: string, index: number) => {
  if (!/^[a-f0-9-]{36}$/.test(media) || !Number.isInteger(index) || index < 0)
    throw new Error("Invalid storage key");
  return `${media}/${index}`;
};
const s3 = () =>
  new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
  });
export async function putChunk(media: string, index: number, data: Uint8Array) {
  const key = objectKey(media, index);
  if (process.env.STORAGE_DRIVER === "s3") {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      }),
    );
    return;
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_PREVIEW !== "1"
  )
    throw new Error("Production requires S3");
  await mkdir(path.join(root(), media), { recursive: true });
  await writeFile(path.join(root(), key), data, { mode: 0o600 });
}
export async function getChunk(
  media: string,
  index: number,
  start?: number,
  end?: number,
): Promise<Uint8Array> {
  const key = objectKey(media, index);
  if (process.env.STORAGE_DRIVER === "s3") {
    const r = await s3().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Range: start === undefined ? undefined : `bytes=${start}-${end ?? ""}`,
      }),
    );
    if (!r.Body) throw new Error("Object missing");
    return r.Body.transformToByteArray();
  }
  if (start === undefined) return readFile(path.join(root(), key));
  const f = await open(path.join(root(), key), "r");
  try {
    const b = Buffer.alloc(end! - start + 1);
    const r = await f.read(b, 0, b.length, start);
    return b.subarray(0, r.bytesRead);
  } finally {
    await f.close();
  }
}
export async function removeMedia(media: string, count: number) {
  if (process.env.STORAGE_DRIVER === "s3") {
    for (let i = 0; i < count; i += 500)
      await s3().send(
        new DeleteObjectsCommand({
          Bucket: process.env.S3_BUCKET,
          Delete: {
            Objects: Array.from(
              { length: Math.min(500, count - i) },
              (_, j) => ({ Key: objectKey(media, i + j) }),
            ),
          },
        }),
      );
  } else {
    objectKey(media, 0);
    await rm(path.join(root(), media), { recursive: true, force: true });
  }
}
