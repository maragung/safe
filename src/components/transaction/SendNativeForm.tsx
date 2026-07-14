// ============================================================================
// components/transaction/SendNativeForm.tsx — Send native OCT via Safe
// ============================================================================

import { useState } from 'react'
import { Send, AlertCircle, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AmountInput } from '@/components/ui/AmountInput'
import { Modal } from '@/components/ui/Modal'
import { useWallet } from '@/hooks/useWallet'
import { useNetwork } from '@/stores/useAppStore'
import { contractCall } from '@/lib/rpc'
import { SAFE_FUNCTIONS } from '@/types'
import { encodeSafeNativeTransferTx } from '@/lib/ocs01'
import { isValidOctraAddress } from '@/lib/zerozio'
import { parseOctAmount, formatOctAmount } from '@/lib/ocs01'
import { decodeInt } from '@/lib/encoder'

export interface SendNativeFormProps {
  safeAddress: string
  safeBalance: number  // in OU
  threshold?: number
  onSubmitted?: (txId: number) => void
  onCancel?: () => void
}

type Stage = 'idle' | 'confirming' | 'signing' | 'submitting' | 'waiting' | 'done' | 'error'

export function SendNativeForm({ safeAddress, safeBalance, threshold, onSubmitted, onCancel }: SendNativeFormProps) {
  const network = useNetwork()
  const { address, isConnected, sendContractCall, refresh } = useWallet()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const amountRaw = parseInt(parseOctAmount(amount || '0'), 10)
  const recipientValid = isValidOctraAddress(recipient)
  const amountValid = amountRaw > 0 && amountRaw <= safeBalance
  const canSubmit = recipientValid && amountValid && !!address && isConnected && stage === 'idle'

  const handleSubmit = async () => {
    if (!address || !isConnected) {
      toast.error('Wallet not connected')
      return
    }
    setStage('confirming')
    setError(null)

    try {
      // Build the Safe tx payload
      const safeTx = encodeSafeNativeTransferTx(recipient, amountRaw)

      // Verify the caller is a Safe owner
      const isOwner = await contractCall<string | boolean>(
        network.rpcUrl,
        safeAddress,
        SAFE_FUNCTIONS.isOwner,
        [address],
        address
      ).then((v) => v === true || v === 'true')

      if (!isOwner) {
        throw new Error('You are not an owner of this Safe')
      }

      // Submit via 0xio wallet — extension handles nonce, signing, broadcasting
      setStage('signing')
      const result = await sendContractCall({
        contract: safeAddress,
        method: SAFE_FUNCTIONS.submitTransaction,
        args: [safeTx.to, safeTx.value, safeTx.data],
        ou: '1000',
      })
      setTxHash(result.hash ?? result.txHash ?? '')

      setStage('done')
      toast.success('Transaction submitted to Safe', {
        description: 'Owners can now confirm and execute it.',
      })
      refresh().catch(() => {})

      // Try to fetch the new tx id from the Safe
      try {
        const newCount = await contractCall<string | number>(
          network.rpcUrl, safeAddress, SAFE_FUNCTIONS.getTransactionCount, []
        ).then(decodeInt)
        const newTxId = newCount - 1
        onSubmitted?.(newTxId)
      } catch {
        // ignore
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed'
      setError(msg)
      setStage('error')
      toast.error('Failed to submit transaction', { description: msg })
    }
  }

  return (
    <Card className="space-y-4">
      <div className="space-y-3">
        <Input
          label="Recipient Address"
          placeholder="oct..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          error={recipient && !recipientValid ? 'Invalid Octra address' : undefined}
          className="font-mono text-xs"
        />

        <AmountInput
          label="Amount"
          symbol="OCT"
          value={amount}
          onChange={setAmount}
          max={safeBalance}
          onMaxClick={() => setAmount(formatOctAmount(safeBalance))}
          error={amount && !amountValid ? amountRaw > safeBalance ? 'Insufficient Safe balance' : 'Invalid amount' : undefined}
        />

        <div className="p-3 rounded-xl bg-bg-subtle border border-border space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Safe Balance</span>
            <span className="font-mono text-text-primary">{formatOctAmount(safeBalance)} OCT</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Transfer Amount</span>
            <span className="font-mono text-text-primary">{formatOctAmount(amountRaw)} OCT</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Recipient</span>
            <span className="font-mono text-text-primary truncate ml-2">
              {recipientValid ? `${recipient.slice(0, 8)}...${recipient.slice(-6)}` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={stage !== 'idle'}>
            Cancel
          </Button>
        )}
        <Button
          className="flex-1"
          disabled={!canSubmit}
          onClick={handleSubmit}
          isLoading={stage !== 'idle' && stage !== 'done' && stage !== 'error'}
        >
          <Send className="h-4 w-4" />
          Submit to Safe
        </Button>
      </div>

      {/* Progress modal */}
      <Modal
        isOpen={stage !== 'idle'}
        onClose={() => { if (stage === 'done' || stage === 'error') { setStage('idle'); setTxHash(null) } }}
        title={stage === 'done' ? 'Transaction Submitted' : stage === 'error' ? 'Submission Failed' : 'Submitting Transaction'}
        showClose={stage === 'done' || stage === 'error'}
        closeOnBackdrop={stage === 'done' || stage === 'error'}
      >
        <div className="space-y-3">
          {stage === 'error' && error && (
            <>
              <div className="p-3 rounded-xl bg-status-failed/10 border border-status-failed/30">
                <p className="text-xs text-status-failed font-mono break-all">{error}</p>
              </div>
              <Button className="w-full" variant="outline" onClick={() => { setStage('idle'); setTxHash(null); setError(null) }}>
                Close & Retry
              </Button>
            </>
          )}

          {stage === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-status-success">
                <Check className="h-5 w-5" />
                <span className="text-sm font-semibold">Transaction submitted!</span>
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
              <p className="text-xs text-text-secondary">
                The transaction is now in the Safe's queue. Other owners can confirm and execute it once enough confirmations are reached.
              </p>
              <Button className="w-full" onClick={() => { setStage('idle'); setTxHash(null); onCancel?.() }}>
                Done
              </Button>
            </div>
          )}

          {stage !== 'done' && stage !== 'error' && (
            <div className="space-y-2">
              {[
                { label: 'Verifying owner status', done: ['signing', 'submitting', 'waiting'].includes(stage) },
                { label: 'Signing transaction', done: ['submitting', 'waiting'].includes(stage) },
                { label: 'Submitting to network', done: ['waiting'].includes(stage) },
                { label: 'Waiting for confirmation', done: false },
              ].map((s, i) => {
                const current = (
                  (i === 0 && stage === 'confirming') ||
                  (i === 1 && stage === 'signing') ||
                  (i === 2 && stage === 'submitting') ||
                  (i === 3 && stage === 'waiting')
                )
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-5 w-5 flex items-center justify-center">
                      {s.done ? <Check className="h-4 w-4 text-status-success" /> :
                       current ? <Loader2 className="h-4 w-4 text-accent-blue animate-spin" /> :
                       <div className="h-2 w-2 rounded-full bg-border" />}
                    </div>
                    <span className="text-sm text-text-secondary">{s.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </Card>
  )
}
