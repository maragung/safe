// ============================================================================
// pages/CreateSafePage.tsx — Wrapper for CreateSafeForm
// ============================================================================

import { CreateSafeForm } from '@/components/safe/CreateSafeForm'
import { useWallet } from '@/hooks/useWallet'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Wallet as WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { AccountModal } from '@/components/wallet/AccountModal'

export function CreateSafePage() {
  const { isConnected, address } = useWallet()
  const [showWalletModal, setShowWalletModal] = useState(false)

  if (!isConnected || !address) {
    return (
      <div className="max-w-2xl mx-auto pt-8">
        <EmptyState
          icon={<WalletIcon className="h-8 w-8" />}
          title="Connect 0xio wallet first"
          description="You need the 0xio wallet extension connected to deploy a Safe. Install or connect your 0xio wallet to continue."
          action={<Button onClick={() => setShowWalletModal(true)}>Connect 0xio Wallet</Button>}
        />
        <AccountModal isOpen={showWalletModal} onClose={() => setShowWalletModal(false)} />
      </div>
    )
  }

  return <CreateSafeForm />
}
