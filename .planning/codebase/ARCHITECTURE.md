# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Modular Monolith with optional microservice decomposition

**Key Characteristics:**
- TypeScript npm workspaces monorepo with numbered layer prefixes enforcing dependency direction
- Modules communicate asynchronously via RabbitMQ message broker, not direct method calls
- Can run as a single process ("all" mode) or decompose into separate services per module
- Decorator-driven handler registration and API endpoint exposure using `reflect-metadata`
- Multi-tenant architecture with tenant-scoped data via Sequelize schemas

## Layers

**00_Base (`@citrineos/base`):**
- Purpose: Define all core interfaces, abstract classes, OCPP protocol types, and configuration schemas. This is the contract layer.
- Location: `00_Base/src/`
- Contains: Interfaces (`IModule`, `ICache`, `IMessageSender`, `IMessageHandler`, `IMessageRouter`, `IAuthenticator`, `IFileStorage`, `IModuleApi`), abstract classes (`AbstractModule`, `AbstractMessageRouter`, `AbstractMessageHandler`, `AbstractMessageSender`, `AbstractModuleApi`), OCPP message types/schemas for versions 1.6, 2.0.1, and 2.1, decorators (`@AsHandler`, `@AsMessageEndpoint`, `@AsDataEndpoint`), config schemas (Zod), `CrudRepository` base class, and `OCPPValidator`.
- Depends on: Nothing internal (only external libs: zod, ajv, tslog, reflect-metadata, uuid)
- Used by: Every other package

**01_Data (`@citrineos/data`):**
- Purpose: Data access layer. Defines repository interfaces and their Sequelize implementations, plus all database models.
- Location: `01_Data/src/`
- Contains: Repository interfaces in `01_Data/src/interfaces/repositories.ts`, Sequelize model definitions in `01_Data/src/layers/sequelize/model/`, repository implementations in `01_Data/src/layers/sequelize/repository/`, and the `RepositoryStore` aggregator in `01_Data/src/layers/sequelize/repository/RepositoryStore.ts`. Also contains OCPP version-specific data mappers in `01_Data/src/layers/sequelize/mapper/`.
- Depends on: `@citrineos/base`
- Used by: `@citrineos/util`, all modules, `@citrineos/server`

**02_Util (`@citrineos/util`):**
- Purpose: Infrastructure implementations for the interfaces defined in `00_Base`.
- Location: `02_Util/src/`
- Contains: Message broker implementations (RabbitMQ sender/receiver in `02_Util/src/queue/rabbit-mq/`, Kafka sender/receiver in `02_Util/src/queue/kafka/`), cache implementations (MemoryCache in `02_Util/src/cache/memory.ts`, RedisCache in `02_Util/src/cache/redis.ts`), file storage implementations (LocalStorage, S3Storage, GcpCloudStorage in `02_Util/src/files/`), WebSocket network connection in `02_Util/src/networkconnection/WebsocketNetworkConnection.ts`, authentication filters (chain of responsibility) in `02_Util/src/networkconnection/authenticator/`, API auth providers (OIDC, local bypass) in `02_Util/src/authorization/provider/`, certificate authority services in `02_Util/src/certificate/`, validators and utilities.
- Depends on: `@citrineos/base`, `@citrineos/data`
- Used by: All modules, `@citrineos/server`

**03_Modules (9 modules):**
- Purpose: Business logic for OCPP functional domains. Each module handles a subset of OCPP call actions.
- Location: `03_Modules/{ModuleName}/src/module/`
- Contains: A `module.ts` (extends `AbstractModule`), message API classes per OCPP version (`2.0.1/MessageApi.ts`, `1.6/MessageApi.ts`), a `DataApi.ts` for CRUD REST endpoints, an `interface.ts` for the module's API interface, and domain-specific service classes.
- Depends on: `@citrineos/base`, `@citrineos/data`, `@citrineos/util`
- Used by: `@citrineos/server`

**Server (`@citrineos/server`):**
- Purpose: Application entry point. Composes all modules, initializes infrastructure, starts Fastify HTTP server and WebSocket servers.
- Location: `Server/src/`
- Contains: `index.ts` (main entry), `citrineOSServer.ts` (composition root), config loading in `Server/src/config/`, environment-specific configs in `Server/src/config/envs/`.
- Depends on: All other packages
- Used by: Nothing (top of dependency chain)

## Data Flow

**Inbound OCPP Message (Charging Station -> CSMS):**

