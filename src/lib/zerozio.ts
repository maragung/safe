// ============================================================================
// lib/zerozio.ts — Singleton wrapper around @0xio/sdk ZeroXIOWallet
// ----------------------------------------------------------------------------
// The 0xio wallet is a browser extension (Chrome MV3) that injects itself as
// `window.octra` (RFC-O-1 standard provider) or `window.wallet0xio` (legacy).
// The SDK auto-detects which transport to use (extension → iframe → WebView).
//
// CRITICAL: We use 0xio wallet EXCLUSIVELY for signing & transaction submission.
// The dApp never sees the user's private key — all signing happens inside the
// extension's isolated background context.
//
// Docs: https://docs.0xio.xyz/
// SDK source: https://github.com/0xio-xyz/0xio-sdk
// Chrome extension: https://chromewebstore.google.com/detail/0xio-wallet/anknhjilldkeelailocijnfibefmepcc
// ============================================================================

import { ZeroXIOWallet, createZeroXIOWallet, isValidAddress, type ConnectEvent, type ConnectionInfo, type Balance, type NetworkInfo, type TransactionResult, type ContractCallData, type ContractViewCallData, type TransactionData } from '@0xio/sdk'

// ===========================================================================
// Singleton instance
// ===========================================================================

let _wallet: ZeroXIOWallet | null = null
let _initPromise: Promise<ZeroXIOWallet | null> | null = null

export interface WalletInitResult {
  wallet: ZeroXIOWallet | null
  available: boolean
}

// Initialize (idempotent — safe to call multiple times).
// Returns the wallet instance if the 0xio extension (or compatible transport)
// is available; null otherwise.
export async function initWallet(): Promise<WalletInitResult> {
  if (_wallet) return { wallet: _wallet, available: true }
  if (_initPromise) {
    const w = await _initPromise
    return { wallet: w, available: w !== null }
  }

  _initPromise = (async () => {
    try {
      const w = new ZeroXIOWallet({
        appName: 'Octra Safe',
        appDescription: 'Multi-signature wallet for the Octra blockchain',
        requiredPermissions: ['read_balance', 'send_transactions', 'sign_messages'],
      })
      const ok = await w.initialize()
      if (!ok) {
        console.warn('[0xio] Wallet not detected. Install from https://chromewebstore.google.com/detail/0xio-wallet/anknhjilldkeelailocijnfibefmepcc')
        return null
      }
      _wallet = w
      return w
    } catch (e) {
      console.error('[0xio] initialize failed:', e)
      return null
    }
  })()

  const w = await _initPromise
  return { wallet: w, available: w !== null }
}

// Get the wallet instance (must call initWallet first).
export function getWallet(): ZeroXIOWallet | null {
  return _wallet
}

// ===========================================================================
// Convenience wrappers — thin pass-through to the SDK
// ===========================================================================

export async function connectWallet(): Promise<ConnectEvent> {
  const { wallet, available } = await initWallet()
  if (!available || !wallet) {
    throw new ZeroXioNotInstalledError()
  }
  return wallet.connect({
    permissions: ['read_balance', 'send_transactions', 'sign_messages'],
  })
}

export async function disconnectWallet(): Promise<void> {
  const wallet = getWallet()
  if (!wallet) return
  try {
    await wallet.disconnect()
  } catch (e) {
    console.warn('[0xio] disconnect failed:', e)
  }
}

export async function getConnectionInfo(): Promise<ConnectionInfo> {
  const wallet = getWallet()
  if (!wallet) return { isConnected: false }
  return wallet.getConnectionStatus()
}

export async function getBalance(forceRefresh = false): Promise<Balance | null> {
  const wallet = getWallet()
  if (!wallet) return null
  try {
    return await wallet.getBalance(forceRefresh)
  } catch (e) {
    console.warn('[0xio] getBalance failed:', e)
    return null
  }
}

export async function getAddress(): Promise<string | null> {
  const wallet = getWallet()
  if (!wallet) return null
  return wallet.getAddress()
}

export async function getNetworkId(): Promise<string | null> {
  const wallet = getWallet()
  if (!wallet) return null
  return wallet.getNetworkId()
}

export async function switchNetwork(networkId: 'mainnet' | 'devnet'): Promise<void> {
  const wallet = getWallet()
  if (!wallet) throw new ZeroXioNotInstalledError()
  await wallet.switchNetwork(networkId)
}

// ===========================================================================
// Transaction helpers
// ===========================================================================

// Send native OCT to a recipient (or to a Safe contract for deposit).
export async function sendNativeOct(params: {
  to: string
  amount: number | string  // OCT (human-readable, e.g. 1.5)
  message?: string
}): Promise<TransactionResult> {
  const wallet = getWallet()
  if (!wallet) throw new ZeroXioNotInstalledError()
  return wallet.sendTransaction({
    to: params.to,
    amount: params.amount,
    message: params.message,
    feeLevel: 1,
  })
}

