# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 5.8.2 - All application code across the monorepo

**Secondary:**
- Shell (bash) - `entrypoint.sh` for Docker container startup and DB strategy selection
- SQL - Database migrations in `migrations/`

## Runtime

**Environment:**
- Node.js >= 24.4.1 (pinned in `.nvmrc`, `package.json` engines, Dockerfile, and CI workflows)

**Module System:**
- ES Modules (`"type": "module"` across all packages)
- Target: ES2022
- Module resolution: NodeNext
- `verbatimModuleSyntax: true` in `tsconfig.build.json`

**Package Manager:**
- npm (workspaces)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Fastify 5.1.0 - HTTP server framework (`@citrineos/base` dependency)
  - `@fastify/cors` 10.0.1 - CORS support (`Server/package.json`)
  - `@fastify/auth` 5.0.1 - Authentication plugin (`00_Base/package.json`)
  - `@fastify/swagger` 9.4.0 - API documentation generation (`02_Util/package.json`)
  - `@fastify/swagger-ui` 5.2.0 - Swagger UI serving (`02_Util/package.json`)
  - `@fastify/type-provider-json-schema-to-ts` 4.0.1 - Type-safe JSON Schema validation (`00_Base/package.json`)

**WebSocket:**
- ws 8.17.1 - WebSocket server for OCPP charger connections (`Server/package.json`)
  - Optional: `bufferutil` 4.0.8, `utf-8-validate` 6.0.3 for performance

**ORM:**
- Sequelize (via `sequelize-typescript` 2.1.6) - Database ORM (`01_Data/package.json`)
- `sequelize-cli` 6.6.2 - Database migrations (root `devDependencies`)

**Validation:**
- Zod 4.1.12 - Configuration schema validation (`00_Base/package.json`)
- Ajv 8.17.1 - JSON Schema validation for OCPP messages and HTTP routes (`00_Base/package.json`)

**Testing:**
- Vitest 3.2.4 - Test runner and framework (`00_Base/package.json`)
- `@vitest/coverage-v8` 3.2.4 - Code coverage (`00_Base/package.json`)
- Newman (installed globally in CI) - Postman collection runner for integration tests

**Build/Dev:**
- TypeScript 5.8.2 - Compilation via `tsc --build` with project references
- nodemon 3.1.7 - Dev server auto-restart (`Server/package.json`)
- ts-node 10.9.1 - TypeScript execution for scripts (`Server/package.json`)
- cross-env 7.0.3 - Cross-platform environment variable setting (`Server/package.json`)

## Key Dependencies

**Critical (business logic):**
- `class-transformer` 0.5.1 - Object serialization/deserialization for OCPP messages
- `reflect-metadata` 0.1.13 - Decorator metadata support (required by Sequelize and class-transformer)
- `big.js` 6.2.1 - Precise decimal arithmetic (charging/billing calculations)
- `uuid` 9.0.1 - UUID generation for message IDs and entities

**Messaging:**
- `amqplib` ^0.10.7 - RabbitMQ client (primary message broker, required by default server)
- `kafkajs` 2.2.4 - Apache Kafka client (alternative message broker)
- `mqtt` 5.1.2 - MQTT client (listed as dependency, not yet wired into queue implementations)

**Caching:**
- `redis` 4.6.6 - Redis client (optional, falls back to in-memory cache)

**Security/Crypto:**
- `jsonwebtoken` ^9.0.2 - JWT verification for OIDC auth
- `jwks-rsa` ^3.2.0 - JWKS key retrieval for OIDC
- `jsrsasign` 11.0.0 - RSA/certificate signing operations
- `pkijs` 3.0.16 - PKI operations (X.509 certificate handling)
- `@peculiar/webcrypto` 1.4.6 - WebCrypto API polyfill
- `node-forge` 1.3.2 - TLS/SSL certificate handling (OcppRouter module)
- `acme-client` 5.3.0 - ACME protocol for Let's Encrypt certificate issuance

**Cloud Storage:**
- `@aws-sdk/client-s3` 3.750.0 - AWS S3 / MinIO file storage
- `aws-sdk` ^2.1692.0 - Legacy AWS SDK (also in util)
- `@google-cloud/storage` 7.18.0 - GCP Cloud Storage

**Data Generation (dev):**
- `@faker-js/faker` 8.4.1 - Test data generation
- `json-schema-faker` ^0.5.8 - Generate mock data from JSON schemas
- `json-schema-to-typescript` 12.0.0 - Generate TS types from OCPP JSON schemas
- `json-schema-to-zod` 1.1.1 - Generate Zod schemas from JSON schemas

**Logging:**
- `tslog` 4.9.2 - Structured logging (supports pretty and JSON output modes)

## Database & Storage

**Primary Database:**
- PostgreSQL 16 with PostGIS 3.5 (Docker image: `postgis/postgis:16-3.5`)
  - Default database name: `citrine`
  - Client: `pg` 8.11.3 + `pg-hstore` 2.3.4
  - ORM: `sequelize-typescript` 2.1.6

