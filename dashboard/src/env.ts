// dashboard/src/env.ts — Vite import.meta.env wrapper with strict
// required-key validation. Analog: scripts/e2e-vault-cycle.ts:142-148
// (Node env-var pattern). VITE_* values are baked into the client bundle
// at build time; treat them as PUBLIC (chain IDs, RPC URLs only — no
// secrets).

const required = (key: string, value: string | undefined): string => {
  if (!value || value.length === 0) {
    throw new Error(
      `${key} env var required (set in dashboard/.env or Vercel project Environment Variables)`,
    );
  }
  return value;
};

export type SuiNetwork = 'testnet' | 'mainnet';

export const env = {
  relayWsUrl: required('VITE_RELAY_WS_URL', import.meta.env.VITE_RELAY_WS_URL),
  suiNetwork: (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as SuiNetwork,
  predictServerUrl: import.meta.env.VITE_PREDICT_SERVER_URL as string | undefined,
};
