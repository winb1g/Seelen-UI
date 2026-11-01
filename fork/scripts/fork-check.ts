// [fork] Fork-specific CI checks. Node built-ins only, run with `node fork/scripts/fork-check.ts <command>`.
//
// Commands:
//   hooks                  every hook listed in FORK.md still exists in its upstream file
//   guard <base-ref>       every upstream file changed since <base-ref> is listed in FORK.md
//   preflight <owner/repo> fork/background/release.rs is ready to ship from <owner/repo>
//   key-match <sig-file>   <sig-file> was signed with the key whose public half is in release.rs
//
// See fork/docs/ci.md.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const FORK_DOC = "FORK.md";
export const RELEASE_RS = "fork/background/release.rs";
export const HOOKS_SECTION = "Hooks into upstream files";
export const PATCHES_SECTION = "Upstream patches";

/** Paths owned by the fork (upstream never has them), so changing them never needs a FORK.md entry. */
const FORK_OWNED: ((path: string) => boolean)[] = [
  (p) => p.startsWith("fork/"),
  (p) => p === "FORK.md",
  (p) => p === "CLAUDE.md",
  (p) => p === ".github/README.md",
  (p) => p.startsWith(".github/workflows/fork-"),
];

export interface Hook {
  file: string;
  marker: string;
}

/** Rows of the markdown tables under the `## <heading>` section, as raw cells (header and separator dropped). */
export function sectionRows(markdown: string, heading: string): string[][] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) {
    return [];
  }
  const rows: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) {
      break;
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }
    const cells = trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) {
      continue; // separator
    }
    rows.push(cells);
  }
  return rows.slice(1); // header
}

/** First `code span` of a table cell. */
export function firstCode(cell: string | undefined): string | undefined {
  return cell?.match(/`([^`]+)`/)?.[1];
}

/** Hooks table: column 1 = upstream file, column 2 = its first code span must appear verbatim in that file. */
export function parseHooks(markdown: string): Hook[] {
  const hooks: Hook[] = [];
  for (const row of sectionRows(markdown, HOOKS_SECTION)) {
    const file = firstCode(row[0]);
    const marker = firstCode(row[1]);
    if (!file || !marker) {
      throw new Error(`${FORK_DOC}: malformed hook row: | ${row.join(" | ")} |`);
    }
    hooks.push({ file, marker });
  }
  return hooks;
}

/** Every upstream file FORK.md declares as touched by the fork (hooks + upstream patches). */
export function declaredUpstreamFiles(markdown: string): Set<string> {
  const files = new Set<string>();
  for (const heading of [HOOKS_SECTION, PATCHES_SECTION]) {
    for (const row of sectionRows(markdown, heading)) {
      const file = firstCode(row[0]);
      if (file) {
        files.add(file);
      }
    }
  }
  return files;
}

export function isForkOwned(path: string): boolean {
  return FORK_OWNED.some((owned) => owned(path));
}

/** Changed upstream files that FORK.md doesn't declare. */
export function undeclaredChanges(changed: string[], declared: Set<string>): string[] {
  return changed.filter((p) => p && !isForkOwned(p) && !declared.has(p));
}

/** Value of `pub const <name>: &str = "<value>";` in a Rust source (the value may wrap to the next line). */
export function rustStrConst(source: string, name: string): string | undefined {
  return source.match(new RegExp(`pub const ${name}: &str =\\s*"([^"]*)";`))?.[1];
}

/**
 * Key id (hex) of a Tauri updater key or signature. Both are base64 of a minisign text file whose second line is
 * base64 of `<2-byte algorithm><8-byte little-endian key id><payload>`. Returned the way minisign prints it.
 */
export function minisignKeyId(tauriBase64: string): string {
  const text = Buffer.from(tauriBase64.trim(), "base64").toString("utf8");
  const line = text.split(/\r?\n/)[1];
  if (!line) {
    throw new Error("not a minisign key or signature");
  }
  const bytes = Buffer.from(line.trim(), "base64");
  if (bytes.length < 10) {
    throw new Error("not a minisign key or signature");
  }
  return Buffer.from(bytes.subarray(2, 10)).reverse().toString("hex").toUpperCase();
}

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

