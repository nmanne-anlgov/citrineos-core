# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework & Tools

**Runner:**
- Vitest 3.2.4
- Config: `vitest.config.ts` (root level)
- Environment: `node`

**Assertion Library:**
- Vitest built-in `expect` (compatible with Jest API)

**Mocking:**
- `vi.fn()`, `vi.mock()`, `vi.spyOn()` from Vitest
- `Mocked<T>` type from Vitest for typed mocks

**Test Data:**
- `@faker-js/faker` (v8.4.1) for generating random test data

**Run Commands:**
```bash
npm test                    # Run all tests (vitest run)
npm run coverage            # Run tests with coverage (vitest run --coverage)
```

**CI Integration:**
- `.github/workflows/unit-tests.yml` runs `npm test` on every pull request
- Uses Node.js 24.4.1 on ubuntu-latest
- Requires build before tests: `npm install && npm run build && npm test`
- `.github/workflows/test-build-server.yml` runs integration tests via Newman (Postman collections) against Docker Compose setup

## Test File Organization

**Location:** Tests live in a `test/` directory at the package root, separate from `src/`:
```
{package}/
  src/
    module/
      TransactionService.ts
  test/
    module/
      TransactionService.test.ts
    providers/
      TransactionProvider.ts
      AuthorizationProvider.ts
    utils/
      UpdateUtil.ts
```

**Naming:**
- Test files: `{ClassName}.test.ts` (e.g., `TransactionService.test.ts`, `CostCalculator.test.ts`)
- Integration tests: `{ClassName}.integration.test.ts` (e.g., `Hubject.integration.test.ts`)
- Provider/factory files: `{EntityName}Provider.ts` or `{EntityName}.ts` (e.g., `TransactionProvider.ts`, `Tariff.ts`)
- No `.spec.ts` files in the codebase

**Test directory mirrors source structure:**
- `test/module/` mirrors `src/module/`
- `test/layers/sequelize/mapper/` mirrors `src/layers/sequelize/mapper/`

## Test Structure

**Suite Organization:**
```typescript
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';

describe('ClassName', () => {
  let service: ClassName;
  let mockDependency: Mocked<IDependency>;

  beforeEach(() => {
    mockDependency = {
      methodName: vi.fn(),
    } as unknown as Mocked<IDependency>;

    service = new ClassName(mockDependency);
  });

  it('should do something when condition', async () => {
    mockDependency.methodName.mockResolvedValue(someValue);

    const result = await service.method(args);

    expect(result).toBe(expected);
  });

  describe('nested group', () => {
    it('should handle specific scenario', async () => {
      // ...
    });
  });
});
```

**Key patterns:**
- Always import `describe`, `it`, `expect`, `beforeEach`, `vi`, `Mocked` from `vitest`
- Use `beforeEach` for test setup (create mocks and system under test)
- Use `afterEach` with `mockReset()` when mocks need explicit cleanup
- Use `vi.restoreAllMocks()` in `afterEach` for spy cleanup

## Mocking

**Typed mock pattern (primary approach):**
```typescript
let repository: Mocked<IAuthorizationRepository>;

beforeEach(() => {
  repository = {
    readAllByQuerystring: vi.fn(),
    readOnlyOneByQuery: vi.fn().mockResolvedValue({ idToken: 1 }),
  } as unknown as Mocked<IAuthorizationRepository>;
});
```

**Key characteristics:**
- Create partial mock objects with only the methods needed for the test
- Cast via `as unknown as Mocked<InterfaceType>` to satisfy TypeScript
- Use `vi.fn()` for all mock methods
- Chain `.mockResolvedValue()` for async methods
- Chain `.mockRejectedValue()` for error cases
- Chain `.mockReturnValue()` for sync methods

**Module mocking (for complex dependencies):**
```typescript
vi.mock('@citrineos/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@citrineos/data')>();
  return {
    ...actual,
    InstalledCertificate: MockInstalledCertificate,
  };
});
```

**Decorator mocking (for API tests):**
```typescript
vi.mock('reflect-metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('reflect-metadata')>();
  return { ...actual };
});
vi.spyOn(Reflect, 'getMetadata').mockReturnValue([]);
```

**Logger mocking (from** `03_Modules/Certificates/vitest.setup.ts`**):**
```typescript
export const mockLogger = {
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  getSubLogger: vi.fn(),
} as unknown as Logger<any>;

vi.mock('tslog', async () => {
  const actual = await vi.importActual('tslog');
  return { ...actual, Logger: vi.fn(() => mockLogger) };
});
```

**What to mock:**
- Repository interfaces (`IAuthorizationRepository`, `ITransactionEventRepository`, etc.)
- External service clients (`IAuthorizer`, filter classes)
- Logger (`tslog`)
- Fastify instance

**What NOT to mock:**
- The system under test itself
- Value objects and data transfer objects
- Mapper/converter functions (test them directly)
- Enum values and constants

## Fixtures and Factories (Providers)

