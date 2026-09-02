# BLOOM — Guide for Role Design and Creation v0.1

**Work:** ROLES  
**Status:** methodological guide for discovery and design; not an approved role catalog  
**Date:** 2026-09-02  
**Design authority:** José Vigil

## 1. Purpose

This guide establishes a cautious method for discovering, defining, reviewing,
and eventually materializing corporate roles in BTIPS/Bloom.

The system is not assumed to serve only a solo developer or a software team. A
Bloom organization may contain engineering, data analysis, research, security,
operations, governance, compliance, product, financial, or other domains. A
person may work locally on a software project, an `ANA` data-analysis project,
or another project category that the system supports in the future.

Consequently, roles must be designed from real responsibilities and governed
operations. They must not be inferred from job titles, existing enum names, or
the present limitations of the implementation.

This document provides a creation methodology. It does not:

- approve new roles;
- approve `Architect`;
- assign permissions to `ANA`;
- define a final authorization schema;
- authorize code, schema, or onboarding changes;
- allow a component to create its own local authority mechanism.

## 2. Starting truth

The material implementation currently recognizes `Master`, `Specialist`, and
`Unknown`. The broader corporate model remains incomplete. The evidence and
known gaps are consolidated in:

`docs/ROLES/BLOOM_ROLES_DISCOVERY_BASE_v0_1.md`.

Any future design must preserve these distinctions:

```text
Documented concept       is not necessarily an implemented role
Membership declaration  is not necessarily effective authority
Job title                is not necessarily a system role
Gravity criterion        is not permission
Technical capability     is not organizational authority
```

## 3. Core model: five separate questions

Every authorization decision must be able to answer five independent questions.

| Dimension | Question | Example |
|---|---|---|
| Identity | Who is acting? | authenticated person or approved system actor |
| Membership | To which organization does the actor belong? | Organization A |
| Role | In what governed capacity is the actor acting? | project reviewer |
| Scope | Where does that capacity apply? | ANA Project X, not the whole organization |
| Permission | What concrete operation is requested? | approve a dataset transformation |

Policies, Gravity, and technical boundaries are evaluated after those facts are
known. They may further restrict an action; they do not manufacture authority.

The conceptual decision is:

```text
verified identity
∩ active organizational relationship
∩ active role assignment
∩ permission included by the role
∩ target inside the assignment scope
∩ Nucleus policy
∩ applicable Gravity
∩ Vault/Executor/runtime limits
= effective authorization
```

## 4. A role belongs to a relationship, not globally to a person

A corporate actor can participate in multiple organizations and projects with
different responsibilities. The role should therefore be attached to:

```text
actor + organization + scope + role + validity period
```

Example:

```text
Person A
├── Organization Alpha
│   ├── Software Project: reviewer
│   └── ANA Project: data analyst
└── Organization Beta
    └── ANA Project: read-only external auditor
```

No role in one organization should silently confer authority in another.
Likewise, authority over one project must not imply access to every dataset,
repository, credential, Mandate, or production environment in the organization.

## 5. Design roles from operations, not titles

The first step is never to choose a name. The first step is to inventory the
operations that require governance.

Examples of operation families include:

- invite, accept, suspend, or remove a participant;
- define or assign a role;
- create, approve, sign, install, or revoke a Mandate;
- create or operate an Intent;
- review or promote a code change;
- read, transform, export, or delete a dataset;
- approve a data methodology or published conclusion;
- register or request access to a Vault credential;
- select an approved runtime/provider/model;
- authorize network or workspace access;
- create, adopt, except, promote, or revoke Gravity;
- inspect evidence or audit trails;
- operate in development, test, staging, or production.

Only after this inventory exists should related permissions be grouped into a
role that humans can understand.

## 6. Scope hierarchy

BTIPS may need authorization at several scopes. These scopes must not be treated
as automatically interchangeable.

| Scope | Governs | Typical boundary question |
|---|---|---|
| Organization | organization-wide identity, policy, and governance | May this actor change organizational policy? |
| Domain or business unit | a technical or functional area | May this actor govern all data-analysis projects? |
| Project | one governed project or project group | May this actor approve changes in ANA Project X? |
| Mandate | one strategic objective | May this actor propose, review, sign, or observe this Mandate? |
| Intent/Action | one bounded cognitive or operational action | May this actor execute this transformation? |
| Resource | dataset, credential, workspace, provider, network, tool | May this actor read this dataset or request this key? |
| Environment | development, test, staging, production | May this action affect production? |

