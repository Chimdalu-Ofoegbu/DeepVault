// dashboard/src/main.tsx — Phase 4 Wave 0 provider stack entry point.
//
// Provider order is LOAD-BEARING (Pitfall 10 mitigation):
//   QueryClientProvider          (peer dep of dapp-kit)
//     SuiClientProvider          (defines network BEFORE wallet attempts autoConnect)
//       WalletProvider           (autoConnect is now safe — network already set)
//         ThemeProvider          (next-themes class toggle on <html>)
//           <App /> + <Toaster />
//
// If WalletProvider opens BEFORE SuiClientProvider, autoConnect can race
// the network selection and briefly display the wallet on the wrong chain
// (Pitfall 10). Plan verify asserts the offset ordering with a character
// position check.
//
// Rule 3 deviation from plan body: in @mysten/sui@2.16.0 (CLAUDE.md pin)
// the helper renamed `getFullnodeUrl` → `getJsonRpcFullnodeUrl` and moved
// from `@mysten/sui/client` → `@mysten/sui/jsonRpc`. NetworkConfig also
// requires a `network` discriminator field. Both are tracked here.

import '@mysten/dapp-kit/dist/index.css';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/500.css';
import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';

import { App } from './App';
import { env } from './env';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchInterval: 10_000, retry: 1 },
  },
});

const networks = {
  testnet: { url: getJsonRpcFullnodeUrl('testnet'), network: 'testnet' as const },
  mainnet: { url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' as const },
};

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork={env.suiNetwork}>
        <WalletProvider autoConnect>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <App />
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
