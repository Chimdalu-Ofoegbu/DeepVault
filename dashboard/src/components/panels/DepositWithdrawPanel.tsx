// dashboard/src/components/panels/DepositWithdrawPanel.tsx — Plan 04-07 Task 2 (DASH-11).
//
// 3-step Input -> Review -> Execute flow per UI-SPEC §Deposit/Redeem flow:
//   Step 1 (Input):  amount field with client-side validation (>0, ≤ wallet balance)
//   Step 2 (Review): shadcn <Dialog> with PTB preview + estimated gas
//   Step 3 (Execute): useSignAndExecuteTransaction with Sonner toasts
//
// Pre-sign balance check (Pitfall 5 mitigation): client.getCoins({owner, coinType})
// is queried before opening the Review dialog. If total balance < requested
// amount, the panel emits the UI-SPEC verbatim copy "Insufficient DUSDC. You
// have X; this deposit requires Y." via a Sonner toast.
//
// Three empty states (UI-SPEC §Empty states + §Error states):
//   1. wallet disconnected → "Connect wallet to deposit or redeem"
//   2. vault not deployed → "Vault not yet deployed to testnet..."
//   3. wallet connected + deployed → Tabs(Deposit, Redeem)
//
// Destructive copy contract (UI-SPEC §Destructive actions): Cancel request is
// the ONLY destructive Dialog. Fulfill redemption uses the default Dialog
// variant (irreversible payout but not destructive — destructive is reserved
// for "Cancel" per UI-SPEC).

import { useEffect, useMemo, useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TxDigestLink } from '@/components/primitives/TxDigestLink';
import type { VaultView } from '@/hooks/useVaultState';
import { DEPLOY, isDeployed } from '@/lib/ptbDeploy';
import {
  buildSupplyTx,
  buildRedeemRequestTx,
  buildRedeemFulfillTx,
  buildRedeemCancelTx,
} from '@/lib/ptbBuilders';
import { formatDusdc } from '@/lib/format';

// DUSDC micro-unit divisor (6 decimals). Local copy — keep in lockstep with
// format.ts DUSDC_DIVISOR (which is not currently exported).
const DUSDC_DECIMALS = 6;

function parseDusdcInput(value: string): bigint | null {
  if (!value || !/^\d*\.?\d*$/.test(value.trim())) return null;
  const [whole, frac = ''] = value.trim().split('.');
  const fracPadded = frac.padEnd(DUSDC_DECIMALS, '0').slice(0, DUSDC_DECIMALS);
  try {
    return BigInt(whole || '0') * 10n ** BigInt(DUSDC_DECIMALS) + BigInt(fracPadded || '0');
  } catch {
    return null;
  }
}

type Props = {
  vaultView: VaultView;
};