A higher organizational position does not automatically mean unrestricted data
access. Corporate security can require an executive to have less direct access
to a sensitive dataset than the assigned analyst or custodian.

## 7. Built-in roles and organization-defined roles

The future model may require two categories, subject to explicit approval.

### 7.1 Built-in roles

Built-in roles would protect essential invariants that every organization must
understand consistently. Their names, minimum permissions, and restrictions
would be versioned by Nucleus and could not be silently redefined locally.

The current `Master` and `Specialist` names do not by themselves establish what
the final built-in catalog should be.

### 7.2 Organization-defined roles

Large organizations may need roles tailored to their structure, such as a data
methodology reviewer or a project-specific dataset custodian. A custom role must
be composed only from approved permissions and scopes. Creating a custom role
must not create a new permission or bypass a Nucleus invariant.

An organization-defined role therefore means:

```text
approved permissions grouped under an organization-controlled name
```

It must never mean:

```text
arbitrary code or component decides what the actor may do
```

## 8. Master and delegated administration

Master is currently the strongest implemented role, but a corporate model should
not require Master to manually assign every low-level permission.

A candidate governance pattern is:

```text
Master or superior organizational authority
├── approves the role catalog or approved templates
├── delegates bounded role-assignment authority
├── approves sensitive exceptions
├── can suspend or revoke delegated administration
└── remains subject to Nucleus invariants, Gravity, and separation of duties
```

This is a design direction, not an approved permission set.

Delegated administrators must only assign roles within their own approved scope.
For example, a project administrator could assign project contributors without
being able to create another Master, access Vault secrets, change organization
policy, or authorize production promotion.

## 9. Separation of duties

Corporate authorization should support operations that one person cannot
complete alone.

Examples:

```text
Mandate
proposer → reviewer → signer → executor → auditor

Data publication
analyst → methodology reviewer → data owner → publisher

Gravity adoption
author → evidence reviewer → organizational approver → local adoption record
```

Possible constraints include:

- an actor cannot approve their own proposal;
- two distinct approvals are required;
- a role combination is incompatible on the same target;
- authority expires after a fixed period;
- production requires stronger approval than development;
- emergency elevation is temporary, named, and audited;
- access to a secret is separate from authority to request an operation using it.

Master should not silently bypass these constraints. Nucleus remains the owner of
organizational authority and applies the approved rules to every actor.

## 10. Invitation and assignment lifecycle

A role assignment must not begin as an unverified row in `team_members[]`. A
corporate lifecycle needs explicit states. Exact names remain to be decided, but
the design must cover at least these facts:

```text
proposal/invitation created
→ intended identity identified
→ invitation delivered
→ identity proves control
→ participant accepts or rejects
→ assignment becomes active
→ assignment may be suspended, expire, change, or be revoked
```

Every transition should preserve:

- organization;
- actor identity;
- role definition and version;
- scope;
- assigning authority;
- accepting identity;
- timestamps and validity;
- reason or provenance;
- current status;
- audit history.

Removal from membership and revocation of effective authority must be connected.
Marking `active: false` is insufficient if local markers, sessions, credentials,
or delegated capabilities remain usable.

## 11. Candidate contracts for design review

The following templates are methodological aids. They are not approved schemas.

### 11.1 RoleDefinition

```yaml
role_id: stable identifier
display_name: human-readable name
purpose: why the role exists
version: definition version
category: built-in or organization-defined
allowed_permissions:
  - exact operation identifiers
allowed_scope_types:
  - organization | domain | project | mandate | action | resource | environment
assignable_by:
  - role or authorization condition
requires_acceptance: true
requires_approval:
  count: 1
  distinct_from_assignee: true
incompatible_roles:
  - role identifiers
maximum_validity: optional duration
constraints:
  - approved policy references
status: draft | approved | deprecated | revoked
```

### 11.2 RoleAssignment

```yaml
assignment_id: stable identifier
actor_id: verified identity reference
organization_id: organization
role_id: approved role definition
role_version: exact version
scope:
  type: project
  target_id: governed target
assigned_by: verified authority
accepted_by: verified assignee
valid_from: timestamp
valid_until: optional timestamp
status: pending | active | suspended | expired | revoked
reason: human-readable purpose
provenance: decision/signature references
```

