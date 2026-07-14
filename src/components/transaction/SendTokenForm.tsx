// ============================================================================
// components/transaction/SendTokenForm.tsx — Send OCS-01 tokens via Safe
// ============================================================================

import { useState } from 'react'
import { Send, AlertCircle, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AmountInput } from '@/components/ui/AmountInput'
import { Modal } from '@/components/ui/Modal'
import { TokenSelector } from '@/components/token/TokenSelector'
import { useWallet } from '@/hooks/useWallet'
import { useNetwork } from '@/stores/useAppStore'
import { useAppStore } from '@/stores/useAppStore'
import { contractCall } from '@/lib/rpc'
import { SAFE_FUNCTIONS, OCS01_FUNCTIONS } from '@/types'
import { decodeInt } from '@/lib/encoder'
import { encodeSafeTokenTransferTx, parseTokenAmount, formatTokenAmount, getTokenBalance } from '@/lib/ocs01'
import { isValidOctraAddress } from '@/lib/zerozio'

export interface SendTokenFormProps {
  safeAddress: string
  threshold?: number
  onSubmitted?: (txId: number) => void
  onCancel?: () => void
}

type Stage = 'idle' | 'confirming' | 'signing' | 'submitting' | 'waiting' | 'done' | 'error'

export function SendTokenForm({ safeAddress, threshold, onSubmitted, onCancel }: SendTokenFormProps) {
  const network = useNetwork()
  const tokens = useAppStore((s) => s.tokens)
  const { address, isConnected, sendContractCall, refresh } = useWallet()
  const [selectedTokenAddr, setSelectedTokenAddr] = useState<string>('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [tokenBalance, setTokenBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedToken = tokens.find((t) => t.address === selectedTokenAddr)

  // Fetch token balance for the Safe
  const fetchBalance = async (tokenAddr: string) => {
    if (!tokenAddr) {
      setTokenBalance(0)
      return
    }
    setLoadingBalance(true)
    try {
      const bal = await getTokenBalance(network.rpcUrl, tokenAddr, safeAddress)
      setTokenBalance(bal)
    } catch {
      setTokenBalance(0)
    } finally {
      setLoadingBalance(false)
    }
  }

  const handleTokenSelect = (addr: string) => {
    setSelectedTokenAddr(addr)
    setAmount('')
    fetchBalance(addr)
  }

  const amountRaw = selectedToken ? parseTokenAmount(amount || '0', selectedToken.decimals) : 0
  const recipientValid = isValidOctraAddress(recipient)
  const amountValid = amountRaw > 0 && amountRaw <= tokenBalance
  const canSubmit = !!selectedToken && recipientValid && amountValid && !!address && isConnected && stage === 'idle'

  const handleSubmit = async () => {
    if (!address || !isConnected || !selectedToken) {
      toast.error('Wallet not connected')
      return
    }
    setStage('confirming')
    setError(null)

    try {
      // Verify Safe ownership
      const isOwner = await contractCall<string | boolean>(
        network.rpcUrl, safeAddress, SAFE_FUNCTIONS.isOwner, [address], address
      ).then((v) => v === true || v === 'true')

      if (!isOwner) {
        throw new Error('You are not an owner of this Safe')
      }

      // Build Safe tx payload (token transfer)
      const safeTx = encodeSafeTokenTransferTx(selectedTokenAddr, recipient, amountRaw)

      // Submit via 0xio wallet
      setStage('signing')
      const result = await sendContractCall({
        contract: safeAddress,
        method: SAFE_FUNCTIONS.submitTransaction,
        args: [safeTx.to, safeTx.value, safeTx.data],
        ou: '1000',
      })
      setTxHash(result.hash ?? result.txHash ?? '')
      setStage('done')

      toast.success('Token transfer submitted to Safe', {
        description: `Send ${formatTokenAmount(amountRaw, selectedToken.decimals)} ${selectedToken.symbol}`,
      })
      refresh().catch(() => {})

      // Try to fetch the new tx id
      try {
        const newCount = await contractCall<string | number>(
          network.rpcUrl, safeAddress, SAFE_FUNCTIONS.getTransactionCount, []
        ).then(decodeInt)
        onSubmitted?.(newCount - 1)
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
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Token</label>
          <TokenSelector
            value={selectedTokenAddr}
            onChange={handleTokenSelect}
            balanceAddress={safeAddress}
          />
        </div>

        {selectedToken && (
          <div className="p-3 rounded-xl bg-bg-subtle border border-border flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase text-text-muted">Safe's {selectedToken.symbol} Balance</p>
              <p className="text-sm font-mono font-semibold text-text-primary mt-0.5">
                {loadingBalance ? '...' : formatTokenAmount(tokenBalance, selectedToken.decimals)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-text-muted">Decimals</p>
              <p className="text-sm font-mono text-text-secondary mt-0.5">{selectedToken.decimals}</p>
            </div>
          </div>
        )}

        <Input
          label="Recipient Address"
          placeholder="oct..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          error={recipient && !recipientValid ? 'Invalid Octra address' : undefined}
          className="font-mono text-xs"
        />

        {selectedToken && (
          <AmountInput
            label="Amount"
            symbol={selectedToken.symbol}
            value={amount}
            onChange={setAmount}
            max={tokenBalance}
            decimals={selectedToken.decimals}
            onMaxClick={() => setAmount(formatTokenAmount(tokenBalance, selectedToken.decimals))}
            error={amount && !amountValid ? amountRaw > tokenBalance ? 'Insufficient token balance' : 'Invalid amount' : undefined}
          />
        )}

        {selectedToken && amount && recipientValid && (
          <div className="p-3 rounded-xl bg-accent-blue/5 border border-accent-blue/20">
            <p className="text-xs text-text-secondary">
              You are about to submit a transaction to send
              <span className="font-mono font-semibold text-text-primary mx-1">
                {formatTokenAmount(amountRaw, selectedToken.decimals)} {selectedToken.symbol}
              </span>
              to
              <span className="font-mono text-text-primary ml-1">
                {recipient.slice(0, 8)}...{recipient.slice(-6)}
              </span>
              via the Safe. This will require{' '}
              <span className="font-semibold text-text-primary">{threshold ?? 'N/A'}</span>{' '}
              confirmation(s) before execution.
            </p>
          </div>
        )}
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
        title={stage === 'done' ? 'Submitted' : stage === 'error' ? 'Failed' : 'Submitting'}
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
