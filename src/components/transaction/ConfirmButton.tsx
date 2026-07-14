// ============================================================================
// components/transaction/ConfirmButton.tsx — Confirm / Execute buttons
// ============================================================================

import { useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button, type ButtonProps } from '@/components/ui/Button'
import { useWallet } from '@/hooks/useWallet'
import { SAFE_FUNCTIONS } from '@/types'

type Action = 'confirm' | 'execute'

export interface ConfirmButtonProps {
  safeAddress: string
  txId: number
  action: Action
  onDone?: () => void
  size?: ButtonProps['size']
  variant?: ButtonProps['variant']
  className?: string
  label?: string
}

export function ConfirmButton({
  safeAddress,
  txId,
  action,
  onDone,
  size = 'sm',
  variant,
  className,
  label,
}: ConfirmButtonProps) {
  const { address, isConnected, sendContractCall } = useWallet()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!address || !isConnected) {
      toast.error('Wallet not connected')
      return
    }
    setLoading(true)
    try {
      const methodName = action === 'confirm' ? SAFE_FUNCTIONS.confirmTransaction : SAFE_FUNCTIONS.executeTransaction
      const result = await sendContractCall({
        contract: safeAddress,
        method: methodName,
        args: [txId],
        ou: '1000',
      })

      const txHash = result.hash ?? result.txHash ?? ''
      if (result.success || result.status === 'confirmed') {
        toast.success(action === 'confirm' ? 'Transaction confirmed' : 'Transaction executed', {
          description: txHash ? `Tx ${txHash_short(txHash)}` : undefined,
        })
        onDone?.()
      } else {
        toast.error(`Transaction ${result.status ?? 'failed'}`, { description: txHash })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed'
      toast.error(action === 'confirm' ? 'Confirm failed' : 'Execute failed', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  const icon = action === 'confirm' ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />
  const defaultVariant = action === 'confirm' ? 'primary' : 'success'

  return (
    <Button
      size={size}
      variant={variant ?? defaultVariant}
      onClick={handleClick}
      isLoading={loading}
      className={className}
    >
      {loading ? null : icon}
      {label ?? (action === 'confirm' ? 'Confirm' : 'Execute')}
    </Button>
  )
}

function txHash_short(hash: string): string {
  if (!hash) return ''
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}
