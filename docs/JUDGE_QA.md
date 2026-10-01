# Judge Q&A

**How do you know a machine is idle?** Five-minute power is interpreted alongside active jobs, shift, optional PLC state, and time-aligned operator events. Energized without confirmed productive operation is IDLE/STANDBY; only excess time above healthy idle with a plausible cause becomes a candidate loss. Power alone does not prove avoidability.

**How does FactoryPulse work with limited instrumentation?** Factory Setup records direct, feeder-only, inferred, and unmetered coverage. Feeder or inferred attribution carries lower confidence; parent-minus-known-child energy is displayed as unallocated. SenseROI proposes a temporary branch measurement where attribution is worth clarifying.

**Where do benchmark values come from?** The first 14 simulated days supply comparable healthy SEC. Power bands, tariff, CAPEX, reduction ranges, and sensor cost are illustrative values in `data/demo-assumptions.json` and `data/interventions.ts`, not validated site/OEM/BEE benchmarks.

**How do you preserve production?** Expected energy is normalized to useful output. Decision filters hold known schedule-delay and quality-validation actions under default constraints. What-If holds good jobs/components constant and checks replacement throughput. Verification compares good jobs and rejection rates before marking the simulated case VERIFIED. A real plant still needs a controlled trial.

**How do you calculate ROI?** Candidate annual kWh saving × selected ₹/kWh gives annual energy value; simple payback is CAPEX ÷ annual financial saving × 12 months. Five-year net benefit is five years of simple annual saving less CAPEX. What-If replacement may include an explicitly entered maintenance saving in financial payback. SenseROI is a separate value-of-information ratio, not financial savings ROI.

**What happens if confidence is low?** The SEC model withholds expected energy below five healthy comparables and caps inferred/extrapolated confidence. SenseROI shows its point-by-point confidence score and recommends temporary measurement only when the estimated gain justifies its cost. A low-confidence variance is not verified waste. The Opportunity Engine has no universal numeric confidence cutoff for CAPEX, so any such scenario still needs engineering approval before implementation.

**Why not use a normal EMS?** FactoryPulse complements metering/EMS views by joining power with jobs, useful output, operator causes, intervention choices, and before/after decision evidence. It is a decision-layer prototype, not a replacement for a metering platform.

**How is this different from energy auditing?** An audit is a site investigation and validation process. FactoryPulse continuously screens simulated operating data, ranks hypotheses, and records simulated verification; an engineer still has to validate causes, safety, tariffs, and savings on site.

**How would real sensor data replace simulated data?** A production adapter would ingest timestamped kW/kWh and quality flags, map meter IDs to the configured topology, align time zones and sample intervals, and join them to MES/job, PLC, and operator events. The present app has **no live ingestion or sensor provisioning**.

**How does this integrate with Schneider hardware/EcoStruxure?** No integration is implemented. A future adapter could read appropriately licensed/authorized meter and hierarchy time series through Schneider's [EcoStruxure Power Monitoring Expert Data API](https://exchange.se.com/develop/products/118970/ecostruxure-power-monitoring-expert-data-api), which its [developer guide](https://assets.se.com/316/document/522453/APIDeveloperGuide.pdf) describes for external applications. Device/protocol availability and data permissions must be checked for the actual installation; Schneider compatibility is **proposed, not demonstrated**.

## Prototype limitations

- All factory telemetry, jobs, anomalies, intervention outcomes, and “verified” savings are simulated. There are **no MEASURED factory values** and no causal field validation.
- Healthy history is 14 simulated days; simple medians and heuristic confidence scores cannot capture all product mix, weather, maintenance, or production constraints.
- The Energy Map's issue markers follow the demo scenario schedule; unallocated energy and inferred machine use are modeled estimates, not physically reconciled meter readings.
- Annualization assumes 312 similar production days. Simple payback excludes demand charges, tariff slabs, taxes, degradation, financing, maintenance uncertainty, and implementation downtime except where a What-If maintenance input is explicit.
- Default production/quality guardrails use intervention assumptions and selected constraints; they do **not prove** that an action preserves throughput or product quality in a real plant.
- Energy Map cost uses the simulator's ₹9.20/kWh; decision scenarios default to ₹9/kWh. Align tariffs before comparing values outside this demo.
- The Opportunity Engine uses declared risk, production, and quality constraints but has no universal diagnostic-confidence cutoff; site approval remains necessary for CAPEX. SenseROI estimates the value of reducing uncertainty, not guaranteed savings. Verification replays a synthetic after period, so its VERIFIED status means **internally calculated demo result**, not independently observed M&V.
- No live Schneider connection, real sensor provisioning, authentication, or production deployment workflow exists.
