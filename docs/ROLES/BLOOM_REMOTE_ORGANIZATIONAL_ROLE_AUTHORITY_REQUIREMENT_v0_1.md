# BLOOM — Remote Organizational Role Authority Requirement v0.1

**Work of origin:** ROLES  
**Status:** cross-Work requirement for collective investigation and agreement  
**Date:** 2026-09-02  
**Design authority:** José Vigil

## 1. Minimum definition

> The remote backend preserves the organizational source of identities,
> memberships, roles, and assignments. Nucleus consumes verifiable, versioned,
> and revocable state and remains the local point that decides and applies
> effective authorization together with current policies, Gravity, and technical
> limits.

This is the minimum definition that the participating Works must preserve. It
establishes the responsibility boundary without prematurely approving database
tables, endpoints, payload schemas, synchronization jobs, or implementation
files.

## 2. Purpose

BTIPS/Bloom is intended to support large organizations, not only a single user
or an isolated local team. In a corporate system, the role of a person is not a
global property of that person or their computer. It is a relationship with an
organization and a governed scope.

The same verified person may legitimately be:

```text
Organization Alpha  → Architect candidate
Organization Beta   → CTO candidate
Organization Gamma  → ANA project analyst candidate
```

The names above are illustrative. They are not approved roles. The invariant is
that each organization interprets and assigns responsibilities independently.

A local file cannot, by itself, provide the synchronization required for:

- multiple administrators;
- multiple devices;
- remote invitations and acceptance;
- organization-specific assignments;
- promotion, suspension, expiration, and revocation;
- immediate or bounded propagation of security changes;
- a durable corporate audit trail;
- consistent authorization across local installations.

For those reasons, the authoritative organizational role tree cannot live only
in a previously initialized local environment.

## 3. Required architectural boundary

The required responsibility split is:

```text
Remote organizational plane
├── identities
├── organization memberships
├── role definitions
├── role assignments
├── scopes and validity
├── invitation/acceptance state
└── revocation and audit history
          │
          │ verifiable synchronization contract
          ▼
Local Nucleus
├── identifies the active organization and actor
├── verifies synchronized organizational state
├── evaluates role and scope
├── applies local Nucleus policies
├── applies applicable Gravity constraints
├── coordinates Vault and Executor boundaries
├── records the local authorization decision
└── allows or rejects the requested operation
```

The backend is the source of organizational facts. Nucleus remains the local
authorization decision and enforcement point. The backend does not directly
execute local actions, and Nucleus does not unilaterally create a competing
organizational truth.

## 4. What the organizational role tree means

The organizational role tree is not merely a list of job titles. It is the
effective, versioned representation of relationships such as:

```text
organization
├── organizational units or governed domains
├── members
│   ├── verified identity references
│   ├── membership state
│   └── validity
├── role definitions
│   ├── permissions
│   ├── allowed scope types
│   ├── assignment authority
│   └── constraints
└── role assignments
    ├── actor
    ├── role and definition version
    ├── scope and target
    ├── assigned-by authority
    ├── acceptance state
    ├── validity period
    └── active, suspended, expired, or revoked state
```

The final shape is not approved by this document. This representation identifies
the minimum information categories that the future contract must cover.

## 5. Identity and GitHub linkage

GitHub can provide an initial verified identity, but a visible GitHub username
must not become the sole permanent primary key of organizational authorization.
Usernames can change, and future organizations may require other identity
providers.

The future model must be able to distinguish:

```text
internal actor identity
└── linked external identity
    ├── provider: GitHub
    ├── stable provider subject
    ├── visible login
    └── verification metadata
```

An identity becomes authoritative in an organization only through an active,
verifiable organizational relationship. Authentication proves who the actor is;
membership and role assignment determine what the actor may do in that
organization.

## 6. Information classes that must not be collapsed

The remote contract must keep these concepts separate:

| Concept | Meaning |
|---|---|
| Identity | Who the actor is |
| Membership | Whether the actor belongs to the organization |
| Role definition | A versioned grouping of approved permissions and constraints |
| Role assignment | The role held by an actor in a specific organization and scope |
| Scope | Where the assignment is valid |
| Permission | The exact operation represented by the role |
| Policy | Organizational rule applied by Nucleus |
| Gravity | Applicable criterion or restriction; never a source of permission |
| Technical limit | Boundary applied by Vault, Executor, runtime, filesystem, network, or another owner |