1. Charging station connects via WebSocket to `WebsocketNetworkConnection` (`02_Util/src/networkconnection/WebsocketNetworkConnection.ts`)
2. Authentication chain processes the connection upgrade: `UnknownStationFilter` -> `ConnectedStationFilter` -> `NetworkProfileFilter` -> `BasicAuthenticationFilter` (chain of responsibility in `02_Util/src/networkconnection/authenticator/`)
3. Raw OCPP JSON message arrives on WebSocket, parsed by `MessageRouterImpl` (`03_Modules/OcppRouter/src/module/router.ts`)
4. Router validates message via `OCPPValidator`, determines the target `EventGroup` from the OCPP action, and publishes to the appropriate RabbitMQ queue via `RabbitMqSender`
5. The target module's `RabbitMqReceiver` picks up the message from its subscribed queue
6. `AbstractModule.handle()` (`00_Base/src/interfaces/modules/AbstractModule.ts`) validates the payload, then dispatches to the appropriate `@AsHandler`-decorated method via `reflect-metadata` lookup
7. Handler method processes business logic using injected repositories, then calls `sendCallResult()` or `sendCallError()` to respond
8. Response flows back through RabbitMQ to the router, then out via WebSocket to the charging station
9. `WebhookDispatcher` (`03_Modules/OcppRouter/src/module/webhook.dispatcher.ts`) notifies any registered webhook subscriptions

**Outbound OCPP Message (CSMS -> Charging Station):**

1. External system calls a REST endpoint exposed by a module's `MessageApi` (e.g., `TransactionsOcpp201Api`)
2. `@AsMessageEndpoint` decorator routes the HTTP request through `AbstractModuleApi._addMessageRoute()` (`00_Base/src/interfaces/api/AbstractModuleApi.ts`)
3. API handler calls `module.sendCall()` which validates the payload and publishes to RabbitMQ
4. Router receives the message, serializes it as an OCPP Call, and sends via WebSocket through `networkHook`
5. When the charging station responds, the response flows back through the inbound path

**Data API Request (REST CRUD):**

1. External system calls a data endpoint exposed by a module's `DataApi`
2. `@AsDataEndpoint` decorator routes the HTTP request through `AbstractModuleApi._addDataRoute()`
3. Handler directly interacts with repository interfaces (e.g., `ITransactionEventRepository`, `ILocationRepository`)
4. Sequelize executes the query against PostgreSQL

**State Management:**
- Persistent state: PostgreSQL via Sequelize ORM with tenant-scoped schemas (`TenantContextManager` in `00_Base/src/interfaces/tenant.ts`)
- Ephemeral state: Redis or in-memory cache (`ICache` interface) for connection info, correlation IDs, boot status, callback URLs
- Connection state: `WebsocketNetworkConnection` maintains a `Map<string, WebSocket>` of active charging station connections

## Key Abstractions

**AbstractModule (`00_Base/src/interfaces/modules/AbstractModule.ts`):**
- Purpose: Base class for all OCPP functional modules. Manages message handler/sender lifecycle, OCPP message validation, and call/response dispatching.
- Pattern: Template method + decorator-driven dispatch. Subclasses declare handlers with `@AsHandler` decorator; `AbstractModule.handle()` uses `reflect-metadata` to find and invoke the right handler.
- Key methods: `handle()`, `sendCall()`, `sendCallResult()`, `sendCallError()`, `initHandlers()`

**CrudRepository (`00_Base/src/interfaces/repository.ts`):**
- Purpose: Abstract base for all data repositories. Extends Node.js `EventEmitter` to emit `created`, `updated`, `deleted` events on mutations.
- Pattern: Template method. Public methods delegate to `protected abstract _create()`, `_updateByKey()`, etc. implemented by `SequelizeRepository` (`01_Data/src/layers/sequelize/repository/Base.ts`).
- All repository methods require a `tenantId` parameter for multi-tenant isolation.

**RepositoryStore (`01_Data/src/layers/sequelize/repository/RepositoryStore.ts`):**
- Purpose: Aggregates all repository instances into a single injectable object. Created once during server initialization and individual repositories are passed to modules.
- Contains 20+ repository instances covering all domain entities.

**AbstractModuleApi (`00_Base/src/interfaces/api/AbstractModuleApi.ts`):**
- Purpose: Base class for module REST APIs. Automatically registers Fastify routes from `@AsMessageEndpoint` and `@AsDataEndpoint` decorators.
- Pattern: Decorator-driven route registration using `reflect-metadata`. Each module typically has a `MessageApi` (OCPP commands) and a `DataApi` (CRUD operations), with separate message APIs per OCPP version (1.6, 2.0.1).

**MessageRouterImpl (`03_Modules/OcppRouter/src/module/router.ts`):**
- Purpose: Central message router that bridges WebSocket connections to RabbitMQ message queues. Handles OCPP Call/CallResult/CallError framing, routing by action type, and circuit breaker logic.
- Extends `AbstractMessageRouter` from `00_Base/src/interfaces/router/AbstractRouter.ts`

**OCPPValidator (`00_Base/src/interfaces/modules/OCPPValidator.ts`):**
- Purpose: Validates OCPP request/response payloads against JSON schemas using Ajv. Two instances exist: one for OCPP message validation (strict, no coercion) and one for Fastify HTTP schema compilation (with type coercion).

