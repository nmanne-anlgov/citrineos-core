# Codebase Concerns

**Analysis Date:** 2026-03-26

## Critical Issues

**Graceful shutdown calls `process.exit(1)` unconditionally:**
- Issue: `shutdown()` in `Server/src/citrineOSServer.ts` (line 225) always calls `process.exit(1)` after a 2-second timeout, even on a clean shutdown. Exit code 1 signals failure. Container orchestrators (Kubernetes, Docker Swarm) will interpret this as a crash and may trigger restart loops or alarms.
- Files: `Server/src/citrineOSServer.ts` (line 223-226), `Server/src/index.ts` (lines 19, 25)
- Impact: Deployment platforms cannot distinguish clean shutdowns from crashes.
- Fix approach: Use `process.exit(0)` for clean shutdown; reserve `process.exit(1)` for actual errors. Consider removing the `setTimeout` wrapper entirely and letting the event loop drain.

**Race condition in charger connection registration:**
- Issue: `registerConnection()` in the OCPP router does not lock the database tables it reads/writes. A rapid connect-disconnect sequence can produce inconsistent state. The code itself acknowledges this with a TODO comment.
- Files: `03_Modules/OcppRouter/src/module/router.ts` (line 137)
- Impact: Under load, a charger that rapidly reconnects could end up with stale subscription state, missed messages, or duplicate registrations.
- Fix approach: Use a database transaction with row-level locking (Sequelize `transaction` with `lock: true`) or an application-level mutex keyed by station identifier.

**WebSocket server has no error recovery:**
- Issue: Both `_onError()` and `_onClose()` handlers in `WebsocketNetworkConnection` log the event but do nothing to recover. The TODO comments confirm recovery was never implemented.
- Files: `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` (lines 474-488)
- Impact: If the WebSocket server encounters a transient error or closes unexpectedly, it stays down permanently until the entire process is restarted.
- Fix approach: Implement reconnection logic with exponential backoff. The `CircuitBreaker` class in `00_Base/src/interfaces/modules/CircuitBreaker.ts` exists but is not used by this component.

**Untyped tenant module interface:**
- Issue: `ITenantModuleApi` has `deleteTenant(request: any): Promise<any>` -- both parameter and return type are `any`. This is a public module interface that other modules depend on.
- Files: `03_Modules/Tenant/src/module/interface.ts` (line 9)
- Impact: No compile-time type checking for tenant operations. Bugs surface only at runtime.
- Fix approach: Define proper request/response types and replace `any`.

## Technical Debt

**OCPP 2.1 protocol support is incomplete across most modules:**
- Issue: Multiple modules have handler methods that only support OCPP 2.0.1 and annotate OCPP 2.1 gaps with TODO comments. The system claims to handle 2.1 but many handlers fall through to 2.0.1 logic or are missing entirely.
- Files:
  - `03_Modules/Transactions/src/module/module.ts` (lines 429, 502) -- needs separate transaction/meter event handlers for 2.1
  - `03_Modules/EVDriver/src/module/module.ts` (line 503) -- authorize logic only handles 2.0.1
  - `03_Modules/Monitoring/src/module/module.ts` (line 201) -- needs separate handler for 2.1
  - `03_Modules/Reporting/src/module/module.ts` (line 248) -- same as Monitoring
  - `03_Modules/SmartCharging/src/module/module.ts` (line 514) -- GetCompositeSchedule for 2.1 missing
  - `03_Modules/Configuration/src/module/module.ts` (lines 420, 432, 685) -- config logic needs protocol-specific branching for 2.1
  - `00_Base/src/config/types.ts` (line 100) -- OCPP 2.1 config uses 2.0.1 enum types as placeholder
  - `00_Base/src/index.ts` (line 414) -- action results for 2.1 need expansion
- Impact: Chargers connecting with OCPP 2.1 may receive incorrect responses or miss protocol-specific behavior.
- Fix approach: Implement per-protocol handler dispatching or create 2.1-specific handler methods for each module. This is likely the largest body of work in the codebase.

