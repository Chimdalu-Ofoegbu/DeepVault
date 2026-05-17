// dashboard/src/components/layout/Header.tsx — sticky top bar (`db-bar`).
//
// Plan 04.1-02 Task 2 (UI-SPEC #12). Reskinned from the Phase 4 flat Tailwind
// header into the handoff `db-bar`: a left breadcrumb + a right pill row
// (live pill, search pill, UTC clock, Deposit DUSDC button, wallet avatar).
// All chrome classes (.db-bar, .db-bar-l, .db-bar-r, .crumb, .db-pill,
// .db-avatar, .btn) are defined in globals.css by Plan 04.1-01.
//
// The `wsState` + `snapshot` prop signature and the `data-testid` are preserved
// so Phase 4 behavior and tests do not regress. RelayStatusPill +
// GlobalStalenessPill are folded into the pill row (their internal reskin is a
// later wave; here they are only re-placed).
//
// The `Deposit DUSDC` primary button triggers `onDepositClick` — App.tsx
// coordinates this (it scrolls to / focuses the DepositWithdrawPanel section).
// A placeholder slot is reserved in the pill row for the Plan 05 theme toggle.

import { useEffect, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit';

import { GlobalStalenessPill } from './GlobalStalenessPill';
import { RelayStatusPill } from './RelayStatusPill';
import type { FullSnapshot, WsState } from '@/lib/types';

type Props = {
  wsState: WsState;
  snapshot: FullSnapshot | null;
  /** Optional countdown to next reconnect attempt for the relay pill. */
  secondsUntilReconnect?: number;
  /** Invoked by the `Deposit DUSDC` primary button. App.tsx coordinates. */
  onDepositClick?: () => void;
};

/** Live `YYYY-MM-DD · HH:MM UTC` string, recomputed each render tick. */
function utcClockLabel(now: Date): string {
  const iso = now.toISOString(); // 2026-05-17T18:42:11.000Z
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${date} · ${time} UTC`;
}

export function Header({
  wsState,
  snapshot,
  secondsUntilReconnect,
  onDepositClick,
}: Props) {
  // UTC clock — updates once per minute (client-side, per Data Binding table).
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="db-bar">
      <div className="db-bar-l">
        <span className="crumb">
          <a href="/">DeepVault</a> <em>/</em> <a href="#">Risk Studio</a>{' '}
          <em>/</em> <b>Overview</b>
        </span>
      </div>
      <div className="db-bar-r" data-testid="header-controls">
        {/* live · testnet — RelayStatusPill carries the WsState machine. */}
        <RelayStatusPill
          state={wsState}
          secondsUntilReconnect={secondsUntilReconnect}
        />
        {/* Surface-data staleness pill. */}
        <GlobalStalenessPill snapshot={snapshot} />
        {/* Static visual-only search affordance (handoff db-pill mono). */}
        <button type="button" className="db-pill mono" tabIndex={-1}>
          ⌘K · Search
        </button>
        {/* Live UTC clock pill. */}
        <button type="button" className="db-pill mono" tabIndex={-1}>
          {utcClockLabel(now)}
        </button>
        {/* Theme-toggle slot — Plan 05 mounts the toggle control here. */}
        {/* <ThemeToggle /> */}
        {/* Primary CTA — opens the DepositWithdrawPanel deposit flow. */}
        <button
          type="button"
          className="btn btn-primary sm"
          onClick={onDepositClick}
        >
          Deposit DUSDC
        </button>
        {/* Wallet — dapp-kit ConnectButton wrapped in db-avatar chrome. */}
        <span className="db-avatar">
          <ConnectButton />
        </span>
      </div>
    </header>
  );
}
