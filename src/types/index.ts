// ============================================================================
// types/index.ts — Shared TypeScript types for Octra Safe
// ============================================================================

export type NetworkId = 'mainnet' | 'devnet'

export interface NetworkConfig {
  id: NetworkId
  name: string
  rpcUrl: string
  explorerUrl: string
  explorerTxUrl: (hash: string) => string
  explorerAddressUrl: (addr: string) => string
  nativeSymbol: string
  nativeDecimals: number
  isTestnet: boolean
}

export interface WalletState {
  // DEPRECATED — wallet state is now sourced from the 0xio SDK via useWallet.
  // Kept as a stub for any code still importing the type.
  address: string | null
  isConnected: boolean
  balance: number | null
}

export interface TokenInfo {
  address: string            // Octra contract address (oct...)
  name: string
  symbol: string
  decimals: number
  logo?: string
  isCustom?: boolean         // user-added token
}

export interface SafeInfo {
  address: string
  owners: string[]
  threshold: number
  ownerCount: number
  balance: number            // native OCT formatted
  balanceRaw: string         // native OU raw
  pendingTxCount: number
}

export interface SafeTransaction {
  id: number
  to: string
  value: number              // native OCT formatted
  valueRaw: string           // raw OU
  data: string               // action encoding (see OctraSafe.aml comments)
  executed: boolean
  confirmations: string[]    // list of owner addresses that confirmed
  confirmationCount: number
  threshold: number
  // Decoded human-readable description (filled by txDecoder)
  description?: string
  kind?: TxKind
  // Optional metadata
  submitEpoch?: number
  executeEpoch?: number
  txHash?: string            // explorer tx hash if executed
}

export type TxKind =
  | 'native_transfer'
  | 'token_transfer'
  | 'token_grant'
  | 'add_owner'
  | 'remove_owner'
  | 'replace_owner'
  | 'change_threshold'
  | 'custom_call'
  | 'unknown'

export interface PendingTx {
  txHash: string
  status: 'pending' | 'confirmed' | 'rejected' | 'dropped'
  from: string
  to: string
  amount: string
  nonce: number
  opType: string
  timestamp: number
}

export interface OctraTx {
  // Build params for a signed Octra transaction
  from: string
  to_: string
  amount: string             // raw OU as string
  nonce: number
  ou: string                 // fee in OU as string
  timestamp: number          // unix seconds (float)
  op_type: string            // 'standard' | 'call' | 'deploy' | ...
  encrypted_data?: string    // method name (call) or bytecode (deploy)
  message?: string           // JSON array of params (call) or constructor args (deploy)
  signature?: string         // base64 ed25519
  public_key?: string        // base64 ed25519 pk
}

export interface ContractCallResult {
  result?: string | number | boolean | null
  error?: { code: number; message: string } | null
  storage?: Record<string, unknown>
  events?: Array<{ name: string; args: unknown[] }>
}

export interface AbiMethod {
  name: string
  type: 'view' | 'call'
  params: Array<{ name: string; type: string; example?: string }>
}

export interface ContractAbi {
  contract: string
  methods: AbiMethod[]
}

// OCS01 function signature names (canonical Octra naming)
export const OCS01_FUNCTIONS = {
  transfer: 'transfer',
  grant: 'grant',
  pull: 'pull',
  balanceOf: 'balance_of',
  allowance: 'allowance',
  getName: 'get_name',
  getSymbol: 'get_symbol',
  getTotalSupply: 'get_total_supply',
  decimals: 'decimals',
  getOwner: 'get_owner',
  mint: 'mint',
  increaseGrant: 'increase_grant',
  decreaseGrant: 'decrease_grant',
  revokeGrant: 'revoke_grant',
} as const

// OctraSafe function names
export const SAFE_FUNCTIONS = {
  submitTransaction: 'submit_transaction',
  confirmTransaction: 'confirm_transaction',
  revokeConfirmation: 'revoke_confirmation',
  executeTransaction: 'execute_transaction',
  addOwner: 'add_owner',
  removeOwner: 'remove_owner',
  replaceOwner: 'replace_owner',
  changeThreshold: 'change_threshold',
  receive: 'receive',
  // view
  getOwnerCount: 'get_owner_count',
  getThreshold: 'get_threshold',
  getTransactionCount: 'get_transaction_count',
  getOwnerAt: 'get_owner_at',
  isOwner: 'is_owner',
  getTransaction: 'get_transaction',
  getConfirmationCount: 'get_confirmation_count',
  isConfirmedBy: 'is_confirmed_by',
  getSafeBalance: 'get_safe_balance',
  getOwners: 'get_owners',
} as const

// Factory function names
// NOTE: After security audit (F1-F19 fixes), the factory no longer caches
// Safe state. register_owner_for_safe was REMOVED (cache drift + no auth).
// get_safe_threshold / get_safe_owner_count / get_safe_owner_at are now
// deprecated passthroughs — frontend should query the Safe contract directly.
// New: unregister_safe (admin-gated), transfer_admin / accept_admin (2-step).
export const FACTORY_FUNCTIONS = {
  registerSafe: 'register_safe',
  unregisterSafe: 'unregister_safe',
  transferAdmin: 'transfer_admin',
  acceptAdmin: 'accept_admin',
  // Read-only
  getSafeCount: 'get_safe_count',
  getSafeAt: 'get_safe_at',
  getSafes: 'get_safes',
  getSafeRange: 'get_safe_range',
  isSafeRegistered: 'is_safe_registered',
  getFactoryAdmin: 'get_factory_admin',
  getPendingAdmin: 'get_pending_admin',
  // DEPRECATED (return 0 / revert — query Safe directly):
  getSafeThreshold: 'get_safe_threshold',
  getSafeOwnerCount: 'get_safe_owner_count',
  getSafeOwnerAt: 'get_safe_owner_at',
} as const
