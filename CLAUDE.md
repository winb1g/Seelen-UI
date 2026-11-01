<!-- [fork] Fork-owned file (upstream has none): makes AI agents load the fork rules alongside upstream's AGENTS.md,
without editing AGENTS.md. -->

@AGENTS.md

@FORK.md

This repository is a fork. FORK.md takes precedence over AGENTS.md wherever they conflict: fork code goes in `fork/`,
upstream files only get the hooks listed in FORK.md, and fork docs live in FORK.md and `fork/docs/`.
