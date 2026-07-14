// ============================================================================
// components/settings/ChangeThreshold.tsx — Submit change-threshold tx
// ============================================================================

import { useState } from 'react'
import { Shield, AlertCircle, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useWallet } from '@/hooks/useWallet'
import { SAFE_FUNCTIONS } from '@/types'
import { encodeSafeChangeThresholdTx } from '@/lib/ocs01'
import { classNames } from '@/utils/helpers'

export interface ChangeThresholdProps {
  safeAddress: string
  currentThreshold: number
  ownerCount: number
  onSubmitted?: () => void
}

export function ChangeThreshold({ safeAddress, currentThreshold, ownerCount, onSubmitted }: ChangeThresholdProps) {
  const { address, isConnected, sendContractCall } = useWallet()
  const [newThreshold, setNewThreshold] = useState(currentThreshold)
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const valid = newThreshold >= 1 && newThreshold <= ownerCount
  const changed = newThreshold !== currentThreshold
  const canSubmit = valid && changed && !!address && isConnected

  const handleSubmit = async () => {
    if (!address || !isConnected) return
    setLoading(true)
    setShowConfirm(false)
    try {
      const safeTx = encodeSafeChangeThresholdTx(newThreshold)
      const result = await sendContractCall({
        contract: safeAddress,
        method: SAFE_FUNCTIONS.submitTransaction,
        args: [safeTx.to, safeTx.value, safeTx.data],
        ou: '1000',
      })
      if (result.success || result.status === 'confirmed') {
        toast.success('Change-threshold transaction submitted')
        onSubmitted?.()
      } else {
        toast.error('Submit failed', { description: `tx ${result.status ?? 'failed'}` })
      }
    } catch (e) {
      toast.error('Failed to submit', { description: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-cyan/10 text-accent-cyan">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Change Threshold</h3>
          <p className="text-xs text-text-secondary">
            Current: <span className="font-mono">{currentThreshold}</span> · Owners: <span className="font-mono">{ownerCount}</span>
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-2">New Threshold</label>
        <div className="flex gap-1">
          {Array.from({ length: ownerCount }).map((_, i) => {
            const n = i + 1
            return (
              <button
                key={n}
                onClick={() => setNewThreshold(n)}
                className={classNames(
                  'flex-1 h-10 rounded-md text-sm font-medium transition-all',
                  newThreshold === n
                    ? 'bg-accent-blue text-white'
                    : 'bg-bg-hover text-text-secondary hover:bg-border'
                )}
              >
                {n}
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-text-muted mt-1.5">
          Number of owner confirmations required to execute a transaction.
        </p>
      </div>

      <Button
        disabled={!canSubmit}
        onClick={() => setShowConfirm(true)}
        className="w-full"
      >
        <Shield className="h-4 w-4" />
        Submit Change-Threshold Transaction
      </Button>

      <Modal
        isOpen={showConfirm}
        onClose={() => !loading && setShowConfirm(false)}
        title="Confirm Threshold Change"
        description="This action requires multi-sig confirmation."
      >
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-bg-subtle border border-border flex items-center justify-between">
            <div>
              <p className="text-[10px] text-text-muted">Current</p>
              <p className="text-lg font-bold text-text-primary">{currentThreshold}</p>
            </div>
            <div className="text-2xl text-text-muted">→</div>
            <div className="text-right">
              <p className="text-[10px] text-text-muted">New</p>
              <p className="text-lg font-bold text-accent-blue">{newThreshold}</p>
            </div>
          </div>
          {newThreshold === 1 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-status-pending/5 border border-status-pending/20">
              <AlertCircle className="h-3.5 w-3.5 text-status-pending shrink-0 mt-0.5" />
              <p className="text-[11px] text-status-pending">
                Threshold of 1 means any single owner can execute transactions. Use with caution.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} disabled={loading}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