function checkHooks(): void {
  const hooks = parseHooks(readFileSync(FORK_DOC, "utf8"));
  const missing = hooks.filter(({ file, marker }) => {
    try {
      return !readFileSync(file, "utf8").includes(marker);
    } catch {
      return true;
    }
  });
  for (const { file, marker } of missing) {
    console.error(`::error file=${file}::fork hook missing: \`${marker}\` (listed in ${FORK_DOC})`);
  }
  if (missing.length > 0) {
    fail(`${missing.length} fork hook(s) missing, re-apply them after the upstream merge (see ${FORK_DOC})`);
  }
  console.log(`✓ ${hooks.length} fork hooks in place`);
}

function checkGuard(baseRef: string | undefined): void {
  if (!baseRef) {
    fail("usage: guard <base-ref>");
  }
  const changed = execFileSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim());
  const undeclared = undeclaredChanges(changed, declaredUpstreamFiles(readFileSync(FORK_DOC, "utf8")));
  for (const file of undeclared) {
    console.error(`::error file=${file}::upstream file changed but not listed in ${FORK_DOC}`);
  }
  if (undeclared.length > 0) {
    fail(
      `Move the change into fork/ behind a hook, or list the file under "## ${HOOKS_SECTION}" or ` +
        `"## ${PATCHES_SECTION}" in ${FORK_DOC}`,
    );
  }
  console.log("✓ every changed upstream file is declared in FORK.md");
}

function checkPreflight(repository: string | undefined): void {
  if (!repository) {
    fail("usage: preflight <owner/repo>");
  }
  const source = readFileSync(RELEASE_RS, "utf8");
  const pubkey = rustStrConst(source, "SIGN_PUB_KEY");
  if (!pubkey) {
    fail(`SIGN_PUB_KEY is empty in ${RELEASE_RS}: paste the fork public key (see fork/docs/releasing.md)`);
  }
  try {
    console.log(`✓ fork public key id ${minisignKeyId(pubkey)}`);
  } catch {
    fail(`SIGN_PUB_KEY in ${RELEASE_RS} is not a Tauri/minisign public key`);
  }
  const endpoint = rustStrConst(source, "RELEASE_ENDPOINT") ?? "";
  const expected = `https://github.com/${repository}/releases/`;
  if (!endpoint.toLowerCase().startsWith(expected.toLowerCase())) {
    fail(`RELEASE_ENDPOINT in ${RELEASE_RS} (${endpoint}) doesn't point at this repository (${expected}...)`);
  }
  console.log(`✓ updates published to ${endpoint}`);
}

function checkKeyMatch(sigFile: string | undefined): void {
  if (!sigFile) {
    fail("usage: key-match <sig-file>");
  }
  const expected = minisignKeyId(rustStrConst(readFileSync(RELEASE_RS, "utf8"), "SIGN_PUB_KEY") ?? "");
  const actual = minisignKeyId(readFileSync(sigFile, "utf8"));
  if (expected !== actual) {
    fail(
      `${sigFile} was signed with key ${actual}, but ${RELEASE_RS} trusts ${expected}: installed builds could not ` +
        "verify this update. The TAURI_SIGNING_PRIVATE_KEY secret and SIGN_PUB_KEY must be the same key pair.",
    );
  }
  console.log(`✓ signed with the fork key ${actual}`);
}

function main(argv: string[]): void {
  const [command, arg] = argv;
  switch (command) {
    case "hooks":
      return checkHooks();
    case "guard":
      return checkGuard(arg);
    case "preflight":
      return checkPreflight(arg);
    case "key-match":
      return checkKeyMatch(arg);
    default:
      fail("usage: fork-check.ts <hooks | guard <base-ref> | preflight <owner/repo> | key-match <sig-file>>");
  }
}

// Run only as a CLI, not when imported by the tests.
if (process.argv[1]?.endsWith("fork-check.ts")) {
  main(process.argv.slice(2));
}
