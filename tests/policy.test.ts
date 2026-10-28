import test from "node:test";
import assert from "node:assert/strict";
import {
  level,
  parseRange,
  priceEGP,
  contributionMargin,
} from "../src/lib/policy";
import { publicAddress } from "../src/lib/relay";
test("ranges support seeks and suffixes without invalid allocations", () => {
  assert.deepEqual(parseRange("bytes=100-199", 1000), {
    start: 100,
    end: 199,
    partial: true,
  });
  assert.deepEqual(parseRange("bytes=-100", 1000), {
    start: 900,
    end: 999,
    partial: true,
  });
  for (const range of [
    "bytes=1000-",
    "bytes=5-2",
    "bytes=0-1,3-4",
    "bytes=-0",
    "bytes=-",
    "x",
  ])
    assert.throws(() => parseRange(range, 1000));
});
test("levels do not change financial entitlement", () => {
  assert.equal(level(0), "Explorer");
  assert.equal(level(3), "Connector");
  assert.equal(level(10), "Ambassador");
  assert.equal(level(25), "Infinity Advocate");
});
test("regional pricing rounds upward and rejects invalid inputs", () => {
  assert.equal(priceEGP(2.99, 50, 5), 160);
  assert.throws(() => priceEGP(1, 0, 0));
  assert.equal(contributionMargin(10, 6), 0.4);
  assert.equal(contributionMargin(0, 1), 0);
});
test("relay rejects private, mapped private, metadata and reserved networks", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.0.1",
    "172.16.1.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "100.64.0.1",
    "224.0.0.1",
    "bad",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
