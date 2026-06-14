/**
 * Minimal unified-diff applier (pure JS, no `git`) — § pay-on-green / Vercel.
 *
 * The subprocess runner shells out to `git apply`, which doesn't exist on
 * serverless (Vercel). This applies standard `@@ -a,b +c,d @@` hunks in-process
 * so the baked demo runs identically everywhere. It VERIFIES the context +
 * removed lines against the source; any mismatch → `{ applied:false }`, which
 * the caller hard-gates exactly like a failed `git apply`. Deterministic.
 *
 * Scope: enough for well-formed unified diffs (the demo + typical single/multi
 * hunk patches). It does not do fuzzy/offset matching — context must match.
 */

export type DiffApplyResult = { applied: boolean; result: string };

export function applyUnifiedDiff(source: string, diff: string): DiffApplyResult {
  const srcLines = source.split("\n");
  const diffLines = diff.split("\n");
  const out: string[] = [];
  let srcIdx = 0; // 0-based cursor into srcLines
  let i = 0;

  // Skip file headers (---, +++, diff --git, index) up to the first hunk.
  while (i < diffLines.length && !diffLines[i].startsWith("@@")) i++;
  if (i >= diffLines.length) return { applied: true, result: source }; // no hunks

  while (i < diffLines.length) {
    const header = diffLines[i];
    if (!header.startsWith("@@")) {
      i++;
      continue;
    }
    const m = header.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (!m) return { applied: false, result: source };
    const hunkStartIdx = parseInt(m[1], 10) - 1; // 1-based → 0-based
    if (hunkStartIdx < srcIdx || hunkStartIdx > srcLines.length) {
      return { applied: false, result: source };
    }
    // Copy untouched source lines up to the hunk.
    while (srcIdx < hunkStartIdx) out.push(srcLines[srcIdx++]);
    i++;

    // Apply the hunk body.
    while (i < diffLines.length && !diffLines[i].startsWith("@@")) {
      const hl = diffLines[i];
      if (hl.startsWith("\\")) {
        i++;
        continue; // "\ No newline at end of file"
      }
      if (hl === "") break; // trailing split artifact / end of hunk
      const tag = hl[0];
      const content = hl.slice(1);
      if (tag === " ") {
        if (srcLines[srcIdx] !== content) return { applied: false, result: source };
        out.push(srcLines[srcIdx++]);
      } else if (tag === "-") {
        if (srcLines[srcIdx] !== content) return { applied: false, result: source };
        srcIdx++;
      } else if (tag === "+") {
        out.push(content);
      } else {
        return { applied: false, result: source };
      }
      i++;
    }
  }

  while (srcIdx < srcLines.length) out.push(srcLines[srcIdx++]);
  return { applied: true, result: out.join("\n") };
}
