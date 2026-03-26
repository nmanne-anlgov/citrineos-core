# Coding Conventions

**Analysis Date:** 2026-03-26

## File Header

Every `.ts` file MUST start with the SPDX license header:

```typescript
// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
```

CI enforces this via `.github/workflows/license-check.yml`.

## Naming Conventions

**Files:**
- PascalCase for classes and models: `AbstractModule.ts`, `TransactionService.ts`, `CostCalculator.ts`
- PascalCase for decorators: `AsHandler.ts`, `AsDataEndpoint.ts`, `AsMessageEndpoint.ts`
- camelCase for utility files: `parser.ts`, `validator.ts`, `swagger.ts`, `idGenerator.ts`
- `index.ts` barrel files in every directory for re-exports
- Interface files named `interface.ts` (lowercase) inside module directories
- Module entry point named `module.ts` (lowercase)

**Classes:**
- PascalCase: `TransactionsModule`, `CostCalculator`, `SequelizeRepository`
- Abstract classes prefixed with `Abstract`: `AbstractModule`, `AbstractModuleApi`, `AbstractMessageHandler`
- Interfaces prefixed with `I`: `IModule`, `ICache`, `IMessageHandler`, `IAuthorizationRepository`
- Module classes suffixed with `Module`: `TransactionsModule`, `CertificatesModule`
- API classes suffixed with `DataApi` or `Ocpp201Api`: `TransactionsDataApi`, `TransactionsOcpp201Api`
- Service classes suffixed with `Service`: `TransactionService`, `StatusNotificationService`
- Repository classes prefixed with `Sequelize` and suffixed with `Repository`: `SequelizeAuthorizationRepository`
- Error classes suffixed with `Error`: `BadRequestError`, `NotFoundError`, `OcppError`

**Functions/Methods:**
- camelCase: `sendCall`, `handleMessageApiCallback`, `validateOCPPRequest`
- Handler methods prefixed with `_handle`: `_handleTransactionEvent`, `_handleMeterValues`
- Private/protected members prefixed with underscore: `_config`, `_logger`, `_cache`
- Provider (factory) functions in tests use `a`/`an` prefix: `aTransaction()`, `anAuthorization()`, `aRequest()`

**Variables:**
- camelCase: `stationId`, `tenantId`, `correlationId`
- Constants in UPPER_SNAKE_CASE: `AS_HANDLER_METADATA`, `METADATA_DATA_ENDPOINTS`, `DEFAULT_TENANT_ID`
- Static readonly constants in UPPER_SNAKE_CASE: `CALLBACK_URL_CACHE_PREFIX`, `MODEL_NAME`

**Types/Enums:**
- PascalCase for type aliases: `CallAction`, `OCPPVersionType`
- PascalCase with `EnumType` suffix for OCPP enums: `AuthorizationStatusEnumType`, `TransactionEventEnumType`
- Internal enums use `Enum` suffix without `Type`: `AuthorizationStatusEnum`, `IdTokenEnum`

## Packages & Namespacing

**Package naming:** `@citrineos/{name}` scope for all packages:
- `@citrineos/base` (`00_Base/`)
- `@citrineos/data` (`01_Data/`)
- `@citrineos/util` (`02_Util/`)
- `@citrineos/transactions` (`03_Modules/Transactions/`)
- `@citrineos/certificates` (`03_Modules/Certificates/`)

**Package numbering convention:** Directories are numbered to indicate dependency order:
- `00_Base` - no internal dependencies
- `01_Data` - depends on `@citrineos/base`
- `02_Util` - depends on `@citrineos/base`
- `03_Modules/*` - depends on `@citrineos/base`, `@citrineos/data`, `@citrineos/util`

**All packages use:**
- `"type": "module"` (ESM)
- `"main": "dist/index.js"`
- `"types": "dist/index.d.ts"`

## Import Organization

**Order:**
1. Third-party type imports (`import type { ... } from '...'`)
2. Third-party value imports (`import { ... } from '...'`)
3. Internal `@citrineos/*` type imports
4. Internal `@citrineos/*` value imports
5. Relative type imports
6. Relative value imports

