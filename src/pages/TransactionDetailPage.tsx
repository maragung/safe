// ============================================================================
// pages/TransactionDetailPage.tsx — Detail view for a single Safe transaction
// ----------------------------------------------------------------------------
// Route: /safe/:safeAddress/tx/:txId
// Reads `safeAddress` and `txId` from URL params, loads the tx via `useSafe`,
// and renders `<TransactionDetail>` with confirm/execute/revoke handlers.
// ============================================================================

import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { TransactionDetail } from '@/components/transaction/TransactionDetail'
import { useSafe } from '@/hooks/useSafe'
import { useWallet } from '@/hooks/useWallet'
import { SAFE_FUNCTIONS } from '@/types'
import type { SafeTransaction } from '@/types'

export function TransactionDetailPage() {
  const { safeAddress, txId } = useParams<{ safeAddress: string; txId: string }>()
  const navigate = useNavigate()
  const { address, isConnected, sendContractCall } = useWallet()
  const { safeInfo, transactions, loading, load, refreshTx } = useSafe(safeAddress)

  const txIdNum = txId ? parseInt(txId, 10) : NaN
  const tx = transactions.find((t) => t.id === txIdNum) ?? null

  const userIsOwner = address && safeInfo ? safeInfo.owners.includes(address) : false
  const userHasConfirmed = tx && address ? tx.confirmations.includes(address) : false
  const canConfirm = !!tx && !tx.executed && userIsOwner && !userHasConfirmed && tx.confirmationCount < tx.threshold
  const canExecute = !!tx && !tx.executed && userIsOwner && tx.confirmationCount >= tx.threshold
  const canRevoke = !!tx && !tx.executed && userIsOwner && userHasConfirmed

  // Submit a contract call to the Safe via 0xio wallet
  const callSafe = async (methodName: string, args: Array<string | number | boolean>, successMsg: string, errorMsg: string) => {
    if (!address || !isConnected || !safeAddress) return
    try {
      const result = await sendContractCall({
        contract: safeAddress,
        method: methodName,
        args,
        ou: '1000',
      })
      if (result.success || result.status === 'confirmed') {
        toast.success(successMsg)
        refreshTx(txIdNum).catch(() => {})
        load()
      } else {
        toast.error(`${errorMsg}: tx ${result.status ?? 'failed'}`)
      }
    } catch (e) {
      toast.error(errorMsg, { description: e instanceof Error ? e.message : '' })
    }
  }

  const handleConfirm = () => {
    callSafe(
      SAFE_FUNCTIONS.confirmTransaction,
      [txIdNum],
      'Transaction confirmed',
      'Confirm failed'
    )
  }

  const handleExecute = () => {
    callSafe(
      SAFE_FUNCTIONS.executeTransaction,
      [txIdNum],
      'Transaction executed',
      'Execute failed'
    )
  }

  const handleRevoke = () => {
    callSafe(
      SAFE_FUNCTIONS.revokeConfirmation,
      [txIdNum],
      'Confirmation revoked',
      'Revoke failed'
    )
  }

  // Auto-refresh every 10s while viewing pending tx
  useEffect(() => {
    if (!tx || tx.executed) return
    const interval = setInterval(() => {
      refreshTx(txIdNum).catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [tx, txIdNum, refreshTx])

  if (loading && !safeInfo) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/safe/${safeAddress}`)}>
          <ArrowLeft className="h-4 w-4" />
          Back to Safe
        </Button>
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!safeAddress || Number.isNaN(txIdNum)) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/safe/${safeAddress ?? ''}`)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <EmptyState
          title="Invalid transaction URL"
          description="The URL is missing required parameters."
        />
      </div>
    )
  }

  if (!tx) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/safe/${safeAddress}`)}>
            <ArrowLeft className="h-4 w-4" />
            Back to Safe
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        <EmptyState
          title="Transaction not found"
          description={`Transaction #${txIdNum} does not exist on this Safe, or is still loading.`}
          action={
            <Button onClick={load} isLoading={loading}>
              <RefreshCw className="h-4 w-4" />
              Reload
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/safe/${safeAddress}`)}>
          <ArrowLeft className="h-4 w-4" />
          Back to Safe
        </Button>
        <Button variant="outline" size="sm" onClick={() => refreshTx(txIdNum)}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <TransactionDetail
        tx={tx}
        safeAddress={safeAddress}
        canConfirm={canConfirm}
        canExecute={canExecute}
        canRevoke={canRevoke}
        hasConfirmed={userHasConfirmed}
        isOwner={userIsOwner}
        onConfirm={handleConfirm}
        onExecute={handleExecute}
        onRevoke={handleRevoke}
      />
    </div>
  )
}
