// ============================================================================
// components/wallet/AccountModal.tsx — 0xio wallet connect / install modal
// ----------------------------------------------------------------------------
// Shows one of three states:
//   1. Extension not detected → install prompt with link to Chrome Web Store
//   2. Extension detected, not connected → connect button (calls 0xio SDK)
//   3. Loading — connecting
// ============================================================================

import { useState } from 'react'
import { Loader2, Wallet, Download, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useWallet } from '@/hooks/useWallet'
import { is0xioExtensionInstalled, ZEROXIO_INSTALL_URL, ZEROXIO_DOCS_URL } from '@/lib/zerozio'

export function AccountModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { connect, isConnecting } = useWallet()
  const [installed] = useState(() => is0xioExtensionInstalled())

  const handleConnect = async () => {
    await connect()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect Wallet" size="md">
      <div className="space-y-4">
        {/* 0xio branding */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-accent-blue/10 to-accent-cyan/5 border border-accent-blue/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue to-accent-cyan">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">0xio Wallet</h3>
            <p className="text-xs text-text-secondary">The Octra wallet for the web</p>
          </div>
        </div>

        {!installed ? (
          // State 1: Extension not detected — show install prompt
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-status-pending/10 border border-status-pending/30">
              <AlertCircle className="h-5 w-5 text-status-pending shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-status-pending">0xio wallet extension not detected</p>
                <p className="text-xs text-status-pending/80 mt-1">
                  Install the 0xio browser extension to connect your Octra wallet. Available for Chrome, Brave, Edge, and Firefox.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-text-secondary">
              <p className="font-medium text-text-primary">Why 0xio?</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Non-custodial — your keys never leave the extension</li>
                <li>Octra-native (mainnet + devnet support)</li>
                <li>Encrypted balance support (pOCT / stealth transfers)</li>
                <li>Audited SDK with open-source code on GitHub</li>
              </ul>
            </div>

            <a href={ZEROXIO_INSTALL_URL} target="_blank" rel="noopener noreferrer">
              <Button className="w-full" size="lg">
                <Download className="h-4 w-4" />
                Install 0xio Wallet
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>

            <Button variant="outline" className="w-full" onClick={handleConnect} isLoading={isConnecting}>
              <CheckCircle2 className="h-4 w-4" />
              I've installed it — refresh & connect
            </Button>

            <a
              href={ZEROXIO_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-text-muted hover:text-text-primary"
            >
              Read the 0xio docs →
            </a>
          </div>
        ) : (
          // State 2: Extension detected — show connect button
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-status-success/10 border border-status-success/30">
              <CheckCircle2 className="h-5 w-5 text-status-success shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-status-success">0xio wallet detected</p>
                <p className="text-xs text-status-success/80 mt-1">
                  Click connect and approve the request in the 0xio extension popup.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-text-secondary">
              <p className="font-medium text-text-primary">This dApp will request:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Read your wallet address & balance</li>
                <li>Submit transactions (you approve each one)</li>
                <li>Sign messages (you approve each one)</li>
              </ul>
              <p className="text-text-muted mt-2">
                Your private key never leaves the extension.
              </p>
            </div>

            <Button className="w-full" size="lg" onClick={handleConnect} isLoading={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for approval...
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4" />
                  Connect 0xio Wallet
                </>
              )}
            </Button>

            <a
              href={ZEROXIO_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-text-muted hover:text-text-primary"
            >
              Learn more about 0xio →
            </a>
          </div>
        )}
      </div>
    </Modal>
  )
}
