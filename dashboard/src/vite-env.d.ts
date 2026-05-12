/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_WS_URL: string;
  readonly VITE_SUI_NETWORK?: 'testnet' | 'mainnet';
  readonly VITE_PREDICT_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