The final contracts must be decided separately and must fit the reconciled
`.ownership.json` and Nucleus authorization design.

## 12. Permission matrix method

For each candidate role, build a matrix before assigning a name.

| Operation | Scope | Allow | Deny | Additional approval | Gravity/policy | Technical boundary |
|---|---|---:|---:|---|---|---|
| Example: read dataset | ANA Project X | candidate |  | data owner | privacy posture | filesystem/data service |
| Example: publish conclusion | organization |  | candidate | methodology reviewer + owner | evidence threshold | publication service |
| Example: request provider key | project | candidate |  | Vault policy | cost posture | Vault |

Rules:

1. Default to deny when no row covers the operation.
2. Use exact operations rather than broad labels such as “full access.”
3. Separate read, propose, modify, approve, sign, execute, publish, and revoke.
4. Separate the authority to request an action from the technical ability to
   perform it.
5. Record environment and resource sensitivity.
6. Test role combinations, not only roles in isolation.
7. Test removal, expiry, and organizational switching.

## 13. ANA and the analyst perspective

`ANA` demonstrates why the model cannot be developer-centric. A local analysis
project may contain datasets, transformations, notebooks, reports, conclusions,
provider usage, and potentially sensitive organizational information. Its
authorization needs differ from a software repository even when both use BTIPS.

Possible responsibilities to investigate include:

- defining an analytical objective;
- importing or linking a dataset;
- classifying data sensitivity;
- reading raw data;
- creating derived data;
- modifying a transformation;
- validating methodology;
- reviewing statistical or analytical conclusions;
- approving external publication;
- exporting data or results;
- requesting model/provider use;
- controlling retention and deletion;
- auditing provenance and reproducibility.

These responsibilities could eventually be grouped into roles such as analyst,
dataset custodian, methodology reviewer, or publisher. Those names are examples
for discovery only. They are not an approved ANA role catalog.

### 13.1 Example discovery matrix for ANA

| Responsibility | Analyst | Dataset custodian | Methodology reviewer | Organizational approver |
|---|---:|---:|---:|---:|
| Propose analysis | candidate |  |  |  |
| Read approved dataset | candidate | candidate | candidate if needed | not implied |
| Grant dataset access |  | candidate |  | possible escalation |
| Modify transformation | candidate |  |  |  |
| Validate methodology | cannot self-approve |  | candidate |  |
| Publish externally |  |  | review only | candidate |
| Delete source data |  | candidate with policy |  | possible additional approval |

This table is deliberately non-authoritative. It illustrates the questions that
must be answered before roles are created.

### 13.2 Data access is not implied by seniority

An organizational Master may administer assignments without automatically
receiving direct access to every dataset. Conversely, an analyst may have access
to a bounded dataset without gaining authority to invite members, alter Gravity,
sign Mandates, access production credentials, or export information.

The design must distinguish:

```text
authority over governance
authority over a project
access to data
authority to alter data
authority to publish conclusions
```

## 14. Relationship with ecosystem components

| Component | Role in authorization | Must not do |
|---|---|---|
| Nucleus | own organizational identity, role definitions, assignments, policy, and authorization decisions | distribute authority to local component-specific mechanisms |
| Gravity | contribute mandatory organizational criteria and constraints | grant a permission absent from the actor's role |
| Vault | protect credentials and decide credential access under explicit rules | expose secrets because a title sounds senior |
| Executor | enforce execution boundaries | decide organizational authority |
| Brain | execute governed cognitive work | infer permission from an Intent or job title |
| AITAP | select allowed runtime/provider/model alternatives and account for usage | create authority or bypass Nucleus limits |
| Core/Conductor | present actions and collect human decisions | treat UI visibility as authorization |
| Alfred | act through authorized channels and scopes | assign itself or a user greater authority |

Authorization should be queried from a single source in Nucleus. Each component
may enforce its technical boundary, but none may invent a role or permission.

## 15. Step-by-step role creation procedure

### Step 1 — Describe the governed outcome

State the organizational result that needs control. Do not name the role yet.

### Step 2 — Enumerate exact operations

Separate read, propose, change, approve, sign, execute, publish, delegate, and
revoke.

### Step 3 — Identify targets and scopes

List organizations, projects, Mandates, Intents, resources, datasets, and
environments affected.

### Step 4 — Identify risks

Consider data leakage, privilege escalation, self-approval, credential exposure,
cross-organization access, unauthorized promotion, and irreversible effects.

