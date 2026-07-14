// ============================================================================
// components/safe/CreateSafeForm.tsx — Form for creating a new Safe
// ----------------------------------------------------------------------------
// Deploys an OctraSafe contract via the Octra deploy flow:
//   1. Compile OctraSafe.aml → bytecode (via octra_compileAmlMulti RPC)
//   2. Compute deterministic contract address (octra_computeContractAddress)
//   3. Build deploy tx with op_type="deploy", encrypted_data=bytecode,
//      message=constructor_params_json
//   4. Sign with ed25519, submit via octra_submit
//   5. Wait for confirmation, then optionally register with factory
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Shield, AlertCircle, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useWallet } from '@/hooks/useWallet'
import { useNetwork } from '@/stores/useAppStore'
import { useAppStore } from '@/stores/useAppStore'
import { compileAmlMulti, computeContractAddress, waitForTransaction } from '@/lib/rpc'
import { OCTRA_SAFE_SOURCE, IOCS01_INTERFACE_SOURCE } from '@/lib/contractSources'
import { isValidOctraAddress } from '@/lib/zerozio'  // 0xio SDK provides isValidAddress
import { classNames, sleep } from '@/utils/helpers'

interface OwnerEntry {
  id: number
  address: string
}

const DEPLOY_STEPS = [
  'Compiling AML contract...',
  'Computing contract address...',
  'Signing deploy transaction...',
  'Submitting to network...',
  'Waiting for confirmation...',
] as const