**Tariff/cost calculation is a known workaround:**
- Issue: Both `CostCalculator` and the EVDriver authorize handler use a temporary tariff workaround. The cost model is a simple `pricePerKwh * totalKwh` calculation that does not support time-of-use, demand charges, or the OCPP 2.1 tariff specification.
- Files:
  - `03_Modules/Transactions/src/module/CostCalculator.ts` (line 50)
  - `03_Modules/EVDriver/src/module/module.ts` (line 483)
  - `03_Modules/Transactions/src/module/module.ts` (line 386)
- Impact: Incorrect billing for any deployment using complex tariff structures. OCPP 2.1 tariff messages cannot be properly handled.
- Fix approach: Implement the full OCPP 2.1 tariff specification. The type definitions already exist in `00_Base/src/ocpp/model/2.1/types/SetDefaultTariffRequest.ts` and `ChangeTransactionTariffRequest.ts`.

**`IAdminApi` interface is empty:**
- Issue: The OcppRouter admin API interface is defined as `export interface IAdminApi {}` with a TODO to add actual methods.
- Files: `03_Modules/OcppRouter/src/module/interface.ts` (line 6-9)
- Impact: No contract for admin operations; implementations can drift without compiler enforcement.
- Fix approach: Define the expected admin API methods based on current usage in the router module.

**Callback error handling is logged but not persisted:**
- Issue: When a call result callback fails, the error is only logged. The TODO acknowledges the need for a "failed invocations table" but it was never implemented. Additionally, call errors, send failures, and charger timeouts all need distinct callback handling.
- Files:
  - `00_Base/src/interfaces/modules/AbstractModule.ts` (line 240)
  - `00_Base/src/interfaces/modules/AbstractModule.ts` (line 301)
- Impact: Failed callbacks are silently lost. Operators have no way to detect or retry failed outbound integrations without parsing log files.
- Fix approach: Create a `FailedInvocation` model and repository. Store failed callbacks with retry metadata.

**`VariableAttribute` status filtering is broken:**
- Issue: The `status` query parameter in the DeviceModel repository does not work because statuses are stored in a separate `VariableStatuses` history table. The filter is applied to the wrong table.
- Files: `01_Data/src/layers/sequelize/repository/DeviceModel.ts` (lines 572-574)
- Impact: API consumers filtering by variable status get incorrect results (either all records or no filtering).
- Fix approach: Join `VariableStatuses` and use a subquery to get the latest status per variable, then filter on that.

**Uniqueness constraint on VariableMonitoring may not be enforced:**
- Issue: Code assumes `variableMonitorings[0]` returns the unique match, but adds a TODO questioning whether the DB constraint actually exists.
- Files: `01_Data/src/layers/sequelize/repository/VariableMonitoring.ts` (line 228)
- Impact: Duplicate variable monitoring records could accumulate silently, causing incorrect monitoring behavior.
- Fix approach: Verify the database schema has a unique constraint on the relevant columns. If not, add a migration.

**50+ TODO/FIXME comments across the codebase:**
- Issue: The codebase contains at least 50 TODO/FIXME markers indicating deferred work.
- Key categories:
  - OCPP 2.1 gaps (14 TODOs) -- see above
  - `personalMessage` handling (6 TODOs) -- `03_Modules/EVDriver/src/module/module.ts`, `03_Modules/Transactions/src/module/module.ts`
  - Error handling gaps (5 TODOs) -- `AbstractModule.ts`, `Certificates module`
  - Configuration refactoring (4 TODOs) -- `00_Base/src/config/types.ts`, `Configuration module`
  - WebSocket recovery (2 TODOs) -- `WebsocketNetworkConnection.ts`
- Impact: Deferred work accumulates and increases maintenance cost over time.

## Complexity Hotspots

