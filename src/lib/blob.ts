/**
 * Azure Blob（本機 Azurite）。container 一律 private；對外只發 5 分鐘、唯讀、單一 blob 的 SAS。
 */
import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  type ContainerClient,
} from "@azure/storage-blob";

const g = globalThis as unknown as { __blob?: { service: BlobServiceClient; cred: StorageSharedKeyCredential; ready?: Promise<unknown> } };

function parseConn(conn: string) {
  const kv = Object.fromEntries(
    conn
      .split(";")
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i), p.slice(i + 1)];
      }),
  );
  return { name: kv.AccountName as string, key: kv.AccountKey as string };
}

function client() {
  if (!g.__blob) {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn) throw new Error("缺少 AZURE_STORAGE_CONNECTION_STRING");
    const { name, key } = parseConn(conn);
    g.__blob = { service: BlobServiceClient.fromConnectionString(conn), cred: new StorageSharedKeyCredential(name, key) };
  }
  return g.__blob;
}

export const containerName = () => process.env.AZURE_STORAGE_CONTAINER || "resources";

export async function container(): Promise<ContainerClient> {
  const c = client();
  const cc = c.service.getContainerClient(containerName());
  // 不帶 access 參數＝private container
  c.ready ??= cc.createIfNotExists();
  await c.ready;
  return cc;
}

export async function putBlob(key: string, data: Uint8Array, contentType: string) {
  const cc = await container();
  await cc.getBlockBlobClient(key).uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
}

export async function deletePrefix(prefix: string) {
  const cc = await container();
  for await (const b of cc.listBlobsFlat({ prefix })) await cc.deleteBlob(b.name).catch(() => {});
}

export async function getBlob(key: string) {
  const cc = await container();
  const bc = cc.getBlobClient(key);
  try {
    const r = await bc.download();
    return { stream: r.readableStreamBody!, contentType: r.contentType, length: r.contentLength };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) return null;
    throw e;
  }
}

/** 5 分鐘、唯讀、單一 blob、以 Content-Disposition 指定下載檔名 */
export function sasUrl(key: string, fileName: string, minutes = 5) {
  const c = client();
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + minutes * 60_000);
  const qs = generateBlobSASQueryParameters(
    {
      containerName: containerName(),
      blobName: key,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
    c.cred,
  ).toString();
  const url = c.service.getContainerClient(containerName()).getBlobClient(key).url;
  return { url: `${url}?${qs}`, expiresOn };
}