### Step 5 — Identify required separations

Decide which operations require another actor, another role, or multiple
approvals.

### Step 6 — Evaluate Gravity and policy

Identify applicable criteria and exceptions. Gravity can restrict an operation;
it cannot create the underlying authority.

### Step 7 — Propose permissions

Create an explicit allow/deny matrix. Anything absent remains denied.

### Step 8 — Propose assignment authority

Determine who may assign the role and within which scope. Prevent an assignment
administrator from delegating more authority than they possess.

### Step 9 — Define lifecycle

Specify invitation, proof, acceptance, activation, expiry, suspension, change,
and revocation.

### Step 10 — Test organizational scenarios

Test at minimum:

- one person with multiple roles;
- one person in multiple organizations;
- multiple Masters or equivalent authorities;
- absence of the highest authority;
- project transfer;
- organization switching;
- expired assignment;
- revoked member with an active session;
- conflicting roles;
- ANA data access without software permissions;
- developer permissions without dataset access;
- Gravity restriction against an otherwise permitted action.

### Step 11 — Review against existing contracts

Check BTIPS, Nucleus, onboarding, `.ownership.json`, Mandate, Gravity, Vault,
Executor, and UI surfaces. Report contradictions instead of resolving them by
inference.

### Step 12 — Obtain explicit design approval

José Vigil approves the role name, responsibility, permissions, scope,
assignment authority, lifecycle, and implementation files before materialization.

### Step 13 — Implement centrally and verify

Only after approval should Nucleus materialize the role and tests prove that
every consumer receives the same decision.

## 16. Review checklist

A candidate role is not ready unless every answer is explicit.

- [ ] Is the organizational purpose real and evidenced?
- [ ] Are permissions exact and default-deny?
- [ ] Is scope explicit?
- [ ] Is the role organization-specific where appropriate?
- [ ] Is assignment authority bounded?
- [ ] Must the assignee accept?
- [ ] Is identity verified?
- [ ] Are expiry and revocation defined?
- [ ] Are incompatible roles identified?
- [ ] Is self-approval prevented where necessary?
- [ ] Are data access and governance authority separated?
- [ ] Are Vault, network, workspace, provider, and production access independent?
- [ ] Is applicable Gravity identified without treating it as permission?
- [ ] Does organization switching preserve isolation?
- [ ] Is the audit trail durable?
- [ ] Is the role understandable to developers and non-developers?
- [ ] Has ANA or another non-software project type been considered?
- [ ] Has José explicitly approved the design?

## 17. Anti-patterns

Do not:

1. add a role directly to a Go enum before defining its contract;
2. infer permissions from a job title;
3. treat `.ownership.json` membership as effective authority without identity
   binding and acceptance;
4. make Master an unrestricted bypass around organizational policy;
5. use UI visibility as an authorization gate;
6. let Brain, Executor, AITAP, Alfred, or a project invent a local role;
7. grant data access because an actor has a senior organizational role;
8. grant production or Vault access through a broad “developer” permission;
9. let Gravity grant authority;
10. reuse a role across organizations without an explicit assignment in each;
11. preserve access after removal, expiry, or organization switching;
12. create roles only for software engineering when BTIPS supports broader work.

## 18. Decisions still required

This guide exposes, but does not decide:

1. the final built-in role catalog;
2. whether `Architect` exists and what responsibility would justify it;
3. whether organizations may define custom roles;
4. the canonical permission vocabulary;
5. the scope hierarchy and inheritance rules;
6. whether multiple Masters are allowed;
7. assignment, acceptance, signature, and revocation contracts;
8. separation-of-duty and multi-approval rules;
9. reconciliation of `.ownership.json`;
10. the single Nucleus authorization query and durable record;
11. the relationship between Synapse profile attributes and organizational role;
12. Gravity administration and adoption permissions;
13. ANA-specific operations, sensitivity classifications, and role candidates;
14. integration with Genesis questions and organization creation.

## 19. Continuity rule for Work ROLES

Future rounds should start from concrete organizational scenarios, including
software and non-software work. Each proposed role must be traceable to real
operations, risks, scopes, and approval requirements.

No role becomes architecture because it appears in an example, matrix, UI, old
document, or job description. It becomes part of BTIPS only after José Vigil
approves its contract and the implementation is verified consistently across
Nucleus and its consumers.