**Module main files are excessively large:**
- Files and sizes:
  - `03_Modules/Configuration/src/module/module.ts` -- 1046 lines
  - `03_Modules/OcppRouter/src/module/router.ts` -- 1042 lines
  - `03_Modules/EVDriver/src/module/module.ts` -- 938 lines
  - `01_Data/src/layers/sequelize/repository/TransactionEvent.ts` -- 805 lines
  - `03_Modules/Transactions/src/module/module.ts` -- 781 lines
  - `Server/src/citrineOSServer.ts` -- 723 lines
  - `03_Modules/SmartCharging/src/module/module.ts` -- 680 lines
  - `02_Util/src/util/validator.ts` -- 672 lines
  - `00_Base/src/config/types.ts` -- 667 lines
  - `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` -- 629 lines
- Impact: Large files are hard to review, test, and modify without introducing regressions. The high git churn on these files (many are in the top 15 most-modified files) confirms they are pain points.
- Fix approach: Extract protocol-specific handlers into separate files (e.g., `module.2.0.1.ts`, `module.2.1.ts`). Extract service logic into dedicated service classes (some modules already do this -- e.g., `TransactionService.ts`, `BootNotificationService.ts`).

**High-churn files (most frequently changed):**
- `Server/src/index.ts` -- 151 revisions
- `01_Data/src/interfaces/repositories.ts` -- 125 revisions
- `03_Modules/Transactions/src/module/module.ts` -- 122 revisions
- `03_Modules/EVDriver/src/module/module.ts` -- 108 revisions
- `01_Data/src/layers/sequelize/repository/TransactionEvent.ts` -- 104 revisions
- `00_Base/src/config/types.ts` -- 104 revisions
- These files are simultaneously the largest and most changed -- a strong indicator of complexity that should be decomposed.

## Missing Capabilities

**Three modules have zero test coverage:**
- Issue: The Reporting, SmartCharging, and Tenant modules have no test directory and no test files.
- Files missing tests:
  - `03_Modules/Reporting/` -- no `test/` directory
  - `03_Modules/SmartCharging/` -- no `test/` directory
  - `03_Modules/Tenant/` -- no `test/` directory
- Impact: Changes to these modules have no automated safety net. The Tenant module manages multi-tenancy, which is a critical path.
- Fix approach: Prioritize tests for the Tenant module first (highest risk), then SmartCharging (complex domain logic), then Reporting.

**Overall test-to-source ratio is low:**
- Issue: 38 test files for 817 source files (4.6% coverage by file count). In the Modules directory specifically, 13 test files for 83 source files (15.7%).
- Impact: Most business logic changes rely on manual testing.
- Fix approach: Establish a policy requiring tests for new code. Focus test investment on the handler/module layer where business logic lives.

**No integration or end-to-end tests:**
- Issue: Beyond one Hubject integration test (`02_Util/test/certificate/client/Hubject.integration.test.ts`), there are no tests that exercise the full message flow from WebSocket to module to database.
- Impact: Protocol-level regressions can only be caught by connecting actual chargers or OCPP test tools (OCTT).
- Fix approach: Create integration tests that use in-memory SQLite and mock WebSocket connections to test the full OCPP message lifecycle.

**`eslint-disable` used to suppress entire files:**
- Issue: Two significant source files disable ESLint entirely with `/* eslint-disable */`:
  - `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` (629 lines)
  - `02_Util/src/util/swagger.ts`
- Impact: These files bypass all linting rules, allowing any code quality issue to pass silently.
- Fix approach: Fix the underlying lint violations and remove the blanket disable. Use targeted `eslint-disable-next-line` for specific justified cases.

**Swagger setup uses `console.log` for debug output:**
- Issue: `02_Util/src/util/swagger.ts` uses `console.log` to print authorization tokens and debug info instead of the structured `tslog` logger used elsewhere.
- Files: `02_Util/src/util/swagger.ts` (lines 32, 128, 133)
- Impact: Sensitive tokens may appear in production logs in an unstructured format. Inconsistent with the project's logging strategy.
- Fix approach: Replace `console.log` calls with the `tslog` logger instance. Remove or mask token logging.

