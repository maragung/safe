// ============================================================================
// components/transaction/GrantTokenForm.tsx — Approve/Grant OCS-01 token
// ----------------------------------------------------------------------------
// Submits a Safe transaction that, when executed, will call grant(spender, amount)
// on the selected OCS-01 token contract (the Safe itself is the token owner).
// ============================================================================

import { useState } from 'react'
import { Send, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AmountInput } from '@/components/ui/AmountInput'
import { Modal } from '@/components/ui/Modal'
import { TokenSelector } from '@/components/token/TokenSelector'
import { useWallet } from '@/hooks/useWallet'
import { useNetwork } from '@/stores/useAppStore'
import { contractCall } from '@/lib/rpc'
import { SAFE_FUNCTIONS } from '@/types'
import { decodeInt } from '@/lib/encoder'
import { encodeSafeTokenGrantTx, parseTokenAmount, formatTokenAmount, getTokenBalance } from '@/lib/ocs01'
import { isValidOctraAddress } from '@/lib/zerozio'

export interface GrantTokenFormProps {
  safeAddress: string
  onSubmitted?: (txId: number) => void
  onCancel?: () => void
}

type Stage = 'idle' | 'confirming' | 'signing' | 'submitting' | 'waiting' | 'done' | 'error'

export function GrantTokenForm({ safeAddress, onSubmitted, onCancel }: GrantTokenFormProps) {
  const network = useNetwork()
  const tokens = useAppStoreShallow()
  const { address, isConnected, sendContractCall, refresh } = useWallet()
  const [selectedTokenAddr, setSelectedTokenAddr] = useState('')
  const [spender, setSpender] = useState('')
  const [amount, setAmount] = useState('')
  const [tokenBalance, setTokenBalance] = useState(0)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedToken = tokens.find((t) => t.address === selectedTokenAddr)

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
  const spenderValid = isValidOctraAddress(spender)
  const amountValid = amountRaw > 0 && amountRaw <= tokenBalance
  const canSubmit = !!selectedToken && spenderValid && amountValid && !!address && isConnected && stage === 'idle'

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
      if (!isOwner) throw new Error('You are not an owner of this Safe')

      const safeTx = encodeSafeTokenGrantTx(selectedTokenAddr, spender, amountRaw)

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
      toast.success('Token grant submitted to Safe', {
        description: `Approve ${formatTokenAmount(amountRaw, selectedToken.decimals)} ${selectedToken.symbol}`,
      })
      refresh().catch(() => {})

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
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Token to Approve</label>
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
          </div>
        )}

        <Input
          label="Spender Address"
          placeholder="oct..."
          value={spender}
          onChange={(e) => setSpender(e.target.value)}
          error={spender && !spenderValid ? 'Invalid Octra address' : undefined}
          hint="The address that will be allowed to spend tokens on the Safe's behalf"
          className="font-mono text-xs"
        />

        {selectedToken && (
          <AmountInput
            label="Amount to Approve"
            symbol={selectedToken.symbol}
            value={amount}
            onChange={setAmount}
            max={tokenBalance}
            decimals={selectedToken.decimals}
            onMaxClick={() => setAmount(formatTokenAmount(tokenBalance, selectedToken.decimals))}
            error={amount && !amountValid ? amountRaw > tokenBalance ? 'Exceeds Safe balance (no real cap on grant)' : 'Invalid amount' : undefined}
          />
        )}

        {selectedToken && amount && spenderValid && (
          <div className="p-3 rounded-xl bg-accent-blue/5 border border-accent-blue/20">
            <p className="text-xs text-text-secondary">
              You are about to allow
              <span className="font-mono font-semibold text-text-primary mx-1">
                {truncateAddr(spender)}
              </span>
              to spend up to
              <span className="font-mono font-semibold text-text-primary mx-1">
                {formatTokenAmount(amountRaw, selectedToken.decimals)} {selectedToken.symbol}
              </span>
              from this Safe.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={stage !== 'idle' && stage !== 'done' && stage !== 'error'}>
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

function truncateAddr(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 17) return addr
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

// Avoid importing useAppStore at top-level to keep this file self-contained
import { useAppStore } from '@/stores/useAppStore'
function useAppStoreShallow() {
  return useAppStore((s) => s.tokens)
}