A table such as `users.role` is insufficient because one actor may belong to
multiple organizations, hold multiple roles, and operate under different scopes
and validity periods.

## 7. Synchronization path to investigate

Bloom already contains communication, distribution, and lifecycle mechanisms
involving Backend, Batcave, and Metamorph. The participating Works must inspect
their actual contracts before selecting the synchronization path.

The conceptual paths to validate are separate:

```text
Organizational-state synchronization

Remote Backend
    │ authoritative organizational role state
    ▼
Batcave / approved sovereign communication plane
    │ authenticated and organization-isolated transport
    ▼
Nucleus
    │ verification, local state transition, and effective authorization
    ▼
Local consumers and enforcement boundaries

Software lifecycle

Metamorph
    ├── installs and updates Batcave
    └── installs and updates Nucleus
```

The first diagram remains a research hypothesis about the transport path, not
an assertion that the current Batcave implementation already supports
role-state synchronization. Metamorph is not part of the ordinary flow of
organizational role data: it manages the lifecycle of the software that
participates in that flow.

The investigation must determine:

- which existing component initiates synchronization;
- which component transports organizational state;
- how Metamorph preserves organizational state while installing versioned
  system artifacts;
- whether Batcave already has the required identity, tenant, and trust boundary;
- how Nucleus authenticates the source;
- how organization isolation is demonstrated;
- how acknowledgement and retry work;
- how revocation urgency differs from ordinary configuration distribution;
- whether push, pull, or a hybrid is required.

No Work may assign a new responsibility to Metamorph, Batcave, Backend, ADK, or
Nucleus solely from this conceptual diagram.

### 7.1 Metamorph responsibility boundary

Metamorph is responsible for distributing, verifying, installing, updating,
and recovering the Batcave and Nucleus software that implements the approved
synchronization and local authorization contracts. Its existing lifecycle
mechanisms include organization-scoped rollout, artifact manifests, integrity
verification, staging, atomic replacement, receipts, rollback, and restoration
of previously active services.

Metamorph is not:

- a source of organizational truth;
- the owner of the local Roles projection;
- an ordinary transport for memberships, role definitions, assignments, or
  revocations;
- an evaluator of roles, scopes, policies, or effective permissions;
- authorized to interpret an artifact hash as proof of organizational
  authority;
- authorized to replace or repair authorization state through an
  indiscriminate force operation.

During rollout, Metamorph must preserve durable organization-specific state
owned by Nucleus or Batcave and must replace only the approved application
artifact boundary. It must not modify a local Roles projection as an incidental
effect of installing a binary or application package.

If a future software version requires a migration of the local Roles
projection, that migration must be separately approved, explicit, versioned,
recoverable, and performed by the component that owns the representation or
through an approved contract with that component. The migration must preserve
organization binding, remote provenance, accepted version, and revocation
semantics; it cannot create or alter organizational authority.

The current Metamorph files relevant to this boundary are:

| File | Current relevance | Permitted direction under this requirement |
|---|---|---|
| `installer/metamorph/internal/maintenance/rollout.go` | Defines the rollout command, selects components, and coordinates lifecycle and results | May coordinate installation and health verification; must not become a Roles-state synchronization or authorization path |
| `installer/metamorph/internal/maintenance/rollout_batcave.go` | Implements the organization-scoped Batcave application rollout and preserves configuration, data, logs, environment, and unknown legacy state outside the replaceable application boundary | May strengthen preservation and recovery of durable state; must not write or interpret the Nucleus Roles projection |
| `installer/metamorph/internal/maintenance/rollout_windows.go` | Implements Windows-specific lifecycle behavior used by rollout | May participate only when an approved software update requires Windows-specific stop, replacement, recovery, or health behavior |
| `installer/metamorph/internal/maintenance/rollout_other.go` | Implements the corresponding non-Windows lifecycle boundary | Must retain equivalent software-lifecycle semantics without introducing a platform-specific Roles authority path |

No modification to these files is authorized by this requirement. The table is
an implementation-impact inventory for a later, specifically approved change.
The file or store that will hold Nucleus's local Roles projection is not yet
approved and therefore is deliberately not named here.

## 8. Required synchronized artifact properties

Whatever transport and schema are ultimately approved, the state consumed by
Nucleus must be:

- **organization-bound:** it cannot be replayed into another organization;
- **source-authenticated:** Nucleus can verify who produced it;
- **integrity-protected:** modification is detectable;
- **versioned:** newer and older organizational states are distinguishable;
- **ordered or conflict-detectable:** out-of-order delivery cannot restore old
  authority silently;