// Call a state-changing method on a smart contract.
// params must be FLAT primitives (string|number|boolean), NOT array-wrapped.
// The 0xio extension builds canonical JSON, signs, and submits via octra_submit.
export async function callContract(params: {
  contract: string
  method: string
  args: Array<string | number | boolean>
  amount?: string  // native OCT to attach (default '0')
  ou?: string      // gas units (default '10000')
}): Promise<TransactionResult> {
  const wallet = getWallet()
  if (!wallet) throw new ZeroXioNotInstalledError()
  const callData: ContractCallData = {
    contract: params.contract,
    method: params.method,
    params: params.args,
    amount: params.amount ?? '0',
    ou: params.ou ?? '10000',
  }
  return wallet.callContract(callData)
}

// Call a read-only view method on a smart contract.
// Does NOT require wallet connection (only initialize()).
export async function callContractView(params: {
  contract: string
  method: string
  args?: Array<string | number | boolean>
}): Promise<unknown> {
  const wallet = getWallet()
  if (!wallet) throw new ZeroXioNotInstalledError()
  const viewData: ContractViewCallData = {
    contract: params.contract,
    method: params.method,
    params: params.args ?? [],
  }
  return wallet.contractCallView(viewData)
}

// Sign an arbitrary message (returns base64 ed25519 signature).
export async function signMessage(message: string): Promise<string> {
  const wallet = getWallet()
  if (!wallet) throw new ZeroXioNotInstalledError()
  return wallet.signMessage(message)
}

// ===========================================================================
// Low-level: deploy a smart contract via window.octra RFC-O-1 provider
// ----------------------------------------------------------------------------
// The 0xio SDK's high-level `sendTransaction()` only supports standard OCT
// transfers (no op_type=deploy). For contract deployment, we bypass the SDK
// and call the underlying window.octra provider directly with a full Octra
// transaction object including op_type='deploy' and encrypted_data=bytecode.
//
// The extension will:
//   1. Show an approval popup (user must approve)
//   2. Build the canonical JSON
//   3. ed25519-sign it
//   4. Submit via octra_submit RPC
//   5. Return the tx hash
// ===========================================================================

export interface DeployResult {
  txHash: string
  contractAddress: string
  status?: string
}

export async function deployContract(params: {
  bytecodeB64: string           // base64-encoded OCTB bytecode
  contractAddress: string       // precomputed deterministic address
  constructorArgs: Array<string | number | boolean>  // JSON array of constructor params
  ou?: string                   // gas units (default '1000000' = ~1 OCT cap)
}): Promise<DeployResult> {
  if (typeof window === 'undefined' || !(window as any).octra?.isOctra) {
    throw new ZeroXioNotInstalledError()
  }
  const provider = (window as any).octra

  // Build the Octra deploy transaction object.
  // The extension will fill in `from`, `nonce`, `timestamp`, `signature`,
  // and `public_key` automatically.
  const tx = {
    to_: params.contractAddress,
    amount: '0',
    ou: params.ou ?? '1000000',
    op_type: 'deploy',
    encrypted_data: params.bytecodeB64,
    message: JSON.stringify(params.constructorArgs.map(stringifyArg)),
  }

  const result = await provider.request({
    method: 'octra_sendTransaction',
    params: tx,
  })

  // Result shape varies by extension version; extract txHash defensively
  const txHash = (result as any)?.txHash ??
    (result as any)?.hash ??
    (result as any)?.tx_hash ??
    ''
  if (!txHash) {
    throw new Error('Deploy succeeded but no tx hash returned')
  }

  return {
    txHash,
    contractAddress: params.contractAddress,
    status: (result as any)?.status,
  }
}

function stringifyArg(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0'
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return JSON.stringify(v)
}

// ===========================================================================
// Error types
// ===========================================================================

export class ZeroXioNotInstalledError extends Error {
  constructor() {
    super('0xio wallet extension not detected. Install from https://chromewebstore.google.com/detail/0xio-wallet/anknhjilldkeelailocijnfibefmepcc')
    this.name = 'ZeroXioNotInstalledError'
  }
}

export class ZeroXioUserRejectedError extends Error {
  constructor() {
    super('User rejected the request')
    this.name = 'ZeroXioUserRejectedError'
  }
}

export class ZeroXioWalletLockedError extends Error {
  constructor() {
    super('0xio wallet is locked. Please unlock it and try again.')
    this.name = 'ZeroXioWalletLockedError'
  }
}

// ===========================================================================
// Install detection — for showing the "Install 0xio" prompt
// ===========================================================================

export function is0xioExtensionInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return !!(
    (window as any).wallet0xio ||
    (window as any).ZeroXIOWallet ||
    ((window as any).octra?.isOctra === true)
  )
}

// Re-export the SDK's address validation helper (validates `oct...` 47-char base58).
export function isValidOctraAddress(addr: string): boolean {
  return isValidAddress(addr)
}

// ===========================================================================
// Re-exports for convenience
// ===========================================================================

export type {
  ZeroXIOWallet,
  ConnectEvent,
  ConnectionInfo,
  Balance,
  NetworkInfo,
  TransactionResult,
  ContractCallData,
  ContractViewCallData,
  TransactionData,
} from '@0xio/sdk'

// Chrome Web Store URL for the install prompt
export const ZEROXIO_INSTALL_URL = 'https://chromewebstore.google.com/detail/0xio-wallet/anknhjilldkeelailocijnfibefmepcc'
export const ZEROXIO_DOCS_URL = 'https://docs.0xio.xyz/'
export const ZEROXIO_WEBSITE_URL = 'https://0xio.xyz/'