export function DepositWithdrawPanel({ vaultView }: Props) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const deployed = isDeployed();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  // State 1: wallet disconnected.
  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deposit / Redeem</CardTitle>
          <CardDescription>
            Connect a wallet to deposit DUSDC and mint vault shares, or to
            redeem an open position.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-slate-200">
            Connect wallet to deposit or redeem
          </p>
        </CardContent>
      </Card>
    );
  }

  // State 2: vault not deployed.
  if (!deployed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deposit / Redeem</CardTitle>
          <CardDescription>DUSDC deposit + share redemption.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Vault not yet deployed to testnet. The dashboard is in snapshot-only
            mode — live events resume after deploy.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deposit / Redeem</CardTitle>
        <CardDescription>
          Deposit DUSDC to mint vault shares + open a hedged position. Redeem
          via two-step queue (1h cooldown).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="deposit">
          <TabsList>
            <TabsTrigger value="deposit">Deposit</TabsTrigger>
            <TabsTrigger value="redeem">Redeem</TabsTrigger>
          </TabsList>
          <TabsContent value="deposit">
            <DepositForm
              account={account}
              client={client}
              vaultView={vaultView}
              signAndExecute={signAndExecute}
              isPending={isPending}
            />
          </TabsContent>
          <TabsContent value="redeem">
            <RedeemForm
              account={account}
              client={client}
              signAndExecute={signAndExecute}
              isPending={isPending}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Deposit subtree
// ----------------------------------------------------------------------------

type SignAndExecuteMutate = ReturnType<typeof useSignAndExecuteTransaction>['mutate'];

function DepositForm({
  account,
  client,
  vaultView,
  signAndExecute,
  isPending,
}: {
  account: { address: string };
  client: ReturnType<typeof useSuiClient>;
  vaultView: VaultView;
  signAndExecute: SignAndExecuteMutate;
  isPending: boolean;
}) {
  const [amountStr, setAmountStr] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [coinId, setCoinId] = useState<string | null>(null);

  const amount = useMemo(() => parseDusdcInput(amountStr), [amountStr]);
  const expectedShares = useMemo(() => {
    if (amount === null || amount <= 0n) return 0n;
    if (!vaultView) return amount; // first depositor: 1:1 by convention
    const ta = BigInt(vaultView.vault.total_assets);
    const ts = BigInt(vaultView.vault.total_shares);
    if (ts === 0n) return amount;
    return (amount * ts) / (ta + 1n);
  }, [amount, vaultView]);

  async function onClickDeposit() {
    if (amount === null || amount <= 0n) {
      toast.error('Enter a positive DUSDC amount.');
      return;
    }
    // Pre-sign balance check (Pitfall 5 — UI-SPEC verbatim copy).
    const coins = await client.getCoins({
      owner: account.address,
      coinType: DEPLOY.dusdc_type_tag,
    });
    const total = coins.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    if (total < amount) {
      toast.error(
        `Insufficient DUSDC. You have ${formatDusdc(total)}; this deposit requires ${formatDusdc(amount)}.`,
      );
      return;
    }
    if (coins.data.length === 0) {
      toast.error('No DUSDC coin objects found in this wallet.');
      return;
    }
    setCoinId(coins.data[0].coinObjectId);
    setDialogOpen(true);
  }

  function onConfirmDeposit() {
    if (amount === null || coinId === null) return;
    const tx = buildSupplyTx({
      deploy: DEPLOY,
      depositCoinId: coinId,
      depositAmountMicro: amount,
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          const digest = 'digest' in result ? result.digest : '';
          toast.success('Deposit succeeded', {
            description: (
              <TxDigestLink digest={digest} />
            ) as unknown as string,
          });
          setDialogOpen(false);
          setAmountStr('');
        },
        onError: (err) => {
          const msg = String(err?.message ?? err);
          if (/reject/i.test(msg)) {
            toast.error('Transaction rejected. No funds moved.');
          } else {
            toast.error('Deposit failed', { description: msg });
          }
          setDialogOpen(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <label className="block text-sm font-medium text-slate-200">
        Amount (DUSDC)
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="mt-2"
        />
      </label>
      <p className="text-sm text-slate-400">
        You receive ~
        <span className="font-mono tabular-nums">{expectedShares.toString()}</span>{' '}
        shares, gas ~0.01 SUI
      </p>
      <Button onClick={onClickDeposit} disabled={amount === null || amount <= 0n || isPending}>
        Deposit DUSDC
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirm deposit of {amount !== null ? formatDusdc(amount) : '0.00'} DUSDC
            </DialogTitle>
            <DialogDescription>
              You will receive approximately {expectedShares.toString()} shares.
              A binary put hedge will be minted atomically against the BTC oracle
              SVI surface. Estimated gas: ~0.01 SUI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Back
            </Button>
            <Button onClick={onConfirmDeposit} disabled={isPending}>
              {isPending ? 'Signing...' : `Confirm deposit of ${amount !== null ? formatDusdc(amount) : '0.00'} DUSDC`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Redeem subtree
// ----------------------------------------------------------------------------

function RedeemForm({
  account,
  client,
  signAndExecute,
  isPending,
}: {
  account: { address: string };
  client: ReturnType<typeof useSuiClient>;
  signAndExecute: SignAndExecuteMutate;
  isPending: boolean;
}) {
  const [shareCoinId, setShareCoinId] = useState<string | null>(null);
  const [shareBalance, setShareBalance] = useState<bigint>(0n);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false);

  // Discover the user's Coin<SHARE>. v1: pick the first share coin if any.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const shareType = `${DEPLOY.package_id}::share::SHARE`;
      try {
        const coins = await client.getCoins({
          owner: account.address,
          coinType: shareType,
        });
        if (cancelled) return;
        if (coins.data.length === 0) {
          setShareCoinId(null);
          setShareBalance(0n);
          return;
        }
        setShareCoinId(coins.data[0].coinObjectId);
        const total = coins.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
        setShareBalance(total);
      } catch {
        // Best-effort — no SHARE coin yet (pre-supply state).
        if (!cancelled) {
          setShareCoinId(null);
          setShareBalance(0n);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account.address, client]);

  function onRequestRedeem() {
    if (!shareCoinId) {
      toast.error('No vault shares to redeem. Deposit first.');
      return;
    }
    const tx = buildRedeemRequestTx({ deploy: DEPLOY, shareCoinId });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          const digest = 'digest' in result ? result.digest : '';
          toast.success('Redemption requested', {
            description: (
              <TxDigestLink digest={digest} />
            ) as unknown as string,
          });
        },
        onError: (err) => {
          const msg = String(err?.message ?? err);
          if (/reject/i.test(msg)) {
            toast.error('Transaction rejected. No funds moved.');
          } else {
            toast.error('Redemption request failed', { description: msg });
          }
        },
      },
    );
  }

  function onConfirmFulfill() {
    const tx = buildRedeemFulfillTx({ deploy: DEPLOY });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          const digest = 'digest' in result ? result.digest : '';
          toast.success('Redemption fulfilled', {
            description: (
              <TxDigestLink digest={digest} />
            ) as unknown as string,
          });
          setFulfillDialogOpen(false);
        },
        onError: (err) => {
          const msg = String(err?.message ?? err);
          if (/reject/i.test(msg)) {
            toast.error('Transaction rejected. No funds moved.');
          } else if (/cooldown/i.test(msg) || /ECooldown/i.test(msg)) {
            toast.error('Cooldown active. Fulfill available in N minutes.');
          } else {
            toast.error('Fulfill failed', { description: msg });
          }
          setFulfillDialogOpen(false);
        },
      },
    );
  }

  function onConfirmCancel() {
    const tx = buildRedeemCancelTx({ deploy: DEPLOY });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          const digest = 'digest' in result ? result.digest : '';
          toast.success('Redemption canceled', {
            description: (
              <TxDigestLink digest={digest} />
            ) as unknown as string,
          });
          setCancelDialogOpen(false);
        },
        onError: (err) => {
          const msg = String(err?.message ?? err);
          if (/reject/i.test(msg)) {
            toast.error('Transaction rejected. No funds moved.');
          } else {
            toast.error('Cancel failed', { description: msg });
          }
          setCancelDialogOpen(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="text-sm text-slate-400">
        Current SHARE balance:{' '}
        <span className="font-mono tabular-nums">{shareBalance.toString()}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRequestRedeem} disabled={!shareCoinId || isPending}>
          Request redemption
        </Button>
        <Button
          variant="outline"
          onClick={() => setFulfillDialogOpen(true)}
          disabled={isPending}
        >
          Fulfill redemption
        </Button>
        <Button
          variant="destructive"
          onClick={() => setCancelDialogOpen(true)}
          disabled={isPending}
        >
          Cancel request
        </Button>
      </div>

      {/* Fulfill confirmation dialog — UI-SPEC §Destructive: NOT destructive variant */}
      <Dialog open={fulfillDialogOpen} onOpenChange={setFulfillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fulfill redemption?</DialogTitle>
            <DialogDescription>
              You will receive approximately your pro-rata share of vault NAV
              and burn the corresponding shares. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFulfillDialogOpen(false)}>
              Back
            </Button>
            <Button onClick={onConfirmFulfill} disabled={isPending}>
              Fulfill redemption
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel-request confirmation dialog — UI-SPEC §Destructive: destructive variant */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel redemption request?</DialogTitle>
            <DialogDescription>
              Your escrowed shares will be returned to your wallet. The 1-hour
              cooldown timer will reset if you submit a new request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep request
            </Button>
            <Button variant="destructive" onClick={onConfirmCancel} disabled={isPending}>
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
