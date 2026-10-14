# BitcoinWalk admin UX audit and optimisation plan

Prepared 14 October 2026. Recommendation: improve task discovery, recovery and shared controls before cosmetic polish. Keep the existing authorization, signing and verification boundaries.

## Scope and evidence

This is an audit and implementation proposal, not an implementation or deployment. It covers all 31 `/admin` page definitions, their redirects, and the principal shared screens and components in checkout `BitcoinWalk-bw117`, commit `5c8bf30`. The production `/admin` login was inspected visually and through its accessibility tree while signed out. Authenticated findings below come from source inspection; authenticated end-to-end behaviour, mobile devices and deployed/source parity still require testing.

The `better-ui` and `emil-design-eng` skills inform the component, interaction and accessibility recommendations. The writing skill informs this repository report. No payments, signatures, messages, production settings or backlog statuses were changed.

## Main recommendation

Make the admin answer three questions immediately: **Which account am I using? What can I do here? What needs my attention next?** Today, access rules and navigation do not always agree, important recovery actions are missing or buried, and individual screens independently implement similar controls.

Keep one shared admin system. Adapt navigation and home-page tasks to capabilities, rather than building four disconnected dashboards. A person can be both an organizer and a sponsor. The super-admin can also sponsor or host a walk. Changing the visible workspace must never grant permissions.

### Proposed audience experience

| Audience | Home page | Main navigation and actions |
| --- | --- | --- |
| Participant | Chosen city, next walk, useful community links | Walks, Chat, Help; view details, directions, calendar link and join available chat. Keep Start a city secondary. Do not imply RSVP or attendance history exists. |
| Organizer or delegated host | Next walk, cities they can manage, outstanding setup tasks | My cities, Walks, Chat, Help; Add a walk, edit an occurrence, resume city setup. Delegated hosts only see actions their grants allow. |
| Sponsor | Sponsorships and their next actions | Sponsorships, Walks, Help; identify the sponsored walk, upload/review asset status, preview placement and find payment history. |
| Super-admin | Prioritized review queue and exceptions | Requests, Cities, Walks, Sponsors, People, Content, Operations. Separate routine reviews from infrastructure controls. |

Use the current profile/avatar components and clearly identify the active signer. Offer a compact workspace switcher only when a person has multiple relevant capabilities. Keep the existing account connection methods; make returning-account connection the primary login path and new-account creation secondary.

City selection should be local to the task, consistent and URL-addressable. Do not reintroduce a mandatory global city selector: it creates ambiguity on multi-city and global screens. Reuse the same CityFinder and city-context presentation everywhere, automatically selecting a sole eligible city.

## Findings ordered by impact

High findings block acceptance of the redesigned experience. They do not imply the current site must be taken offline. Source risks that need runtime confirmation are identified explicitly.

### Task access and recovery

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | [Dashboard policy](../src/domain/dashboard.ts), [shell](../src/components/dashboard-shell.tsx) | Sponsor routes permit connected users, but the Sponsor navigation entry is super-admin-only. The role model has no sponsor capability. | Expose Sponsorships to sponsors and provide a discoverable entry for other eligible users; support overlapping capabilities. | A permitted workspace should not require knowing its URL. |
| HIGH | [Overview](../src/app/admin/page.tsx), [walks](../src/app/organizer/events/_screen.tsx) | Members receive organizer-focused guidance. Empty walks tell users to choose Add a walk even when that control is unavailable to them. | Role-aware home and empty states, with one available next action. | Participants otherwise reach an apparent dead end. |
| HIGH | [Shell](../src/components/dashboard-shell.tsx) | Directory discovery failure advises disconnect/reconnect; the associated status is inside the overview-only profile area. | Persistent, unobtrusive connection/data status on every admin route, with scoped retry and retained last-known data. | Users must distinguish unavailable data from missing permission without losing their work. |
| HIGH | [City editor](../src/app/organizer/_screen.tsx), [inventory](../src/domain/organizer-city-inventory.ts), overview | Overview tells needs-changes submitters to update and resubmit, while a non-editable city can say approval is required before editing. | Define an explicit correction path and show the actual review reason. Reconcile the copy with permitted operations; test an unapproved needs-changes submission. | Instructions must not send users into a circular approval dependency. Any permission change needs separate backend review. |
| HIGH | [Sponsor assignments](../src/app/admin/sponsors/page.tsx) | Existing timestamps populate `datetime-local` via UTC `toISOString()`, then save through local-time parsing. | Consistent named timezone, round-trip-safe conversion and a human-readable review. | Source indicates an unchanged edited value can shift outside UTC. Verify with non-UTC regression tests. |
| HIGH | [Chat](../src/app/admin/chat/page.tsx) | Draft state is shared across room selection; new messages force scrolling to the bottom. An error asks users to refresh chat without a visible dedicated retry action. | Room-keyed drafts/attachments, explicit room context, new-message indicator while reading history, reconnect control. | Avoid accidental cross-room messages and disruptive reading. Confirm the full switch/send sequence in runtime. |

