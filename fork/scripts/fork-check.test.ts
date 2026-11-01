// [fork] Tests for fork-check.ts: `node --test fork/scripts/`.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  declaredUpstreamFiles,
  isForkOwned,
  minisignKeyId,
  parseHooks,
  rustStrConst,
  undeclaredChanges,
} from "./fork-check.ts";

const FORK_MD = `
# Fork

## Hooks into upstream files

| Upstream file    | Hook                                   | Feature |
| ---------------- | -------------------------------------- | ------- |
| \`src/main.rs\`    | \`fork::init();\` at the end of \`setup\` | Entry   |
| \`src/a.svelte\`   | import + \`{@attach foo(() => x)}\`       | Foo     |

## Upstream patches

| Upstream file  | Change    | Upstream PR |
| -------------- | --------- | ----------- |
| \`src/fix.rs\`   | some fix  | -           |

## Features

| \`src/not-declared.rs\` | tables outside the two sections are ignored |
`;

// Upstream's public updater key (public data), key id 48B55EB44C470DEB.
const UPSTREAM_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQ4QjU1RUI0NEM0NzBERUIKUldUckRVZE10RjYxU0lpaERvdklYL05DVlg0Sk9EVngvaEgzZjMvU1NNemJTZXZ1K0dNVXU3ZkQK";

function fakeSignature(keyIdHex: string): string {
  const keyId = Buffer.from(keyIdHex, "hex").reverse(); // stored little-endian
  const blob = Buffer.concat([Buffer.from("ED", "ascii"), keyId, Buffer.alloc(64)]);
  const text = `untrusted comment: signature from tauri secret key\n${
    blob.toString("base64")
  }\ntrusted comment: x\nAAAA\n`;
  return Buffer.from(text).toString("base64");
}

test("parseHooks takes the file and the first code span of the hook column", () => {
  assert.deepEqual(parseHooks(FORK_MD), [
    { file: "src/main.rs", marker: "fork::init();" },
    { file: "src/a.svelte", marker: "{@attach foo(() => x)}" },
  ]);
});

test("parseHooks rejects rows without a marker", () => {
  const md = "## Hooks into upstream files\n\n| File | Hook |\n| - | - |\n| `src/x.rs` | no code |\n";
  assert.throws(() => parseHooks(md), /malformed hook row/);
});

test("declaredUpstreamFiles merges hooks and patches only", () => {
  assert.deepEqual([...declaredUpstreamFiles(FORK_MD)].sort(), ["src/a.svelte", "src/fix.rs", "src/main.rs"]);
});

test("isForkOwned", () => {
  for (const p of ["fork/weg/x.ts", "FORK.md", "CLAUDE.md", ".github/README.md", ".github/workflows/fork-ci.yml"]) {
    assert.ok(isForkOwned(p), p);
  }
  for (const p of ["src/main.rs", "README.md", ".github/workflows/ci.yml", "package.json", "forked/x"]) {
    assert.ok(!isForkOwned(p), p);
  }
});

test("undeclaredChanges reports only undeclared upstream files", () => {
  const changed = ["fork/a.ts", "src/main.rs", "src/fix.rs", "src/other.rs", "package.json", ""];
  assert.deepEqual(undeclaredChanges(changed, declaredUpstreamFiles(FORK_MD)), ["src/other.rs", "package.json"]);
});

test("rustStrConst reads single and wrapped constants", () => {
  const src = 'pub const A: &str = "";\npub const B: &str =\n    "https://x/latest.json";\n';
  assert.equal(rustStrConst(src, "A"), "");
  assert.equal(rustStrConst(src, "B"), "https://x/latest.json");
  assert.equal(rustStrConst(src, "C"), undefined);
});

test("minisignKeyId reads public keys and signatures alike", () => {
  assert.equal(minisignKeyId(UPSTREAM_PUBKEY), "48B55EB44C470DEB");
  assert.equal(minisignKeyId(fakeSignature("48B55EB44C470DEB")), "48B55EB44C470DEB");
  assert.throws(() => minisignKeyId(""), /not a minisign/);
});
