# Requirements: CitrineOS OCPP 2.1 V2X Discharge Testing

**Defined:** 2026-03-26
**Core Value:** A charging station client can connect to CitrineOS over OCPP 2.1 and successfully execute a V2X discharge session end-to-end.

## v1 Requirements

### Validation Infrastructure

- [ ] **VALID-01**: OCPPValidator uses correct request schema record for OCPP 2.1 message validation (fix bug at OCPPValidator.ts:144)
- [ ] **VALID-02**: ChargingState DTO enum includes "Discharging" value for V2X sessions
- [ ] **VALID-03**: Measurand DTO enum includes OCPP 2.1 V2X measurands (Energy.Active.Export.*, Display.*, Setpoint.*)

### Energy Accounting

- [ ] **ENRGY-01**: MeterValueUtils handles Energy.Active.Export.Register and Energy.Active.Export.Interval measurands
- [ ] **ENRGY-02**: totalKwh calculation accounts for bidirectional energy (net = import - export)

### Smart Charging V2X

- [ ] **SMART-01**: NotifyEVChargingNeeds handler accepts BPT energy transfer modes (AC_BPT, DC_BPT, AC_BPT_DER, DC_ACDP_BPT)
- [ ] **SMART-02**: NotifyEVChargingNeeds handler processes V2XChargingParametersType fields (maxDischargePower, minDischargePower, etc.)
- [ ] **SMART-03**: ChargingProfile calculation generates discharge-aware profiles with dischargeLimit and setpoint fields for BPT modes
- [ ] **SMART-04**: ChargingProfile mapper preserves OCPP 2.1 fields (dischargeLimit, setpoint) when persisting/sending profiles

### EVDriver Configuration

- [ ] **EVDRV-01**: NotifyAllowedEnergyTransfer action is routed to EVDriver module in all config files (docker.ts, local.ts, swarm.docker.ts)

### Connection Guide

- [ ] **GUIDE-01**: Documentation explains how to connect an OCPP 2.1 charging station client to CitrineOS (WebSocket URL, subprotocol, auth, Docker setup)

## v2 Requirements

### Transaction Handlers

- **TXEVT-01**: OCPP 2.1-specific TransactionEvent handler processes operationMode, costDetails, and 2.1-only fields
- **TXEVT-02**: OCPP 2.1-specific MeterValues handler processes V2X measurands and stores bidirectional meter data

### Data Models

- **MODEL-01**: Transaction model has operationMode (STRING) and totalExportKwh (DECIMAL) columns with migration
- **MODEL-02**: ChargingNeeds model has v2xChargingParameters (JSONB), controlMode, mobilityNeedsMode, availableEnergyTransfer, evEnergyOffer columns with migration

### EVDriver Full Implementation

- **EVDRV-02**: Full NotifyAllowedEnergyTransfer handler with MessageApi endpoint and response processing

### Testing

- **TEST-01**: End-to-end V2X discharge test scenario document with expected message sequence

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cost/compensation calculation for V2G discharge | High complexity, not needed for flow validation |
| DER/grid services integration | Separate domain, future work |
| GetCompositeSchedule 2.1 handler | Not required for basic V2X discharge flow |
| DynamicControl real-time setpoints | Beyond initial scheduled control validation |
| ISO 15118 / Plug&Charge | Separate concern from OCPP message flow |
| Production deployment / performance | This is dev/test validation only |
| OCPP 2.1 features unrelated to V2X | Not the focus of this effort |
| Charging station client implementation | User has their own client |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VALID-01 | | Pending |
| VALID-02 | | Pending |
| VALID-03 | | Pending |
| ENRGY-01 | | Pending |
| ENRGY-02 | | Pending |
| SMART-01 | | Pending |
| SMART-02 | | Pending |
| SMART-03 | | Pending |
| SMART-04 | | Pending |
| EVDRV-01 | | Pending |
| GUIDE-01 | | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
