// ============================================================================
// components/safe/DepositModal.tsx — Deposit native OCT into a Safe
// ----------------------------------------------------------------------------
// Sends a standard OCT transfer from the user's wallet to the Safe address.
// The Safe contract's `payable fn receive()` will emit a Deposit event.
// ============================================================================

import { useState } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AmountInput } from '@/components/ui/AmountInput'
import { useWallet } from '@/hooks/useWallet'
import { useNetwork } from '@/stores/useAppStore'
import { parseOctAmount, formatOctAmount } from '@/lib/ocs01'
import { truncateAddress } from '@/utils/helpers'

export interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  safeAddress: string
  onDeposited?: () => void
}

type Stage = 'idle' | 'signing' | 'submitting' | 'waiting' | 'done' | 'error'

export function DepositModal({ isOpen, onClose, safeAddress, onDeposited }: DepositModalProps) {
  const network = useNetwork()
  const { address, isConnected, balance, sendTx } = useWallet()
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const balanceRaw = balance ? balance.public * 1_000_000 : 0  // OCT → OU
  const amountRaw = parseInt(parseOctAmount(amount || '0'), 10)
  const amountValid = amountRaw > 0 && amountRaw <= balanceRaw
  const canSubmit = amountValid && !!address && isConnected && stage === 'idle'

  const handleSubmit = async () => {
    if (!address || !isConnected) {
      toast.error('Wallet not connected')
      return
    }
    setError(null)
    setStage('signing')
    try {
      // Send via 0xio wallet — extension handles nonce, signing, broadcasting
      const result = await sendTx({
        to: safeAddress,
        amount: amountRaw / 1_000_000,  // OU → OCT (number)
      })
      setTxHash(result.hash ?? result.txHash ?? '')
      setStage('done')
      toast.success('Deposit successful', {
        description: `${formatOctAmount(String(amountRaw))} OCT sent to Safe`,
      })
      setAmount('')
      onDeposited?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Deposit failed'
      setError(msg)
      setStage('error')
      toast.error('Deposit failed', { description: msg })
    }
  }

  const handleClose = () => {
    if (stage === 'signing' || stage === 'submitting' || stage === 'waiting') {
      // Don't allow close during in-flight tx
      return
    }
    setStage('idle')
    setTxHash(null)
    setError(null)
    setAmount('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Deposit OCT"
      description={`Send native OCT to ${truncateAddress(safeAddress)}`}
    >
      <div className="space-y-4">
        {stage === 'idle' || stage === 'error' ? (
          <>
            <AmountInput
              label="Amount"
              symbol="OCT"
              value={amount}
              onChange={setAmount}
              max={balanceRaw}
              onMaxClick={() => setAmount(formatOctAmount(String(balanceRaw)))}
              error={amount && !amountValid
                ? amountRaw > balanceRaw ? 'Insufficient wallet balance' : 'Invalid amount'
                : undefined
              }
            />

            <div className="p-3 rounded-xl bg-bg-subtle border border-border space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">From (your wallet)</span>
                <span className="font-mono text-text-primary">{address ? truncateAddress(address) : '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">To (Safe)</span>
                <span className="font-mono text-text-primary">{truncateAddress(safeAddress)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Wallet balance</span>
                <span className="font-mono text-text-primary">
                  {balance ? balance.public.toFixed(4) : '—'} OCT
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-status-failed/10 border border-status-failed/30">
                <p className="text-xs text-status-failed font-mono break-all">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
              <Button className="flex-1" disabled={!canSubmit} onClick={handleSubmit}>
                Deposit {amount && amountValid ? `${formatOctAmount(String(amountRaw))} OCT` : ''}
              </Button>
            </div>
          </>
        ) : stage === 'done' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-status-success">
              <Check className="h-5 w-5" />
              <span className="text-sm font-semibold">Deposit successful!</span>
            </div>
            {txHash && (
              <div className="p-3 rounded-xl bg-bg-subtle border border-border">
                <p className="text-[10px] text-text-muted mb-1">Tx Hash</p>
                <a
                  href={network.explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-accent-blue hover:underline break-all"
                >
                  {txHash}
                </a>
              </div>
            )}
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-center gap-2 text-text-secondary">
              <Loader2 className="h-5 w-5 animate-spin text-accent-blue" />
              <span className="text-sm">
                {stage === 'signing' && 'Signing transaction...'}
                {stage === 'submitting' && 'Submitting to network...'}
                {stage === 'waiting' && 'Waiting for confirmation...'}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
