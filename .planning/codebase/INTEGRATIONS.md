# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**Hubject (V2G Certificate Authority):**
- Purpose: ISO 15118 Vehicle-to-Grid certificate signing via Hubject's Open Plug&Charge API
- Client: Custom HTTP client using `fetch` in `02_Util/src/certificate/client/hubject.ts`
- Auth: OAuth2 client credentials flow (token URL, client ID, client secret)
- Endpoint: `/.well-known/cpo/simpleenroll` for certificate enrollment
- Config keys: `util.certificateAuthority.v2gCA.hubject` in SystemConfig
- Default constants: `HUBJECT_DEFAULT_BASEURL`, `HUBJECT_DEFAULT_TOKENURL`, `HUBJECT_DEFAULT_CLIENTID`, `HUBJECT_DEFAULT_CLIENTSECRET` (defined in `@citrineos/base`)

**Let's Encrypt (ACME Certificate Authority):**
- Purpose: Automated TLS certificate issuance for charging station CA
- SDK: `acme-client` 5.3.0 in `02_Util/src/certificate/client/acme.ts`
- Environments: staging (default) and production Let's Encrypt directory URLs
- Config keys: `util.certificateAuthority.chargingStationCA.acme` (email, accountKeyFilePath, env)
- Certificate chain and sub-CA private key loaded from filesystem paths

**OCPI Server (planned):**
- Config section `ocpiServer` exists in SystemConfig with host/port (default `0.0.0.0:8085`)
- Implementation status: Config stubs present, full OCPI integration expected as separate package

## Message Queues & Events

**RabbitMQ (Primary, Required):**
- Purpose: Inter-module message routing for OCPP request/response handling
- SDK: `amqplib` ^0.10.7
- Sender: `02_Util/src/queue/rabbit-mq/sender.ts` (`RabbitMqSender`)
- Receiver: `02_Util/src/queue/rabbit-mq/receiver.ts` (`RabbitMqReceiver`)
- Default URL: `amqp://guest:guest@localhost:5672` (local), `amqp://guest:guest@amqp-broker:5672` (Docker)
- Exchange: `citrineos` (fanout)
- Circuit breaker pattern with configurable reconnect logic
- Docker service: `rabbitmq:3-management` (ports 5672, 15672)
- Config key: `util.messageBroker.amqp`

**Apache Kafka (Alternative):**
- Purpose: Alternative message broker (can replace RabbitMQ)
- SDK: `kafkajs` 2.2.4
- Sender: `02_Util/src/queue/kafka/sender.ts` (`KafkaSender`)
- Receiver: `02_Util/src/queue/kafka/receiver.ts` (`KafkaReceiver`)
- Auth: SASL/PLAIN over SSL
- Config key: `util.messageBroker.kafka` (brokers, topicPrefix, topicName, sasl)
- Circuit breaker pattern for resilience
- Not used by default server implementation (server constructor requires AMQP config)

**MQTT (Dependency only):**
- Package: `mqtt` 5.1.2 listed in `02_Util/package.json`
- Status: Listed as dependency but no queue sender/receiver implementations found. Reserved for future use.

## WebSocket Connections

**OCPP WebSocket Servers:**
- Purpose: Bidirectional communication with EV charging stations via OCPP protocol
- SDK: `ws` 8.17.1
- Implementation: `02_Util/src/networkconnection/WebsocketNetworkConnection.ts`
- Protocols supported: OCPP 1.6, OCPP 2.0.1, OCPP 2.1
- Security profiles: 0 (no auth), 1 (basic auth), 2 (TLS), 3 (mTLS)
- Multiple WebSocket servers can run simultaneously on different ports
- Authentication pipeline: `02_Util/src/networkconnection/authenticator/`
  - `UnknownStationFilter` - Check if station exists in DB
  - `ConnectedStationFilter` - Check if station already connected (via cache)
  - `NetworkProfileFilter` - Validate network profile
  - `BasicAuthenticationFilter` - HTTP Basic auth for security profile 1

