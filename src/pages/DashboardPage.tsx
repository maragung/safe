// ============================================================================
// pages/DashboardPage.tsx — Main dashboard after wallet connect
// ============================================================================

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Shield, Wallet as WalletIcon, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { SafeList } from '@/components/safe/SafeList'
import { AccountModal } from '@/components/wallet/AccountModal'
import { useWallet } from '@/hooks/useWallet'
import { useNetwork } from '@/stores/useAppStore'
import { useAppStore } from '@/stores/useAppStore'
import { contractCall, getBalance } from '@/lib/rpc'
import { SAFE_FUNCTIONS } from '@/types'
import { decodeAddressList, decodeInt } from '@/lib/encoder'
import type { SafeInfo } from '@/types'

export function DashboardPage() {
  const navigate = useNavigate()
  const network = useNetwork()
  const { address, isConnected, balance, refresh } = useWallet()
  const knownSafes = useAppStore((s) => s.knownSafes)
  const [safes, setSafes] = useState<SafeInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [ownedByUser, setOwnedByUser] = useState<Set<string>>(new Set())
  const [showWalletModal, setShowWalletModal] = useState(false)

  const loadSafes = async () => {
    if (!address || knownSafes.length === 0) {
      setSafes([])
      return
    }
    setLoading(true)
    try {
      const infos: SafeInfo[] = []
      const owned = new Set<string>()

      for (const safeAddr of knownSafes) {
        try {
          const [ownersCsv, threshold, ownerCount, balResult] = await Promise.all([
            contractCall<string>(network.rpcUrl, safeAddr, SAFE_FUNCTIONS.getOwners, []).catch(() => ''),
            contractCall<string | number>(network.rpcUrl, safeAddr, SAFE_FUNCTIONS.getThreshold, []).then(decodeInt).catch(() => 1),
            contractCall<string | number>(network.rpcUrl, safeAddr, SAFE_FUNCTIONS.getOwnerCount, []).then(decodeInt).catch(() => 0),
            getBalance(network.rpcUrl, safeAddr).catch(() => null),
          ])

          const owners = decodeAddressList(ownersCsv)
          if (owners.includes(address)) {
            owned.add(safeAddr)
          }

          infos.push({
            address: safeAddr,
            owners,
            threshold,
            ownerCount,
            balance: balResult ? parseFloat(balResult.balance) : 0,
            balanceRaw: balResult ? balResult.balance_raw : '0',
            pendingTxCount: 0, // skip for dashboard (would require N queries)
          })
        } catch (e) {
          console.warn(`Failed to load Safe ${safeAddr}`, e)
        }
      }

      setSafes(infos)
      setOwnedByUser(owned)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSafes()
  }, [address, knownSafes.join(','), network.rpcUrl])

  if (!isConnected || !address) {
    return (
      <div className="max-w-2xl mx-auto pt-8">
        <EmptyState
          icon={<WalletIcon className="h-8 w-8" />}
          title="Connect 0xio wallet"
          description="Octra Safe uses the 0xio browser extension for wallet management. Connect your 0xio wallet to manage Safes on Octra."
          action={<Button onClick={() => setShowWalletModal(true)}>Connect 0xio Wallet</Button>}
        />
        <AccountModal isOpen={showWalletModal} onClose={() => setShowWalletModal(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">My Safes</h1>
          <p className="text-sm text-text-secondary">Manage your multi-signature wallets on Octra</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refresh(); loadSafes() }}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={() => navigate('/create')}>
            <Plus className="h-4 w-4" />
            Create Safe
          </Button>
        </div>
      </div>

      {/* Balance card */}
      <Card className="bg-gradient-to-br from-accent-blue/10 to-accent-cyan/5 border-accent-blue/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-text-muted">Wallet Balance</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-mono font-bold text-text-primary">
                {balance ? balance.public.toFixed(4) : '...'}
              </span>
              <span className="text-sm text-text-muted">OCT</span>
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-card/50">
            <WalletIcon className="h-6 w-6 text-accent-blue" />
          </div>
        </div>
      </Card>

      {/* Safe list */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3">
          {loading ? 'Loading Safes...' : `${safes.length} Safe${safes.length !== 1 ? 's' : ''}`}
        </h2>
        {loading && safes.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : (
          <SafeList safes={safes} ownedByUser={ownedByUser} loading={loading} />
        )}
      </div>

      {/* Help card */}
      {safes.length === 0 && !loading && (
        <Card className="bg-accent-blue/5 border-accent-blue/20">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-accent-blue shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">What is a Safe?</h3>
              <p className="text-xs text-text-secondary mt-1">
                A multi-signature wallet requires multiple owners to approve transactions before they execute.
                This adds an extra layer of security — no single owner can move funds alone.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
