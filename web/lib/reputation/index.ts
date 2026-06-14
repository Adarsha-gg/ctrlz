export { REPUTATION_CONFIG, type Tier } from "./config.ts";
export type {
  EventClass,
  FraudKind,
  FraudEvent,
  AgentRecord,
  OperatorCluster,
  TrustBreakdown,
  AgentTrust
} from "./types.ts";
export {
  decay,
  floorLift,
  hasFraudPattern,
  contamination,
  trustForAgent,
  scoreCluster
} from "./score.ts";
export { classifyResolution } from "./classify.ts";
export { runReputationSelfcheck, type SelfcheckResult } from "./selfcheck.ts";