**Alternative Database (development):**
- SQLite3 5.1.6 (`Server/package.json` dependency, for local development without PostgreSQL)

**GraphQL Layer:**
- Hasura GraphQL Engine v2.40.3 (Docker service, auto-discovers Postgres schema)
  - Runs on port 8090
  - Metadata stored in `Server/hasura-metadata/`

**Object Storage:**
- MinIO (S3-compatible, Docker service for local development)
  - API: port 9000, Console: port 9001
- AWS S3 (production via `@aws-sdk/client-s3`)
- GCP Cloud Storage (production via `@google-cloud/storage`)
- Local filesystem (default for development)

**Caching:**
- Redis 4.6.6 client (optional, configurable via `util.cache.redis`)
- In-memory Map-based cache (default fallback: `MemoryCache` in `02_Util/src/cache/memory.ts`)

**Database Migrations:**
- Sequelize CLI migrations in `migrations/` directory
- Three DB strategies via `DB_STRATEGY` env var in `entrypoint.sh`:
  - `migrate` (default) - Run sequelize-cli migrations
  - `sync` - Sequelize model sync
  - `force-sync` - Sequelize force sync (destructive)
  - `none` - Skip DB initialization

## Monorepo Structure

**Workspace Packages (npm workspaces):**
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

**Dependency DAG:**
```
@citrineos/base (no internal deps)
    |
@citrineos/data (depends on base)
    |
@citrineos/util (depends on base, data)
    |
@citrineos/[modules] (each depends on base, data, util)
    |
@citrineos/server (depends on all modules + util)
```

## Infrastructure & Deployment

**Containerization:**
- Docker multi-stage build (`Server/Dockerfile`)
  - Build stage: `node:24.4.1`
  - Runtime stage: `node:24.4.1-slim`
- Docker Compose for local development (`Server/docker-compose.yml`)
  - Services: `citrine`, `ocpp-db` (PostgreSQL), `amqp-broker` (RabbitMQ), `minio`, `minio-init`, `graphql-engine` (Hasura)

**Container Registry:**
- GitHub Container Registry (GHCR): `ghcr.io/citrineos/citrineos-server`
- Multi-platform builds: `linux/amd64`, `linux/arm64`

**CI/CD (GitHub Actions):**
- `.github/workflows/unit-tests.yml` - Vitest unit tests on PR
- `.github/workflows/test-build-server.yml` - Docker build + Newman integration tests on PR
- `.github/workflows/lint.yml` - ESLint on PR
- `.github/workflows/license-check.yml` - REUSE license compliance check on PR
- `.github/workflows/publish-swagger.yml` - Generate and publish Swagger JSON on push to main
- `.github/workflows/push-release-tagged-server.yml` - Build and push Docker image on version tags (`v*.*.*`)

**Exposed Ports (default config):**
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

**Linting:**
- ESLint 9.16.0 with flat config (`eslint.config.js`)
  - `typescript-eslint` 8.17.0 - TypeScript-aware linting
  - `eslint-config-prettier` 9.1.0 - Disable conflicting rules
  - `eslint-plugin-prettier` 5.2.3 - Run Prettier as ESLint rule
  - Key rules: `@typescript-eslint/no-floating-promises: error`, `@typescript-eslint/no-explicit-any: off`

**Formatting:**
- Prettier 3.2.5 (`.prettierrc`)
  - Single quotes, trailing commas, 100 char print width, 2-space tabs

**Git Hooks:**
- Husky 9.1.7 - Git hook management
- lint-staged 15.4.3 - Run Prettier on staged `*.{js,ts,jsx,tsx,json,md}` files

**Dependency Management:**
- Renovate bot (`renovate.json`) - Automated dependency updates
  - Runs nightly (10pm-4am ET)
  - Max 5 concurrent PRs, 2/hour

**License Compliance:**
- REUSE tool (Python) - SPDX license header checking
- Apache-2.0 license

## Configuration

**Bootstrap Configuration:**
- Loaded from environment variables prefixed with `BOOTSTRAP_CITRINEOS_`
- Validated with Zod schema in `00_Base/src/config/bootstrap.config.ts`
- Controls: database connection, file access type (local/s3/gcp), config file name

**System Configuration:**
- Full application config stored as JSON file (`config.json`)
- Loaded from configured storage backend (local filesystem, S3, or GCP)
- Environment-specific defaults: `Server/src/config/envs/docker.ts`, `Server/src/config/envs/local.ts`
- Validated with `defineConfig()` in `00_Base/src/config/defineConfig.ts`

**Key Environment Variables:**
- `APP_NAME` - Module to run (`all`, `router`, `modules`, or specific module name)
- `APP_ENV` - Environment (`local`, `docker`)
- `DB_STRATEGY` - Database initialization strategy (`migrate`, `sync`, `force-sync`, `none`)
- `DEPLOYMENT_TARGET` - Set to `cloud` for JSON logging format
- `BOOTSTRAP_CITRINEOS_*` - Bootstrap config (database host, file access, etc.)

---

*Stack analysis: 2026-03-26*