**Provider pattern with UpdateFunction (primary approach):**
```typescript
// File: test/providers/TransactionProvider.ts
import { applyUpdateFunction, UpdateFunction } from '../utils/UpdateUtil.js';

export function aTransaction(updateFunction?: UpdateFunction<Transaction>): Transaction {
  const item: Transaction = {
    id: faker.string.uuid(),
    stationId: faker.string.uuid(),
    transactionId: faker.string.uuid(),
    isActive: true,
    chargingState: OCPP2_0_1.ChargingStateEnumType.Charging,
    totalKwh: faker.number.float({ min: 0, max: 100 }),
  } as Transaction;

  return applyUpdateFunction(item, updateFunction);
}
```

**UpdateFunction utility (duplicated across packages):**
```typescript
// File: test/utils/UpdateUtil.ts
export type UpdateFunction<T> = (item: T) => void;

export const applyUpdateFunction = <T>(item: T, updateFunction?: UpdateFunction<T>): T => {
  if (updateFunction) {
    updateFunction(item);
  }
  return item;
};
```

Present in: `01_Data/test/utils/`, `02_Util/test/utils/`, `03_Modules/Configuration/test/utils/`, `03_Modules/Monitoring/test/utils/`, `03_Modules/Transactions/test/utils/`

**Provider with Partial override (alternative approach):**
```typescript
// File: test/providers/Tariff.ts
export function aTariff(override?: Partial<Tariff>): Tariff {
  return {
    id: faker.string.uuid(),
    currency: 'USD',
    pricePerKwh: faker.number.float({ min: 0, max: 5 }),
    ...override,
  } as Tariff;
}
```

**Using providers in tests:**
```typescript
// With UpdateFunction (mutating):
const authorization = anAuthorization((auth) => {
  auth.status = AuthorizationStatusEnum.Blocked;
});

// With Partial override (spreading):
const tariff = aTariff({ pricePerKwh: 0.09 });
```

**Provider naming convention:**
- Function prefix `a` or `an`: `aTransaction()`, `anAuthorization()`, `aRequest()`
- File names: `TransactionProvider.ts`, `AuthorizationProvider.ts`, or just `Tariff.ts`
- Located in `test/providers/` directory

**Provider locations across packages:**

| Package | Providers Path | Providers |
|---------|---------------|-----------|
| `01_Data` | `01_Data/test/providers/` | `Authorization.ts`, `Boot.ts`, `MeterValue.ts` |
| `02_Util` | `02_Util/test/providers/` | `ACME.ts`, `AuthenticationOptionsProvider.ts`, `CertificateAuthority.ts`, `ChargingStationProvider.ts`, `Hubject.ts`, `IncomingMessageProvider.ts`, `ValidatorProvider.ts`, `VariableAttributeProvider.ts` |
| Certificates | `03_Modules/Certificates/test/providers/` | `ChargingStation.ts`, `DeleteCertificateRequestProvider.ts`, `InstallCertificateRequestProvider.ts`, `SystemConfig.ts`, `UploadExistingCertificateProvider.ts` |
| Configuration | `03_Modules/Configuration/test/providers/` | `BootConfigProvider.ts`, `SendCall.ts` |
| Monitoring | `03_Modules/Monitoring/test/providers/` | `Monitoring.ts` |
| OcppRouter | `03_Modules/OcppRouter/test/providers/` | `SubscriptionProvider.ts` |
| Transactions | `03_Modules/Transactions/test/providers/` | `AuthorizationProvider.ts`, `DeviceModelProvider.ts`, `IdTokenProvider.ts`, `MessageContextProvider.ts`, `StatusNotification.ts`, `Tariff.ts`, `TransactionProvider.ts` |

## Test Types

**Unit Tests:**
- Primary test type in the codebase
- Test individual service classes, mappers, validators, and utilities
- Mock all external dependencies (repositories, external services)
- ~36 test files across all packages

**Integration Tests:**
- One integration test file: `02_Util/test/certificate/client/Hubject.integration.test.ts`
- Uses `describe.skip(...)` - requires real credentials to run
- Not part of CI pipeline

**E2E / API Tests:**
- Newman (Postman) collection at `.github/workflows/tests/CI/collection.json`
- Runs against Docker Compose in CI (`.github/workflows/test-build-server.yml`)
- Tests the server via HTTP requests against a fully running system
- Not run as part of `npm test`

## Coverage

**Requirements:** No enforced coverage thresholds.

**Configuration:**
```typescript
// vitest.config.ts
coverage: {
  reporter: ['text', 'json', 'html'],
},
```

**View Coverage:**
```bash
npm run coverage    # Generates text, json, html reports
```

**Coverage by package (approximate):**

