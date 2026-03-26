# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
citrineos-core/
├── 00_Base/                          # Core interfaces, types, decorators, OCPP models
│   ├── src/
│   │   ├── assertion/                # Assertion utilities
│   │   ├── config/                   # Config schemas (Zod), bootstrap config, defineConfig
│   │   │   ├── bootstrap.config.ts   # BootstrapConfig schema & loader (from env vars)
│   │   │   ├── types.ts              # SystemConfig schema (modules, network, auth, etc.)
│   │   │   ├── ConfigStore.ts        # ConfigStoreFactory for file-based config
│   │   │   ├── defineConfig.ts       # Config validation/defaults
│   │   │   ├── BootConfig.ts         # Boot config for charging stations
│   │   │   └── signedMeterValuesConfig.ts
│   │   ├── interfaces/               # Core abstractions
│   │   │   ├── api/                  # AbstractModuleApi, decorators, auth interfaces
│   │   │   │   ├── AbstractModuleApi.ts    # Base class for REST APIs
│   │   │   │   ├── AsMessageEndpoint.ts    # Decorator: expose method as OCPP command endpoint
│   │   │   │   ├── AsDataEndpoint.ts       # Decorator: expose method as CRUD endpoint
│   │   │   │   ├── auth/                   # IApiAuthProvider, UserInfo, auth results
│   │   │   │   ├── exceptions/             # BadRequestError, NotFoundError
│   │   │   │   └── ModuleApi.ts            # IModuleApi interface
│   │   │   ├── cache/                # ICache interface, CacheNamespace enum
│   │   │   ├── files/                # IFileAccess, IFileStorage interfaces
│   │   │   ├── messages/             # IMessageHandler, IMessageSender, EventGroup, Message
│   │   │   │   ├── AbstractMessageHandler.ts
│   │   │   │   ├── AbstractMessageSender.ts
│   │   │   │   └── index.ts          # EventGroup enum, MessageState, MessageOrigin
│   │   │   ├── modules/              # IModule, AbstractModule, decorators
│   │   │   │   ├── AbstractModule.ts       # Base class for all OCPP modules
│   │   │   │   ├── AsHandler.ts            # @AsHandler decorator for OCPP message handlers
│   │   │   │   ├── Module.ts               # IModule interface
│   │   │   │   ├── OCPPValidator.ts        # OCPP message validation via Ajv
│   │   │   │   └── CircuitBreaker.ts
│   │   │   ├── router/               # IMessageRouter, AbstractMessageRouter, IAuthenticator
│   │   │   ├── repository.ts         # CrudRepository abstract base (extends EventEmitter)
│   │   │   └── tenant.ts             # TenantContextManager
│   │   ├── ocpp/                     # OCPP protocol definitions
│   │   │   ├── model/                # Generated OCPP type definitions
│   │   │   │   ├── 1.6/              # OCPP 1.6 types
│   │   │   │   ├── 2.0.1/            # OCPP 2.0.1 types
│   │   │   │   └── 2.1/              # OCPP 2.1 types
│   │   │   ├── persistence/          # Namespace enums, query schemas for REST
│   │   │   └── rpc/                  # Call/CallResult/CallError types, OCPP_CallAction enum
│   │   ├── util/                     # RequestBuilder, misc utilities
│   │   └── index.ts                  # Barrel export for all of @citrineos/base
│   ├── test/                         # Unit tests
│   └── package.json
│
├── 01_Data/                          # Data access layer
│   ├── src/
│   │   ├── interfaces/               # Repository interfaces and query types
│   │   │   ├── repositories.ts       # All repository interfaces (IAuthorizationRepository, etc.)
│   │   │   ├── queries/              # Zod schemas for REST API querystrings
│   │   │   ├── projections/          # Data projection types
│   │   │   └── dtos/                 # Data transfer objects
│   │   ├── layers/
│   │   │   └── sequelize/            # Sequelize ORM implementation
│   │   │       ├── model/            # Sequelize model definitions
│   │   │       │   ├── Authorization/
│   │   │       │   ├── Boot.ts
│   │   │       │   ├── Certificate/
│   │   │       │   ├── ChargingProfile/
│   │   │       │   ├── DeviceModel/
│   │   │       │   ├── Location/     # ChargingStation, Evse, Connector, etc.
│   │   │       │   ├── TransactionEvent/
│   │   │       │   ├── Tenant.ts
│   │   │       │   ├── BaseModelWithTenant.ts  # Base model with tenantId
│   │   │       │   └── ... (20+ model directories/files)
│   │   │       ├── repository/       # Repository implementations
│   │   │       │   ├── Base.ts       # SequelizeRepository<T> base class
│   │   │       │   ├── RepositoryStore.ts  # Aggregates all repositories
│   │   │       │   ├── Authorization.ts
│   │   │       │   ├── Boot.ts
│   │   │       │   ├── Location.ts
│   │   │       │   ├── TransactionEvent.ts
│   │   │       │   └── ... (20+ repository files)
│   │   │       ├── mapper/           # OCPP version-specific data mappers
│   │   │       │   ├── 1.6/          # OCPP 1.6 to internal model mapping
│   │   │       │   └── 2.0.1/        # OCPP 2.0.1 to internal model mapping
│   │   │       ├── util.ts           # DefaultSequelizeInstance (singleton)
│   │   │       └── index.ts
│   │   ├── util/                     # CryptoUtils
│   │   └── index.ts                  # Barrel export for @citrineos/data
│   ├── test/
│   └── package.json
│
├── 02_Util/                          # Infrastructure implementations
│   ├── src/
│   │   ├── authorization/            # API auth plugin & providers
│   │   │   ├── ApiAuthPlugin.ts      # Fastify plugin for REST API auth
│   │   │   ├── OidcTokenProvider.ts  # OIDC token management
│   │   │   ├── provider/             # OIDCAuthProvider, LocalBypassAuthProvider
│   │   │   └── rbac/                 # Role-based access control
│   │   ├── authorizer/               # RealTimeAuthorizer for EV charging authorization
│   │   ├── cache/
│   │   │   ├── memory.ts             # MemoryCache (ICache implementation)
│   │   │   └── redis.ts              # RedisCache (ICache implementation)
│   │   ├── certificate/              # CertificateAuthorityService, Hubject integration
│   │   ├── files/
│   │   │   ├── localStorage.ts       # Local filesystem storage
│   │   │   ├── s3Storage.ts          # AWS S3 storage
│   │   │   ├── gcpCloudStorage.ts    # Google Cloud Storage
│   │   │   └── ftpServer.ts          # FTP server for firmware updates
│   │   ├── networkconnection/
│   │   │   ├── WebsocketNetworkConnection.ts  # WebSocket server for OCPP
│   │   │   └── authenticator/        # Connection authentication filters
│   │   │       ├── Authenticator.ts             # Composes filter chain
│   │   │       ├── UnknownStationFilter.ts      # Allow/reject unknown stations
│   │   │       ├── ConnectedStationFilter.ts    # Prevent duplicate connections
│   │   │       ├── NetworkProfileFilter.ts      # Validate network profiles
│   │   │       └── BasicAuthenticationFilter.ts # HTTP basic auth validation
│   │   ├── queue/
│   │   │   ├── rabbit-mq/
│   │   │   │   ├── sender.ts         # RabbitMqSender (IMessageSender)
│   │   │   │   └── receiver.ts       # RabbitMqReceiver (IMessageHandler)
│   │   │   └── kafka/
│   │   │       ├── sender.ts         # KafkaSender (IMessageSender)
│   │   │       └── receiver.ts       # KafkaReceiver (IMessageHandler)
│   │   ├── security/                 # Password utils, SignedMeterValuesUtil
│   │   ├── util/                     # Swagger init, validators, parsers, IdGenerator
│   │   └── index.ts                  # Barrel export for @citrineos/util
│   ├── test/
│   └── package.json
│
├── 03_Modules/                       # OCPP functional modules
│   ├── Certificates/                 # Certificate management (install, delete, sign)
│   │   └── src/module/
│   │       ├── module.ts             # CertificatesModule extends AbstractModule
│   │       ├── 2.0.1/MessageApi.ts   # CertificatesOcpp201Api
│   │       ├── DataApi.ts            # CertificatesDataApi
│   │       └── interface.ts
│   ├── Configuration/                # Boot, heartbeat, firmware, device model
│   │   └── src/module/
│   │       ├── module.ts             # ConfigurationModule
│   │       ├── 2.0.1/MessageApi.ts   # ConfigurationOcpp201Api
│   │       ├── 1.6/MessageApi.ts     # ConfigurationOcpp16Api
│   │       ├── DataApi.ts            # ConfigurationDataApi
│   │       ├── BootNotificationService.ts
│   │       └── DeviceModelService.ts
│   ├── EVDriver/                     # Authorization, local auth list, reservations
│   │   └── src/module/
│   │       ├── module.ts             # EVDriverModule
│   │       ├── 2.0.1/MessageApi.ts   # EVDriverOcpp201Api
│   │       ├── 1.6/MessageApi.ts     # EVDriverOcpp16Api
│   │       ├── DataApi.ts            # EVDriverDataApi
│   │       └── LocalAuthListService.ts
│   ├── Monitoring/                   # Variable monitoring, event notifications
│   │   └── src/module/
│   │       ├── module.ts             # MonitoringModule
│   │       ├── 2.0.1/MessageApi.ts   # MonitoringOcpp201Api
│   │       ├── DataApi.ts            # MonitoringDataApi
│   │       └── MonitoringService.ts
│   ├── OcppRouter/                   # WebSocket message routing (not a standard module)
│   │   └── src/module/
│   │       ├── router.ts             # MessageRouterImpl extends AbstractMessageRouter
│   │       ├── DataApi.ts            # AdminApi (connections, subscriptions)
│   │       └── webhook.dispatcher.ts # WebhookDispatcher for push notifications
│   ├── Reporting/                    # Reports, security events, log status
│   │   └── src/module/
│   │       ├── module.ts             # ReportingModule
│   │       ├── 2.0.1/MessageApi.ts   # ReportingOcpp201Api
│   │       └── 1.6/MessageApi.ts     # ReportingOcpp16Api
│   ├── SmartCharging/                # Charging profiles, composite schedules
│   │   └── src/module/
│   │       ├── module.ts             # SmartChargingModule
│   │       ├── 2.0.1/MessageApi.ts   # SmartChargingOcpp201Api
│   │       ├── 1.6/MessageApi.ts     # SmartChargingOcpp16Api
│   │       └── smartCharging/        # ISmartCharging interface, InternalSmartCharging
│   ├── Tenant/                       # Multi-tenant management
│   │   └── src/module/
│   │       ├── module.ts             # TenantModule
│   │       └── DataApi.ts            # TenantDataApi
│   └── Transactions/                 # Transaction events, cost, status notifications
│       └── src/module/
│           ├── module.ts             # TransactionsModule
│           ├── 2.0.1/MessageApi.ts   # TransactionsOcpp201Api
│           ├── DataApi.ts            # TransactionsDataApi
│           ├── TransactionService.ts
│           ├── CostCalculator.ts
│           ├── CostNotifier.ts
│           ├── StatusNotificationService.ts
│           └── Scheduler.ts
│
├── Server/                           # Application entry point
│   ├── src/
│   │   ├── index.ts                  # Main entry point
│   │   ├── citrineOSServer.ts        # Composition root (720 lines)
│   │   ├── config/
│   │   │   ├── index.ts              # Config resolution logic
│   │   │   ├── config.loader.ts      # loadSystemConfig from file storage
│   │   │   ├── sequelize.bridge.config.ts  # Sequelize CLI config bridge
│   │   │   └── envs/
│   │   │       ├── local.ts          # Local dev config defaults
│   │   │       ├── docker.ts         # Docker config defaults
│   │   │       └── swarm.docker.ts   # Docker Swarm config defaults
│   │   └── assets/                   # Static assets (certs, logo)
│   ├── docker-compose.yml            # Development docker-compose
│   ├── Dockerfile                    # Production Dockerfile
│   ├── hasura-metadata/              # Hasura GraphQL Engine metadata
│   ├── everest/                      # EVerest integration configs
│   └── data/                         # Local data directories (gitignored)
│
├── migrations/                       # Sequelize CLI database migrations (27 files)
│   ├── 20250430103000-initial.ts
│   ├── 20250430105500-create-tenants-table.ts
│   └── ...
│
├── package.json                      # Root workspace config
├── tsconfig.json                     # Root TypeScript config (references Server)
├── tsconfig.build.json               # Shared compiler options
├── eslint.config.js                  # ESLint configuration
├── vitest.config.ts                  # Vitest test runner config
└── .sequelizerc                      # Sequelize CLI config file paths
```

## Package Dependencies

**Internal Dependency Graph (arrows = depends on):**

```
@citrineos/server
    |
    +---> @citrineos/ocpprouter ----+
    +---> @citrineos/certificates --+
    +---> @citrineos/configuration -+
    +---> @citrineos/evdriver ------+
    +---> @citrineos/monitoring ----+---> @citrineos/util ---> @citrineos/data ---> @citrineos/base
    +---> @citrineos/reporting -----+
    +---> @citrineos/smartcharging -+
    +---> @citrineos/tenant --------+
    +---> @citrineos/transactions --+
    |
    +---> @citrineos/util
    +---> @citrineos/data
    +---> @citrineos/base