export function CreateSafeForm() {
  const navigate = useNavigate()
  const network = useNetwork()
  const { address, isConnected, deployContract, refresh } = useWallet()
  const addKnownSafe = useAppStore((s) => s.addKnownSafe)

  const [owners, setOwners] = useState<OwnerEntry[]>([
    { id: 1, address: '' },
  ])

  // Pre-fill the first owner input with the connected wallet's address
  // (once `address` becomes available after wallet unlock).
  useEffect(() => {
    if (address && owners[0]?.address === '') {
      setOwners((prev) =>
        prev.map((o, i) => i === 0 ? { ...o, address: address } : o)
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])
  const [threshold, setThreshold] = useState(1)
  const [deploying, setDeploying] = useState(false)
  const [deployStep, setDeployStep] = useState(-1)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const addOwner = () => {
    setOwners([...owners, { id: Date.now(), address: '' }])
  }

  const removeOwner = (id: number) => {
    if (owners.length <= 1) return
    setOwners(owners.filter((o) => o.id !== id))
    if (threshold > owners.length - 1) setThreshold(owners.length - 1)
  }

  const updateOwner = (id: number, addr: string) => {
    setOwners(owners.map((o) => (o.id === id ? { ...o, address: addr } : o)))
  }

  // Validation
  const validOwners = owners.filter((o) => o.address && isValidOctraAddress(o.address))
  const duplicateOwners = validOwners.length !== new Set(validOwners.map((o) => o.address)).size
  const includesZero = owners.some((o) => o.address && !isValidOctraAddress(o.address))
  const thresholdValid = threshold >= 1 && threshold <= validOwners.length
  const canSubmit = validOwners.length >= 1 && !duplicateOwners && !includesZero && thresholdValid && !!address && isConnected

  const ownerAddresses = validOwners.map((o) => o.address)

  const handleDeploy = async () => {
    if (!address || !isConnected) {
      toast.error('Wallet not connected')
      return
    }

    setDeploying(true)
    setDeployError(null)
    setTxHash(null)
    setDeployStep(0)
    setShowConfirm(false)

    try {
      // Step 1: Compile AML contract
      setDeployStep(0)
      const compileResult = await compileAmlMulti(
        network.rpcUrl,
        [
          { path: 'interfaces/IOCS01.aml', source: IOCS01_INTERFACE_SOURCE },
          { path: 'main.aml', source: OCTRA_SAFE_SOURCE },
        ],
        'main.aml'
      )
      if (!compileResult.bytecode) throw new Error('Compile failed: no bytecode returned')

      // Step 2: Compute deterministic contract address
      // (0xio extension handles nonce internally, but we still need to predict
      //  the address to display to the user. We use the current pending nonce
      //  from the RPC; the actual deploy will use whatever nonce the extension
      //  picks, which should be pending_nonce + 1.)
      setDeployStep(1)
      // We don't have direct access to the extension's nonce counter, so we
      // pass undefined and let computeContractAddress use the current nonce.
      const addrResult = await computeContractAddress(
        network.rpcUrl,
        compileResult.bytecode,
        address,
      )
      if (!addrResult.address) throw new Error('Failed to compute contract address')

      // Step 3-4: Build & sign deploy tx via 0xio extension
      // The extension will:
      //   - Show an approval popup
      //   - Sign with the user's ed25519 private key (which we never see)
      //   - Submit via octra_submit RPC
      //   - Return the tx hash
      setDeployStep(2)
      const result = await deployContract({
        bytecodeB64: compileResult.bytecode,
        contractAddress: addrResult.address,
        constructorArgs: [threshold],  // OctraSafe constructor takes (threshold_val: int)
        ou: '1000000',                 // ~1 OCT cap
      })
      setTxHash(result.txHash)

      // Step 5: Wait for confirmation
      setDeployStep(4)
      const confirmedTx = await waitForTransaction(network.rpcUrl, result.txHash)
      if (confirmedTx.status !== 'confirmed') {
        throw new Error(`Transaction ${confirmedTx.status}`)
      }

      // Cache the Safe address locally for fast dashboard load
      addKnownSafe(addrResult.address)

      // Refresh wallet balance
      refresh().catch(() => {})

      // Brief pause for indexing
      await sleep(2000)

      toast.success('Safe deployed!', {
        description: `Address: ${addrResult.address.slice(0, 12)}...`,
        duration: 5000,
      })

      // Navigate to the new Safe detail page
      navigate(`/safe/${addrResult.address}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Deploy failed'
      setDeployError(msg)
      toast.error('Deploy failed', { description: msg, duration: 8000 })
    } finally {
      setDeploying(false)
      setDeployStep(-1)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Create New Safe</h1>
        <p className="text-sm text-text-secondary mt-1">
          Deploy a new multi-signature wallet on Octra {network.isTestnet ? 'Devnet' : 'Mainnet'}.
        </p>
      </div>

      {!address && (
        <Card className="flex items-center gap-3 border-status-pending/30 bg-status-pending/5">
          <AlertCircle className="h-5 w-5 text-status-pending shrink-0" />
          <p className="text-xs text-status-pending">
            Connect your wallet first to deploy a Safe.
          </p>
        </Card>
      )}

      {/* Owners section */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent-blue" />
              Owners
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Add the addresses that will co-manage this Safe.
            </p>
          </div>
          <Badge variant="info">{validOwners.length} valid</Badge>
        </div>

        <div className="space-y-2">
          {owners.map((owner, idx) => (
            <div key={owner.id} className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-hover text-xs font-semibold text-text-muted shrink-0">
                {idx + 1}
              </div>
              <Input
                placeholder="oct..."
                value={owner.address}
                onChange={(e) => updateOwner(owner.id, e.target.value)}
                error={
                  owner.address && !isValidOctraAddress(owner.address)
                    ? 'Invalid Octra address'
                    : undefined
                }
                className="font-mono text-xs"
              />
              {owner.address === address && (
                <Badge variant="info" size="sm">You</Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeOwner(owner.id)}
                disabled={owners.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addOwner}>
          <Plus className="h-3.5 w-3.5" />
          Add Owner
        </Button>

        {duplicateOwners && (
          <p className="text-xs text-status-failed flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Duplicate addresses detected
          </p>
        )}
      </Card>

      {/* Threshold section */}
      <Card className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Confirmation Threshold</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            How many owners must confirm a transaction before it executes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={validOwners.length}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 1)}
            error={!thresholdValid ? `Must be between 1 and ${validOwners.length}` : undefined}
            className="w-24 text-center font-mono"
          />
          <span className="text-sm text-text-muted">of {validOwners.length} owner(s)</span>
        </div>

        <div className="flex gap-1">
          {Array.from({ length: validOwners.length }).map((_, i) => {
            const n = i + 1
            return (
              <button
                key={n}
                onClick={() => setThreshold(n)}
                className={classNames(
                  'flex-1 h-8 rounded-md text-xs font-medium transition-all',
                  threshold === n
                    ? 'bg-accent-blue text-white'
                    : 'bg-bg-hover text-text-secondary hover:bg-border'
                )}
              >
                {n}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Preview section */}
      <Card className="space-y-3 bg-accent-blue/5 border-accent-blue/20">
        <h3 className="text-sm font-semibold text-text-primary">Summary</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] uppercase text-text-muted">Owners</p>
            <p className="text-lg font-bold text-text-primary">{validOwners.length}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-text-muted">Threshold</p>
            <p className="text-lg font-bold text-text-primary">{threshold}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-text-muted">Network</p>
            <p className="text-sm font-bold text-text-primary mt-1">{network.isTestnet ? 'Devnet' : 'Mainnet'}</p>
          </div>
        </div>
        <p className="text-[10px] text-text-muted text-center">
          Deploy cost: ~1 OCT max (actual fee typically much less)
        </p>
      </Card>

      <Button
        size="lg"
        className="w-full"
        disabled={!canSubmit}
        onClick={() => setShowConfirm(true)}
      >
        <Shield className="h-4 w-4" />
        Deploy Safe
      </Button>

      {/* Confirm modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => !deploying && setShowConfirm(false)}
        title="Confirm Deployment"
        description="Review the Safe configuration before deploying."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-bg-subtle border border-border space-y-2">
            <Row label="Owners" value={`${validOwners.length}`} />
            <Row label="Threshold" value={`${threshold} / ${validOwners.length}`} />
            <Row label="Network" value={network.isTestnet ? 'Devnet' : 'Mainnet'} />
            <Row label="Deployer" value={address ?? '-'} mono />
            <Row label="Est. fee" value="~1 OCT max" />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-status-pending/10 border border-status-pending/30">
            <AlertCircle className="h-4 w-4 text-status-pending shrink-0 mt-0.5" />
            <p className="text-xs text-status-pending">
              This transaction will deploy a new contract on-chain and consume OCT for gas. The operation is irreversible.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} disabled={deploying}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleDeploy} disabled={deploying}>
              {deploying ? 'Deploying...' : 'Confirm & Deploy'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deploy progress modal */}
      <Modal
        isOpen={deploying || !!deployError || !!txHash}
        onClose={() => {}}
        title={deployError ? 'Deployment Failed' : txHash ? 'Deployment Successful' : 'Deploying Safe'}
        showClose={false}
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          {deployError && (
            <div className="p-3 rounded-xl bg-status-failed/10 border border-status-failed/30">
              <p className="text-xs text-status-failed font-mono break-all">{deployError}</p>
            </div>
          )}

          {!deployError && !txHash && (
            <div className="space-y-3">
              {DEPLOY_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center shrink-0">
                    {i < deployStep ? (
                      <Check className="h-4 w-4 text-status-success" />
                    ) : i === deployStep ? (
                      <Loader2 className="h-4 w-4 text-accent-blue animate-spin" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-border" />
                    )}
                  </div>
                  <span className={classNames(
                    'text-sm',
                    i < deployStep ? 'text-text-secondary' :
                    i === deployStep ? 'text-text-primary font-medium' :
                    'text-text-muted'
                  )}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          )}

          {txHash && !deployError && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-status-success">
                <Check className="h-5 w-5" />
                <span className="text-sm font-semibold">Safe deployed successfully!</span>
              </div>
              <div className="p-3 rounded-xl bg-bg-subtle border border-border">
                <p className="text-[10px] text-text-muted mb-1">Transaction Hash</p>
                <a
                  href={network.explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-accent-blue hover:underline break-all"
                >
                  {txHash}
                </a>
              </div>
              <Button className="w-full" onClick={() => navigate(-1)}>
                Continue
              </Button>
            </div>
          )}

          {deployError && (
            <Button className="w-full" variant="outline" onClick={() => { setDeployError(null); setTxHash(null); setDeploying(false); setDeployStep(-1) }}>
              Close & Retry
            </Button>
          )}
        </div>
      </Modal>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={classNames('text-xs text-text-primary', mono && 'font-mono')}>{value}</span>
    </div>
  )
}
