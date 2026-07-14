// ============================================================================
// pages/SafeDetailPage.tsx — Safe detail with tabs (transactions / settings)
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Settings, ListTodo, RefreshCw, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { SafeInfo } from '@/components/safe/SafeInfo'
import { OwnersList } from '@/components/safe/OwnersList'
import { TokenBalances } from '@/components/safe/TokenBalances'
import { TransactionList } from '@/components/transaction/TransactionList'
import { NewTransactionForm } from '@/components/transaction/NewTransactionForm'
import { AddOwner } from '@/components/settings/AddOwner'
import { RemoveOwner } from '@/components/settings/RemoveOwner'
import { ChangeThreshold } from '@/components/settings/ChangeThreshold'
import { DepositModal } from '@/components/safe/DepositModal'
import { useSafe } from '@/hooks/useSafe'
import { useSafeTransactions } from '@/hooks/useSafeTransactions'
import { useWallet } from '@/hooks/useWallet'
import { useAppStore } from '@/stores/useAppStore'
import { toast } from 'sonner'
import { SAFE_FUNCTIONS } from '@/types'
import type { SafeTransaction } from '@/types'

type Tab = 'transactions' | 'settings'

export function SafeDetailPage() {
  const { safeAddress } = useParams<{ safeAddress: string }>()
  const navigate = useNavigate()
  const { address, isConnected, sendContractCall } = useWallet()
  const safe = useSafe(safeAddress)
  const { safeInfo, transactions, loading, load } = safe
  const { pending, executed, readyToExecute, error } = useSafeTransactions(safe)
  const addKnownSafe = useAppStore((s) => s.addKnownSafe)
  const [tab, setTab] = useState<Tab>('transactions')
  const [showNewTx, setShowNewTx] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)

  // Cache this Safe as known — MUST be in useEffect, not in render body
  useEffect(() => {
    if (safeAddress) addKnownSafe(safeAddress)
  }, [safeAddress, addKnownSafe])

  const userIsOwner = address ? safeInfo?.owners.includes(address) ?? false : false
  const userHasConfirmed = (tx: SafeTransaction) => !!address && tx.confirmations.includes(address)

  // Call a state-changing method on the Safe contract via the 0xio wallet.
  // The extension handles nonce, signing, and submission.
  const callSafe = async (methodName: string, args: Array<string | number | boolean>, successMsg: string, errorMsg: string) => {
    if (!address || !isConnected || !safeAddress) return
    try {
      const result = await sendContractCall({
        contract: safeAddress,
        method: methodName,
        args,
        ou: '1000',
      })
      // 0xio SDK returns { txHash, success, status, ... }
      if (result.success || result.status === 'confirmed') {
        toast.success(successMsg)
        load()
      } else {
        toast.error(`${errorMsg}: tx ${result.status ?? 'failed'}`)
      }
    } catch (e) {
      toast.error(errorMsg, { description: e instanceof Error ? e.message : '' })
    }
  }

  const handleConfirm = (tx: SafeTransaction) => {
    callSafe(SAFE_FUNCTIONS.confirmTransaction, [tx.id], 'Transaction confirmed', 'Confirm failed')
  }

  const handleExecute = (tx: SafeTransaction) => {
    callSafe(SAFE_FUNCTIONS.executeTransaction, [tx.id], 'Transaction executed', 'Execute failed')
  }

  if (loading && !safeInfo) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!safeInfo) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Skeleton className="h-32" />
        <p className="text-xs text-text-muted text-center">
          {error ? `Error: ${error}` : 'Loading Safe...'}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {userIsOwner && (
            <Button variant="outline" size="sm" onClick={() => setShowDeposit(true)}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Deposit</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-xl bg-status-failed/10 border border-status-failed/30 text-xs text-status-failed">
          Failed to load latest data: {error}. Will retry in background.
        </div>
      )}

      {/* Safe overview */}
      <SafeInfo safe={safeInfo} isOwner={userIsOwner} />

      {/* Two-column layout: balances + owners */}
      <div className="grid lg:grid-cols-2 gap-4">
        <TokenBalances walletAddress={safeInfo.address} />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Owners</h3>
            <span className="text-xs text-text-muted">{safeInfo.ownerCount} total</span>
          </div>
          <OwnersList owners={safeInfo.owners} threshold={safeInfo.threshold} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'transactions', label: 'Transactions', icon: <ListTodo className="h-3.5 w-3.5" />, count: pending.length + executed.length },
          { id: 'settings', label: 'Settings', icon: <Settings className="h-3.5 w-3.5" /> },
        ]}
        active={tab}
        onChange={(t) => setTab(t as Tab)}
      />

      {/* Tab content */}
      {tab === 'transactions' && (
        <div className="space-y-4">
          {!showNewTx ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">Transaction Queue</h3>
                {userIsOwner && (
                  <Button size="sm" onClick={() => setShowNewTx(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    New Transaction
                  </Button>
                )}
              </div>

              {/* Ready to execute highlight */}
              {readyToExecute.length > 0 && (
                <div className="p-3 rounded-xl bg-accent-blue/5 border border-accent-blue/20">
                  <p className="text-xs text-accent-blue font-medium mb-2">
                    {readyToExecute.length} transaction{readyToExecute.length > 1 ? 's' : ''} ready to execute
                  </p>
                </div>
              )}

              <TransactionList
                transactions={pending}
                safeAddress={safeInfo.address}
                loading={loading}
                emptyTitle="No pending transactions"
                emptyDescription="All clear! Create a new transaction to get started."
                emptyIcon={<ListTodo className="h-6 w-6" />}
                canConfirm={(tx) => userIsOwner && !userHasConfirmed(tx) && tx.confirmationCount < tx.threshold}
                canExecute={(tx) => userIsOwner && tx.confirmationCount >= tx.threshold}
                hasConfirmed={userHasConfirmed}
                onConfirm={handleConfirm}
                onExecute={handleExecute}
              />

              {executed.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-text-primary pt-4">History</h3>
                  <TransactionList
                    transactions={executed}
                    safeAddress={safeInfo.address}
                    emptyTitle="No executed transactions yet"
                  />
                </>
              )}
            </>
          ) : (
            <NewTransactionForm
              safeAddress={safeInfo.address}
              safeBalance={parseInt(safeInfo.balanceRaw || '0', 10)}
              threshold={safeInfo.threshold}
              onSubmitted={() => { setShowNewTx(false); load() }}
              onCancel={() => setShowNewTx(false)}
            />
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          {!userIsOwner ? (
            <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
              <p className="text-sm text-text-secondary">
                You are not an owner of this Safe. Settings are read-only.
              </p>
            </div>
          ) : (
            <>
              <ChangeThreshold
                safeAddress={safeInfo.address}
                currentThreshold={safeInfo.threshold}
                ownerCount={safeInfo.ownerCount}
                onSubmitted={load}
              />
              <AddOwner
                safeAddress={safeInfo.address}
                currentOwnerCount={safeInfo.ownerCount}
                onSubmitted={load}
              />
              <RemoveOwner
                safeAddress={safeInfo.address}
                owners={safeInfo.owners}
                onSubmitted={load}
              />
            </>
          )}
        </div>
      )}

      {/* Deposit modal */}
      <DepositModal
        isOpen={showDeposit}
        onClose={() => setShowDeposit(false)}
        safeAddress={safeInfo.address}
        onDeposited={() => { setShowDeposit(false); load() }}
      />
    </div>
  )
}