### Shared controls and accessibility

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | [City moderation](../src/components/city-moderation.tsx) | Review navigation explicitly requests smooth scrolling without a reduced-motion check. | Respect reduced motion, expand the target, move focus appropriately and use a stable city anchor. | Navigation must remain accessible without forced motion. |
| MEDIUM | [CityFinder](../src/components/city-finder.tsx), [SponsorPicker](../src/components/sponsor-picker.tsx) | Sponsor selection inherits city-specific accessible labels and empty copy. Active options are not scrolled into view; ArrowDown handling can skip the first result on opening. | Shared domain-neutral combobox with entity-specific labels, correct keyboard entry and visible active option. | Reuse should preserve meaning and keyboard usability. |
| MEDIUM | Walk editor, [relay setup](../src/components/city-directory-requests.tsx), ownership transfer | City selection mixes searchable finders and native city dropdowns; alias search differs by caller. | CityFinder everywhere a geographic city is selected, with consistent aliases and permission-scoped results. | Users learn one selection pattern; large inventories remain usable. Small fixed enums can stay native selects. |
| MEDIUM | [People tabs](../src/app/admin/organizers/page.tsx), sponsor tabs, operations navigation | Independent tab implementations; organizer ARIA tabs lack complete relationships and keyboard behaviour; sponsor tabs repeat the Sponsors label at nested levels. | One Tabs component or ordinary navigation links, correctly chosen for the interaction. Persist relevant view in the URL. | Predictable keyboard, back-button and deep-link behaviour. |
| MEDIUM | [Walk route](../src/app/admin/walks/page.tsx), walk screen | Route and embedded screen both render `main`. | One main landmark, one page heading and consistent section hierarchy. | Better assistive navigation and clearer page structure. |
| MEDIUM | [Shell styles](../src/components/dashboard-shell.module.css) | Blanket section/article styles create nested bordered cards; generic button styling does not communicate action importance. | Explicit PageSection, Card and ActionButton variants; remove blanket styling gradually. | Reduce visual noise without rewriting every screen. |

### Task presentation and feedback

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | [Pro setup](../src/app/admin/pro-setup/screen.tsx), [signer setup](../src/components/city-signer-setup.tsx) | Artwork, payout, signer and services occupy a long screen before the checklist; existing paid users see upgrade language. | Resumable checklist first, one expanded next step, completed details collapsed; Resume setup or Manage Pro according to state. | Make progress legible without hiding necessary signatures. |
| MEDIUM | Pro setup | Community visibility confirmation names Armada even for a Walkie Talkie action; technical states are presented directly. | Surface-specific confirmation and plain-language status, with technical detail available separately. | People should know exactly what they are authorizing. |
| MEDIUM | [Requests](../src/components/requests-screen.tsx), [activation review](../src/components/city-brand-review.tsx) | Separate stacked queues, repeated Requests headings, independently loaded counts. Unknown activation count can appear as zero in the shell aggregate. | Unified queue presentation with typed filters and complete/loading/partial counts; retain separate action handlers. | Zero must mean checked and empty, not not-yet-loaded. |
| MEDIUM | City moderation and [identity health](../src/components/city-identity-health.tsx) | Health/cleanup blocks precede city work; identity-request links lose city context; archive actions use Delete terminology. | Search and selected-city summary first, contextual next actions, city-filtered requests, accurate Archive labels and a separate danger area. | Reduce navigation and avoid confusing archival with deletion. |
| MEDIUM | [Sponsor workspace](../src/app/admin/sponsors/workspace.tsx), [payments](../src/components/sponsor-payments.tsx) | Good city/sponsor grouping exists, but sponsor-facing copy calls it a hidden page; raw payment data and recovery details dominate. | Keep grouping; lead with walk, placement, asset status, preview and next action. Put receipts and technical identifiers in Details. | Sponsors care about whether their branding is live and what remains to do. |
| MEDIUM | [Guide](../src/app/admin/guide/page.tsx), [invitation acceptance](../src/app/admin/accept-invitation/page.tsx) | Guide is a placeholder; invitation page asks to connect/view after the shell has connected. | Honest Help/Guide entry; auto-load the invitation after authentication and explicitly show target identity. | Avoid empty destinations and duplicate connection steps. |
| MEDIUM | [Content](../src/app/admin/content/page.tsx), city and sponsor forms | Page/feature management is long; reload can overwrite operation feedback. City-switch discard prompts do not establish actual dirty state. | Separate Pages/Features, preview before publishing, durable success notice, actual dirty tracking and recoverable drafts. | Feedback should describe the completed action, and warnings should be meaningful. |
| LOW | Shared navigation and menus | Hover treatments are not consistently restricted to hover-capable devices; visual density and secondary action presentation vary. | Shared spacing, focus, hover and action-menu rules. | Polish follows task and accessibility fixes, rather than obscuring them. |