**CircuitBreaker uses `console.log` instead of injected logger:**
- Issue: The `CircuitBreaker` class uses `console.log` for state change notifications instead of accepting a logger dependency.
- Files: `00_Base/src/interfaces/modules/CircuitBreaker.ts` (line 57)
- Impact: State change events cannot be filtered, structured, or routed through the centralized logging pipeline.
- Fix approach: Accept an `ILogObj` logger in the constructor and use it for state change notifications.

## Dependency Risks

**`aws-sdk` v2 is used alongside `@aws-sdk/client-s3` v3:**
- Issue: Both AWS SDK v2 (`aws-sdk@^2.1692.0` in `02_Util/package.json`) and AWS SDK v3 (`@aws-sdk/client-s3@3.750.0` in `00_Base/package.json`) are dependencies. AWS SDK v2 entered maintenance mode in 2023 and is approaching end-of-life.
- Impact: Duplicated AWS client code increases bundle size. v2 will stop receiving security patches.
- Fix approach: Migrate all AWS SDK v2 usage to v3 modular clients and remove the `aws-sdk` dependency from `02_Util/package.json`.

**`@types/sequelize@4.28.20` is outdated:**
- Issue: The Data layer uses `@types/sequelize@4.28.20` which corresponds to Sequelize v4 types, while `sequelize-typescript@2.1.6` depends on Sequelize v6. These types are mismatched.
- Files: `01_Data/package.json` (line 28)
- Impact: Type definitions may not match runtime behavior, causing false positive or negative type checks.
- Fix approach: Remove `@types/sequelize` and rely on the types bundled with the Sequelize package itself (Sequelize v6+ includes its own types).

**`sequelize-typescript@2.1.6` is outdated:**
- Issue: The latest `sequelize-typescript` is v2.1.6 (released 2023). The Sequelize ecosystem is moving toward Sequelize v7 which has built-in TypeScript support, making `sequelize-typescript` less necessary.
- Files: `01_Data/package.json` (line 31)
- Impact: May not receive security patches or compatibility fixes for newer Node.js versions.
- Fix approach: Evaluate Sequelize v7 migration when it reaches stable. In the meantime, ensure `sequelize-typescript` is compatible with the Node.js 24 requirement.

**Spurious root-level dependencies `audit` and `fix`:**
- Issue: The root `package.json` lists `"audit": "^0.0.6"` and `"fix": "^0.0.6"` as production dependencies. These are not imported anywhere in the codebase. `audit` is a micro-benchmarking library; `fix` is a FIX financial protocol library. Neither is relevant to an OCPP server.
- Files: `package.json` (root, `dependencies` section)
- Impact: Unnecessary dependencies increase `node_modules` size and introduce potential supply chain risk. These packages have very low download counts and may not be well-maintained.
- Fix approach: Remove both packages from `dependencies`.

**Node.js >=24.4.1 is a bleeding-edge requirement:**
- Issue: The `.nvmrc` and `package.json` `engines` field require Node.js v24.4.1+. As of the analysis date, Node.js 24 is a current (non-LTS) release.
- Files: `.nvmrc`, `package.json`
- Impact: Contributors and CI environments must use very recent Node.js versions. Some dependencies may not have been tested with Node 24.
- Fix approach: Consider whether Node.js 22 LTS compatibility is feasible for wider contributor support.

## Performance Concerns

**`AbstractModuleApi` schema processing may be slow:**
- Issue: A TODO at line 413 of `AbstractModuleApi.ts` questions whether unknown keys can be removed from JSON schemas for performance rather than processing them at runtime.
- Files: `00_Base/src/interfaces/api/AbstractModuleApi.ts` (line 413)
- Impact: Every API request processes the full schema, including keys that are never used. At high request volumes, this is unnecessary CPU work.
- Fix approach: Pre-process schemas at startup to remove unknown keys, cache the result.