**Key rules:**
- Use `import type { ... }` for type-only imports (enforced by `verbatimModuleSyntax: true` in tsconfig)
- All relative imports MUST include `.js` extension: `import { Foo } from './Foo.js'`
- Use `@citrineos/base`, `@citrineos/data`, `@citrineos/util` for cross-package imports
- Barrel exports via `index.ts` files using `export * from` or named re-exports

**Example from** `03_Modules/Transactions/src/module/module.ts`:
```typescript
import type {
  CallAction,
  HandlerProperties,
  ICache,
  IMessageHandler,
  IMessageSender,
} from '@citrineos/base';
import {
  AbstractModule,
  AsHandler,
  EventGroup,
  OCPP_CallAction,
  OCPPVersion,
} from '@citrineos/base';
import type {
  IAuthorizationRepository,
  ITransactionEventRepository,
} from '@citrineos/data';
import { sequelize, Transaction } from '@citrineos/data';
import { RabbitMqReceiver, RabbitMqSender } from '@citrineos/util';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import { TransactionService } from './TransactionService.js';
```

## Code Style

**Formatting (Prettier):**
- Config: `.prettierrc`
- Single quotes: `true`
- Trailing commas: `all`
- Print width: `100`
- Semicolons: `true`
- Tab width: `2`
- Bracket spacing: `true`
- Arrow parens: `always`

**Linting (ESLint):**
- Config: `eslint.config.js` (flat config format)
- Extends: `@eslint/js` recommended + `typescript-eslint` recommended
- Prettier integration via `eslint-plugin-prettier` (formatting errors are ESLint errors)
- `@typescript-eslint/no-floating-promises`: `error` - all promises must be handled
- `@typescript-eslint/no-explicit-any`: `off` - `any` is allowed
- `@typescript-eslint/no-unused-vars`: `warn` with `_` prefix ignored
- `@typescript-eslint/no-empty-object-type`: `off`

**Pre-commit hook:** `.husky/pre-commit` runs `npx lint-staged`, which applies Prettier to staged `*.{js,ts,jsx,tsx,json,md}` files.

## TypeScript Configuration

**Key settings from** `tsconfig.build.json`:
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

**Decorator-based metadata pattern:**
The project uses `reflect-metadata` extensively with custom decorators:

- `@AsHandler(protocols, action)` on `AbstractModule` methods - registers OCPP message handlers
- `@AsDataEndpoint(namespace, method, ...)` on API methods - registers REST data endpoints
- `@AsMessageEndpoint(action, schema, ...)` on API methods - registers REST message endpoints
- Sequelize decorators (`@Table`, `@Column`, `@BelongsTo`, etc.) on data models

**Interface + Abstract class pattern:**
- Define interface (`IModule`, `ICache`, `IMessageHandler`)
- Provide abstract class implementing interface (`AbstractModule`, `AbstractModuleApi`)
- Concrete implementations extend abstract class (`TransactionsModule extends AbstractModule`)

**Generics usage:**
- `CrudRepository<T>` - generic CRUD repository base
- `SequelizeRepository<T extends Model>` - generic Sequelize repository
- `AbstractModuleApi<T extends IModule>` - generic API base
- `IMessage<T extends OcppRequest | OcppResponse>` - typed messages
- `Logger<ILogObj>` - tslog generic logger

**OCPP version namespacing:**
- `OCPP1_6.*` for 1.6 types (e.g., `OCPP1_6.StatusNotificationRequest`)
- `OCPP2_0_1.*` for 2.0.1 types (e.g., `OCPP2_0_1.TransactionEventRequest`)
- `OCPP2_1.*` for 2.1 types (e.g., `OCPP2_1.TransactionEventEnumType`)
- Combined version lists via `OCPP_2_VER_LIST` for handlers supporting both 2.0.1 and 2.1
- Common OCPP 2.x types via `OCPP2_request_types` and `OCPP2_response_types`

## Error Handling