## Unified component approach

Build on existing components rather than replacing the entire UI framework.

| Component family | Reuse or change | Contract |
| --- | --- | --- |
| CityFinder and other entity pickers | Extract a neutral searchable-combobox core; preserve CityFinder and SponsorPicker as adapters. | Explicit label, description, aliases, loading/error/empty states, clear label, keyboard navigation and permitted results. ChatRoomPicker includes Global without pretending it is a city. |
| AdminShell and PageHeader | Retain shared session and authorization model. | Consistent title, environment indicator, account, primary action, breadcrumbs where needed and visible data health. |
| AsyncState and StatusBadge | Consolidate ad hoc loading/error/success paragraphs. | Distinguish loading, empty, partial, stale, failure, saved, awaiting review and independently verified. Never equate signed with active. Errors use alerts; routine progress uses polite status announcements. |
| TaskCard and SetupChecklist | Reuse identity-health concepts in home, city details and Pro setup. | What is complete, what is waiting, who acts next and one direct action. |
| ActionButton and ReviewAction | Shared primary, secondary and danger variants plus operation lifecycle. | Target, acting account, consequences and expected signatures; busy/duplicate-submit protection; success only at the correct verification boundary. |
| Tabs and filters | Reusable navigation tabs and separate segmented filters. | URL state for shareable views; proper keyboard and ARIA semantics for local tabs. |
| NostrUser and account identity | Keep existing avatar/name resolution. | Human-readable identity with copyable npub in details; fallback and wrong-account recovery. Public city branding must not reveal a private organizer identity. |
| WalkSummary and WalkEditor | Reuse LocationPicker, RichDescriptionEditor and existing schedule preview. | City timezone, consistent date/status/actions, preserved draft, explicit publish review. |
| AssetPreview | Extend existing sponsor preview components. | Separate uploaded, approved, generated and applied states; correct walk target, restore default and visible expiry. Preserve automatic sponsor OG expiry 12 hours after walk start. |

Use orange for the main action, neutral surfaces and dark readable text; preserve the purple admin favicon. Status always includes words, not colour alone. Use one icon family and explicit labels for unfamiliar actions. Target at least 44-pixel mobile controls and visible keyboard focus. Keep surfaces shallow: page, section, then disclosure—not a border around every nested article.

For motion, use a consistent 150ms ease-out press treatment around scale 0.96 where appropriate; no bounce. Frequent filtering and tab changes should be immediate. Respect reduced motion, gate hover effects to hover-capable devices, and do not animate critical status changes for decoration.

## Route coverage and target treatment

All paths below are prefixed with `/admin`. Redirects count as routes, not additional product screens.

| Routes | Target treatment |
| --- | --- |
| root | Capability-aware home and returning-account login. |
| `/walks` | Shared CityFinder; All/Upcoming/Past and permitted drafts; guided Details → Schedule → Review/sign. Preserve the fact that browser recurrence drafts are not automatic scheduling. |
| `/my-cities` | Organizer city profile, next walk and setup tasks; clear separation between city defaults and individual walk details. |
| `/cities` | Super-admin searchable inventory and selected-city details; contextual health actions, archived disclosure and safe moderation. |
| `/requests` | One review workspace with typed queues and city context; do not merge distinct authorization semantics. |
| `/upgrade` | State-aware Pro setup; existing branded identity reuse prominent; payout and signer recovery handled explicitly. |
| `/pro-setup` | Preserve compatibility redirect and relevant city/query context. Current direct redirect drops that context. |
| `/sponsor`, `/sponsors` | Choose one canonical Sponsorships URL while retaining the alias; audience-aware workspace. Admin Cities/Sponsors grouping remains. |
| `/sponsors/upload`, `/sponsors/logos`, `/sponsors/payments` | Legacy redirects should land on the relevant tab/action, not an undifferentiated start page. Preserve safe context. |
| `/organizers` | People workspace with directory, editors, invitations and publishing-access views; global suspension clearly distinguished from a city-level action. |
| `/accept-invitation` | Load after connection; target-account, expiry and permission summary before acceptance. |
| `/chat` | City/Global room picker, room-specific drafts, connection recovery and stable history reading. Respect Armada feature visibility and shared Walkie Talkie routing. |
| `/guide` | Replace placeholder with honest Help/Guide information or remove from primary navigation until useful; do not imply a functioning DM inbox. |
| `/content` | Pages and Features views, preview and explicit publishing feedback. |
| `/directory` | Contextual city service setup; advanced relay handovers/rehearsals separated from ordinary organizer tasks. |
| `/monitoring`, `/monitoring/alerts`, `/alerts` | Canonical Operations → Alerts, retain aliases; human city names plus detailed identifiers, active navigation and actionable failures. |
| `/monitoring/relays`, `/monitoring/chats` | Technical operations views with status, affected cities, next action and details; preserve staged provisioning/activation safeguards. |
| `/madeira-pilot` | Explicit staging/test-only utility; excluded from normal navigation and production user flows. |
| `/calendar`, `/hosting`, `/approvals`, `/moderation`, `/editors`, `/invitations`, `/appearance` | Preserve legacy redirects to current workspaces; test query/hash and city context, and remove stale internal links. |

