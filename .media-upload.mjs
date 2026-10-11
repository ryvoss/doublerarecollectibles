import crypto from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const expectedFiles = [
  {
    localPath: String.raw`C:\Users\Ryan Voss\Documents\Projects\DoubleRareCollectibles\uploads\products\2\efeb774d-b29c-4b8c-b5d9-a860863d73de.png`,
    key: "products/2/efeb774d-b29c-4b8c-b5d9-a860863d73de.png",
    sha256: "dbd0f5f79826bd95fc06a39d8f14109d2ce4b5af503fc06c2e7b5ce79e85d020",
  },
  {
    localPath: String.raw`C:\Users\Ryan Voss\Documents\Projects\DoubleRareCollectibles\uploads\site-assets\primary-logo\71890fa1-c0bb-46c0-9800-35eebc9b226d.png`,
    key: "site-assets/primary-logo/71890fa1-c0bb-46c0-9800-35eebc9b226d.png",
    sha256: "ddf92267afaa162604b5c1a7cd7fc4cc43b143191fee93042d1bdadb8c4153f5",
  },
  {
    localPath: String.raw`C:\Users\Ryan Voss\Documents\Projects\DoubleRareCollectibles\uploads\site-assets\hero-image\5158d1d9-e218-494d-a8e9-58007a04dd55.png`,
    key: "site-assets/hero-image/5158d1d9-e218-494d-a8e9-58007a04dd55.png",
    sha256: "ddf92267afaa162604b5c1a7cd7fc4cc43b143191fee93042d1bdadb8c4153f5",
  },
];

const digest = (data) => crypto.createHash("sha256").update(data).digest("hex");

async function bodyToBuffer(body) {
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  if (body && Symbol.asyncIterator in body) {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new Error("Object body was not readable");
}

const prepared = [];
for (const file of expectedFiles) {
  await access(file.localPath);
  const data = await readFile(file.localPath);
  const metadata = await stat(file.localPath);
  const actualHash = digest(data);
  if (actualHash !== file.sha256) throw new Error(`Local SHA-256 mismatch for ${file.key}`);
  prepared.push({ ...file, data, sizeBytes: metadata.size });
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.S3_BUCKET_NAME;
const results = [];
for (const file of prepared) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: file.key,
    Body: file.data,
    ContentType: "image/png",
    CacheControl: "public, max-age=31536000, immutable",
  }));

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
  const downloaded = await client.send(new GetObjectCommand({ Bucket: bucket, Key: file.key }));
  const downloadedData = await bodyToBuffer(downloaded.Body);
  const localAfter = await readFile(file.localPath);
  const localAfterStat = await stat(file.localPath);
  const downloadedHash = digest(downloadedData);
  const localAfterHash = digest(localAfter);

  const result = {
    key: file.key,
    localPath: file.localPath,
    expectedSizeBytes: file.sizeBytes,
    objectSizeBytes: Number(head.ContentLength),
    downloadedSizeBytes: downloadedData.length,
    expectedSha256: file.sha256,
    downloadedSha256: downloadedHash,
    localAfterSha256: localAfterHash,
    contentType: head.ContentType,
    exists: true,
    sizeMatches: Number(head.ContentLength) === file.sizeBytes && downloadedData.length === file.sizeBytes,
    hashMatches: downloadedHash === file.sha256,
    localFileStillExists: localAfterStat.isFile(),
    localFileUnchanged: localAfterHash === file.sha256 && localAfterStat.size === file.sizeBytes,
  };
  if (!result.sizeMatches || !result.hashMatches || !result.localFileUnchanged) {
    throw new Error(`Verification failed for ${file.key}: ${JSON.stringify(result)}`);
  }
  results.push(result);
}

const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
const objectKeys = (listed.Contents || []).map((object) => object.Key).sort();
const expectedKeys = expectedFiles.map((file) => file.key).sort();
if (JSON.stringify(objectKeys) !== JSON.stringify(expectedKeys)) {
  throw new Error(`Bucket object list differs from the three expected keys: ${JSON.stringify(objectKeys)}`);
}

console.log(JSON.stringify({
  bucket,
  uploadedAndVerified: results.length,
  objectCount: Number(listed.KeyCount ?? objectKeys.length),
  objectKeys,
  results,
}, null, 2));
