import test from "node:test";
import assert from "node:assert/strict";
import {
  createVault,
  unlockVault,
  prepareFile,
  openFile,
  encryptChunk,
  iv,
  unb64,
  aad,
  wrapForRecipient,
} from "../src/lib/vault";
test("vault recovers keys, authenticates chunks and wraps keys for recipients", async () => {
  const vault = await createVault(),
    key = await unlockVault(vault.recovery, vault.wrapped),
    id = crypto.randomUUID();
  const file = new File(["private media bytes"], "secret title.mp4", {
    type: "video/mp4",
  });
  const prepared = await prepareFile(file, id, vault.publicKey);
  assert.equal(
    JSON.stringify(prepared.metadata).includes("secret title"),
    false,
  );
  const opened = await openFile(id, prepared.metadata, key);
  assert.equal(opened.name, file.name);
  const cipher = await encryptChunk(
    prepared.key,
    prepared.metadata.prefix,
    id,
    0,
    file.size,
    await file.arrayBuffer(),
  );
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv(unb64(prepared.metadata.prefix), 0),
      additionalData: aad(id, 0, file.size),
    },
    opened.key,
    cipher,
  );
  assert.equal(new TextDecoder().decode(plain), "private media bytes");
  const tampered = new Uint8Array(cipher.slice(0));
  tampered[0] ^= 1;
  await assert.rejects(() =>
    crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv(unb64(prepared.metadata.prefix), 0),
        additionalData: aad(id, 0, file.size),
      },
      opened.key,
      tampered,
    ),
  );
  await assert.rejects(() =>
    crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv(unb64(prepared.metadata.prefix), 0),
        additionalData: aad(id, 1, file.size),
      },
      opened.key,
      cipher,
    ),
  );
  await assert.rejects(() =>
    openFile(crypto.randomUUID(), prepared.metadata, key),
  );
  const recipient = await createVault(),
    shared = await wrapForRecipient(opened.key, recipient.publicKey);
  const second = await openFile(
    id,
    prepared.metadata,
    recipient.privateKey,
    shared,
  );
  assert.equal(second.name, file.name);
  await assert.rejects(() =>
    openFile(id, prepared.metadata, recipient.privateKey),
  );
});
