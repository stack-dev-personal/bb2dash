# Local interactive architecture map

[Floorplan](https://github.com/haydenschmitty/floorplan) builds a local, zoomable map of the codebase. This pass used upstream commit `70be3f40f9c2e061290b76027f180d9ff892edd6`, under its [MIT license](https://github.com/haydenschmitty/floorplan/blob/70be3f40f9c2e061290b76027f180d9ff892edd6/LICENSE). The inputs were its [`skills/floorplan/SKILL.md`](https://github.com/haydenschmitty/floorplan/blob/70be3f40f9c2e061290b76027f180d9ff892edd6/skills/floorplan/SKILL.md), scanner and build scripts, and the safe subset of this repository's source.

The map lives in the ignored `floorplan/` directory of `C:/Users/stack/projects/bb2dash-floorplan`. It is not a checked-in artifact. The stable overview is [architecture.md](architecture.md), with editable Mermaid sources in [diagrams/](diagrams/). The maintenance approach follows the local map guide in the separate `g-tee-oh-floorplan` analysis checkout, adapted to bb2dash's stricter data boundary.

This map describes source commit `81d28019c3e3f10762b84507fe521df3fbd71c7a` on the `docs/floorplan-architecture` branch. It is source analysis, not a configured development environment or a live production audit.

## Keep the analysis boundary

Floorplan reads tracked documentation and configuration as well as code. An `ignore` entry in `floorplan/architecture.json` changes what appears on the board. It does **not** stop the scanner from reading a file.

Run the scanner only in the dedicated sparse analysis checkout. Retain its exclusions before every scan, refresh or Ask session. Do not scan the original working checkout, vault or private data directories, and do not recover omitted files through git history.

The analysis excludes:

- `.env`, `.env.*` and `*.env` files, `.mcp.json`, credential files and secret directories;
- `.claude`, `.guard-private`, `.harness` and local cache material;
- course context, private course material, fixtures and database fixtures;
- `docs/inbox-decisions` and other private captured material.

For another analysis checkout, clone with `--no-checkout`, establish the sparse exclusions before materializing any files, and verify the resulting tree before scanning. Never copy credentials or course context into it. If the boundary expands, update the exclusions first. An ignored folder is not a privacy control.

Restricted material must never enter the map, its descriptions, session memory or a published artifact. If restricted material appears in an area that could be synced or ingested, stop and report it without moving or deleting it.

## Open the existing map

Open `C:/Users/stack/projects/bb2dash-floorplan/floorplan/index.html` directly in a browser to view the generated map locally. From the safe analysis checkout:

```powershell
Set-Location C:/Users/stack/projects/bb2dash-floorplan
Invoke-Item ./floorplan/index.html
```

Start with the tour, then follow a sync or a Workspace question. The map also supports starting from a screen or a file. Direct file viewing does not require an agent-enabled server.

The optional server adds the Ask connection:

```powershell
node floorplan/serve.mjs
```

Open the local URL it prints. The normal port is `4378`; it can select another free port. The server discovers signed-in Claude Code or Codex command-line tools. Using Ask invokes an agent through that account and may read source files. Keep the same sparse-checkout and data restrictions as this analysis. Do not publish or export the map to an external service without explicit authorization.

## Generate or refresh

Floorplan stays in a separate upstream clone at `C:/Users/stack/projects/floorplan`; this pass did not require a global plugin installation. Check the source revision and privacy exclusions before starting. These commands operate only on the safe analysis checkout:

```powershell
node C:/Users/stack/projects/floorplan/skills/floorplan/scripts/status.mjs C:/Users/stack/projects/bb2dash-floorplan
node C:/Users/stack/projects/floorplan/skills/floorplan/scripts/scan.mjs C:/Users/stack/projects/bb2dash-floorplan
```

A scan does not produce an explained architecture by itself. Follow the upstream schema and writing guide, inspect the source, and write `floorplan/architecture.json`. Add explicit connections for database queues, RPCs and scheduled work that the import scan cannot infer. Build, fill the description worksheets, then build again:

```powershell
node C:/Users/stack/projects/floorplan/skills/floorplan/scripts/build.mjs C:/Users/stack/projects/bb2dash-floorplan
node C:/Users/stack/projects/floorplan/skills/floorplan/scripts/describe.mjs C:/Users/stack/projects/bb2dash-floorplan
```

Descriptions belong in `floorplan/descriptions/`; every file and detected route should have one. `graph.json` and `index.html` are generated outputs. Edit `architecture.json` and the description files, then rebuild. Preserve user-authored map content when refreshing.

After code changes, ask the agent to **update the floorplan** in the safe checkout. Check out the intended source revision on a working branch and retain the exclusions first. For an existing map, use the upstream refresh workflow:

```powershell
node C:/Users/stack/projects/floorplan/skills/floorplan/scripts/refresh.mjs C:/Users/stack/projects/bb2dash-floorplan
```

Follow its next steps to describe new or flagged files, review module summaries and rebuild. The map does not track repository changes on its own. Do not add a personal agent-memory file as part of map maintenance without a separate request.

## Interpret the result

The source is the authority for the system's behavior. The scanner is a navigation aid:

- It detected no HTTP route definitions or matched HTTP calls at this baseline. Supabase database functions, table access, edge functions, MCP and browser automation still cross real interfaces. See the explicit flows in [architecture.md](architecture.md).
- A screen count does not establish complete route coverage. Inspect `web/src/app/` and the query modules for the actual page and data-access structure.
- SQL Health findings can describe a historical migration rather than the final policy. Review the later migrations, role grants and function checks before deciding that a boundary is open or closed.
- File counts and dependency edges describe the sparse tree. Omitted private files and fixtures were not analyzed.
- The scanner classifies two TypeScript files containing literal null characters as assets: [`units.ts`](../workspace-ingest/src/units.ts) and [`process-document.test.ts`](../workspace-ingest/test/process-document.test.ts). This map includes those source cards explicitly and excludes ordinary binary assets. Their import and symbol details are incomplete; explicit source edges preserve the validator and test connections.
- Container isolation and network rules were read from source. No running firewall, production schema, provider access or deployed service version was audited.

Use the Health view as a list of leads for source review, not as a security certification. Do not put secret values into descriptions or notes, even when explaining a finding.

### Health review at this baseline

The static findings were reviewed against the source available in the sparse checkout:

- Five secret warnings refer to synthetic test values or dummy verification values. Their values are not copied into this guide. This classification does not assess omitted credential files or production credentials.
- Fourteen table warnings miss the loop that enables row-level security in [`001_schema.sql`, lines 306 to 311](../db/migrations/001_schema.sql#L306), followed by the owner policies in [`020_rls_owner_scoped.sql`](../db/migrations/020_rls_owner_scoped.sql).
- Three anonymous-insert findings concern permissions superseded by [`049_bb_files_submissions.sql`, line 65](../db/migrations/049_bb_files_submissions.sql#L65), [`198_text_embeddings_anon_insert_drop.sql`, line 30](../db/migrations/198_text_embeddings_anon_insert_drop.sql#L30) and [`201_drop_bb_file_text_anon_insert.sql`, line 28](../db/migrations/201_drop_bb_file_text_anon_insert.sql#L28).

The fourth anonymous-insert finding is a retained source boundary: [`002_raw_landing.sql`, line 16](../db/migrations/002_raw_landing.sql#L16) allows anonymous inserts into `bb_raw`. The browser crawler uses this raw intake. Registered-run checks in [`136_transform_tick_register_first.sql`, lines 80 to 96](../db/migrations/136_transform_tick_register_first.sql#L80) constrain which runs fold into typed records, but they do not remove the intake permission. The restricted sync-runner database login is a separate control. Live grants and deployed fold behavior were not audited.

The map and Mermaid layouts could not be visually verified in this environment because browser access was unavailable. Source relationships and static consistency checks are separate from visual layout review.

## Maintain the diagrams

The architecture guide embeds the contents of these editable Mermaid files exactly:

- [system-overview.mmd](diagrams/system-overview.mmd)
- [sync-and-review.mmd](diagrams/sync-and-review.mmd)
- [workspace-request.mmd](diagrams/workspace-request.mmd)

Update each `.mmd` file and its matching Markdown block together. Check diagram syntax, render them for layout review, and check local links and source relationships before calling a refresh complete. Update the baseline SHA when the analyzed source changes. Diagram rendering can be done with an approved local Mermaid renderer; no production stack or database is needed.
