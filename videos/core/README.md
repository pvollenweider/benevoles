# Core boundary

`videos/core/` is the generic video engine; it moves to tutocast unchanged.
A file under `videos/core/` imports only from `videos/core/`, Node built-ins and the dependencies declared in `dependencies.json`, and contains none of the forbidden tokens: benevol, Mailpit, benevol ports and hosts, and known video IDs.
`videos/lib/__tests__/core-boundary.test.ts` enforces both rules.
