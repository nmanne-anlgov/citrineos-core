<!-- GSD:project-start source:PROJECT.md -->
## Project

**CitrineOS OCPP 2.1 V2X Discharge Testing**

A focused effort to validate and complete CitrineOS's CSMS-side support for OCPP 2.1 bidirectional power transfer (V2X discharge), enabling a charging station client to connect via WebSocket and execute a full V2X discharge flow. The deliverable is a gap analysis, any necessary fixes, and a working test setup with connection guide.

**Core Value:** A charging station client can connect to CitrineOS over OCPP 2.1 and successfully execute a V2X discharge session end-to-end.

### Constraints

- **Branch**: Must work on `feature/ocpp-2.1` branch — not main
- **Protocol**: OCPP 2.1 specifically (not 2.0.1 backward compatibility)
- **Environment**: Docker-based deployment
- **Scope**: Single flow (V2X discharge) — not full 2.1 feature coverage
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.8.2 - All application code across the monorepo
- Shell (bash) - `entrypoint.sh` for Docker container startup and DB strategy selection
- SQL - Database migrations in `migrations/`
## Runtime
- Node.js >= 24.4.1 (pinned in `.nvmrc`, `package.json` engines, Dockerfile, and CI workflows)
- ES Modules (`"type": "module"` across all packages)
- Target: ES2022
- Module resolution: NodeNext
- `verbatimModuleSyntax: true` in `tsconfig.build.json`
- npm (workspaces)
- Lockfile: `package-lock.json` present
## Frameworks
- Fastify 5.1.0 - HTTP server framework (`@citrineos/base` dependency)
- ws 8.17.1 - WebSocket server for OCPP charger connections (`Server/package.json`)
- Sequelize (via `sequelize-typescript` 2.1.6) - Database ORM (`01_Data/package.json`)
- `sequelize-cli` 6.6.2 - Database migrations (root `devDependencies`)
- Zod 4.1.12 - Configuration schema validation (`00_Base/package.json`)
- Ajv 8.17.1 - JSON Schema validation for OCPP messages and HTTP routes (`00_Base/package.json`)
- Vitest 3.2.4 - Test runner and framework (`00_Base/package.json`)
- `@vitest/coverage-v8` 3.2.4 - Code coverage (`00_Base/package.json`)
- Newman (installed globally in CI) - Postman collection runner for integration tests
- TypeScript 5.8.2 - Compilation via `tsc --build` with project references
- nodemon 3.1.7 - Dev server auto-restart (`Server/package.json`)
- ts-node 10.9.1 - TypeScript execution for scripts (`Server/package.json`)
- cross-env 7.0.3 - Cross-platform environment variable setting (`Server/package.json`)
## Key Dependencies
- `class-transformer` 0.5.1 - Object serialization/deserialization for OCPP messages
- `reflect-metadata` 0.1.13 - Decorator metadata support (required by Sequelize and class-transformer)
- `big.js` 6.2.1 - Precise decimal arithmetic (charging/billing calculations)
- `uuid` 9.0.1 - UUID generation for message IDs and entities
- `amqplib` ^0.10.7 - RabbitMQ client (primary message broker, required by default server)
- `kafkajs` 2.2.4 - Apache Kafka client (alternative message broker)
- `mqtt` 5.1.2 - MQTT client (listed as dependency, not yet wired into queue implementations)
- `redis` 4.6.6 - Redis client (optional, falls back to in-memory cache)
- `jsonwebtoken` ^9.0.2 - JWT verification for OIDC auth
- `jwks-rsa` ^3.2.0 - JWKS key retrieval for OIDC
- `jsrsasign` 11.0.0 - RSA/certificate signing operations
- `pkijs` 3.0.16 - PKI operations (X.509 certificate handling)
- `@peculiar/webcrypto` 1.4.6 - WebCrypto API polyfill
- `node-forge` 1.3.2 - TLS/SSL certificate handling (OcppRouter module)
- `acme-client` 5.3.0 - ACME protocol for Let's Encrypt certificate issuance
- `@aws-sdk/client-s3` 3.750.0 - AWS S3 / MinIO file storage
- `aws-sdk` ^2.1692.0 - Legacy AWS SDK (also in util)
- `@google-cloud/storage` 7.18.0 - GCP Cloud Storage
- `@faker-js/faker` 8.4.1 - Test data generation
- `json-schema-faker` ^0.5.8 - Generate mock data from JSON schemas
- `json-schema-to-typescript` 12.0.0 - Generate TS types from OCPP JSON schemas
- `json-schema-to-zod` 1.1.1 - Generate Zod schemas from JSON schemas
- `tslog` 4.9.2 - Structured logging (supports pretty and JSON output modes)
## Database & Storage
- PostgreSQL 16 with PostGIS 3.5 (Docker image: `postgis/postgis:16-3.5`)
- SQLite3 5.1.6 (`Server/package.json` dependency, for local development without PostgreSQL)
- Hasura GraphQL Engine v2.40.3 (Docker service, auto-discovers Postgres schema)
- MinIO (S3-compatible, Docker service for local development)
- AWS S3 (production via `@aws-sdk/client-s3`)
- GCP Cloud Storage (production via `@google-cloud/storage`)
- Local filesystem (default for development)
- Redis 4.6.6 client (optional, configurable via `util.cache.redis`)
- In-memory Map-based cache (default fallback: `MemoryCache` in `02_Util/src/cache/memory.ts`)
- Sequelize CLI migrations in `migrations/` directory
- Three DB strategies via `DB_STRATEGY` env var in `entrypoint.sh`:
## Monorepo Structure
| Package | Path | Version |
|---------|------|---------|
| `@citrineos/workspace` | `/` (root) | 1.8.3 |
| `@citrineos/base` | `00_Base/` | 1.8.3 |
| `@citrineos/data` | `01_Data/` | 1.8.3 |
| `@citrineos/util` | `02_Util/` | 1.8.3 |
| `@citrineos/certificates` | `03_Modules/Certificates/` | 1.8.3 |
| `@citrineos/configuration` | `03_Modules/Configuration/` | 1.8.3 |
| `@citrineos/evdriver` | `03_Modules/EVDriver/` | 1.8.3 |
| `@citrineos/monitoring` | `03_Modules/Monitoring/` | 1.8.3 |
| `@citrineos/ocpprouter` | `03_Modules/OcppRouter/` | 1.8.3 |
| `@citrineos/reporting` | `03_Modules/Reporting/` | 1.8.3 |
| `@citrineos/smartcharging` | `03_Modules/SmartCharging/` | 1.8.3 |
| `@citrineos/tenant` | `03_Modules/Tenant/` | 1.8.3 |
| `@citrineos/transactions` | `03_Modules/Transactions/` | 1.8.3 |
| `@citrineos/server` | `Server/` | 1.8.3 |
## Infrastructure & Deployment
- Docker multi-stage build (`Server/Dockerfile`)
- Docker Compose for local development (`Server/docker-compose.yml`)
- GitHub Container Registry (GHCR): `ghcr.io/citrineos/citrineos-server`
- Multi-platform builds: `linux/amd64`, `linux/arm64`
- `.github/workflows/unit-tests.yml` - Vitest unit tests on PR
- `.github/workflows/test-build-server.yml` - Docker build + Newman integration tests on PR
- `.github/workflows/lint.yml` - ESLint on PR
- `.github/workflows/license-check.yml` - REUSE license compliance check on PR
- `.github/workflows/publish-swagger.yml` - Generate and publish Swagger JSON on push to main
- `.github/workflows/push-release-tagged-server.yml` - Build and push Docker image on version tags (`v*.*.*`)
| Port | Service |
|------|---------|
| 8080 | Fastify HTTP API (central system) |
| 8081 | WebSocket server (OCPP 2.0.1, security profile 0) |
| 8082 | WebSocket server (OCPP 2.0.1, security profile 1) |
| 8083 | WebSocket server (OCPP 2.1, security profile 0) |
| 8092 | WebSocket server (OCPP 1.6, security profile 0) |
| 8443 | WebSocket server (OCPP 2.0.1, TLS security profile 2) |
| 8444 | WebSocket server (OCPP 2.0.1, mTLS security profile 3) |
| 9229 | Node.js debugger |
| 10000-10500 | Dynamic websocket servers |
## Development Tools
- ESLint 9.16.0 with flat config (`eslint.config.js`)
- Prettier 3.2.5 (`.prettierrc`)
- Husky 9.1.7 - Git hook management
- lint-staged 15.4.3 - Run Prettier on staged `*.{js,ts,jsx,tsx,json,md}` files
- Renovate bot (`renovate.json`) - Automated dependency updates
- REUSE tool (Python) - SPDX license header checking
- Apache-2.0 license
## Configuration
- Loaded from environment variables prefixed with `BOOTSTRAP_CITRINEOS_`
- Validated with Zod schema in `00_Base/src/config/bootstrap.config.ts`
- Controls: database connection, file access type (local/s3/gcp), config file name
- Full application config stored as JSON file (`config.json`)
- Loaded from configured storage backend (local filesystem, S3, or GCP)
- Environment-specific defaults: `Server/src/config/envs/docker.ts`, `Server/src/config/envs/local.ts`
- Validated with `defineConfig()` in `00_Base/src/config/defineConfig.ts`
- `APP_NAME` - Module to run (`all`, `router`, `modules`, or specific module name)
- `APP_ENV` - Environment (`local`, `docker`)
- `DB_STRATEGY` - Database initialization strategy (`migrate`, `sync`, `force-sync`, `none`)
- `DEPLOYMENT_TARGET` - Set to `cloud` for JSON logging format
- `BOOTSTRAP_CITRINEOS_*` - Bootstrap config (database host, file access, etc.)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## File Header
## Naming Conventions
- PascalCase for classes and models: `AbstractModule.ts`, `TransactionService.ts`, `CostCalculator.ts`
- PascalCase for decorators: `AsHandler.ts`, `AsDataEndpoint.ts`, `AsMessageEndpoint.ts`
- camelCase for utility files: `parser.ts`, `validator.ts`, `swagger.ts`, `idGenerator.ts`
- `index.ts` barrel files in every directory for re-exports
- Interface files named `interface.ts` (lowercase) inside module directories
- Module entry point named `module.ts` (lowercase)
- PascalCase: `TransactionsModule`, `CostCalculator`, `SequelizeRepository`
- Abstract classes prefixed with `Abstract`: `AbstractModule`, `AbstractModuleApi`, `AbstractMessageHandler`
- Interfaces prefixed with `I`: `IModule`, `ICache`, `IMessageHandler`, `IAuthorizationRepository`
- Module classes suffixed with `Module`: `TransactionsModule`, `CertificatesModule`
- API classes suffixed with `DataApi` or `Ocpp201Api`: `TransactionsDataApi`, `TransactionsOcpp201Api`
- Service classes suffixed with `Service`: `TransactionService`, `StatusNotificationService`
- Repository classes prefixed with `Sequelize` and suffixed with `Repository`: `SequelizeAuthorizationRepository`
- Error classes suffixed with `Error`: `BadRequestError`, `NotFoundError`, `OcppError`
- camelCase: `sendCall`, `handleMessageApiCallback`, `validateOCPPRequest`
- Handler methods prefixed with `_handle`: `_handleTransactionEvent`, `_handleMeterValues`
- Private/protected members prefixed with underscore: `_config`, `_logger`, `_cache`
- Provider (factory) functions in tests use `a`/`an` prefix: `aTransaction()`, `anAuthorization()`, `aRequest()`
- camelCase: `stationId`, `tenantId`, `correlationId`
- Constants in UPPER_SNAKE_CASE: `AS_HANDLER_METADATA`, `METADATA_DATA_ENDPOINTS`, `DEFAULT_TENANT_ID`
- Static readonly constants in UPPER_SNAKE_CASE: `CALLBACK_URL_CACHE_PREFIX`, `MODEL_NAME`
- PascalCase for type aliases: `CallAction`, `OCPPVersionType`
- PascalCase with `EnumType` suffix for OCPP enums: `AuthorizationStatusEnumType`, `TransactionEventEnumType`
- Internal enums use `Enum` suffix without `Type`: `AuthorizationStatusEnum`, `IdTokenEnum`
## Packages & Namespacing
- `@citrineos/base` (`00_Base/`)
- `@citrineos/data` (`01_Data/`)
- `@citrineos/util` (`02_Util/`)
- `@citrineos/transactions` (`03_Modules/Transactions/`)
- `@citrineos/certificates` (`03_Modules/Certificates/`)
- `00_Base` - no internal dependencies
- `01_Data` - depends on `@citrineos/base`
- `02_Util` - depends on `@citrineos/base`
- `03_Modules/*` - depends on `@citrineos/base`, `@citrineos/data`, `@citrineos/util`
- `"type": "module"` (ESM)
- `"main": "dist/index.js"`
- `"types": "dist/index.d.ts"`
## Import Organization
- Use `import type { ... }` for type-only imports (enforced by `verbatimModuleSyntax: true` in tsconfig)
- All relative imports MUST include `.js` extension: `import { Foo } from './Foo.js'`
- Use `@citrineos/base`, `@citrineos/data`, `@citrineos/util` for cross-package imports
- Barrel exports via `index.ts` files using `export * from` or named re-exports
## Code Style
- Config: `.prettierrc`
- Single quotes: `true`
- Trailing commas: `all`
- Print width: `100`
- Semicolons: `true`
- Tab width: `2`
- Bracket spacing: `true`
- Arrow parens: `always`
- Config: `eslint.config.js` (flat config format)
- Extends: `@eslint/js` recommended + `typescript-eslint` recommended
- Prettier integration via `eslint-plugin-prettier` (formatting errors are ESLint errors)
- `@typescript-eslint/no-floating-promises`: `error` - all promises must be handled
- `@typescript-eslint/no-explicit-any`: `off` - `any` is allowed
- `@typescript-eslint/no-unused-vars`: `warn` with `_` prefix ignored
- `@typescript-eslint/no-empty-object-type`: `off`
## TypeScript Configuration
- `target`: ES2022
- `module`: NodeNext
- `moduleResolution`: NodeNext
- `strict`: true
- `experimentalDecorators`: true (required for `@AsHandler`, `@AsDataEndpoint`, etc.)
- `emitDecoratorMetadata`: true (required for `reflect-metadata`)
- `verbatimModuleSyntax`: true (enforces `import type`)
- `declaration`: true
- `sourceMap`: true
- Node.js >= 24.4.1 required
## Type Patterns
- `@AsHandler(protocols, action)` on `AbstractModule` methods - registers OCPP message handlers
- `@AsDataEndpoint(namespace, method, ...)` on API methods - registers REST data endpoints
- `@AsMessageEndpoint(action, schema, ...)` on API methods - registers REST message endpoints
- Sequelize decorators (`@Table`, `@Column`, `@BelongsTo`, etc.) on data models
- Define interface (`IModule`, `ICache`, `IMessageHandler`)
- Provide abstract class implementing interface (`AbstractModule`, `AbstractModuleApi`)
- Concrete implementations extend abstract class (`TransactionsModule extends AbstractModule`)
- `CrudRepository<T>` - generic CRUD repository base
- `SequelizeRepository<T extends Model>` - generic Sequelize repository
- `AbstractModuleApi<T extends IModule>` - generic API base
- `IMessage<T extends OcppRequest | OcppResponse>` - typed messages
- `Logger<ILogObj>` - tslog generic logger
- `OCPP1_6.*` for 1.6 types (e.g., `OCPP1_6.StatusNotificationRequest`)
- `OCPP2_0_1.*` for 2.0.1 types (e.g., `OCPP2_0_1.TransactionEventRequest`)
- `OCPP2_1.*` for 2.1 types (e.g., `OCPP2_1.TransactionEventEnumType`)
- Combined version lists via `OCPP_2_VER_LIST` for handlers supporting both 2.0.1 and 2.1
- Common OCPP 2.x types via `OCPP2_request_types` and `OCPP2_response_types`
## Error Handling
- Use `OcppError` class with `ErrorCode` enum for OCPP protocol errors
- `OcppError` includes `correlationId`, `ErrorCode`, message, and optional details
- Handler errors caught in `AbstractModule.handle()` which sends `CallError` responses
- `BadRequestError` (400) - extends `Error` with `statusCode` property at `00_Base/src/interfaces/api/exceptions/BadRequestError.ts`
- `NotFoundError` (404) - extends `Error` with `statusCode` property at `00_Base/src/interfaces/api/exceptions/NotFoundError.ts`
- Try/catch blocks with `this._logger.error(...)` for logging
- Errors re-thrown or converted to OCPP errors when in handler context
- Sequelize errors checked by name (e.g., `(error as any).name === 'SequelizeForeignKeyConstraintError'`)
- Fire-and-forget patterns use `.catch((error) => { this._logger.error(...) })` for non-critical operations
## Logging
- Type: `Logger<ILogObj>`
- Sub-loggers created via `logger.getSubLogger({ name: this.constructor.name })`
- Protected `_logger` field on all classes extending `AbstractModule`
- Log levels: silly, trace, debug, info, warn, error, fatal
- Module initialization: `this._logger.info('Initializing...')`
- Handler entry: `this._logger.debug('Transaction event received:', message, props)`
- Errors: `this._logger.error('Failed handling message: ', error, message)`
- Response confirmation: `this._logger.debug('Transaction response sent: ', messageConfirmation)`
## Common Patterns
- Interfaces defined in `01_Data/src/interfaces/repositories.ts`
- Implementations in `01_Data/src/layers/sequelize/repository/`
- Base class `SequelizeRepository<T>` at `01_Data/src/layers/sequelize/repository/Base.ts`
- All repository methods take `tenantId` as first parameter for multi-tenancy
- `{Module}DataApi` - CRUD operations on data (uses `@AsDataEndpoint`)
- `{Module}Ocpp201Api` - OCPP message sending (uses `@AsMessageEndpoint`)
- `src/module/2.0.1/MessageApi.ts` for version-specific API implementations
- Handler methods on the main module class use `@AsHandler([OCPPVersion.OCPP2_0_1], ...)` for version dispatch
## Comments
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- TypeScript npm workspaces monorepo with numbered layer prefixes enforcing dependency direction
- Modules communicate asynchronously via RabbitMQ message broker, not direct method calls
- Can run as a single process ("all" mode) or decompose into separate services per module
- Decorator-driven handler registration and API endpoint exposure using `reflect-metadata`
- Multi-tenant architecture with tenant-scoped data via Sequelize schemas
## Layers
- Purpose: Define all core interfaces, abstract classes, OCPP protocol types, and configuration schemas. This is the contract layer.
- Location: `00_Base/src/`
- Contains: Interfaces (`IModule`, `ICache`, `IMessageSender`, `IMessageHandler`, `IMessageRouter`, `IAuthenticator`, `IFileStorage`, `IModuleApi`), abstract classes (`AbstractModule`, `AbstractMessageRouter`, `AbstractMessageHandler`, `AbstractMessageSender`, `AbstractModuleApi`), OCPP message types/schemas for versions 1.6, 2.0.1, and 2.1, decorators (`@AsHandler`, `@AsMessageEndpoint`, `@AsDataEndpoint`), config schemas (Zod), `CrudRepository` base class, and `OCPPValidator`.
- Depends on: Nothing internal (only external libs: zod, ajv, tslog, reflect-metadata, uuid)
- Used by: Every other package
- Purpose: Data access layer. Defines repository interfaces and their Sequelize implementations, plus all database models.
- Location: `01_Data/src/`
- Contains: Repository interfaces in `01_Data/src/interfaces/repositories.ts`, Sequelize model definitions in `01_Data/src/layers/sequelize/model/`, repository implementations in `01_Data/src/layers/sequelize/repository/`, and the `RepositoryStore` aggregator in `01_Data/src/layers/sequelize/repository/RepositoryStore.ts`. Also contains OCPP version-specific data mappers in `01_Data/src/layers/sequelize/mapper/`.
- Depends on: `@citrineos/base`
- Used by: `@citrineos/util`, all modules, `@citrineos/server`
- Purpose: Infrastructure implementations for the interfaces defined in `00_Base`.
- Location: `02_Util/src/`
- Contains: Message broker implementations (RabbitMQ sender/receiver in `02_Util/src/queue/rabbit-mq/`, Kafka sender/receiver in `02_Util/src/queue/kafka/`), cache implementations (MemoryCache in `02_Util/src/cache/memory.ts`, RedisCache in `02_Util/src/cache/redis.ts`), file storage implementations (LocalStorage, S3Storage, GcpCloudStorage in `02_Util/src/files/`), WebSocket network connection in `02_Util/src/networkconnection/WebsocketNetworkConnection.ts`, authentication filters (chain of responsibility) in `02_Util/src/networkconnection/authenticator/`, API auth providers (OIDC, local bypass) in `02_Util/src/authorization/provider/`, certificate authority services in `02_Util/src/certificate/`, validators and utilities.
- Depends on: `@citrineos/base`, `@citrineos/data`
- Used by: All modules, `@citrineos/server`
- Purpose: Business logic for OCPP functional domains. Each module handles a subset of OCPP call actions.
- Location: `03_Modules/{ModuleName}/src/module/`
- Contains: A `module.ts` (extends `AbstractModule`), message API classes per OCPP version (`2.0.1/MessageApi.ts`, `1.6/MessageApi.ts`), a `DataApi.ts` for CRUD REST endpoints, an `interface.ts` for the module's API interface, and domain-specific service classes.
- Depends on: `@citrineos/base`, `@citrineos/data`, `@citrineos/util`
- Used by: `@citrineos/server`
- Purpose: Application entry point. Composes all modules, initializes infrastructure, starts Fastify HTTP server and WebSocket servers.
- Location: `Server/src/`
- Contains: `index.ts` (main entry), `citrineOSServer.ts` (composition root), config loading in `Server/src/config/`, environment-specific configs in `Server/src/config/envs/`.
- Depends on: All other packages
- Used by: Nothing (top of dependency chain)
## Data Flow
- Persistent state: PostgreSQL via Sequelize ORM with tenant-scoped schemas (`TenantContextManager` in `00_Base/src/interfaces/tenant.ts`)
- Ephemeral state: Redis or in-memory cache (`ICache` interface) for connection info, correlation IDs, boot status, callback URLs
- Connection state: `WebsocketNetworkConnection` maintains a `Map<string, WebSocket>` of active charging station connections
## Key Abstractions
- Purpose: Base class for all OCPP functional modules. Manages message handler/sender lifecycle, OCPP message validation, and call/response dispatching.
- Pattern: Template method + decorator-driven dispatch. Subclasses declare handlers with `@AsHandler` decorator; `AbstractModule.handle()` uses `reflect-metadata` to find and invoke the right handler.
- Key methods: `handle()`, `sendCall()`, `sendCallResult()`, `sendCallError()`, `initHandlers()`
- Purpose: Abstract base for all data repositories. Extends Node.js `EventEmitter` to emit `created`, `updated`, `deleted` events on mutations.
- Pattern: Template method. Public methods delegate to `protected abstract _create()`, `_updateByKey()`, etc. implemented by `SequelizeRepository` (`01_Data/src/layers/sequelize/repository/Base.ts`).
- All repository methods require a `tenantId` parameter for multi-tenant isolation.
- Purpose: Aggregates all repository instances into a single injectable object. Created once during server initialization and individual repositories are passed to modules.
- Contains 20+ repository instances covering all domain entities.
- Purpose: Base class for module REST APIs. Automatically registers Fastify routes from `@AsMessageEndpoint` and `@AsDataEndpoint` decorators.
- Pattern: Decorator-driven route registration using `reflect-metadata`. Each module typically has a `MessageApi` (OCPP commands) and a `DataApi` (CRUD operations), with separate message APIs per OCPP version (1.6, 2.0.1).
- Purpose: Central message router that bridges WebSocket connections to RabbitMQ message queues. Handles OCPP Call/CallResult/CallError framing, routing by action type, and circuit breaker logic.
- Extends `AbstractMessageRouter` from `00_Base/src/interfaces/router/AbstractRouter.ts`
- Purpose: Validates OCPP request/response payloads against JSON schemas using Ajv. Two instances exist: one for OCPP message validation (strict, no coercion) and one for Fastify HTTP schema compilation (with type coercion).
## Entry Points
- Location: `Server/src/index.ts`
- Triggers: `npm run start` or `node dist/Server/src/index.js`
- Responsibilities: Loads bootstrap config from env vars, loads system config from file storage, creates `CitrineOSServer` instance, calls `server.run()`
- Location: `Server/src/citrineOSServer.ts`
- Triggers: Instantiated by `Server/src/index.ts`
- Responsibilities: Composition root. Initializes all infrastructure (cache, DB, message broker, file storage), then based on `APP_NAME` env var, initializes either all modules + router ("all"), just the router ("router"), just modules ("modules"), or a single specific module.
- `all`: Single process with WebSocket server + all modules (monolith mode)
- `router`: Only the WebSocket server / OCPP router (for microservice decomposition)
- `modules`: All modules without WebSocket server (for microservice decomposition)
- `certificates`, `configuration`, `evdriver`, etc.: Individual module as separate service
## Error Handling
- `OcppError` class (`00_Base/src/ocpp/rpc/message.ts`) wraps OCPP error codes (FormatViolation, NotSupported, InternalError, etc.)
- `AbstractModule.handle()` catches errors in handler methods and automatically sends `CallError` responses to charging stations for request messages
- `CircuitBreaker` (`00_Base/src/interfaces/modules/CircuitBreaker.ts`) protects RabbitMQ connections from cascading failures. Used in both `RabbitMqSender` and `RabbitMqReceiver`.
- `RetryMessageError` signals that a message should be retried (nacked in RabbitMQ)
- Ajv validation errors are caught and converted to `OcppError` with `FormatViolation` error code
## Communication Patterns
- Modules do NOT call each other directly
- All inter-module communication goes through RabbitMQ message queues
- Each module subscribes to queues based on its `EventGroup` and configured request/response actions
- Queue naming: `{eventGroup}_requests` and `{eventGroup}_responses` (e.g., `transactions_requests`)
- Messages are filtered by `MessageOrigin` (cs = charging station, csms = management system) and `MessageState` (Request, Response)
- Modules send responses/requests through `RabbitMqSender` -> RabbitMQ -> `MessageRouterImpl` (via `RabbitMqReceiver`)
- Router sends messages to charging stations via `networkHook` (bound to `WebsocketNetworkConnection.sendMessage()`)
- REST API via Fastify HTTP server (message endpoints and data endpoints)
- WebSocket connections from charging stations (OCPP 1.6, 2.0.1, 2.1 subprotocols)
- Webhook subscriptions for outbound notifications (`WebhookDispatcher`)
- GraphQL via Hasura (sits directly on PostgreSQL, configured via `Server/hasura-metadata/`)
## Cross-Cutting Concerns
- WebSocket connections: Chain of responsibility pattern with four filters (`UnknownStationFilter`, `ConnectedStationFilter`, `NetworkProfileFilter`, `BasicAuthenticationFilter`) composed via `Authenticator` class in `02_Util/src/networkconnection/authenticator/Authenticator.ts`
- REST API: Fastify plugin-based auth via `apiAuthPluginFp` in `02_Util/src/authorization/ApiAuthPlugin.ts`. Supports OIDC (`OIDCAuthProvider`) or local bypass (`LocalBypassAuthProvider`).
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
