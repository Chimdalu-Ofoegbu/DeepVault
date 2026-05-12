// indexer/src/types.ts — Phase 4 Plan 04-02 wire-format types.
//
// All u64 fields cross the relay→browser boundary as STRINGS (Pitfall 8
// mitigation; Phase 3 WAVE0-DECISION.md Q5). Browsers parse via BigInt();
// the relay never floats a u64 through `Number`.
//
// I64 (Move signed integer) decodes via decodeI64.ts and is emitted as a
// signed-integer-string (e.g. "-123456789").

/**
 * Raw I64 shape emitted in @mysten/sui `parsedJson`.
 *
 * Source-of-truth: scripts/deepbookv3/packages/predict/sources/helper/i64.move:13-16
 * The field name is `is_negative` (NOT `negative` — RESEARCH.md A2 corrected
 * by PATTERNS.md). decodeI64.ts asserts the literal field name; a unit test
 * fails if a refactor regresses to `negative`.
 */
export type RawI64 = { magnitude: string; is_negative: boolean };

/**
 * Per-oracle SVI surface snapshot maintained by `Snapshot.applyOracleEvent`.
 * `rho_signed` and `m_signed` are pre-decoded via decodeI64 — clients should
 * BigInt() them directly without re-handling the `{ magnitude, is_negative }`
 * struct.
 */
export type SurfaceSnapshot = {
  oracle_id: string;
  a: string; // u64-as-string
  b: string; // u64-as-string
  rho_signed: string; // signed-int-as-string (decoded from i64)
  m_signed: string; // signed-int-as-string (decoded from i64)
  sigma: string; // u64-as-string
  timestamp_ms: string; // u64-as-string (chain time)
  last_updated_ms: string; // u64-as-string (relay wall-clock at apply time)
};

/**
 * Ring buffer entry. Pushed on every applyOracleEvent / applyVaultEvent.
 * `data` is the same payload broadcast on the wire as `{type:'event'}`.
 */
export type RingEvent = {
  name: string;
  ts_ms: string;
  data: Record<string, unknown>;
};

/**
 * Vault state snapshot — populated by future Plan 03 getObject pollers.
 * Plan 02 ships the slot + setter so wsServer can broadcast on connect even
 * before the live poll is wired.
 */
export type VaultStateSnapshot = {
  vault_id: string;
  balance: string;
  total_assets: string;
  total_shares: string;
  paused: boolean;
  last_updated_ms: string;
} | null;

/**
 * Full snapshot frame sent on every new WebSocket client connect (D-02).
 */
export type FullSnapshot = {
  oracles: SurfaceSnapshot[];
  vault: VaultStateSnapshot;
  ring_buffer: RingEvent[];
  served_at_ms: string;
};

/**
 * Wire-protocol message kinds (D-03 — three kinds: snapshot, event, heartbeat).
 */
export type WsMessage =
  | { type: 'snapshot'; data: FullSnapshot }
  | { type: 'event'; name: string; data: Record<string, unknown> }
  | { type: 'heartbeat'; ts_ms: string };

/**
 * Shape of TESTNET-DEPLOY.json — extends the Phase 3 base
 * (scripts/e2e-vault-cycle.ts:107-114) with Phase 4 optional `oracle_svi_id`.
 *
 * The pre-deploy fixture ships `status: "pending_first_deploy"` with
 * `package_id: "PENDING"` etc. — isDeployed() guards against running the
 * polling loops in that state.
 */
export type DeployJson = {
  network: string;
  status: string;
  deployed_at_iso: string;
  deploy_tx_digest: string;
  deployer: string;
  package_id: string;
  vault_id: string;
  vault_initial_shared_version: number;
  admin_cap_id: string;
  predict_manager_id: string;
  predict_manager_initial_shared_version: number;
  predict_package_id: string;
  predict_registry_id: string;
  predict_top_level_id: string;
  dusdc_type_tag: string;
  oracle_svi_id?: string;
};
