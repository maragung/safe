// ============================================================================
// components/wallet/ConnectButton.tsx — 0xio wallet connection button
// ----------------------------------------------------------------------------
// OctraSafe now uses 0xio wallet EXCLUSIVELY (no in-browser key management).
// Install: https://chromewebstore.google.com/detail/0xio-wallet/anknhjilldkeelailocijnfibefmepcc
// ============================================================================

import { useState } from 'react'
import { Wallet, LogOut, ChevronDown, ExternalLink, AlertCircle } from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { Button } from '@/components/ui/Button'
import { AccountModal } from './AccountModal'
import { truncateAddress, classNames } from '@/utils/helpers'

export function ConnectButton() {
  const { address, isConnected, isConnecting, isAvailable, balance, connect, disconnect } = useWallet()
  const [modalOpen, setModalOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  if (!isConnected || !address) {
    return (
      <>
        <Button size="sm" onClick={() => setModalOpen(true)} isLoading={isConnecting}>
          <Wallet className="h-4 w-4" />
          Connect 0xio
        </Button>
        <AccountModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    )
  }

  const octBalance = balance?.public ?? 0

  return (
    <div className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 h-9 px-3 rounded-xl bg-bg-card border border-border hover:border-border-hover transition-colors"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-accent-blue to-accent-cyan text-[10px] font-bold text-white">
          {address.charAt(3).toUpperCase()}
        </div>
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-xs font-mono text-text-primary">{truncateAddress(address)}</span>
          <span className="text-[10px] text-text-muted">{octBalance.toFixed(2)} OCT</span>
        </div>
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </button>

      {dropdownOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent-blue to-accent-cyan">
                  <Wallet className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-text-primary">0xio Wallet</p>
                  <p className="text-[10px] text-status-success">● Connected</p>
                </div>
              </div>
              <p className="text-[10px] text-text-muted">Account</p>
              <p className="text-xs font-mono text-text-primary break-all">{address}</p>
              <p className="text-xs text-text-secondary mt-1">{octBalance.toFixed(6)} OCT</p>
            </div>
            <div className="p-1">
              <button
                onClick={() => {
                  disconnect()
                  setDropdownOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-status-failed hover:bg-status-failed/10 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </button>
            </div>
            <div className="border-t border-border p-1">
              <a
                href="https://0xio.xyz/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                About 0xio wallet
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