```

**Dependency Rules:**
- `@citrineos/base` has no internal dependencies (pure contracts)
- `@citrineos/data` depends only on `@citrineos/base`
- `@citrineos/util` depends on `@citrineos/base` and `@citrineos/data`
- All modules depend on `@citrineos/base`, `@citrineos/data`, `@citrineos/util`
- `@citrineos/server` depends on everything (composition root)
- Modules do NOT depend on each other

**Version:** All internal packages are at version `1.8.3` (synchronized workspace versions).

## Entry Points

**Application Start:**
- `Server/src/index.ts` - Main entry. Loads bootstrap config, resolves system config, creates `CitrineOSServer`, calls `run()`.
- Start command: `npm run start` (from root) or `npm run start --prefix ./Server`
- Docker: `npm run start-docker` (uses `docker-compose.yml`)

**Build:**
- `npm run build` - TypeScript project references build (`tsc --build --verbose`), followed by asset copy
- Build order enforced by `tsconfig.json` references chain

**Database:**
- `npm run migrate` - Run Sequelize CLI migrations from `migrations/` directory
- `npm run sync-db` / `npm run force-sync-db` - Direct Sequelize model sync (development only)

**Tests:**
- `npm run test` - Run vitest across all packages
- `npm run coverage` - Run vitest with coverage

## Configuration Files

**Root:**
- `package.json`: Workspace definitions, scripts, engine requirements (Node >= 24.4.1)
- `tsconfig.json`: Root TS config, references `Server`
- `tsconfig.build.json`: Shared compiler options (ES2022 target, NodeNext module, decorators enabled)
- `eslint.config.js`: ESLint configuration
- `vitest.config.ts`: Vitest test runner configuration
- `.sequelizerc`: Points Sequelize CLI to `Server/src/config/sequelize.bridge.config.ts`

**Server:**
- `Server/docker-compose.yml`: Development infrastructure (PostgreSQL/PostGIS, RabbitMQ, MinIO/S3, Hasura GraphQL)
- `Server/Dockerfile`: Production container build
- `Server/src/config/envs/local.ts`: Default SystemConfig for local development
- `Server/src/config/envs/docker.ts`: Default SystemConfig for Docker environment
- `Server/src/config/config.loader.ts`: Config loading from file storage (local/S3/GCP)

**Environment Variables (key ones for startup):**
- `APP_NAME`: Deployment mode - `all`, `router`, `modules`, or specific module name
- `APP_ENV`: Config environment - `local` or `docker`
- `BOOTSTRAP_CITRINEOS_DATABASE_HOST`, `_PORT`, `_NAME`, `_USERNAME`, `_PASSWORD`: Database connection
- `BOOTSTRAP_CITRINEOS_FILE_ACCESS_TYPE`: `local`, `s3`, or `gcp`
- `BOOTSTRAP_CITRINEOS_CONFIG_FILENAME`: Config file name (default: `config.json`)

## Key Files Reference

**Must-know files for any developer:**

| File | Purpose |
|------|---------|
| `Server/src/citrineOSServer.ts` | Composition root - see how everything is wired together |
| `00_Base/src/interfaces/modules/AbstractModule.ts` | Core module base class - understand handler dispatch |
| `00_Base/src/interfaces/modules/AsHandler.ts` | `@AsHandler` decorator - how OCPP handlers are registered |
| `00_Base/src/interfaces/api/AbstractModuleApi.ts` | Base REST API class - how endpoints are auto-registered |
| `00_Base/src/interfaces/repository.ts` | `CrudRepository` - base for all data access |
| `00_Base/src/config/types.ts` | `SystemConfig` Zod schema - all configuration options |
| `00_Base/src/config/bootstrap.config.ts` | `BootstrapConfig` - startup/infra config from env vars |
| `01_Data/src/interfaces/repositories.ts` | All repository interfaces |
| `01_Data/src/layers/sequelize/repository/RepositoryStore.ts` | Repository aggregator |
| `01_Data/src/layers/sequelize/repository/Base.ts` | `SequelizeRepository<T>` base implementation |
| `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` | WebSocket server for OCPP |
| `02_Util/src/queue/rabbit-mq/sender.ts` | RabbitMQ message sending |
| `02_Util/src/queue/rabbit-mq/receiver.ts` | RabbitMQ message receiving |
| `03_Modules/OcppRouter/src/module/router.ts` | Central OCPP message routing |

## Naming Conventions

**Files:**
- PascalCase for classes: `AbstractModule.ts`, `RepositoryStore.ts`, `WebsocketNetworkConnection.ts`
- camelCase for non-class modules: `index.ts`, `util.ts`, `types.ts`
- Dot-separated for special purpose: `webhook.dispatcher.ts`, `bootstrap.config.ts`

**Directories:**
- PascalCase for modules: `Certificates/`, `Configuration/`, `EVDriver/`
- camelCase for utility dirs: `networkconnection/`, `authenticator/`
- Numbered prefixes for layer ordering: `00_Base/`, `01_Data/`, `02_Util/`, `03_Modules/`

**OCPP Version Directories:**
- `1.6/`, `2.0.1/`, `2.1/` under modules for version-specific API/handler code

## Where to Add New Code

**New OCPP Module:**
1. Create `03_Modules/{ModuleName}/` with `package.json` (depend on `@citrineos/base`, `@citrineos/data`, `@citrineos/util`)
2. Create `src/module/module.ts` extending `AbstractModule`, register `@AsHandler` methods
3. Create `src/module/2.0.1/MessageApi.ts` extending `AbstractModuleApi` with `@AsMessageEndpoint` methods
4. Create `src/module/DataApi.ts` with `@AsDataEndpoint` methods for CRUD
5. Create `src/module/interface.ts` for the module's API interface
6. Create `src/index.ts` barrel export
7. Add workspace to root `package.json` workspaces array
8. Add `init{ModuleName}Module()` method to `Server/src/citrineOSServer.ts`
9. Add module config to `systemConfigInputSchema` in `00_Base/src/config/types.ts`
10. Add `EventGroup` entry in `00_Base/src/interfaces/messages/index.ts`

**New Repository:**
1. Define interface in `01_Data/src/interfaces/repositories.ts` extending `CrudRepository<T>`
2. Create Sequelize model in `01_Data/src/layers/sequelize/model/`
3. Create repository implementation in `01_Data/src/layers/sequelize/repository/` extending `SequelizeRepository<T>`
4. Add to `RepositoryStore` in `01_Data/src/layers/sequelize/repository/RepositoryStore.ts`
5. Export from `01_Data/src/index.ts`
6. Add database migration in `migrations/`

**New OCPP Handler (existing module):**
1. Add `@AsHandler([OCPPVersion.OCPP2_0_1], OCPP_CallAction.{Action})` decorated method to the module's `module.ts`
2. Add the action to the module's `_requests` or `_responses` arrays (sourced from config)
3. Add corresponding `@AsMessageEndpoint` method to the relevant `MessageApi.ts` if CSMS-initiated

**New REST Data Endpoint (existing module):**
1. Add `@AsDataEndpoint(Namespace.{Name}, HttpMethod.{Method}, ...)` decorated method to the module's `DataApi.ts`
2. Define query/body Zod schemas in `01_Data/src/interfaces/queries/`

**New Infrastructure Implementation:**
- Cache: Implement `ICache` in `02_Util/src/cache/`
- Message broker: Implement `IMessageSender`/`IMessageHandler` in `02_Util/src/queue/{broker-name}/`
- File storage: Implement `IFileStorage` in `02_Util/src/files/`

## Special Directories

**`Server/data/`:**
- Purpose: Docker volume mount points for local dev (PostgreSQL data, RabbitMQ data, MinIO data)
- Generated: Yes (by docker-compose)
- Committed: No (gitignored)

**`Server/hasura-metadata/`:**
- Purpose: Hasura GraphQL Engine metadata for auto-generated GraphQL API over PostgreSQL
- Generated: No (manually maintained)
- Committed: Yes

**`Server/everest/`:**
- Purpose: Configuration for EVerest (open-source EV charging software stack) integration
- Generated: No
- Committed: Yes

**`migrations/`:**
- Purpose: Sequelize CLI database migrations (timestamped TypeScript files)
- Generated: No (manually authored)
- Committed: Yes
- Run order: By timestamp prefix (YYYYMMDDHHMMSS)

**`00_Base/src/ocpp/model/{version}/`:**
- Purpose: OCPP protocol type definitions and JSON schemas
- Generated: Likely auto-generated from OCPP specifications (large generated type files)
- Committed: Yes

**`LICENSES/`:**
- Purpose: License text files for REUSE compliance
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-26*