| Package | Test Files | Coverage Notes |
|---------|-----------|----------------|
| `00_Base` | 4 test files | Money, Currency, MeterValueUtils, OCPPValidator |
| `01_Data` | 4 test files | Mapper tests for Authorization, Location, MeterValue; ChargingStationSequence |
| `02_Util` | 8 test files | Certificate utils, authenticator filters, file storage, parser, validator |
| `03_Modules/Certificates` | 3 test files | DataApi, installCertificateHelperService, MessageApi |
| `03_Modules/Configuration` | 1 test file | BootNotificationService |
| `03_Modules/EVDriver` | 1 test file | LocalAuthListService |
| `03_Modules/Monitoring` | 1 test file | MonitoringService |
| `03_Modules/OcppRouter` | 2 test files | WebhookDispatcher, MessageRouterImpl |
| `03_Modules/Reporting` | 0 test files | No tests |
| `03_Modules/SmartCharging` | 0 test files | No tests |
| `03_Modules/Tenant` | 0 test files | No tests |
| `03_Modules/Transactions` | 5 test files | CostCalculator, CostNotifier, Scheduler, StatusNotificationService, TransactionService |
| `Server` | 0 test files | No tests |

**Under-tested areas:**
- `03_Modules/Reporting/` - no test files
- `03_Modules/SmartCharging/` - no test files
- `03_Modules/Tenant/` - no test files
- `Server/` - no unit tests (only Newman e2e)
- Module handler methods (the `@AsHandler` decorated methods on module classes) - not directly unit tested
- Data model validations and Sequelize hooks

## Common Patterns

**Async Testing:**
```typescript
it('should return Unknown status when authorizations length is not 1', async () => {
  authorizationRepository.readAllByQuerystring.mockResolvedValue([]);

  const response = await transactionService.authorizeOcpp201IdToken(
    DEFAULT_TENANT_ID,
    transactionEventRequest,
    messageContext,
  );

  expect(response.idTokenInfo!.status).toBe(
    OCPP2_0_1.AuthorizationStatusEnumType.Unknown,
  );
});
```

**Error Testing:**
```typescript
it('should reject when unknown station filter rejects', async () => {
  unknownStationFilter.authenticate.mockRejectedValue(new Error('Unknown station'));

  await expect(
    authenticator.authenticate(aRequest({ url: `wss://citrineos.io/${stationId}` }), ...)
  ).rejects.toThrow();
});

it('should throw an error for unknown statuses', () => {
  expect(() =>
    AuthorizationMapper.fromAuthorizationStatusEnumType('InvalidStatus' as AuthorizationStatusType),
  ).toThrow('Unknown authorization status');
});
```

**Parameterized Testing (it.each):**
```typescript
it.each([
  { tariff: aTariff({ pricePerKwh: 0.09 }), kwh: 20, expectedCost: 1.8 },
  { tariff: aTariff({ pricePerKwh: 0.14 }), kwh: 20, expectedCost: 2.8 },
  { tariff: aTariff({ pricePerKwh: 0.23 }), kwh: 20, expectedCost: 4.6 },
])('should calculate cost using provided kWh', async ({ tariff, kwh, expectedCost }) => {
  givenTariff(tariff);
  expect(
    await costCalculator.calculateTotalCost(DEFAULT_TENANT_ID, tariff.stationId, kwh),
  ).toBe(expectedCost);
});
```

Also used with array-style arguments:
```typescript
it.each([
  [0, new Big(0)],
  [11.6, new Big('11.60')],
] as Array<[number, Big]>)('should instantiate from number', (numberAmount, expectedAmount) => {
  const money = Money.of(numberAmount, 'USD');
  expect(money.amount).toEqual(expectedAmount);
});
```

**Given/When/Then helper functions:**
```typescript
function givenTariff(tariff: Tariff) {
  tariffRepository.findByStationId.mockResolvedValue(tariff);
  return tariff;
}
```

**Enum mapping tests (exhaustive):**
```typescript
const statuses = [
  { input: AuthorizationStatusEnum.Accepted, output: OCPP2_0_1.AuthorizationStatusEnumType.Accepted },
  { input: AuthorizationStatusEnum.Blocked, output: OCPP2_0_1.AuthorizationStatusEnumType.Blocked },
  // ... all values
];

statuses.forEach(({ input, output }) => {
  it(`should map ${input} to ${output}`, () => {
    const result = AuthorizationMapper.fromAuthorizationStatusEnumType(input);
    expect(result).toBe(output);
  });
});
```

**Vitest setup files:**
- Only one setup file exists: `03_Modules/Certificates/vitest.setup.ts`
- Provides shared mock logger, mock Fastify instance, mock file storage, and mock `jsrsasign` library
- Referenced via module-level config, not root vitest.config.ts

## Writing New Tests

**Checklist for adding tests to a module:**

1. Create test file at `{package}/test/module/{ClassName}.test.ts`
2. Create provider files in `{package}/test/providers/` for test data factories
3. If the package doesn't have `test/utils/UpdateUtil.ts`, copy from an existing package
4. Import all vitest utilities from `vitest`: `import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest'`
5. Mock dependencies using the `Mocked<Interface>` + `as unknown as` pattern
6. Use `@faker-js/faker` for random test data
7. Use `DEFAULT_TENANT_ID` from `@citrineos/base` for tenant ID in tests
8. Use `.js` extension in all relative imports

---

*Testing analysis: 2026-03-26*
