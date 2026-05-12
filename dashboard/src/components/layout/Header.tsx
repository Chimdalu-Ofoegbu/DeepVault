// dashboard/src/components/layout/Header.tsx — sticky header shell.
//
// UI-SPEC §Component Inventory: Display 28px product name + GlobalStalenessPill
// + RelayStatusPill + dApp Kit <ConnectButton/>. Sticky top, slate-900 chrome,
// 1280px max-width inner container per §Spacing.
//
// Plan 04-03 Task 3: replaces the Wave-0 placeholder header in App.tsx and
// passes the WsState + snapshot down from useWebSocket.

import { ConnectButton } from '@mysten/dapp-kit';

import { GlobalStalenessPill } from './GlobalStalenessPill';
import { RelayStatusPill } from './RelayStatusPill';
import type { FullSnapshot, WsState } from '@/lib/types';

type Props = {
  wsState: WsState;
  snapshot: FullSnapshot | null;
  /** Optional countdown to next reconnect attempt for the relay pill. */
  secondsUntilReconnect?: number;
};

export function Header({ wsState, snapshot, secondsUntilReconnect }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
        <h1 className="text-[28px] font-semibold leading-[1.2]">PLP Risk Studio</h1>
        <div className="flex items-center gap-3" data-testid="header-controls">
          <GlobalStalenessPill snapshot={snapshot} />
          <RelayStatusPill
            state={wsState}
            secondsUntilReconnect={secondsUntilReconnect}
          />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