- **revocable:** removal or suspension can become effective locally;
- **time-aware:** issue, validity, and expiry are explicit;
- **auditable:** source, delivery, acceptance, and local application are
  traceable;
- **idempotent:** replaying the same version does not duplicate effects;
- **reconcilable:** Nucleus can compare local consumed state with remote truth;
- **fail-closed where required:** missing or unverifiable authority does not
  become permission.

The synchronized state may eventually take the form of a snapshot, signed
manifest, versioned projection, event stream, or combination. This document does
not choose among them.

## 9. Synchronization modes that require design

### 9.1 Initial bootstrap

The first local association with an organization must establish:

- the organization identity;
- the remote trust anchor;
- the actor's verified relationship;
- the first accepted role-state version;
- the point after which local authorization can begin.

The current local `.master` bootstrap cannot be assumed to be the final
corporate authority model.

### 9.2 Full reconciliation

Nucleus must be able to request or receive a complete current projection and
compare it with the locally consumed version. This is necessary after a new
installation, corruption, prolonged disconnection, or a detected version gap.

### 9.3 Incremental synchronization

Routine assignments, suspensions, and role changes may require incremental
delivery. The design must prevent gaps and support recovery through a full
reconciliation.

### 9.4 Revocation propagation

Revocation is more urgent than ordinary role additions. The design must define:

- maximum acceptable propagation delay;
- what happens to active sessions and pending work;
- whether sensitive operations require freshness confirmation;
- how local components learn that a previously valid assignment is no longer
  valid;
- how acknowledgement is recorded.

### 9.5 Offline behavior

Offline operation must be an explicit policy, not an accidental consequence of
cached state.

Possible classes to investigate include:

- operations forbidden without fresh organizational state;
- bounded low-risk operations allowed under an unexpired snapshot;
- read-only observation;
- emergency operation under a separately approved and audited mechanism.

No offline permission model is approved here.

## 10. Local representation is a consumed projection, not the source

Nucleus may need local materialization for availability, performance, and
enforcement. If it exists, it must be treated as:

```text
verified projection of remote organizational truth
```

and not as:

```text
independent local organizational role tree
```

The local representation must carry enough evidence to determine:

- organization;
- source;
- version;
- issued and accepted timestamps;
- validity/freshness;
- integrity verification result;
- reconciliation state.

Editing a local projection must not create organizational authority.

## 11. Effective local authorization

After consuming verified state, Nucleus evaluates the requested action using all
applicable boundaries:

```text
remote organizational identity/membership/assignment
∩ local active organization
∩ exact requested action and target
∩ role scope and validity
∩ Nucleus policy
∩ Gravity constraints
∩ Vault credential rules
∩ Executor execution limits
∩ environment and resource boundaries
= local authorization decision
```

AITAP may select among permitted alternatives but does not create authority.
Brain may execute governed cognitive work but does not assign roles. Core,
Conductor, Alfred, ADK, and other consumers must not use UI state or local
assumptions as a substitute for the Nucleus decision.

## 12. Separation from Gravity collision handling

The organizational role state and Gravity collision analysis may share the same
remote platform, tenant isolation, identity foundation, and audit capabilities.
They remain different contracts:

```text
Roles and assignments  → who may act, where, and in what capacity
Gravity                → which criteria constrain the action
Gravity collision      → which applicable postures conflict
```

A Gravity posture cannot grant permission that the actor does not possess. A
role cannot make an otherwise applicable Gravity constraint disappear. Any
exception must be explicit, authorized, scoped, and auditable.

## 13. Blocker for Organization and Nucleus design

Organization and Nucleus cannot be considered complete in their corporate role
dimension until the participating Works agree on:

1. remote source-of-truth ownership;
2. identity and organization tenancy;
3. role-definition and assignment semantics;
4. synchronization path;
5. verification and versioning;
6. revocation and offline behavior;
7. local projection ownership;
8. Nucleus authorization query and decision record;
9. integration boundaries with Gravity, Vault, Executor, and consumers.

This blocker does not prohibit unrelated development. It prevents local role
markers, UI fields, or provisional tables from being presented as the final
corporate authorization architecture.

## 14. Cross-Work responsibilities for the next investigation

### ROLES

- define the semantic requirements for identity, membership, roles,
  assignments, scopes, delegation, acceptance, and revocation;
