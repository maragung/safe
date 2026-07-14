// ============================================================================
// config/networks.ts — Octra network configurations
// ----------------------------------------------------------------------------
// Octra is NOT EVM-compatible. There is no numeric chain ID; networks are
// identified by `network_version` returned from `node_status` RPC.
// All RPC is JSON-RPC 2.0 over POST /rpc with custom `octra_*` methods.
// ============================================================================

import type { NetworkConfig, NetworkId } from '@/types'

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: 'mainnet',
    name: 'Octra Mainnet',
    rpcUrl: 'https://octra.network/rpc',
    explorerUrl: 'https://octrascan.io',
    explorerTxUrl: (hash) => `https://octrascan.io/tx.html?hash=${hash}`,
    explorerAddressUrl: (addr) => `https://octrascan.io/address.html?addr=${addr}`,
    nativeSymbol: 'OCT',
    nativeDecimals: 6,
    isTestnet: false,
  },
  devnet: {
    id: 'devnet',
    name: 'Octra Devnet',
    rpcUrl: 'https://devnet.octrascan.io/rpc',
    explorerUrl: 'https://devnet.octrascan.io',
    explorerTxUrl: (hash) => `https://devnet.octrascan.io/tx.html?hash=${hash}`,
    explorerAddressUrl: (addr) => `https://devnet.octrascan.io/address.html?addr=${addr}`,
    nativeSymbol: 'OCT',
    nativeDecimals: 6,
    isTestnet: true,
  },
}

export const DEFAULT_NETWORK: NetworkId = 'devnet'

// Native asset constants
export const NATIVE_DECIMALS = 6
export const NATIVE_SYMBOL = 'OCT'
export const OU_PER_OCT = 1_000_000

// Default fee (in OU = operation units) for various operation types.
// NOTE: `ou` is a MAX CAP / bid, not the actual fee charged. The network
// charges based on actual computation effort (see `contract_receipt.effort`).
// These defaults are conservative caps; actual cost is typically much lower.
// 1 OCT = 1,000,000 OU.
//
// Recommended approach: query `octra_recommendedFee(op_type)` before submit
// and use the "recommended" value as the bid. These defaults are fallbacks
// only for when the RPC query fails.
export const DEFAULT_FEES = {
  standard: '10000',     // plain OCT transfer  (~0.01 OCT cap)
  call: '1000',          // contract state-changing call  (~0.001 OCT cap)
  deploy: '1000000',     // contract deployment  (~1 OCT cap — was 50M, lowered)
  program_exec: '1000',
  multi_exec: '8000',
} as const

// Operation type names used in Octra transactions
export const OP_TYPES = {
  STANDARD: 'standard',
  CALL: 'call',
  DEPLOY: 'deploy',
  PROGRAM_EXEC: 'program_exec',
  MULTI_EXEC: 'multi_exec',
  ENCRYPT: 'encrypt',
  DECRYPT: 'decrypt',
  STEALTH: 'stealth',
} as const

// Local storage keys
export const STORAGE_KEYS = {
  network: 'octra-safe:network',
  tokens: 'octra-safe:custom-tokens',
  safes: 'octra-safe:known-safes',      // locally cached Safe addresses owned by user
} as const

// Regex for validating Octra addresses
// Format: `oct` + base58 chars (123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz)
// Total length: 47 chars
export const OCTRA_ADDRESS_REGEX = /^oct[1-9A-HJ-NP-Za-km-z]{44}$/