## Data Storage

**PostgreSQL (Primary Database):**
- Image: `postgis/postgis:16-3.5` (PostGIS-enabled PostgreSQL 16)
- Connection: Configured via `BOOTSTRAP_CITRINEOS_DATABASE_*` environment variables
- Client: `pg` 8.11.3 via `sequelize-typescript` 2.1.6
- Default credentials: `citrine/citrine`, database `citrine`, port 5432
- Migrations: 20 Sequelize CLI migrations in `migrations/` directory

**SQLite3 (Development alternative):**
- Package: `sqlite3` 5.1.6 in `Server/package.json`
- Purpose: Lightweight local development without PostgreSQL

**MinIO (S3-compatible Object Storage):**
- Purpose: Local development replacement for AWS S3
- Docker image: `minio/minio`
- Ports: API 9000, Console 9001
- Client: `@aws-sdk/client-s3` 3.750.0 with `forcePathStyle: true`
- Implementation: `02_Util/src/files/s3Storage.ts` (`S3Storage`)

**AWS S3 (Production Object Storage):**
- Purpose: File/config storage in production
- SDK: `@aws-sdk/client-s3` 3.750.0
- Implementation: `02_Util/src/files/s3Storage.ts` (`S3Storage`)
- Config key: `fileAccess.s3` (region, endpoint, defaultBucketName, credentials)

**GCP Cloud Storage (Alternative Object Storage):**
- Purpose: Alternative file/config storage for GCP deployments
- SDK: `@google-cloud/storage` 7.18.0
- Implementation: `02_Util/src/files/gcpCloudStorage.ts` (`GcpCloudStorage`)
- Config key: `fileAccess.gcp` (projectId, credentials)

**Local Filesystem:**
- Implementation: `02_Util/src/files/localStorage.ts` (`LocalStorage`)
- Default file path: `/data` (Docker) or `data` (local)
- Used as default config store when `fileAccess.type = 'local'`

**FTP Server (Stub):**
- Implementation: `02_Util/src/files/ftpServer.ts` (`FtpServer`)
- Status: Stub only - `getFileURL()` throws "Method not implemented"

## Caching

**Redis (Optional):**
- Purpose: Distributed cache for multi-instance deployments
- SDK: `redis` 4.6.6
- Implementation: `02_Util/src/cache/redis.ts` (`RedisCache`)
- Config key: `util.cache.redis` (url or host/port)
- Supports namespace-prefixed keys and key subscriptions

**In-Memory Cache (Default):**
- Implementation: `02_Util/src/cache/memory.ts` (`MemoryCache`)
- Uses Proxy-based Map for change subscriptions
- Suitable for single-instance deployments only

## Authentication & Authorization

**OIDC / Keycloak (API Authentication):**
- Purpose: JWT-based API authentication for HTTP endpoints
- Implementation: `02_Util/src/authorization/provider/OIDCAuthProvider.ts`
- SDK: `jsonwebtoken` ^9.0.2, `jwks-rsa` ^3.2.0
- Config key: `util.authProvider.oidc` (jwksUri, issuer, audience)
- Features: JWKS key caching, rate limiting, RBAC via `RbacRulesLoader`

**Local Bypass (Development):**
- Implementation: `02_Util/src/authorization/LocalByPassAuthProvider.ts`
- Purpose: Skip authentication during development
- Config key: `util.authProvider.localByPass: true`

**RBAC (Role-Based Access Control):**
- Implementation: `02_Util/src/authorization/rbac/RbacRulesLoader.ts`
- URL matching: `02_Util/src/authorization/rbac/UrlMatcher.ts`
- Integrated with OIDC provider for role-based endpoint authorization

