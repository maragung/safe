// ============================================================================
// stores/useAppStore.ts — Global app state via zustand
// ----------------------------------------------------------------------------
// Wallet state is now sourced from the 0xio SDK via useWallet hook (NOT here).
// This store only holds: network selection, custom tokens, and locally-cached
// Safe addresses (for fast dashboard load).
// ============================================================================

import { create } from 'zustand'
import type { NetworkId, TokenInfo } from '@/types'
import { NETWORKS, DEFAULT_NETWORK } from '@/config/networks'
import { getKnownTokens } from '@/config/contracts'
import { STORAGE_KEYS } from '@/config/networks'

interface AppState {
  // Network (local-only state — actual wallet network is in 0xio extension)
  networkId: NetworkId
  setNetworkId: (id: NetworkId) => void

  // Tokens (known + custom user-added)
  tokens: TokenInfo[]
  addToken: (t: TokenInfo) => void
  removeToken: (addr: string) => void
  reloadTokens: () => void

  // Locally cached Safes (addresses the user owns or has interacted with)
  knownSafes: string[]
  addKnownSafe: (addr: string) => void
  removeKnownSafe: (addr: string) => void
  reloadKnownSafes: () => void

  // UI state
  loading: boolean
  setLoading: (b: boolean) => void
}

function loadCustomTokens(networkId: NetworkId): TokenInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tokens)
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, TokenInfo[]>
    return all[networkId] ?? []
  } catch {
    return []
  }
}

function saveCustomTokens(networkId: NetworkId, tokens: TokenInfo[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tokens)
    const all = raw ? (JSON.parse(raw) as Record<string, TokenInfo[]>) : {}
    all[networkId] = tokens
    localStorage.setItem(STORAGE_KEYS.tokens, JSON.stringify(all))
  } catch {
    // ignore
  }
}

function loadKnownSafes(): string[] {
  try {
    const networkId = getCurrentNetworkId()
    const raw = localStorage.getItem(STORAGE_KEYS.safes)
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, string[]>
    return all[networkId] ?? []
  } catch {
    return []
  }
}

function saveKnownSafes(addrs: string[]) {
  try {
    const networkId = getCurrentNetworkId()
    const raw = localStorage.getItem(STORAGE_KEYS.safes)
    const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    all[networkId] = addrs
    localStorage.setItem(STORAGE_KEYS.safes, JSON.stringify(all))
  } catch {
    // ignore
  }
}

function getCurrentNetworkId(): NetworkId {
  if (typeof window === 'undefined') return DEFAULT_NETWORK
  const stored = window.localStorage.getItem(STORAGE_KEYS.network)
  if (stored === 'mainnet' || stored === 'devnet') return stored
  return DEFAULT_NETWORK
}

function getInitialTokens(networkId: NetworkId): TokenInfo[] {
  const known = getKnownTokens(networkId)
  const custom = loadCustomTokens(networkId)
  const seen = new Set(known.map((t) => t.address))
  const merged = [...known]
  for (const t of custom) {
    if (!seen.has(t.address)) {
      merged.push(t)
      seen.add(t.address)
    }
  }
  return merged
}

const initialNetworkId = getCurrentNetworkId()

export const useAppStore = create<AppState>((set, get) => ({
  networkId: initialNetworkId,
  setNetworkId: (id) => {
    localStorage.setItem(STORAGE_KEYS.network, id)
    const tokens = getInitialTokens(id)
    const allSafesRaw = localStorage.getItem(STORAGE_KEYS.safes)
    let newSafes: string[] = []
    if (allSafesRaw) {
      try {
        const all = JSON.parse(allSafesRaw) as Record<string, string[]>
        newSafes = all[id] ?? []
      } catch {
        // ignore
      }
    }
    set({ networkId: id, tokens, knownSafes: newSafes })
  },

  tokens: getInitialTokens(initialNetworkId),
  addToken: (t) => {
    const existing = get().tokens
    if (existing.some((x) => x.address === t.address)) return
    const custom = loadCustomTokens(get().networkId)
    const newCustom = [...custom.filter((x) => x.address !== t.address), t]
    saveCustomTokens(get().networkId, newCustom)
    set({ tokens: [...existing, t] })
  },
  removeToken: (addr) => {
    const existing = get().tokens
    const filtered = existing.filter((t) => t.address !== addr)
    const custom = loadCustomTokens(get().networkId).filter((t) => t.address !== addr)
    saveCustomTokens(get().networkId, custom)
    set({ tokens: filtered })
  },
  reloadTokens: () => set({ tokens: getInitialTokens(get().networkId) }),

  knownSafes: loadKnownSafes(),
  addKnownSafe: (addr) => {
    const existing = get().knownSafes
    if (existing.includes(addr)) return
    const updated = [...existing, addr]
    saveKnownSafes(updated)
    set({ knownSafes: updated })
  },
  removeKnownSafe: (addr) => {
    const existing = get().knownSafes
    const updated = existing.filter((a) => a !== addr)
    saveKnownSafes(updated)
    set({ knownSafes: updated })
  },
  reloadKnownSafes: () => set({ knownSafes: loadKnownSafes() }),

  loading: false,
  setLoading: (b) => set({ loading: b }),
}))

// Convenience selector for current NetworkConfig
export function useNetwork() {
  const networkId = useAppStore((s) => s.networkId)
  return NETWORKS[networkId]
}

