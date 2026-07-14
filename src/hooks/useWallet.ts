// ============================================================================
// hooks/useWallet.ts — Wallet connection via 0xio extension
// ----------------------------------------------------------------------------
// REFACTOR: OctraSafe now uses 0xio wallet EXCLUSIVELY. The in-browser
// ed25519 wallet (signer.ts) has been removed. All signing happens inside
// the 0xio browser extension's isolated background context — the dApp never
// sees the private key.
//
// Install: https://chromewebstore.google.com/detail/0xio-wallet/anknhjilldkeelailocijnfibefmepcc
// Docs: https://docs.0xio.xyz/
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  initWallet, getWallet, connectWallet, disconnectWallet,
  getConnectionInfo, getBalance, getAddress, getNetworkId, switchNetwork,
  sendNativeOct, callContract, callContractView, signMessage as zeroxioSignMessage,
  deployContract as zeroxioDeployContract,
  is0xioExtensionInstalled, ZeroXioNotInstalledError, ZeroXioUserRejectedError,
  ZEROXIO_INSTALL_URL,
  type Balance, type NetworkInfo, type TransactionResult, type DeployResult,
} from '@/lib/zerozio'

export interface WalletHook {
  // State
  address: string | null
  isConnected: boolean
  isConnecting: boolean
  isAvailable: boolean           // 0xio extension detected?
  balance: Balance | null
  networkId: string | null       // 'mainnet' | 'devnet' | null
  networkInfo: NetworkInfo | null
  // Connection
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
  // Switch network
  switchToNetwork: (id: 'mainnet' | 'devnet') => Promise<void>
  // Signing & tx submission (all via 0xio extension)
  sendTx: (params: { to: string; amount: number | string; message?: string }) => Promise<TransactionResult>
  sendContractCall: (params: {
    contract: string
    method: string
    args: Array<string | number | boolean>
    amount?: string
    ou?: string
  }) => Promise<TransactionResult>
  callView: (params: {
    contract: string
    method: string
    args?: Array<string | number | boolean>
  }) => Promise<unknown>
  deployContract: (params: {
    bytecodeB64: string
    contractAddress: string
    constructorArgs: Array<string | number | boolean>
    ou?: string
  }) => Promise<DeployResult>
  signMessage: (msg: string) => Promise<string>
  // Install info
  installUrl: string
}