## Implementation sequence

### Phase one Restore discoverability and reliable recovery

Fix sponsor navigation, participant empty states, global connection feedback and the needs-changes recovery path. Correct date conversion and room-scoped chat drafts. Add the missing retry controls and reduced-motion handling.

Acceptance: each audience reaches its primary task without a hidden URL; failed reads show retry rather than false absence; sponsor date edits round-trip in UTC, Madeira and a daylight-saving timezone; switching chats cannot carry an attachment into the wrong room unnoticed.

### Phase two Establish shared primitives through Walks

Introduce the shared picker, action, feedback, tabs and page-layout contracts. Migrate Walks as the first complete vertical slice. Add keyboard tests to the underlying components before migrating other callers. Remove blanket card CSS only as screens adopt explicit layouts.

Acceptance: one city-selection implementation; aliases and keyboard work consistently; a host can select a city, draft, preview, sign and confirm a walk while a participant sees no unauthorized editing affordances. Browser back/refresh retains appropriate filter context.

### Phase three Simplify Cities Requests and Pro setup

Connect city health to filtered Requests and a resumable setup checklist. Put one next action above completed detail. Existing-city identity migration must not create a redundant account. Keep personal payout private; show old destination active until replacement verification completes. Keep identity readiness distinct from who signs walk events.

Acceptance: test basic, paid-complete, paid-incomplete, legacy-paid, needs-changes, archived and staging-only cities. Every state has a truthful explanation and either an authorized action or the person it is waiting for.

### Phase four Complete sponsor and supporting workspaces

Expose sponsor self-service; simplify assignment/asset/placement status and preview. Apply shared patterns to People, Content, invitations, Help and Operations. Preserve explicit permissions, public moderation reasons, exact-event signing and deployment boundaries.

Acceptance: sponsor can find its walk and asset state; admin can review a logo, preview the resulting image, see whether it is applied, restore the default and understand automatic expiry. No UI-only status claims replace provider/relay verification.

### Phase five Validate and roll out

Stage changes by coherent workflow rather than a single admin rewrite. Test with participant, single-city organizer, multi-city organizer, delegated host, sponsor-only, organizer-plus-sponsor and super-admin identities. Release after authenticated staging acceptance, then smoke-test the same flows in production without unnecessary writes.

Test matrix:

- Widths 360, 390, 768 and 1440 pixels; 200% zoom; long city/sponsor names and translated dates.
- Keyboard-only navigation, focus restoration, combobox option visibility, screen-reader labels, reduced motion and touch hover behaviour.
- Browser extension and NIP-46; Android/GrapheneOS with Amber. No account creation required for an existing signer.
- Empty, loading, stale, partial and unavailable data; signer change, cancelled signature, expired request, duplicate click and interrupted publish.
- Safe unsaved-change navigation and draft restoration; no sensitive destination or signer secret in URLs, screenshots or routine status messages.
- City-scoped permission enforcement remains server/relay verified; hiding an action is not authorization.
- Correct city links, legacy redirects, environment labels and feature-flag behaviour.

Use task completion, time to locate the next action, failed/abandoned flows and repeated support requests as outcome measures. Establish a baseline before setting improvement percentages; this audit has not measured those metrics.

## Backlog relationship and decision

Treat this as UX follow-up work, not a reason to reopen completed functionality indiscriminately. Relevant foundations include BW-44 unified admin, BW-74 reusable identity, BW-105 guided activation, BW-117 identity health, BW-99/BW-101 upgrade and payout workflows, and the sponsor work. Coordinate large-list behaviour with BW-69; keep Walkie Talkie/BW-125 separate from promises about the current web chat.

Recommended first implementation package: **phase one, followed by the shared component foundation and Walks vertical slice**. This fixes real access/recovery problems and establishes patterns before migrating the more sensitive paid-city workflows.

Audit verdict: **Block acceptance of the proposed polished admin experience until the HIGH findings are resolved and authenticated testing is complete.** This is not a production shutdown recommendation, a security audit or a claim that untested routes have passed.
