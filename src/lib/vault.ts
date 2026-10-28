// Experimental BI-V1 format. Standard Web Crypto primitives; independent format review remains a release gate.
import { sha256 } from "@noble/hashes/sha2.js";
export const VAULT_CHUNK = 4 * 1024 * 1024;
export async function fingerprint(file: Blob) {
  const hash = sha256.create(),
    reader = file.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return b64(hash.digest());
}
const enc = new TextEncoder();
export const b64 = (x: ArrayBuffer | Uint8Array) => {
  const a = x instanceof Uint8Array ? x : new Uint8Array(x);
  let s = "";
  for (let i = 0; i < a.length; i += 8192)
    s += String.fromCharCode(...a.subarray(i, i + 8192));
  return btoa(s);
};
export const unb64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export function iv(prefix: Uint8Array, index: number) {
  if (
    prefix.length !== 8 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 2 ** 32
  )
    throw new Error("Invalid nonce");
  const n = new Uint8Array(12);
  n.set(prefix);
  new DataView(n.buffer).setUint32(8, index);
  return n;
}
export const aad = (id: string, index: number, size: number) =>
  enc.encode(`BI-V1:${id}:${index}:${size}`);
export async function createVault() {
  const master = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["wrapKey", "unwrapKey"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey),
    raw = await crypto.subtle.exportKey("pkcs8", pair.privateKey),
    nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: enc.encode("BI-VAULT-KEY-V1"),
    },
    master,
    raw,
  );
  return {
    publicKey,
    wrapped: { version: 1, iv: b64(nonce), cipher: b64(cipher) },
    recovery: `BI-RECOVERY-1.${b64(await crypto.subtle.exportKey("raw", master))}`,
    privateKey: await crypto.subtle.importKey('pkcs8',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['unwrapKey']),
  };
}
export async function unlockVault(
  recovery: string,
  wrapped: { version: number; iv: string; cipher: string },
) {
  if (!recovery.startsWith("BI-RECOVERY-1.") || wrapped.version !== 1)
    throw new Error("Invalid recovery kit");
  const master = await crypto.subtle.importKey(
    "raw",
    unb64(recovery.slice(14)),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const raw = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unb64(wrapped.iv),
      additionalData: enc.encode("BI-VAULT-KEY-V1"),
    },
    master,
    unb64(wrapped.cipher),
  );
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["unwrapKey"],
  );
}
export async function prepareFile(
  file: File,
  id: string,
  publicJwk: JsonWebKey,
  digest?: string,
) {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const prefix = crypto.getRandomValues(new Uint8Array(8));
  const pub = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
  const wrapped = await crypto.subtle.wrapKey("raw", key, pub, {
    name: "RSA-OAEP",
  });
  const metadata = enc.encode(
    JSON.stringify({
      name: file.name,
      mime: file.type || "application/octet-stream",
      fingerprint: digest || (await fingerprint(file)),
    }),
  );
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv(prefix, 0xffffffff),
      additionalData: aad(id, 0xffffffff, file.size),
    },
    key,
    metadata,
  );
  return {
    key,
    metadata: {
      version: 1,
      prefix: b64(prefix),
      wrappedKey: b64(wrapped),
      cipher: b64(cipher),
      size: file.size,
      chunkSize: VAULT_CHUNK,
    },
  };
}
export async function openFile(
  id: string,
  meta: any,
  privateKey: CryptoKey,
  shareWrapped?: string,
) {
  if (meta.version !== 1 || meta.chunkSize !== VAULT_CHUNK)
    throw new Error("Unsupported vault format");
  const key = await crypto.subtle.unwrapKey(
    "raw",
    unb64(shareWrapped || meta.wrappedKey),
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const prefix = unb64(meta.prefix);
  const raw = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv(prefix, 0xffffffff),
      additionalData: aad(id, 0xffffffff, meta.size),
    },
    key,
    unb64(meta.cipher),
  );
  return { key, ...JSON.parse(new TextDecoder().decode(raw)) };
}
export async function encryptChunk(
  key: CryptoKey,
  prefix: string,
  id: string,
  index: number,
  size: number,
  data: ArrayBuffer,
) {
  return crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv(unb64(prefix), index),
      additionalData: aad(id, index, size),
    },
    key,
    data,
  );
}
export async function wrapForRecipient(key: CryptoKey, jwk: JsonWebKey) {
  const pub = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
  return b64(
    await crypto.subtle.wrapKey("raw", key, pub, { name: "RSA-OAEP" }),
  );
}
export async function keyFingerprint(jwk:JsonWebKey){if(jwk.kty!=='RSA'||!jwk.e||!jwk.n)throw new Error('Invalid public key');const canonical=JSON.stringify({e:jwk.e,kty:'RSA',n:jwk.n});return b64(await crypto.subtle.digest('SHA-256',enc.encode(canonical))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