export function useWallet(): WalletHook {
  const [address, setAddress] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [networkId, setNetworkId] = useState<string | null>(null)
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  // --- Initial detect & auto-reconnect ---
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const { wallet, available } = await initWallet()
      if (cancelled) return

      setIsAvailable(available)
      if (!available || !wallet) return

      // Try to auto-reconnect if user previously approved
      try {
        const info = await wallet.getConnectionStatus()
        if (cancelled) return
        if (info.isConnected && info.address) {
          setAddress(info.address)
          setIsConnected(true)
          setBalance(info.balance ?? null)
          setNetworkInfo(info.networkInfo ?? null)
          setNetworkId(info.networkInfo?.id ?? null)
        }
      } catch (e) {
        console.warn('[useWallet] auto-reconnect check failed', e)
      }

      // Subscribe to wallet events
      const onAccountChanged = (event: any) => {
        const newAddr = event?.data?.newAddress ?? event?.newAddress
        if (newAddr) {
          setAddress(newAddr)
          toast.info('Account changed', { description: newAddr.slice(0, 12) + '...' })
        }
      }
      const onDisconnect = () => {
        setAddress(null)
        setIsConnected(false)
        setBalance(null)
        toast.info('Wallet disconnected')
      }
      const onBalanceChanged = (event: any) => {
        const newBal = event?.data?.newBalance ?? event?.newBalance
        if (newBal) setBalance(newBal)
      }
      const onNetworkChanged = (event: any) => {
        const newNet = event?.data?.newNetwork ?? event?.newNetwork
        if (newNet) {
          setNetworkInfo(newNet)
          setNetworkId(newNet.id)
          toast.info('Network changed', { description: newNet.name })
        }
      }
      const onExtensionLocked = () => {
        toast.info('0xio wallet locked', { description: 'Unlock it to continue' })
      }
      const onExtensionUnlocked = () => {
        // Refresh state after unlock
        refresh()
      }

      wallet.on('accountChanged', onAccountChanged)
      wallet.on('disconnect', onDisconnect)
      wallet.on('balanceChanged', onBalanceChanged)
      wallet.on('networkChanged', onNetworkChanged)
      wallet.on('extensionLocked', onExtensionLocked)
      wallet.on('extensionUnlocked', onExtensionUnlocked)

      return () => {
        wallet.off('accountChanged', onAccountChanged)
        wallet.off('disconnect', onDisconnect)
        wallet.off('balanceChanged', onBalanceChanged)
        wallet.off('networkChanged', onNetworkChanged)
        wallet.off('extensionLocked', onExtensionLocked)
        wallet.off('extensionUnlocked', onExtensionUnlocked)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  // --- Auto-refresh balance every 30s when connected ---
  useEffect(() => {
    if (!isConnected) return
    refresh()
    refreshTimerRef.current = window.setInterval(refresh, 30000)
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [isConnected])

  // --- Connect ---
  const connect = useCallback(async () => {
    setIsConnecting(true)
    try {
      // Check extension installed
      if (!is0xioExtensionInstalled()) {
        toast.error('0xio wallet not detected', {
          description: 'Install the Chrome extension to continue',
          action: {
            label: 'Install',
            onClick: () => window.open(ZEROXIO_INSTALL_URL, '_blank'),
          },
          duration: 8000,
        })
        return
      }
      const result = await connectWallet()
      setAddress(result.address)
      setIsConnected(true)
      setBalance(result.balance)
      setNetworkInfo(result.networkInfo)
      setNetworkId(result.networkInfo.id)
      toast.success('Connected to 0xio wallet', {
        description: result.address.slice(0, 12) + '...' + result.address.slice(-6),
      })
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (msg.includes('USER_REJECTED') || msg.includes('rejected')) {
        toast.error('Connection rejected')
      } else if (msg.includes('WALLET_LOCKED') || msg.includes('locked')) {
        toast.error('0xio wallet is locked', { description: 'Unlock it and try again' })
      } else {
        toast.error('Failed to connect', { description: msg })
      }
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // --- Disconnect ---
  const disconnect = useCallback(async () => {
    try {
      await disconnectWallet()
    } catch (e) {
      console.warn('[useWallet] disconnect failed', e)
    }
    setAddress(null)
    setIsConnected(false)
    setBalance(null)
    toast.info('Wallet disconnected')
  }, [])

  // --- Refresh balance & connection status ---
  const refresh = useCallback(async () => {
    if (!isConnected) return
    try {
      const [bal, info] = await Promise.all([getBalance(true), getConnectionInfo()])
      if (bal) setBalance(bal)
      if (info.networkInfo) {
        setNetworkInfo(info.networkInfo)
        setNetworkId(info.networkInfo.id)
      }
    } catch (e) {
      console.warn('[useWallet] refresh failed', e)
    }
  }, [isConnected])

  // --- Switch network ---
  const switchToNetwork = useCallback(async (id: 'mainnet' | 'devnet') => {
    try {
      await switchNetwork(id)
      toast.success(`Switched to ${id === 'mainnet' ? 'Mainnet' : 'Devnet'}`)
      refresh()
    } catch (e: any) {
      toast.error('Failed to switch network', { description: e?.message })
    }
  }, [refresh])

  // --- Send native OCT ---
  const sendTx = useCallback(async (params: {
    to: string
    amount: number | string
    message?: string
  }): Promise<TransactionResult> => {
    if (!isConnected) throw new Error('Wallet not connected')
    return sendNativeOct(params)
  }, [isConnected])

  // --- Send contract call ---
  const sendContractCall = useCallback(async (params: {
    contract: string
    method: string
    args: Array<string | number | boolean>
    amount?: string
    ou?: string
  }): Promise<TransactionResult> => {
    if (!isConnected) throw new Error('Wallet not connected')
    return callContract(params)
  }, [isConnected])

  // --- Read-only contract view ---
  const callView = useCallback(async (params: {
    contract: string
    method: string
    args?: Array<string | number | boolean>
  }): Promise<unknown> => {
    return callContractView(params)
  }, [])

  // --- Sign arbitrary message ---
  const signMessage = useCallback(async (msg: string): Promise<string> => {
    if (!isConnected) throw new Error('Wallet not connected')
    return zeroxioSignMessage(msg)
  }, [isConnected])

  // --- Deploy smart contract (uses window.octra directly for op_type=deploy) ---
  const deployContract = useCallback(async (params: {
    bytecodeB64: string
    contractAddress: string
    constructorArgs: Array<string | number | boolean>
    ou?: string
  }): Promise<DeployResult> => {
    if (!isConnected) throw new Error('Wallet not connected')
    return zeroxioDeployContract(params)
  }, [isConnected])

  return {
    address,
    isConnected,
    isConnecting,
    isAvailable,
    balance,
    networkId,
    networkInfo,
    connect,
    disconnect,
    refresh,
    switchToNetwork,
    sendTx,
    sendContractCall,
    callView,
    deployContract,
    signMessage,
    installUrl: ZEROXIO_INSTALL_URL,
  }
}