**Large barrel export files:**
- Issue: `00_Base/src/index.ts` (550 lines), `01_Data/src/index.ts` (85+ lines with TODO), and the OCPP enum/type index files (1000+ lines) re-export everything. Any import from these packages causes the entire barrel to be evaluated.
- Files: `00_Base/src/index.ts`, `00_Base/src/ocpp/model/2.1/enums/index.ts` (1398 lines), `00_Base/src/ocpp/model/2.1/index.ts` (535 lines)
- Impact: Increased startup time and memory usage, especially in microservice configurations where only a subset of exports is needed.
- Fix approach: Consider direct path imports for hot paths (`import { X } from '@citrineos/base/ocpp/model/2.1/types/...'`). This requires adding `exports` field to `package.json`.

## Upgrade Path Concerns

**OCPP 2.1 migration is partially complete:**
- Issue: The codebase is in a transitional state between OCPP 2.0.1 and 2.1. Type definitions exist for 2.1, but handler logic in most modules still assumes 2.0.1 semantics. Handler registration uses version lists (e.g., `OCPP_2_VER_LIST`) that include 2.1, so 2.1 messages are routed to 2.0.1 handlers.
- Impact: This is the single biggest upgrade concern. Until all modules implement 2.1-specific handlers, the system cannot reliably serve 2.1 chargers.
- Fix approach: Audit each module's handler registrations. For handlers that differ between 2.0.1 and 2.1, create separate handler methods. For handlers that are identical, explicitly document that they are protocol-version-agnostic.

**Monorepo workspace versioning is tightly coupled:**
- Issue: All workspace packages share the exact version `1.8.3`. This means any change to any package requires bumping the version of all packages. Internal dependencies use exact versions (e.g., `"@citrineos/base": "1.8.3"`).
- Files: `package.json` (root), all workspace `package.json` files
- Impact: A small fix to one module triggers a version bump across the entire monorepo. This complicates independent deployability and semantic versioning.
- Fix approach: Consider using `workspace:*` protocol for internal dependencies (npm workspaces support this). Version packages independently if they have different release cadences.

**Configuration schema (`SystemConfig`) is a single monolithic type:**
- Issue: `00_Base/src/config/types.ts` (667 lines) defines one large `SystemConfig` type via Zod that covers all modules, all OCPP versions, and all deployment configurations. A TODO at line 23 acknowledges the need to refactor.
- Files: `00_Base/src/config/types.ts`
- Impact: Every module depends on the full config schema even if it only uses a small subset. Changes to config require careful coordination across all modules.
- Fix approach: Break config into module-specific schemas that compose into the full `SystemConfig`. Each module should define and export its own config schema.

## Test Coverage Gaps

**Modules with no tests:**
- What's not tested: Reporting module (`03_Modules/Reporting/`), SmartCharging module (`03_Modules/SmartCharging/`), Tenant module (`03_Modules/Tenant/`)
- Files: All `module.ts`, `services.ts`, `MessageApi.ts`, `DataApi.ts` files in those modules
- Risk: The SmartCharging module has complex schedule/profile calculation logic (680 lines). The Tenant module handles multi-tenancy resolution. Both are high-risk areas to leave untested.
- Priority: High

**No tests for the Server package:**
- What's not tested: `Server/src/citrineOSServer.ts` -- server initialization, module wiring, shutdown logic
- Files: `Server/src/citrineOSServer.ts`, `Server/src/index.ts`, `Server/src/config/index.ts`
- Risk: Configuration loading, module initialization order, and shutdown behavior are all untested. The Server `package.json` test script just echoes an error.
- Priority: High

**WebSocket connection management is untested:**
- What's not tested: `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` (629 lines, eslint disabled)
- Risk: WebSocket upgrade, ping/pong, connection lifecycle, and error handling are all critical path code with no tests.
- Priority: High

**Data layer repositories have minimal tests:**
- What's not tested: Most repository files in `01_Data/src/layers/sequelize/repository/` (DeviceModel.ts at 596 lines, TransactionEvent.ts at 805 lines) have no dedicated tests. Only `ChargingStationSequence.test.ts` exists for the data layer.
- Risk: ORM query construction, data mapping, and constraint enforcement are largely untested.
- Priority: Medium

---

*Concerns audit: 2026-03-26*
