// ============================================================================
// components/token/AddTokenModal.tsx — Add custom OCS-01 token by address
// ============================================================================

import { useState } from 'react'
import { Loader2, Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAppStore, useNetwork } from '@/stores/useAppStore'
import { fetchTokenMetadata } from '@/lib/ocs01'
import { isValidOctraAddress } from '@/lib/zerozio'
import type { TokenInfo } from '@/types'

export function AddTokenModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const network = useNetwork()
  const { tokens, addToken } = useAppStore()
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<TokenInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFetch = async () => {
    setError(null)
    setPreview(null)
    if (!address.trim()) {
      setError('Token address is required')
      return
    }
    if (!isValidOctraAddress(address)) {
      setError('Invalid Octra address')
      return
    }
    if (tokens.some((t) => t.address === address)) {
      setError('Token already added')
      return
    }
    setLoading(true)
    try {
      const meta = await fetchTokenMetadata(network.rpcUrl, address)
      setPreview(meta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch token metadata')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    if (!preview) return
    addToken(preview)
    toast.success('Token added', { description: `${preview.symbol} (${preview.name})` })
    setAddress('')
    setPreview(null)
    setError(null)
    onClose()
  }

  const handleClose = () => {
    setAddress('')
    setPreview(null)
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Custom Token" description="Add an OCS-01 token by its contract address.">
      <div className="space-y-4">
        <Input
          label="Token Contract Address"
          placeholder="oct..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={error ?? undefined}
          className="font-mono text-xs"
          rightAdornment={
            <button
              onClick={handleFetch}
              disabled={loading || !address}
              className="text-accent-blue hover:text-accent-blue/80 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          }
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
        />

        {preview && (
          <div className="p-4 rounded-xl bg-bg-subtle border border-border space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-cyan/30 to-accent-blue/30 text-xs font-bold text-accent-cyan">
                {preview.symbol.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">{preview.name}</p>
                <p className="text-xs text-text-secondary">{preview.symbol} · {preview.decimals} decimals</p>
              </div>
              <Check className="h-5 w-5 text-status-success ml-auto" />
            </div>
            <div className="pt-2 border-t border-border text-xs text-text-muted font-mono break-all">
              {preview.address}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!preview} onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add Token
          </Button>
        </div>
      </div>
    </Modal>
  )
}