- keep candidate job titles separate from approved system roles;
- define the questions that Genesis and onboarding must answer.

### BACKEND

- inventory current tenant, identity, database, API, event, and audit
  capabilities;
- propose storage and API options without implementing before approval;
- identify consistency, security, and revocation constraints.

### BATCAVE

- verify whether its current sovereign communication plane can transport
  organization-bound authorization state;
- document authentication, tenant isolation, replay protection, and delivery
  guarantees already present or absent.

### METAMORPH

- own only the software lifecycle of the Batcave and Nucleus components that
  implement the approved synchronization and authorization contracts;
- preserve organization-specific durable state while replacing only approved
  application artifact boundaries;
- reuse artifact manifests, integrity checks, staging, receipts, rollback, and
  service restoration for software deployment without treating them as proof
  of organizational authority;
- remain outside the ordinary propagation of mutable memberships, role
  definitions, assignments, and revocations;
- require separate approval for any future migration of the local Roles
  projection and delegate interpretation of that representation to its owning
  component.

### ADK

- identify how its actors or consumers obtain identity and organization context;
- document any authorization assumptions it currently makes;
- avoid defining a parallel role model.

### NUCLEUS

- define the requirements for consuming, verifying, storing, reconciling, and
  applying the remote projection;
- preserve Nucleus as the local organizational authorization decision point;
- identify migration implications for `.master`, `.specialist`,
  `.ownership.json`, and existing guards.

### GRAVITY

- define how applicable postures constrain an already authorized action;
- identify organization and role references needed for adoption, exception, and
  collision decisions without turning Gravity into a permission system.

## 15. Questions requiring collective agreement

1. What is the stable internal actor identity?
2. How is a GitHub identity linked and reverified?
3. Can an organization define custom roles, and from which permission catalog?
4. Which roles or permissions are built into Nucleus?
5. What are the valid scope types and inheritance rules?
6. Who may invite, assign, delegate, suspend, or revoke?
7. Does every assignment require acceptance by the assignee?
8. How are definition and assignment versions represented?
9. Is synchronization push, pull, or hybrid?
10. Which component carries the authoritative payload?
11. Which component verifies signature, version, and organization binding?
12. What freshness is required for sensitive operations?
13. What is the maximum revocation propagation delay?
14. What is permitted while disconnected?
15. How are active sessions and in-flight Mandates affected by revocation?
16. How does Nucleus expose the decision to local consumers?
17. How are authorization events audited remotely and locally?
18. How are Gravity adoption and exceptions authorized?
19. How does Genesis establish the first organization and initial authorities?
20. How are legacy local markers migrated without creating a privilege window?

## 16. Acceptance criteria for the discovery phase

The cross-Work discovery is complete only when it provides:

- a responsibility map confirmed by each participating Work;
- an inventory of existing Backend/Batcave/Metamorph synchronization mechanisms;
- a verified statement of which mechanisms can be reused unchanged;
- explicit gaps where new contracts are required;
- a proposed identity and tenancy model;
- a proposed role-definition and assignment model;
- a proposed synchronization sequence, including bootstrap and revocation;
- a proposed local Nucleus projection and verification contract;
- explicit online/offline behavior;
- conflict and failure scenarios;
- a list of exact files and schemas that would require later authorization;
- José Vigil's explicit approval before implementation.

## 17. Non-decisions

This requirement does not yet approve:

- database table names or schemas;
- API endpoint names;
- event names or topics;
- a snapshot or token format;
- a cryptographic mechanism;
- a polling or push interval;
- a Metamorph role-state synchronization or authorization responsibility beyond
  the software-lifecycle boundary established in section 7.1;
- a new Batcave service;
- an ADK authorization component;
- a final role catalog;
- `Architect`, CTO, analyst, or any other example as an implemented role;
- modification of `.ownership.json` or local markers;
- code changes in any participating Work.

## 18. Governing conclusion

The organizational role tree is remote organizational truth. Local Nucleus
consumes a trustworthy projection and combines it with the local context that
only Nucleus and its enforcement boundaries can evaluate.

This preserves both requirements:

```text
Corporate synchronization and user management require remote authority.
Local execution and resource access require local, contextual enforcement.
```

Neither side replaces the other. The next step is collective discovery across
ROLES, BACKEND, BATCAVE, METAMORPH, ADK, NUCLEUS, and GRAVITY before any schema
or implementation is approved.
