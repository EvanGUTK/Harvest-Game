---
name: adr
description: Create a new Architecture Decision Record from the template, numbered sequentially, and register it in docs/adr/README.md and (if it resolves one) docs/00-overview/decisions-needed.md.
---

# /adr <title>

1. Find the next number: `ls docs/adr | grep -E '^[0-9]{4}-' | sort | tail -1`.
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-<kebab-title>.md`. Fill Context, Decision, Consequences, Alternatives. Status `proposed` unless the owner has already approved, then `accepted`.
3. Add a row to the table in `docs/adr/README.md`.
4. If this decides a `D-xx` item, update that row in `docs/00-overview/decisions-needed.md` to point at the ADR.
5. If it supersedes an ADR, set the old one's status to `superseded by ADR-NNNN`. Never change its Decision text.
6. Commit `docs(ADR-NNNN): <title>`.