**Charging Station Authentication:**
- Basic HTTP Auth (security profile 1): `02_Util/src/networkconnection/authenticator/BasicAuthenticationFilter.ts`
- TLS (security profile 2): Server-side certificate validation
- mTLS (security profile 3): Mutual TLS with client certificate verification

## GraphQL

**Hasura GraphQL Engine:**
- Purpose: Auto-generated GraphQL API over PostgreSQL schema
- Version: v2.40.3.cli-migrations-v3
- Port: 8090 (mapped from internal 8080)
- Connection: Direct to PostgreSQL (`postgres://citrine:citrine@ocpp-db:5432/citrine`)
- Metadata: `Server/hasura-metadata/` (volume-mounted)
- Features: Console enabled, dev mode, telemetry disabled
- Depends on: CitrineOS server being healthy (ensures DB schema is ready)

## Monitoring & Observability

**Logging:**
- Framework: `tslog` 4.9.2
- Modes: Pretty (development), JSON (cloud/production, triggered by `DEPLOYMENT_TARGET=cloud`)
- Log levels: Configurable via `logLevel` in SystemConfig (0=silly through 6=fatal)
- Pattern: Sub-loggers created per class via `logger.getSubLogger({ name: this.constructor.name })`

**Error Tracking:**
- None detected (no Sentry, Datadog, or similar integration)

**Metrics:**
- None detected (no Prometheus, StatsD, or similar integration)

**Health Check:**
- HTTP endpoint: `GET /health` returns `{ status: 'healthy' }`
- Docker healthcheck: TCP connection test to port 8080

## Webhooks & Callbacks

**Outgoing Webhooks (WebhookDispatcher):**
- Implementation: `03_Modules/OcppRouter/src/module/webhook.dispatcher.ts`
- Purpose: Notify external systems of OCPP events (connection, disconnection, messages)
- Subscription-based: External systems register webhook URLs stored in database
- Subscription refresh: Every 3 minutes
- Event types: onConnection, onClose, onMessage, onSentMessage
- Repository: `ISubscriptionRepository` (Sequelize-backed)

**Incoming Webhooks:**
- None detected as explicit webhook endpoints

## Swagger / OpenAPI

**API Documentation:**
- Generation: `@fastify/swagger` 9.4.0
- UI: `@fastify/swagger-ui` 5.2.0
- Default path: `/docs`
- CI: Auto-published to `citrineos.github.io` on push to main
- Config key: `util.swagger` (path, logoPath, exposeData, exposeMessage)

## Environment Configuration

**Required Environment Variables (Docker):**
- `APP_NAME` - Which module(s) to run (e.g., `all`)
- `APP_ENV` - Environment name (`local`, `docker`)
- `DB_STRATEGY` - Database init strategy (`migrate`, `sync`, `force-sync`, `none`)
- `BOOTSTRAP_CITRINEOS_DATABASE_HOST` - PostgreSQL host
- `BOOTSTRAP_CITRINEOS_CONFIG_FILENAME` - Config JSON filename
- `BOOTSTRAP_CITRINEOS_FILE_ACCESS_TYPE` - Storage backend (`local`, `s3`, `gcp`)
- `BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH` - Local storage path

**Optional Environment Variables:**
- `DEPLOYMENT_TARGET` - Set to `cloud` for JSON logging
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - For S3/MinIO storage
- `BOOTSTRAP_CITRINEOS_DATABASE_PORT` - PostgreSQL port (default 5432)
- `BOOTSTRAP_CITRINEOS_DATABASE_USERNAME` - DB username (default `citrine`)
- `BOOTSTRAP_CITRINEOS_DATABASE_PASSWORD` - DB password (default `citrine`)
- `BOOTSTRAP_CITRINEOS_CONFIG_DIR` - Custom config directory

**Secrets Location:**
- No `.env` files committed to repository
- Secrets passed via environment variables in Docker Compose or CI/CD
- Certificate files stored in `Server/src/assets/certificates/` (development only)

---

*Integration audit: 2026-03-26*
