// ============================================================================
// components/settings/RemoveOwner.tsx — Submit remove-owner tx to Safe
// ============================================================================

import { useState } from 'react'
import { UserMinus, AlertCircle, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useWallet } from '@/hooks/useWallet'
import { SAFE_FUNCTIONS } from '@/types'
import { encodeSafeRemoveOwnerTx } from '@/lib/ocs01'
import { isValidOctraAddress } from '@/lib/zerozio'

export interface RemoveOwnerProps {
  safeAddress: string
  owners: string[]
  onSubmitted?: () => void
}

export function RemoveOwner({ safeAddress, owners, onSubmitted }: RemoveOwnerProps) {
  const { address, isConnected, sendContractCall } = useWallet()
  const [selectedOwner, setSelectedOwner] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const canRemove = owners.length > 1
  const valid = isValidOctraAddress(selectedOwner)
  const canSubmit = valid && canRemove && !!address && isConnected

  const handleSubmit = async () => {
    if (!address || !isConnected) return
    setLoading(true)
    setShowConfirm(false)
    try {
      const safeTx = encodeSafeRemoveOwnerTx(selectedOwner)
      const result = await sendContractCall({
        contract: safeAddress,
        method: SAFE_FUNCTIONS.submitTransaction,
        args: [safeTx.to, safeTx.value, safeTx.data],
        ou: '1000',
      })
      if (result.success || result.status === 'confirmed') {
        toast.success('Remove-owner transaction submitted')
        setSelectedOwner('')
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-failed/10 text-status-failed">
          <UserMinus className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Remove Owner</h3>
          <p className="text-xs text-text-secondary">Remove an existing owner from this Safe.</p>
        </div>
      </div>

      {!canRemove && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-status-failed/5 border border-status-failed/20">
          <AlertCircle className="h-3.5 w-3.5 text-status-failed shrink-0 mt-0.5" />
          <p className="text-[11px] text-status-failed">
            Cannot remove the last owner. Add another owner first.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Select Owner to Remove</label>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {owners.map((owner, idx) => (
            <button
              key={owner}
              onClick={() => setSelectedOwner(owner)}
              disabled={!canRemove}
              className={`w-full flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                selectedOwner === owner
                  ? 'bg-status-failed/10 border-status-failed/40'
                  : 'bg-bg-subtle border-border hover:border-border-hover'
              } ${!canRemove ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="text-xs font-semibold text-text-muted">{idx + 1}</span>
              <span className="text-xs font-mono text-text-primary truncate flex-1">{owner}</span>
              {owner === address && <span className="text-[10px] text-accent-blue">You</span>}
            </button>
          ))}
        </div>
      </div>

      <Button
        disabled={!canSubmit}
        onClick={() => setShowConfirm(true)}
        variant="danger"
        className="w-full"
      >
        <UserMinus className="h-4 w-4" />
        Submit Remove-Owner Transaction
      </Button>

      <Modal
        isOpen={showConfirm}
        onClose={() => !loading && setShowConfirm(false)}
        title="Confirm Remove Owner"
        description="This action requires multi-sig confirmation."
      >
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-bg-subtle border border-border">
            <p className="text-xs text-text-muted mb-1">Owner to Remove</p>
            <p className="text-xs font-mono text-text-primary break-all">{selectedOwner}</p>
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-status-failed/5 border border-status-failed/20">
            <AlertCircle className="h-3.5 w-3.5 text-status-failed shrink-0 mt-0.5" />
            <p className="text-[11px] text-status-failed">
              If threshold now exceeds owner count, it will be auto-adjusted down.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleSubmit} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