## Entry Points

**Server Main (`Server/src/index.ts`):**
- Location: `Server/src/index.ts`
- Triggers: `npm run start` or `node dist/Server/src/index.js`
- Responsibilities: Loads bootstrap config from env vars, loads system config from file storage, creates `CitrineOSServer` instance, calls `server.run()`

**CitrineOSServer (`Server/src/citrineOSServer.ts`):**
- Location: `Server/src/citrineOSServer.ts`
- Triggers: Instantiated by `Server/src/index.ts`
- Responsibilities: Composition root. Initializes all infrastructure (cache, DB, message broker, file storage), then based on `APP_NAME` env var, initializes either all modules + router ("all"), just the router ("router"), just modules ("modules"), or a single specific module.

**Deployment Modes (controlled by `APP_NAME` env var and `EventGroup` enum):**
- `all`: Single process with WebSocket server + all modules (monolith mode)
- `router`: Only the WebSocket server / OCPP router (for microservice decomposition)
- `modules`: All modules without WebSocket server (for microservice decomposition)
- `certificates`, `configuration`, `evdriver`, etc.: Individual module as separate service

## Error Handling

**Strategy:** OCPP-aware error handling with automatic CallError responses

**Patterns:**
- `OcppError` class (`00_Base/src/ocpp/rpc/message.ts`) wraps OCPP error codes (FormatViolation, NotSupported, InternalError, etc.)
- `AbstractModule.handle()` catches errors in handler methods and automatically sends `CallError` responses to charging stations for request messages
- `CircuitBreaker` (`00_Base/src/interfaces/modules/CircuitBreaker.ts`) protects RabbitMQ connections from cascading failures. Used in both `RabbitMqSender` and `RabbitMqReceiver`.
- `RetryMessageError` signals that a message should be retried (nacked in RabbitMQ)
- Ajv validation errors are caught and converted to `OcppError` with `FormatViolation` error code

## Communication Patterns

**Between Modules:**
- Modules do NOT call each other directly
- All inter-module communication goes through RabbitMQ message queues
- Each module subscribes to queues based on its `EventGroup` and configured request/response actions
- Queue naming: `{eventGroup}_requests` and `{eventGroup}_responses` (e.g., `transactions_requests`)
- Messages are filtered by `MessageOrigin` (cs = charging station, csms = management system) and `MessageState` (Request, Response)

**Module to Router:**
- Modules send responses/requests through `RabbitMqSender` -> RabbitMQ -> `MessageRouterImpl` (via `RabbitMqReceiver`)
- Router sends messages to charging stations via `networkHook` (bound to `WebsocketNetworkConnection.sendMessage()`)

**External to System:**
- REST API via Fastify HTTP server (message endpoints and data endpoints)
- WebSocket connections from charging stations (OCPP 1.6, 2.0.1, 2.1 subprotocols)
- Webhook subscriptions for outbound notifications (`WebhookDispatcher`)
- GraphQL via Hasura (sits directly on PostgreSQL, configured via `Server/hasura-metadata/`)

## Cross-Cutting Concerns

**Logging:** tslog (`Logger<ILogObj>`). Parent logger created in `CitrineOSServer.initLogger()`, sub-loggers created in each component via `logger.getSubLogger({ name: this.constructor.name })`. Supports pretty (dev) and JSON (cloud) output modes. Log level configurable via `SystemConfig.logLevel`.

**Validation:** Two-layer validation. OCPP messages validated by `OCPPValidator` using Ajv against JSON schemas. HTTP request bodies validated by Fastify's schema compiler (also Ajv, but with type coercion). Configuration validated by Zod schemas.

**Authentication:**
- WebSocket connections: Chain of responsibility pattern with four filters (`UnknownStationFilter`, `ConnectedStationFilter`, `NetworkProfileFilter`, `BasicAuthenticationFilter`) composed via `Authenticator` class in `02_Util/src/networkconnection/authenticator/Authenticator.ts`
- REST API: Fastify plugin-based auth via `apiAuthPluginFp` in `02_Util/src/authorization/ApiAuthPlugin.ts`. Supports OIDC (`OIDCAuthProvider`) or local bypass (`LocalBypassAuthProvider`).

**Multi-Tenancy:** Row-level tenant isolation. All `CrudRepository` methods require `tenantId`. Tenant IDs are derived from WebSocket connection identifiers via `createIdentifier(tenantId, stationId)`. Tenant schema naming: `tenant_{tenantId}` (see `TenantContextManager`). WebSocket servers can have static tenant assignment or dynamic tenant resolution.

**Configuration:** Two-phase config. `BootstrapConfig` (database, file access) loaded from environment variables at startup. `SystemConfig` (modules, protocols, auth, caching) loaded from file storage (local/S3/GCP) or created from defaults. Config can be hot-reloaded via data API endpoints.

---

*Architecture analysis: 2026-03-26*
