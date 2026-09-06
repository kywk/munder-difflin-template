# Agent Team SDLC

This is the routing and delivery source of truth for the Munder Difflin floor. `PROTOCOL.md` remains the source of truth for mailbox and Hive mechanics.

## Control plane

- **Moo Cow (`god`)** is the owner's clone and final orchestrator. Moo Cow adjudicates conflicts, guards human gates, and owns the shared board; routine delivery flows through the PM.
- **Delivery PM (`pm`)** accepts routine work, decomposes it into outcome-sized tasks, records dependencies and acceptance criteria, assigns owners, watches `fleet.json`, and routes blockers.
- Only `god`, `pm`, `architect`, and `senior-architect` may request new workers. Prefer an idle permanent agent before spawning one.
- An agent owns only its assigned paths and task. Cross-scope work is proposed to `pm`; architecture disputes or unresolved blockers follow the escalation ladder below.

## Routing table

| Work | Primary | Escalation or fallback |
| --- | --- | --- |
| Routine planning, dispatch, status, acceptance | `pm` — balanced generalist | Strong-reasoning generalist when cross-system ambiguity grows |
| Architecture and cross-system requirements | `architect` — strong-reasoning model | `senior-architect` after one evidence-backed failed resolution |
| Complex architecture or repeated unresolved blocker | `senior-architect` — strongest available reasoning model | `god` only for scope, policy, spend, or human decisions |
| Backend implementation | `backend` — coding model | Strong-reasoning coding model for cross-system, concurrency, security-sensitive, or repeatedly failing work |
| Frontend implementation | `frontend` — UI-capable coding model | Alternate provider after repeated tool/model failure; strongest reasoning model for complex architecture |
| Test design and verification | `qa` — coding model | Architecture or environment blockers go to `architect` or `devops` |
| Independent review | `reviewer` — strong-reasoning model, read-only | Security findings may trigger the on-demand security reviewer |
| CI/CD, release, environments, observability | `devops` — coding model | Complex platform design goes to `architect` |
| Simple work, collection, organization, schedules | `operations` — fast generalist | Alternate provider, then a balanced generalist |
| Reports, documentation, executive summaries, slides | `docs` — fast multimodal generalist | Alternate provider, then a balanced generalist |

## On-demand specialists

Use isolated workers by default. The requester supplies a bounded objective, absolute repository path, owned paths, acceptance evidence, and a token cap appropriate to the task.

| Specialist | Trigger | Preferred capability |
| --- | --- | --- |
| Security reviewer | Auth, secrets, permissions, supply chain, threat modeling, or security-sensitive changes | Strong-reasoning model, read-only |
| Incident diagnostician | Production incident, intermittent failure, or unclear root cause | Strong-reasoning model with diagnostic tools |
| Performance engineer | Latency, throughput, resource, or scalability regression | Strong-reasoning coding model |
| Presentation designer | A presentation needs a dedicated narrative and visual-production pass | Fast multimodal model |
| Complex backend engineer | Cross-system backend, concurrency, migration, or repeated primary-model failure | Strong-reasoning coding model |
| Frontend fallback | The primary provider repeatedly fails or cannot operate required tooling | Alternate UI-capable provider; strongest reasoning model for architecture-heavy work |
| Research fallback | The primary provider cannot retrieve or structure the requested material | Alternate fast provider, then a balanced generalist |

“Repeated failure” means two materially different attempts have failed with recorded evidence. A third retry uses the fallback or escalation route instead of repeating the same approach.

## Delivery flow

1. **Intake:** `god` routes routine work to `pm`. PM states the outcome, scope, constraints, dependencies, owner, reviewer, and acceptance evidence.
2. **Design gate:** Cross-system, irreversible, security-sensitive, or contract-changing work receives an `architect` decision before implementation. The architect records alternatives, decision, risks, migration, and rollback.
3. **Build:** The implementer works in an isolated worktree when repository changes may overlap. It preserves existing changes and reports changed paths and verification.
4. **Verify:** `qa` independently verifies behavior in proportion to risk. Compilation and static inspection are evidence only for what they directly establish.
5. **Review:** `reviewer` is independent from the author and reports findings by severity with file/line evidence. The author resolves findings; the reviewer confirms closure.
6. **Release:** `devops` checks CI, configuration, observability, rollout, rollback, and environment-specific assumptions when release is in scope.
7. **Close:** PM closes only when acceptance evidence exists, review findings are resolved or explicitly accepted, documentation is current, and remaining live-environment assumptions are named.

## Escalation ladder

1. An agent sends a concise `query` to the domain owner with attempted approaches, exact evidence, and the smallest decision needed.
2. PM re-routes dependency, environment, or ownership blockers.
3. Architect handles cross-system ambiguity and design conflict.
4. Senior architect handles a failed architecture resolution, systemic deadlock, or unusually complex design.
5. `god` receives only human gates: spend, destructive operations, credentials, external publication, production deployment, scope expansion, policy exceptions, or unresolved business decisions.

Continue safe independent work while an escalation is open. Circuit-breaker messages take priority over this ladder.

## Git and authority

- The Hive harness is the single committer for Hive coordination files. Product-code agents use their assigned worktree and do not modify another agent's workspace.
- Authors do not approve their own code. Review and QA remain independent even when the change is small.
- Git push, production deployment, destructive data or filesystem operations, paid actions, credential handling, and material scope changes require an ASK ME decision through `god`.
- Messages contain paths and secret names, never secret values. Logs, reports, commits, and screenshots follow the same rule.

## Handoff contract

Every `done` message states:

- outcome and task ID;
- paths or artifacts changed;
- commands run and observed results;
- acceptance criteria satisfied;
- unresolved risks, blockers, and unverified live assumptions;
- next owner, if work remains.

Use `request`, `query`, or `propose` only when a reply is required. Use `inform` for status and `done` exactly once for completion.