**OCPP errors:**
- Use `OcppError` class with `ErrorCode` enum for OCPP protocol errors
- `OcppError` includes `correlationId`, `ErrorCode`, message, and optional details
- Handler errors caught in `AbstractModule.handle()` which sends `CallError` responses

```typescript
throw new OcppError(
  message.context.correlationId,
  ErrorCode.FormatViolation,
  'Invalid message format',
  { errors: errors },
);
```

**HTTP API errors:**
- `BadRequestError` (400) - extends `Error` with `statusCode` property at `00_Base/src/interfaces/api/exceptions/BadRequestError.ts`
- `NotFoundError` (404) - extends `Error` with `statusCode` property at `00_Base/src/interfaces/api/exceptions/NotFoundError.ts`

**General error handling:**
- Try/catch blocks with `this._logger.error(...)` for logging
- Errors re-thrown or converted to OCPP errors when in handler context
- Sequelize errors checked by name (e.g., `(error as any).name === 'SequelizeForeignKeyConstraintError'`)
- Fire-and-forget patterns use `.catch((error) => { this._logger.error(...) })` for non-critical operations

## Logging

**Framework:** `tslog` (v4.9.2)
- Type: `Logger<ILogObj>`
- Sub-loggers created via `logger.getSubLogger({ name: this.constructor.name })`
- Protected `_logger` field on all classes extending `AbstractModule`
- Log levels: silly, trace, debug, info, warn, error, fatal

**Patterns:**
- Module initialization: `this._logger.info('Initializing...')`
- Handler entry: `this._logger.debug('Transaction event received:', message, props)`
- Errors: `this._logger.error('Failed handling message: ', error, message)`
- Response confirmation: `this._logger.debug('Transaction response sent: ', messageConfirmation)`

## Common Patterns

**Constructor dependency injection:**
Modules accept optional dependencies in constructor with fallback defaults:
```typescript
constructor(
  config: SystemConfig,
  cache: ICache,
  sender?: IMessageSender,    // optional with default
  handler?: IMessageHandler,  // optional with default
  logger?: Logger<ILogObj>,
) {
  super(
    config,
    cache,
    handler || new RabbitMqReceiver(config, logger),  // default fallback
    sender || new RabbitMqSender(config, logger),
    EventGroup.Transactions,
    logger,
  );
}
```

**Repository pattern:**
- Interfaces defined in `01_Data/src/interfaces/repositories.ts`
- Implementations in `01_Data/src/layers/sequelize/repository/`
- Base class `SequelizeRepository<T>` at `01_Data/src/layers/sequelize/repository/Base.ts`
- All repository methods take `tenantId` as first parameter for multi-tenancy

**Module API pattern:**
Each module exposes two API classes:
- `{Module}DataApi` - CRUD operations on data (uses `@AsDataEndpoint`)
- `{Module}Ocpp201Api` - OCPP message sending (uses `@AsMessageEndpoint`)
Both extend `AbstractModuleApi<{Module}Module>` and implement `I{Module}ModuleApi`

**OCPP version-specific directories:**
- `src/module/2.0.1/MessageApi.ts` for version-specific API implementations
- Handler methods on the main module class use `@AsHandler([OCPPVersion.OCPP2_0_1], ...)` for version dispatch

**Barrel file pattern:**
Every directory has `index.ts` that re-exports its contents. Package `index.ts` files at the package root (e.g., `03_Modules/Transactions/src/index.ts`) export only the public API:
```typescript
export { TransactionsOcpp201Api } from './module/2.0.1/MessageApi.js';
export { TransactionsDataApi } from './module/DataApi.js';
export type { ITransactionsModuleApi } from './module/interface.js';
export { TransactionsModule } from './module/module.js';
```

## Comments

**JSDoc:** Used extensively on public methods and constructors with `@param`, `@return` tags. Particularly detailed on module constructors describing each dependency.

**TODO comments:** Present throughout the codebase for planned work. Format: `// TODO: description` or `// TODO description`.

**Inline comments:** Used sparingly, mainly for explaining OCPP-specific business logic or workarounds.

---

*Convention analysis: 2026-03-26*
