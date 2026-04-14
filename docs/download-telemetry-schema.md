# Download Telemetry Schema

Source of truth:
- `src/download-capabilities/telemetry.ts`

Current event type:
- `download_outcome`

Current schema version:
- `1`

## Fields

Each JSONL line is one `download_outcome` event with:

- `schemaVersion`: integer version of the line schema
- `eventType`: currently always `download_outcome`
- `recordedAt`: ISO datetime
- `traceId`: download trace identifier
- `siteId`: resolved site identity
- `providerId`: resolved provider identity
- `interactionMode`: `paste | drag | context_menu | injected_button | page_bridge | unknown`
- `engineChain`: ordered engine list considered for the request
- `chosenEngine`: engine actually executed for the final outcome, or `null`
- `outcome`: `success | failure`
- `errorCode`: runtime error code, or `null`
- `errorClassification`: classified failure category, or `null`
- `errorMessage`: human-readable error summary, or `null`

## Stability Rules

- Adding a new optional field is backward-compatible and does not require a schema version bump.
- Renaming a field, removing a field, or changing the meaning/type of an existing field requires a schema version bump.
- Report generators must read and preserve `schemaVersion` before interpreting lines.
- New consumers should validate each line against `downloadTelemetryEventSchema` instead of assuming shape.

## Reporting Contract

Current local report outputs should be derived from:
- total success / failure counts
- per-site success rates
- auth-required hotspots
- high-risk site/engine combinations

If future reports need more dimensions, prefer adding optional fields first and keeping the existing fields stable.
