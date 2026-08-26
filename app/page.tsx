'use client';

import React, { useState, useEffect, Fragment, useRef } from 'react';
import axios from 'axios';
import { 
  LayoutGrid, ShieldCheck, Plus, X, ChevronDown, ChevronUp, 
  Loader2, Copy, Check, ExternalLink, Wallet, Trash2, ArrowUpDown, Filter, Search, AlertTriangle, Shield, Ban, RefreshCw, TrendingUp, TrendingDown, Activity, Users, Clock, Timer, History
} from 'lucide-react';
import TradeHistoryModal from './components/TradeHistoryModal';
import { truncateAddress } from '@/app/lib/utils';

interface WalletItem {
  id?: number;
  wallet_address: string;
  chain_network: string;
  label?: string;
}

interface TokenItem {
  contract_address: string;
  name: string;
  symbol: string;
  logo: string | null;
  balance: string;
  price_usd?: number;
  total_value_usd?: number;
  is_spam?: boolean;
  injected_chain?: string;
}

interface WhitelistItem {
  contract_address: string;
  label: string;
}

interface TrackedCoin {
  id?: number;
  contract_address: string;
  chain_network: string;
  label?: string;
  name?: string;
  symbol?: string;
  price_usd?: number | null;
  price_change_h24?: number | null;
  price_change_h6?: number | null;
  price_change_h1?: number | null;
  volume_h24?: number | null;
  liquidity_usd?: number | null;
  market_cap?: number | null;
  chain_id?: string;
  dex_url?: string;
  logo?: string | null;
  total_holders?: number | null;
}

const getWalletTag = (address: string) => {
  const lower = address.toLowerCase();
  
  // Burn / Null Addresses
  if (lower === '0x000000000000000000000000000000000000dead') return { label: '🔥 Burn Address', color: 'bg-rose-100 text-rose-700 border border-rose-200' };
  if (lower === '0x0000000000000000000000000000000000000000') return { label: '🔥 Null Address', color: 'bg-rose-100 text-rose-700 border border-rose-200' };
  if (lower === '1incinerator11111111111111111111111111111111') return { label: '🔥 Burn Address', color: 'bg-rose-100 text-rose-700 border border-rose-200' };
  
  // Binance Hot Wallets (some popular ones)
  const binanceWallets = [
    '0xf977814e90da44bfa03b6295a0616a897441acec',
    '0x28c6c06298d514db089934071355e5743bf21d60',
    '0x8894e0a0c962cb723c1976a4421c95949be2d4e3',
    '0x56eddb7aa87536c09ccc2793473599fd21a8b17f',
    '0x00000000219ab540356cbb839cbe05303d7705fa'
  ];
  if (binanceWallets.includes(lower)) return { label: '🏦 Binance', color: 'bg-yellow-50 text-yellow-700 border border-yellow-200' };

  // KuCoin Hot Wallets
  if (lower === '0x2b5634c42055806a59e9107ed44d43c426e58258') return { label: '🏦 KuCoin', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };

  // OKX Hot Wallets
  if (lower === '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b') return { label: '🏦 OKX', color: 'bg-blue-50 text-blue-700 border border-blue-200' };

  return null;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'watchlist' | 'track' | 'blacklist' | 'my_wallet'>('watchlist');

  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWallet, setNewWallet] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newNetwork, setNewNetwork] = useState('EVM (ETH/BSC/RH)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [networkFilter, setNetworkFilter] = useState('All');
  const [walletFilter, setWalletFilter] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'net_worth', direction: 'desc' });

  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [walletTokens, setWalletTokens] = useState<Record<string, TokenItem[]>>({});
  const [loadingTokens, setLoadingTokens] = useState<Record<string, boolean>>({});
  const [walletPages, setWalletPages] = useState<Record<string, number>>({});
  const [walletHasNext, setWalletHasNext] = useState<Record<string, boolean>>({});
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  const [showSpam, setShowSpam] = useState<Record<string, boolean>>({});

  const isSyncing = useRef(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);

  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [newWlAddress, setNewWlAddress] = useState('');
  const [newWlLabel, setNewWlLabel] = useState('');
  const [isWlSubmitting, setIsWlSubmitting] = useState(false);

  const [trackedCoins, setTrackedCoins] = useState<TrackedCoin[]>([]);
  const [indicators, setIndicators] = useState<Record<string, {rsi: number | null, macd: any | null}>>({});
  const [isTrackLoading, setIsTrackLoading] = useState(false);
  const [newTrackAddress, setNewTrackAddress] = useState('');
  const [newTrackLabel, setNewTrackLabel] = useState('');
  const [newTrackNetwork, setNewTrackNetwork] = useState('Unknown');
  const [isTrackSubmitting, setIsTrackSubmitting] = useState(false);

  // Auto Refresh states for Track Coin
  const [trackAutoRefreshInterval, setTrackAutoRefreshInterval] = useState<number>(0); // 0 = off, seconds
  const [trackCountdown, setTrackCountdown] = useState<number>(0);

  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [connectedNetwork, setConnectedNetwork] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [showConnectMenu, setShowConnectMenu] = useState(false);
  
  const [myWalletTokens, setMyWalletTokens] = useState<TokenItem[]>([]);
  const [myWalletLoading, setMyWalletLoading] = useState(false);
  const [myWalletNetWorth, setMyWalletNetWorth] = useState(0);

  const [isHoldersModalOpen, setIsHoldersModalOpen] = useState(false);
  const [selectedCoinHolders, setSelectedCoinHolders] = useState<any[]>([]);
  const [isFetchingHolders, setIsFetchingHolders] = useState(false);
  const [holdersCoinName, setHoldersCoinName] = useState('');
  const [holdersCoinAddress, setHoldersCoinAddress] = useState('');
  const [holdersChainNetwork, setHoldersChainNetwork] = useState('');
  const [holdersTotalCount, setHoldersTotalCount] = useState<number | null>(null);
  const [addedHolders, setAddedHolders] = useState<Record<string, boolean>>({});

  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [historyTitle, setHistoryTitle] = useState('');
  const [historyExplorerBase, setHistoryExplorerBase] = useState('');
  const [currentHistoryParams, setCurrentHistoryParams] = useState<any>(null);
  // Client-side TTL cache: key = wallet+contract, value = { data, fetchedAt }
  const historyCache = useRef<Record<string, { data: any[]; fetchedAt: number }>>({});

  interface BlacklistItem {
    id?: number;
    contract_address: string;
    label?: string;
    chain_network?: string;
  }
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);
  const [newBlAddress, setNewBlAddress] = useState('');
  const [newBlLabel, setNewBlLabel] = useState('');
  const [newBlNetwork, setNewBlNetwork] = useState('Unknown');
  const [isBlSubmitting, setIsBlSubmitting] = useState(false);

  const fetchWatchlist = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/watchlist');
      setWallets(response.data);
    } catch (error) {
      console.error("Gagal mengambil data watchlist:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWhitelist = async () => {
    try {
      const response = await axios.get('/api/whitelist');
      setWhitelist(response.data);
    } catch (error) {
      console.error("Gagal mengambil data whitelist:", error);
    }
  };

  const fetchBlacklist = async () => {
    try {
      const response = await axios.get('/api/blacklist');
      setBlacklist(response.data);
    } catch (error) {
      console.error("Gagal mengambil data blacklist:", error);
    }
  };

  const fetchTrackedCoins = async () => {
    try {
      setIsTrackLoading(true);
      const response = await axios.get('/api/track');
      const coins = Array.isArray(response.data) ? response.data : [];
      setTrackedCoins(coins);
      
      // Process indicators sequentially to avoid 429 Rate Limits from GeckoTerminal
      const fetchAllIndicators = async () => {
        for (const coin of coins) {
          try {
            const res = await axios.get(`/api/indicators?contract_address=${coin.contract_address}&chain_network=${coin.chain_network}`);
            setIndicators(prev => ({
              ...prev,
              [coin.contract_address]: res.data
            }));
            // Small delay between requests
            await new Promise(r => setTimeout(r, 250));
          } catch (err) {
            console.error(`Failed to fetch indicators for ${coin.contract_address}`, err);
            setIndicators(prev => ({
              ...prev,
              [coin.contract_address]: { rsi: null, macd: null }
            }));
          }
        }
      };
      
      // Start background fetch
      fetchAllIndicators();
    } catch (error) {
      console.error('Gagal mengambil tracked coins:', error);
    } finally {
      setIsTrackLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    fetchWhitelist();
    fetchBlacklist();
    fetchTrackedCoins();

    // Restore active tab from localStorage
    const savedTab = localStorage.getItem('pelacakActiveTab');
    if (savedTab && (savedTab === 'watchlist' || savedTab === 'track' || savedTab === 'blacklist' || savedTab === 'my_wallet')) {
      setActiveTab(savedTab as any);
    }
    
    // Restore connected wallet
    const savedWallet = localStorage.getItem('my_connected_wallet');
    const savedNetwork = localStorage.getItem('my_connected_network');
    if (savedWallet && savedNetwork) {
      setConnectedWallet(savedWallet);
      setConnectedNetwork(savedNetwork);
    }
  }, []);

  // Auto-refresh timer for Track Coin tab
  useEffect(() => {
    if (activeTab !== 'track' || trackAutoRefreshInterval <= 0) {
      setTrackCountdown(0);
      return;
    }

    setTrackCountdown(trackAutoRefreshInterval);

    const timer = setInterval(() => {
      setTrackCountdown((prev) => {
        if (prev <= 1) {
          fetchTrackedCoins();
          return trackAutoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTab, trackAutoRefreshInterval]);

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs > 0 ? `${secs}s` : ''}`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins > 0 ? `${remMins}m` : ''}`;
  };

  const fetchMyWalletTokens = async () => {
    if (!connectedWallet || !connectedNetwork) return;
    try {
      setMyWalletLoading(true);
      if (connectedNetwork === 'Omnichain') {
        const chains = ['Ethereum', 'BSC', 'Base Chain', 'Robinhood'];
        const promises = chains.map(async (chain) => {
          try {
            const response = await axios.post('/api/tokens', { wallet_address: connectedWallet, chain_network: chain, page: 1 });
            return (response.data.tokens || []).map((t: any) => ({ ...t, injected_chain: chain }));
          } catch(e) { return []; }
        });
        const results = await Promise.all(promises);
        const combinedTokens = results.flat().sort((a: any, b: any) => {
          if (a.is_spam && !b.is_spam) return 1;
          if (!a.is_spam && b.is_spam) return -1;
          return (b.total_value_usd || 0) - (a.total_value_usd || 0);
        });
        setMyWalletTokens(combinedTokens);
        const netWorth = combinedTokens.filter((t: any) => !t.is_spam).reduce((sum: number, token: any) => sum + (token.total_value_usd || 0), 0);
        setMyWalletNetWorth(netWorth);
      } else {
        const isSolana = connectedNetwork.toUpperCase() === 'SOLANA';
        const endpoint = isSolana ? '/api/solana' : '/api/tokens';
        const response = await axios.post(endpoint, { wallet_address: connectedWallet, chain_network: connectedNetwork, page: 1 });
        const newTokens = (response.data.tokens || []).map((t: any) => ({ ...t, injected_chain: connectedNetwork }));
        setMyWalletTokens(newTokens);
        const netWorth = newTokens.filter((t: any) => !t.is_spam).reduce((sum: number, token: any) => sum + (token.total_value_usd || 0), 0);
        setMyWalletNetWorth(netWorth);
      }
    } catch (error) {
      console.error('Failed to fetch personal wallet', error);
    } finally {
      setMyWalletLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'my_wallet' && connectedWallet) {
      fetchMyWalletTokens();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, connectedWallet, connectedNetwork]);

  const handleTabChange = (tab: 'watchlist' | 'track' | 'blacklist' | 'my_wallet') => {
    setActiveTab(tab);
    localStorage.setItem('pelacakActiveTab', tab);
  };

  const fetchTokensQuietly = async (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    try {
      setLoadingTokens((prev) => ({ ...prev, [memoryKey]: true }));
      const isSolana = chainNetwork.toUpperCase() === 'SOLANA';
      const endpoint = isSolana ? '/api/solana' : '/api/tokens';
      const response = await axios.post(endpoint, { wallet_address: walletAddress, chain_network: chainNetwork, page: 1 });
      const newTokens = response.data.tokens || [];
      setWalletTokens((prev) => ({ ...prev, [memoryKey]: newTokens }));
      setWalletHasNext((prev) => ({ ...prev, [memoryKey]: response.data.hasNextPage || false }));
      setWalletPages((prev) => ({ ...prev, [memoryKey]: 1 }));
    } catch (error) {} finally {
      setLoadingTokens((prev) => ({ ...prev, [memoryKey]: false }));
    }
  };

  useEffect(() => {
    if (wallets.length === 0 || isSyncing.current) return;
    const runBackgroundSync = async () => {
      isSyncing.current = true;
      for (const wallet of wallets) {
        const safeNet = wallet.chain_network.toUpperCase();
        if (!['ETHEREUM', 'BASE CHAIN', 'BSC', 'ROBINHOOD', 'SOLANA'].includes(safeNet) && !safeNet.includes('EVM') && !safeNet.includes('RH')) continue;
        const memoryKey = `${wallet.wallet_address}-${wallet.chain_network}`;
        if (!walletTokens[memoryKey]) {
          await fetchTokensQuietly(wallet.wallet_address, wallet.chain_network);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      isSyncing.current = false;
    };
    runBackgroundSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  const handleToggleTokens = async (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    if (expandedWallet === memoryKey) {
      setExpandedWallet(null);
      return;
    }
    setExpandedWallet(memoryKey);
    if (!walletTokens[memoryKey] && !loadingTokens[memoryKey]) {
      await fetchTokensQuietly(walletAddress, chainNetwork);
    }
  };

  const handleSyncAll = async () => {
    if (isSyncingAll || wallets.length === 0) return;
    try {
      setIsSyncingAll(true);
      // Clear token cache to force fresh data reload
      setWalletTokens({});

      const supportedWallets = wallets.filter(w => {
        const safeNet = w.chain_network.toUpperCase();
        return ['ETHEREUM', 'BASE CHAIN', 'BSC', 'ROBINHOOD', 'SOLANA'].includes(safeNet) || safeNet.includes('EVM') || safeNet.includes('RH');
      });

      setSyncProgress({ current: 0, total: supportedWallets.length });

      for (let i = 0; i < supportedWallets.length; i++) {
        const wallet = supportedWallets[i];
        setSyncProgress({ current: i + 1, total: supportedWallets.length });
        await fetchTokensQuietly(wallet.wallet_address, wallet.chain_network);
        // Small delay to respect RPC / external rate limits
        await new Promise((res) => setTimeout(res, 250));
      }
    } catch (error) {
      console.error("Gagal sync all tokens:", error);
    } finally {
      setIsSyncingAll(false);
      setSyncProgress(null);
    }
  };

  const handleLoadMore = async (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    const nextPage = (walletPages[memoryKey] || 1) + 1;
    try {
      setLoadingTokens((prev) => ({ ...prev, [memoryKey]: true }));
      const isSolana = chainNetwork.toUpperCase() === 'SOLANA';
      const endpoint = isSolana ? '/api/solana' : '/api/tokens';
      const response = await axios.post(endpoint, { wallet_address: walletAddress, chain_network: chainNetwork, page: nextPage });
      setWalletTokens((prev) => ({ ...prev, [memoryKey]: [...(prev[memoryKey] || []), ...(response.data.tokens || [])] }));
      setWalletHasNext((prev) => ({ ...prev, [memoryKey]: response.data.hasNextPage || false }));
      setWalletPages((prev) => ({ ...prev, [memoryKey]: nextPage }));
    } catch (e) {} finally {
      setLoadingTokens((prev) => ({ ...prev, [memoryKey]: false }));
    }
  };

  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWallet) return alert("Alamat tidak boleh kosong!");
    try {
      setIsSubmitting(true);
      const response = await axios.post('/api/watchlist', { wallet_address: newWallet, chain_network: newNetwork, label: newLabel });
      
      if (response.data.error) {
        alert(`[GAGAL] ${response.data.error}`);
        return;
      }

      setIsModalOpen(false);
      setNewWallet('');
      setNewLabel('');
      fetchWatchlist(); 
    } catch (error: any) {
      alert(error.response?.data?.error || "Gagal menambahkan target");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWallet = async (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    if (!confirm(`Hapus target ${walletAddress.slice(0,6)}...?`)) return;
    try {
      await axios.delete('/api/watchlist', { data: { wallet_address: walletAddress, chain_network: chainNetwork } });
      if (expandedWallet === memoryKey) setExpandedWallet(null);
      fetchWatchlist();
    } catch (error: any) {}
  };

  const handleDeleteAllWatchlist = async () => {
    if (!confirm(`Apakah Anda yakin ingin menghapus SEMUA target dari Watchlist?`)) return;
    try {
      await axios.delete('/api/watchlist', { data: { deleteAll: true } });
      setExpandedWallet(null);
      fetchWatchlist();
    } catch (error: any) {
      alert("Gagal menghapus semua watchlist");
    }
  };

  const handleDeleteAllTrack = async () => {
    if (!confirm(`Apakah Anda yakin ingin menghapus SEMUA koin dari Track Coin?`)) return;
    try {
      await axios.delete('/api/track', { data: { deleteAll: true } });
      fetchTrackedCoins();
    } catch (error: any) {
      alert("Gagal menghapus semua track coin");
    }
  };

  const handleDeleteAllBlacklist = async () => {
    if (!confirm(`Apakah Anda yakin ingin menghapus SEMUA koin dari Blacklist?`)) return;
    try {
      await axios.delete('/api/blacklist', { data: { deleteAll: true } });
      fetchBlacklist();
    } catch (error: any) {
      alert("Gagal menghapus semua blacklist");
    }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWlAddress || !newWlLabel) return;
    try {
      setIsWlSubmitting(true);
      const response = await axios.post('/api/whitelist', { contract_address: newWlAddress, label: newWlLabel });
      
      if (response.data.error) {
        alert(`[GAGAL] ${response.data.error}`);
        return;
      }

      setNewWlAddress('');
      setNewWlLabel('');
      fetchWhitelist();
    } catch (error: any) {
      alert(error.response?.data?.error || "Gagal menambahkan ke whitelist");
    } finally {
      setIsWlSubmitting(false);
    }
  };

  const handleRemoveWhitelist = async (contract_address: string) => {
    if (!confirm(`Hapus whitelist?`)) return;
    try {
      await axios.delete('/api/whitelist', { data: { contract_address } });
      fetchWhitelist();
    } catch (error) {}
  };

  const handleViewHolders = async (coin: TrackedCoin) => {
    setIsHoldersModalOpen(true);
    setSelectedCoinHolders([]);
    setHoldersCoinName(coin.label || coin.name || 'Token');
    setHoldersCoinAddress(coin.contract_address);
    // Prioritize chain_id from DexScreener (live), fallback to chain_network from DB
    const effectiveChain = coin.chain_id || coin.chain_network;
    setHoldersChainNetwork(effectiveChain);
    setHoldersTotalCount(coin.total_holders ?? null);
    setIsFetchingHolders(true);
    setAddedHolders({});

    try {
      const res = await axios.get(`/api/holders?contract_address=${coin.contract_address}&chain_network=${effectiveChain}&price_usd=${coin.price_usd || 0}`);
      setSelectedCoinHolders(res.data.holders || []);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gagal mengambil Top Holders');
      setIsHoldersModalOpen(false);
    } finally {
      setIsFetchingHolders(false);
    }
  };

  const HISTORY_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const handleViewHistory = async (walletAddress: string, contractAddress: string, chainNetwork: string, tokenSymbol: string, priceUsd: number, forceRefresh = false) => {
    if (contractAddress === 'NATIVE_COIN') return;
    const cacheKey = `${walletAddress}-${contractAddress}-${chainNetwork}`;
    const now = Date.now();

    setCurrentHistoryParams({ walletAddress, contractAddress, chainNetwork, tokenSymbol, priceUsd });
    setIsHistoryModalOpen(true);
    setHistoryTitle(`${tokenSymbol} · ${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}`);
    
    if (forceRefresh) {
      delete historyCache.current[cacheKey];
    }

    const cached = historyCache.current[cacheKey];
    
    if (!forceRefresh) {
      setHistoryData([]);
      setIsFetchingHistory(true);
    }

    // Serve from cache if still fresh (5 min TTL)
    if (cached && now - cached.fetchedAt < HISTORY_TTL_MS) {
      setHistoryData(cached.data);
      setIsFetchingHistory(false);
      return;
    }

    try {
      const res = await axios.get(`/api/history?wallet_address=${walletAddress}&contract_address=${contractAddress}&chain_network=${chainNetwork}`);
      const data = res.data.history || [];
      historyCache.current[cacheKey] = { data, fetchedAt: now };
      setHistoryData(data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gagal mengambil riwayat transaksi');
      setIsHistoryModalOpen(false);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleAddHolderToWatchlist = async (address: string, coinName: string, index: number) => {
    try {
      const response = await axios.post('/api/watchlist', {
        wallet_address: address,
        label: `Whale #${index + 1} - ${coinName}`,
        chain_network: holdersChainNetwork || 'Unknown',
      });
      if (response.data.error) {
        alert(`[GAGAL] ${response.data.error}`);
        return;
      }
      setAddedHolders(prev => ({...prev, [address]: true}));
      alert(`Dompet ${address.slice(0, 6)}... berhasil ditambahkan ke Watchlist!`);
      fetchWatchlist();
    } catch (error: any) {
      alert(error.response?.data?.error || "Gagal menambahkan ke Watchlist");
    }
  };


  const connectEVMWallet = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert("Silakan install ekstensi MetaMask atau dompet EVM lainnya di browser kamu.");
      return;
    }
    try {
      setIsConnectingWallet(true);
      setShowConnectMenu(false);
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        const account = accounts[0];
        setConnectedWallet(account);
        setConnectedNetwork('Omnichain');
        localStorage.setItem('my_connected_wallet', account);
        localStorage.setItem('my_connected_network', 'Omnichain');
        alert(`Berhasil terhubung dengan MetaMask! Buka tab My Portfolio untuk melihat aset.`);
        setActiveTab('my_wallet');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const connectSolanaWallet = async () => {
    if (typeof window === 'undefined' || !(window as any).solana) {
      alert("Silakan install ekstensi Phantom atau dompet Solana lainnya di browser kamu.");
      return;
    }
    try {
      setIsConnectingWallet(true);
      setShowConnectMenu(false);
      const resp = await (window as any).solana.connect();
      if (resp && resp.publicKey) {
        const account = resp.publicKey.toString();
        setConnectedWallet(account);
        setConnectedNetwork('Solana');
        localStorage.setItem('my_connected_wallet', account);
        localStorage.setItem('my_connected_network', 'Solana');
        alert(`Berhasil terhubung dengan Phantom! Buka tab My Portfolio untuk melihat aset.`);
        setActiveTab('my_wallet');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const disconnectWallet = () => {
    setConnectedWallet(null);
    setConnectedNetwork(null);
    setMyWalletTokens([]);
    setMyWalletNetWorth(0);
    localStorage.removeItem('my_connected_wallet');
    localStorage.removeItem('my_connected_network');
    if (activeTab === 'my_wallet') setActiveTab('watchlist');
  };

  const handleAddTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrackAddress) return;
    try {
      setIsTrackSubmitting(true);
      const response = await axios.post('/api/track', {
        contract_address: newTrackAddress,
        chain_network: newTrackNetwork,
        label: newTrackLabel,
      });
      if (response.data.error) {
        alert(`[GAGAL] ${response.data.error}`);
        return;
      }
      setNewTrackAddress('');
      setNewTrackLabel('');
      setNewTrackNetwork('Unknown');
      await fetchTrackedCoins();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Gagal menambahkan ke Track Coin');
    } finally {
      setIsTrackSubmitting(false);
    }
  };

  const handleRemoveTrack = async (contract_address: string) => {
    if (!confirm(`Hapus dari Track Coin?`)) return;
    try {
      await axios.delete('/api/track', { data: { contract_address } });
      setTrackedCoins(prev => prev.filter(c => c.contract_address !== contract_address));
    } catch (error) {}
  };

  // Helper: mark a specific contract as spam/non-spam in all cached wallet data (no full reset)
  const patchTokenSpamStatus = (contractAddress: string, isSpam: boolean) => {
    setWalletTokens(prev => {
      const updated = { ...prev };
      for (const key in updated) {
        updated[key] = updated[key].map(token =>
          token.contract_address.toLowerCase() === contractAddress.toLowerCase()
            ? { ...token, is_spam: isSpam }
            : token
        );
      }
      return updated;
    });
  };

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlAddress) return;
    try {
      setIsBlSubmitting(true);
      const response = await axios.post('/api/blacklist', {
        contract_address: newBlAddress,
        label: newBlLabel,
        chain_network: newBlNetwork,
      });
      if (response.data.error) {
        alert(`[GAGAL] ${response.data.error}`);
        return;
      }
      setNewBlAddress('');
      setNewBlLabel('');
      fetchBlacklist();
      // ✅ Surgical update: tandai token ini spam di semua wallet tanpa reset data lain
      patchTokenSpamStatus(newBlAddress, true);
    } catch (error: any) {
      alert(error.response?.data?.error || "Gagal menambahkan ke blacklist");
    } finally {
      setIsBlSubmitting(false);
    }
  };

  const handleRemoveBlacklist = async (contract_address: string) => {
    if (!confirm(`Hapus dari blacklist?`)) return;
    try {
      await axios.delete('/api/blacklist', { data: { contract_address } });
      fetchBlacklist();
      // ✅ Surgical update: unmark spam, wallet lain tetap intact
      patchTokenSpamStatus(contract_address, false);
    } catch (error) {}
  };

  const handleQuickTrack = async (contractAddress: string, label: string, chainNetwork: string) => {
    if (!contractAddress || contractAddress === 'NATIVE_COIN') return;
    try {
      // Unmark from spam
      await axios.post('/api/whitelist', {
        contract_address: contractAddress,
        label: label || 'Whitelisted Token',
      });
      fetchWhitelist();

      // Add to Track Coin
      const response = await axios.post('/api/track', {
        contract_address: contractAddress,
        chain_network: chainNetwork || 'Unknown',
        label: label || 'Tracked Token',
      });
      
      if (response.data.error && response.data.error !== 'Token sudah ditambahkan ke Track Coin') {
        alert(`[GAGAL] ${response.data.error}`);
        return;
      }

      // ✅ Surgical update: unmark spam untuk token ini saja
      patchTokenSpamStatus(contractAddress, false);
      
      // Update data Track Coin
      await fetchTrackedCoins();

      alert(`Token ${label} (${contractAddress.slice(0, 6)}...) berhasil ditambahkan ke Track Coin!`);
    } catch (error: any) {
      alert(error.response?.data?.error || "Gagal menambahkan ke Track Coin");
    }
  };

  const handleQuickBlacklist = async (contractAddress: string, label: string, chainNetwork: string) => {
    if (!contractAddress || contractAddress === 'NATIVE_COIN') return;
    try {
      const response = await axios.post('/api/blacklist', {
        contract_address: contractAddress,
        label: label || 'Blacklisted Spam',
        chain_network: chainNetwork,
      });
      if (response.data.error) {
        alert(`[GAGAL] ${response.data.error}`);
        return;
      }
      fetchBlacklist();
      // ✅ Surgical update: tandai spam untuk token ini saja
      patchTokenSpamStatus(contractAddress, true);
      alert(`Token ${label} (${contractAddress.slice(0, 6)}...) berhasil ditambahkan ke Blacklist Coin!`);
    } catch (error: any) {
      alert(error.response?.data?.error || "Gagal menambahkan ke Blacklist Coin");
    }
  };

  const formatCurrency = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatTokenPrice = (val: number | undefined | null) => {
    if (!val || val <= 0) return 'Unknown Price';
    if (val < 0.01) {
      return `@ $${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
    }
    return `@ ${formatCurrency(val)}`;
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const getExplorerUrl = (network: string, tokenAddress: string, walletAddress: string) => {
    const net = network.toUpperCase();
    if (net === 'SOLANA') {
      return `https://solscan.io/account/${walletAddress}`;
    }
    let baseUrl = 'https://etherscan.io';
    if (net === 'BASE CHAIN' || net === 'BASE') baseUrl = 'https://basescan.org';
    else if (net === 'BSC' || net === 'BNB') baseUrl = 'https://bscscan.com';
    else if (net === 'ROBINHOOD' || net.includes('ROBINHOOD') || net === 'RH') baseUrl = 'https://explorer.robinhood.com';
    if (tokenAddress === 'NATIVE_COIN') return `${baseUrl}/address/${walletAddress}`;
    return `${baseUrl}/token/${tokenAddress}?a=${walletAddress}`;
  };

  const getDexScreenerUrl = (network: string, tokenAddress: string) => {
    if (!tokenAddress || tokenAddress === 'NATIVE_COIN') {
      const net = network.toUpperCase();
      if (net === 'SOLANA') return 'https://dexscreener.com/solana';
      if (net === 'BSC' || net === 'BNB') return 'https://dexscreener.com/bsc';
      if (net === 'BASE CHAIN' || net === 'BASE') return 'https://dexscreener.com/base';
      if (net === 'ROBINHOOD' || net.includes('ROBINHOOD') || net === 'RH') return 'https://dexscreener.com/robinhood';
      return 'https://dexscreener.com/ethereum';
    }
    const net = network.toUpperCase();
    let chainSlug = 'solana';
    if (net === 'ETHEREUM' || net.includes('ETH')) chainSlug = 'ethereum';
    else if (net === 'BSC' || net.includes('BNB')) chainSlug = 'bsc';
    else if (net === 'BASE CHAIN' || net === 'BASE') chainSlug = 'base';
    else if (net === 'ROBINHOOD' || net.includes('ROBINHOOD') || net === 'RH') chainSlug = 'robinhood';
    else if (net === 'SOLANA') chainSlug = 'solana';
    
    return `https://dexscreener.com/${chainSlug}/${tokenAddress}`;
  };

  const getNetWorth = (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    const tokens = walletTokens[memoryKey];
    if (!tokens) return null;
    return tokens.filter(t => !t.is_spam).reduce((sum, token) => sum + (token.total_value_usd || 0), 0);
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

  const filteredWallets = wallets.filter(w => {
    const matchNetwork = networkFilter === 'All' || w.chain_network.toLowerCase() === networkFilter.toLowerCase();
    const matchAddress = !walletFilter || 
                         w.wallet_address.toLowerCase().includes(walletFilter.toLowerCase()) || 
                         (w.label && w.label.toLowerCase().includes(walletFilter.toLowerCase()));
    return matchNetwork && matchAddress;
  });
  const sortedWallets = [...filteredWallets].sort((a, b) => {
    let valA: any = 0; let valB: any = 0;
    if (sortConfig.key === 'wallet_address') { valA = a.wallet_address.toLowerCase(); valB = b.wallet_address.toLowerCase(); }
    else if (sortConfig.key === 'chain_network') { valA = a.chain_network.toLowerCase(); valB = b.chain_network.toLowerCase(); }
    else if (sortConfig.key === 'net_worth') { valA = getNetWorth(a.wallet_address, a.chain_network) ?? -1; valB = getNetWorth(b.wallet_address, b.chain_network) ?? -1; }
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg"><Wallet className="text-white" size={20} /></div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Portfolio Tracker</h1>
                <p className="text-xs text-slate-500 font-medium">Enterprise Web3 Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button onClick={() => handleTabChange('my_wallet')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${activeTab === 'my_wallet' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><ShieldCheck size={16} /> My Portfolio</button>
                <button onClick={() => handleTabChange('watchlist')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${activeTab === 'watchlist' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><LayoutGrid size={16} /> Targets</button>
                <button onClick={() => handleTabChange('track')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${activeTab === 'track' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Activity size={16} /> Track Coin</button>
                <button onClick={() => handleTabChange('blacklist')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${activeTab === 'blacklist' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Ban size={16} /> Blacklist Coin</button>
              </div>

              {/* CONNECT WALLET BUTTON */}
              <div className="relative">
                <button 
                  onClick={() => connectedWallet ? disconnectWallet() : setShowConnectMenu(!showConnectMenu)}
                  className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 border ${
                    connectedWallet 
                      ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' 
                      : 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800 shadow-sm'
                  }`}
                >
                  {isConnectingWallet ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                  {connectedWallet ? `${connectedWallet.slice(0,6)}...${connectedWallet.slice(-4)}` : 'Connect Wallet'}
                </button>
                
                {showConnectMenu && !connectedWallet && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                    <div className="p-2 border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">Select Provider</div>
                    <button onClick={connectEVMWallet} className="w-full text-left px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" className="w-5 h-5" alt="MetaMask" />
                      EVM Wallet
                    </button>
                    <button onClick={connectSolanaWallet} className="w-full text-left px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                      <img src="https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png" className="w-5 h-5 rounded-full object-cover" alt="Solana" />
                      Solana Wallet
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {activeTab === 'watchlist' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl font-bold text-slate-900">Active Watchlist</h2>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                  <Search size={16} className="text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search address or label..." 
                    value={walletFilter}
                    onChange={(e) => setWalletFilter(e.target.value)}
                    className="bg-transparent text-sm font-semibold text-slate-700 outline-none w-36 sm:w-48 placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                  <Filter size={16} className="text-slate-400" />
                  <select value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                    <option value="All">All Networks</option>
                    <option value="Ethereum">Ethereum</option>
                    <option value="BSC">BSC</option>
                    <option value="Base Chain">Base Chain</option>
                    <option value="Robinhood">Robinhood</option>
                    <option value="Solana">Solana</option>
                  </select>
                </div>
                <button
                  onClick={handleSyncAll}
                  disabled={isSyncingAll || wallets.length === 0}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-60 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all text-sm font-semibold shadow-sm w-full sm:w-auto justify-center"
                  title="Reload and scan all wallet balances"
                >
                  <RefreshCw size={15} className={isSyncingAll ? "animate-spin text-blue-600" : "text-slate-500"} />
                  <span>
                    {isSyncingAll && syncProgress
                      ? `Syncing (${syncProgress.current}/${syncProgress.total})...`
                      : "Sync All"}
                  </span>
                </button>
                <button
                  onClick={handleDeleteAllWatchlist}
                  disabled={wallets.length === 0}
                  className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 disabled:opacity-60 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all text-sm font-semibold shadow-sm w-full sm:w-auto justify-center"
                  title="Delete All Targets"
                >
                  <Trash2 size={15} />
                  <span>Delete All</span>
                </button>
                <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto justify-center"><Plus size={16} /> Add Target</button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {loading ? (
                <div className="p-10 flex flex-col items-center justify-center text-slate-500">
                  <Loader2 className="animate-spin mb-2" size={24} />
                  <p className="text-sm font-medium">Loading database...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort('wallet_address')}>
                          <div className="flex items-center gap-1.5">Target Wallet <ArrowUpDown size={14} className={sortConfig.key === 'wallet_address' ? 'text-blue-600' : 'text-slate-300'} /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort('chain_network')}>
                          <div className="flex items-center gap-1.5">Network <ArrowUpDown size={14} className={sortConfig.key === 'chain_network' ? 'text-blue-600' : 'text-slate-300'} /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group text-right" onClick={() => handleSort('net_worth')}>
                          <div className="flex items-center justify-end gap-1.5">Valid Net Worth <ArrowUpDown size={14} className={sortConfig.key === 'net_worth' ? 'text-blue-600' : 'text-slate-300'} /></div>
                        </th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedWallets.map((wallet, index) => {
                        const memoryKey = `${wallet.wallet_address}-${wallet.chain_network}`;
                        const isExpanded = expandedWallet === memoryKey;
                        const isSupported = ['ETHEREUM', 'BASE CHAIN', 'BSC', 'ROBINHOOD', 'SOLANA'].includes(wallet.chain_network.toUpperCase()) || wallet.chain_network.toUpperCase().includes('EVM') || wallet.chain_network.toUpperCase().includes('RH');
                        const isLoadingToken = loadingTokens[memoryKey];
                        const tokens = walletTokens[memoryKey] || [];
                        const validTokens = tokens.filter(t => !t.is_spam);
                        const spamTokens = tokens.filter(t => t.is_spam);
                        const netWorth = getNetWorth(wallet.wallet_address, wallet.chain_network);

                        return (
                          <Fragment key={`${memoryKey}-${index}`}>
                            <tr className={`transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900">{wallet.label || 'Unknown Target'}</span>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="font-mono text-slate-500 text-xs">{wallet.wallet_address}</span>
                                    <button onClick={() => handleCopy(wallet.wallet_address)} className="text-slate-400 hover:text-blue-600"><Copy size={12} /></button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">{wallet.chain_network}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {isLoadingToken && netWorth === null ? (
                                  <div className="flex items-center justify-end gap-2 text-slate-400 text-xs italic"><Loader2 size={12} className="animate-spin" /> Syncing...</div>
                                ) : netWorth !== null ? (
                                  <span className="font-bold text-blue-600 text-base">{formatCurrency(netWorth)}</span>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Unscanned</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {isSupported ? (
                                    <button onClick={() => handleToggleTokens(wallet.wallet_address, wallet.chain_network)} className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Inspect {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                                  ) : (
                                    <span className="text-xs text-slate-400 font-medium px-3">Unsupported</span>
                                  )}
                                  <button onClick={() => handleDeleteWallet(wallet.wallet_address, wallet.chain_network)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"><Trash2 size={16} /></button>
                                </div>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr>
                                <td colSpan={4} className="p-0 border-b border-slate-200">
                                  <div className="bg-slate-50 p-6 border-l-4 border-blue-500 shadow-inner">
                                    <div className="flex justify-between items-start mb-6">
                                      <div>
                                        <h4 className="text-sm font-bold text-slate-800">Valid Assets</h4>
                                        <p className="text-xs text-slate-500 font-mono mt-1">{wallet.wallet_address}</p>
                                      </div>
                                    </div>

                                    {/* GRID KOIN ASLI */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                      {validTokens.map((token, tIdx) => (
                                        <div key={`valid-${tIdx}`} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-all flex flex-col justify-between">
                                          <div>
                                            <div className="flex justify-between items-start mb-3">
                                              <div>
                                                <h5 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                  <a
                                                    href={getDexScreenerUrl(wallet.chain_network, token.contract_address)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-blue-600 hover:underline flex items-center gap-1.5 group cursor-pointer"
                                                    title="Open live chart on DexScreener"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <span>{token.symbol}</span>
                                                    <ExternalLink size={13} className="text-slate-400 group-hover:text-blue-600" />
                                                  </a>
                                                  {token.contract_address === 'NATIVE_COIN' && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-bold">CORE</span>}
                                                </h5>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                  {token.contract_address !== 'NATIVE_COIN' && (
                                                    <button onClick={() => handleCopy(token.contract_address)} className="text-[11px] font-mono text-slate-500 hover:text-blue-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center gap-1" title="Copy Contract Address">
                                                      {token.contract_address.slice(0, 6)}...{token.contract_address.slice(-4)}
                                                    </button>
                                                  )}
                                                  <a
                                                    href={getDexScreenerUrl(wallet.chain_network, token.contract_address)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1 transition-colors"
                                                    title="View Chart on DexScreener"
                                                  >
                                                    DexScreener
                                                  </a>
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); window.open(getExplorerUrl(wallet.chain_network, token.contract_address, wallet.wallet_address), '_blank'); }} 
                                                    className="text-slate-400 hover:text-blue-600" 
                                                    title="View on Explorer"
                                                  >
                                                    <ExternalLink size={12} />
                                                  </button>
                                                </div>
                                              </div>
                                              <div className="text-right">
                                                <p className="text-sm font-bold text-slate-900">{formatCurrency(token.total_value_usd)}</p>
                                              </div>
                                            </div>
                                            <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-100 pt-3">
                                              <span className="font-medium">Qty: {token.balance}</span>
                                              <span>{formatTokenPrice(token.price_usd)}</span>
                                            </div>
                                          </div>

                                          {/* QUICK ACTIONS FOR TOKEN */}
                                          {token.contract_address !== 'NATIVE_COIN' && (
                                            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                                              <button 
                                                onClick={(e) => { e.stopPropagation(); handleViewHistory(wallet.wallet_address, token.contract_address, wallet.chain_network, token.symbol || token.name || '?', token.price_usd || 0); }}
                                                className="flex-1 py-1.5 px-2 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 font-semibold text-xs flex items-center justify-center gap-1 transition-colors border border-violet-200/60"
                                                title="Lihat Riwayat Transaksi Koin Ini"
                                              >
                                                <History size={13} /> History
                                              </button>
                                              <button 
                                                onClick={() => handleQuickTrack(token.contract_address, token.name || token.symbol, wallet.chain_network)}
                                                className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs flex items-center justify-center gap-1 transition-colors border border-emerald-200/60"
                                                title="Add to Track Coin"
                                              >
                                                <Activity size={13} /> + Track
                                              </button>
                                              <button 
                                                onClick={() => handleQuickBlacklist(token.contract_address, token.name || token.symbol, wallet.chain_network)}
                                                className="flex-1 py-1.5 px-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs flex items-center justify-center gap-1 transition-colors border border-red-200/60"
                                                title="Add to Blacklist Coin"
                                              >
                                                <Ban size={13} /> + Blacklist
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>

                                    {/* FOLDER KARANTINA SPAM */}
                                    {spamTokens.length > 0 && (
                                      <div className="mt-8 border border-red-200 rounded-xl bg-red-50/30 overflow-hidden">
                                        <button 
                                          onClick={() => setShowSpam(prev => ({ ...prev, [memoryKey]: !prev[memoryKey] }))}
                                          className="w-full px-4 py-3 flex justify-between items-center bg-red-50 hover:bg-red-100 transition-colors"
                                        >
                                          <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                                            <AlertTriangle size={16} /> Blocked Spam Assets ({spamTokens.length})
                                          </div>
                                          {showSpam[memoryKey] ? <ChevronUp size={16} className="text-red-500"/> : <ChevronDown size={16} className="text-red-500"/>}
                                        </button>
                                        
                                        {showSpam[memoryKey] && (
                                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-red-100">
                                            {spamTokens.map((token, tIdx) => (
                                              <div key={`spam-${tIdx}`} className="bg-white p-3 rounded-lg border border-red-100 opacity-90 hover:opacity-100 transition-opacity flex flex-col justify-between">
                                                <div>
                                                  <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                      <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                                        <a
                                                          href={getDexScreenerUrl(wallet.chain_network, token.contract_address)}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="hover:text-blue-600 hover:underline flex items-center gap-1"
                                                          title="Inspect chart on DexScreener"
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          <span>{token.symbol}</span>
                                                          <ExternalLink size={10} className="text-slate-400" />
                                                        </a>
                                                      </h5>
                                                      <span className="text-[10px] font-mono text-slate-400 mt-1 block">{token.contract_address.slice(0, 6)}...{token.contract_address.slice(-4)}</span>
                                                    </div>
                                                    <div className="text-right">
                                                      <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider line-through">
                                                        Fake: {formatCurrency(token.total_value_usd)}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>
                                                {token.contract_address !== 'NATIVE_COIN' && (
                                                  <div className="flex items-center gap-2 pt-2 border-t border-red-50 text-xs mt-2">
                                                    <button 
                                                      onClick={() => handleQuickTrack(token.contract_address, token.name || token.symbol, wallet.chain_network)}
                                                      className="flex-1 py-1 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium text-[10px] flex items-center justify-center gap-1 transition-colors border border-emerald-100"
                                                      title="Unblock & Add to Track Coin"
                                                    >
                                                      <Activity size={11} /> + Track
                                                    </button>
                                                    <button 
                                                      onClick={() => handleQuickBlacklist(token.contract_address, token.name || token.symbol, wallet.chain_network)}
                                                      className="flex-1 py-1 px-2 rounded-md bg-red-50 hover:bg-red-100 text-red-700 font-medium text-[10px] flex items-center justify-center gap-1 transition-colors border border-red-100"
                                                      title="Confirm Blacklist Coin"
                                                    >
                                                      <Ban size={11} /> + Blacklist
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* LOAD MORE BUTTON */}
                                    <div className="mt-6 flex justify-center">
                                      {isLoadingToken ? (
                                        <div className="flex items-center gap-2 text-sm text-blue-600 font-medium"><Loader2 size={16} className="animate-spin" /> Fetching more records...</div>
                                      ) : walletHasNext[memoryKey] && (
                                        <button onClick={() => handleLoadMore(wallet.wallet_address, wallet.chain_network)} className="text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-blue-600 px-6 py-2 rounded-lg shadow-sm">Load More Assets</button>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TRACK COIN */}
        {activeTab === 'track' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Track Coin</h2>
                <p className="text-sm text-slate-500 mt-1">Live market data & on-chain metrics for tracked tokens powered by DexScreener & Covalent/Solana.</p>
              </div>

              {/* Auto Refresh & Controls */}
              <div className="flex items-center flex-wrap gap-2.5">
                {/* Auto Refresh Selector */}
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 border-r border-slate-100">
                    <Clock size={14} className={trackAutoRefreshInterval > 0 ? "text-emerald-500 animate-pulse" : "text-slate-400"} />
                    <span>Auto Refresh:</span>
                  </div>
                  <select
                    value={trackAutoRefreshInterval}
                    onChange={(e) => setTrackAutoRefreshInterval(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-700 px-2 py-1 outline-none cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    <option value={0}>Off (Manual)</option>
                    <option value={5}>5 Detik</option>
                    <option value={30}>30 Detik</option>
                    <option value={300}>5 Menit</option>
                    <option value={1800}>30 Menit</option>
                    <option value={3600}>1 Jam</option>
                    <option value={14400}>4 Jam</option>
                    <option value={86400}>1 Hari</option>
                  </select>
                </div>

                {/* Countdown Badge when active */}
                {trackAutoRefreshInterval > 0 && (
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Next in {formatCountdown(trackCountdown)}</span>
                  </div>
                )}

                {/* Manual Refresh Button */}
                <button
                  onClick={fetchTrackedCoins}
                  disabled={isTrackLoading || trackedCoins.length === 0}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-60 px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all text-sm font-semibold shadow-sm"
                  title="Force refresh token data"
                >
                  <RefreshCw size={14} className={isTrackLoading ? "animate-spin text-blue-600" : "text-slate-500"} />
                  <span className="hidden sm:inline">Sync Now</span>
                </button>
                <button
                  onClick={handleDeleteAllTrack}
                  disabled={trackedCoins.length === 0}
                  className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 disabled:opacity-60 px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all text-sm font-semibold shadow-sm"
                  title="Delete All Tracked Coins"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Delete All</span>
                </button>
              </div>
            </div>

            {/* Horizontal Add Token Bar */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <form onSubmit={handleAddTrack} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Address / Mint</label>
                  <input 
                    type="text" 
                    value={newTrackAddress} 
                    onChange={(e) => setNewTrackAddress(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-blue-500 text-xs font-mono" 
                    placeholder="0x... atau Solana Mint" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Chain Network</label>
                  <select 
                    value={newTrackNetwork} 
                    onChange={(e) => setNewTrackNetwork(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-blue-500 text-xs font-semibold"
                  >
                    <option value="Unknown">Auto-detect (DexScreener)</option>
                    <option value="solana">Solana</option>
                    <option value="ethereum">Ethereum</option>
                    <option value="bsc">BSC</option>
                    <option value="base">Base</option>
                    <option value="robinhood">Robinhood</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Optional Label</label>
                  <input 
                    type="text" 
                    value={newTrackLabel} 
                    onChange={(e) => setNewTrackLabel(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-blue-500 text-xs" 
                    placeholder="e.g. Whale Target #1" 
                  />
                </div>
                <div>
                  <button 
                    type="submit" 
                    disabled={isTrackSubmitting} 
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg shadow-xs flex justify-center items-center gap-1.5 text-xs transition-colors h-[38px]"
                  >
                    {isTrackSubmitting ? <Loader2 size={15} className="animate-spin" /> : <><Plus size={15} /> Track Token</>}
                  </button>
                </div>
              </form>
            </div>

            {/* Wide Horizontal Tracked Coins List */}
            <div className="w-full">
              {isTrackLoading && trackedCoins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-slate-200">
                  <Loader2 size={32} className="animate-spin text-blue-600 mb-4" />
                  <p className="text-slate-500 font-medium text-sm">Fetching live market data & on-chain metrics...</p>
                </div>
              ) : trackedCoins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-slate-200 border-dashed">
                  <div className="bg-slate-50 p-4 rounded-full mb-4"><Activity size={32} className="text-slate-400" /></div>
                  <h3 className="text-lg font-bold text-slate-700">No tokens tracked</h3>
                  <p className="text-slate-500 text-sm mt-1 max-w-md text-center">Tambahkan contract address koin pada form di atas untuk memantau harga live, likuiditas, RSI, dan riwayat transaksi.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trackedCoins.map((coin, idx) => {
                    const isUp = coin.price_change_h24 && coin.price_change_h24 >= 0;
                    const rsiVal = indicators[coin.contract_address]?.rsi;
                    const macdObj = indicators[coin.contract_address]?.macd;

                    return (
                      <div 
                        key={idx} 
                        className="bg-white rounded-xl shadow-xs border border-slate-200/90 hover:border-slate-300 hover:shadow-md transition-all p-4.5 overflow-hidden"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          
                          {/* 1. Token Identity */}
                          <div className="flex items-center gap-3.5 min-w-[260px] lg:max-w-[300px]">
                            {coin.logo ? (
                              <img src={coin.logo} alt={coin.symbol} className="w-11 h-11 rounded-full bg-white shadow-xs object-cover border border-slate-100 shrink-0" />
                            ) : (
                              <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                                {coin.symbol?.charAt(0) || '?'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h3 className="font-bold text-slate-900 text-base leading-tight truncate" title={coin.name}>
                                  {coin.name}
                                </h3>
                                <span className="text-slate-400 font-semibold text-xs shrink-0">
                                  ({coin.symbol})
                                </span>
                              </div>
                              <div className="flex items-center flex-wrap gap-1.5 mt-1">
                                <span className="text-[10px] font-bold tracking-wider uppercase bg-slate-100 text-slate-700 border border-slate-200/60 px-1.5 py-0.5 rounded">
                                  {coin.chain_id}
                                </span>
                                {coin.label && coin.label !== coin.name && (
                                  <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200/60 px-1.5 py-0.5 rounded truncate max-w-[100px]" title={coin.label}>
                                    {coin.label}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Users size={10} className="text-emerald-600" />
                                  {coin.total_holders ? `${coin.total_holders.toLocaleString()} holders` : 'Holders: -'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-slate-400">
                                <span>{truncateAddress(coin.contract_address, 6, 4)}</span>
                                <button 
                                  onClick={() => { navigator.clipboard.writeText(coin.contract_address); setCopiedAddress(coin.contract_address); setTimeout(()=>setCopiedAddress(null), 2000); }} 
                                  className="text-slate-400 hover:text-slate-700 transition-colors"
                                  title="Copy contract"
                                >
                                  {copiedAddress === coin.contract_address ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* 2. Metrics Grid (Price, Volume, Liquidity, Indicators) */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100 flex-1">
                            {/* Price */}
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Live Price</p>
                              <div className="mt-0.5 flex items-baseline gap-1.5">
                                <span className="text-base font-bold text-slate-900">
                                  {coin.price_usd ? (coin.price_usd < 0.0001 ? `$${coin.price_usd.toFixed(8)}` : `$${coin.price_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`) : 'N/A'}
                                </span>
                              </div>
                              {coin.price_change_h24 !== null && coin.price_change_h24 !== undefined && (
                                <span className={`text-[11px] font-bold inline-flex items-center gap-0.5 mt-0.5 ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                  {Math.abs(coin.price_change_h24).toFixed(2)}% (24h)
                                </span>
                              )}
                            </div>

                            {/* Volume & Liquidity */}
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">24h Vol / Liq</p>
                              <p className="text-xs font-bold text-slate-800 mt-1">
                                Vol: {coin.volume_h24 ? `$${(coin.volume_h24 / 1000).toFixed(1)}K` : '-'}
                              </p>
                              <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                                Liq: {coin.liquidity_usd ? `$${(coin.liquidity_usd / 1000).toFixed(1)}K` : '-'}
                              </p>
                            </div>

                            {/* Market Cap & Holders */}
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Market Cap</p>
                              <p className="text-xs font-bold text-slate-800 mt-1">
                                {coin.market_cap ? (coin.market_cap >= 1_000_000 ? `$${(coin.market_cap / 1_000_000).toFixed(2)}M` : `$${(coin.market_cap / 1_000).toFixed(1)}K`) : '-'}
                              </p>
                              <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                                {coin.total_holders ? `${coin.total_holders.toLocaleString()} holders` : ''}
                              </p>
                            </div>

                            {/* Technical Indicators */}
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">RSI / MACD</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={`text-xs font-bold ${
                                  rsiVal ? (rsiVal > 70 ? 'text-rose-600' : rsiVal < 30 ? 'text-emerald-600' : 'text-slate-800') : 'text-slate-400'
                                }`}>
                                  RSI: {rsiVal ? rsiVal.toFixed(1) : '-'}
                                </span>
                                {rsiVal && (
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                                    rsiVal < 30 ? 'bg-emerald-100 text-emerald-700' : 
                                    rsiVal > 70 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'
                                  }`}>
                                    {rsiVal < 30 ? 'Oversold' : rsiVal > 70 ? 'Overbought' : 'Neutral'}
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] font-semibold mt-0.5 ${
                                macdObj ? (macdObj.MACD > macdObj.signal ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'
                              }`}>
                                MACD: {macdObj?.MACD ? macdObj.MACD.toFixed(4) : '-'}
                              </p>
                            </div>
                          </div>

                          {/* 3. Spacious Action Buttons Bar */}
                          <div className="flex items-center flex-wrap sm:flex-nowrap gap-2 self-start lg:self-center shrink-0">
                            <TradeHistoryModal coin={coin} />
                            
                            <button 
                              onClick={() => handleViewHolders(coin)} 
                              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-emerald-200/60 shadow-2xs"
                              title="Lihat Top Holders On-chain"
                            >
                              <Users size={13} className="text-emerald-600" />
                              <span>Top Holders</span>
                            </button>

                            <a 
                              href={coin.dex_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-blue-200/60 shadow-2xs"
                              title="Buka Chart DexScreener"
                            >
                              <span>Live Chart</span>
                              <ExternalLink size={12} />
                            </a>

                            <button 
                              onClick={() => handleRemoveTrack(coin.contract_address)} 
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 ml-1" 
                              title="Hapus Koin dari Track list"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: BLACKLIST */}
        {activeTab === 'blacklist' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Blacklist Coin Configuration</h2>
                <p className="text-sm text-slate-500 mt-1">Tokens added here will be <strong className="text-red-600">force-marked as Spam</strong> and excluded from all net worth calculations.</p>
              </div>
              <button
                onClick={handleDeleteAllBlacklist}
                disabled={blacklist.length === 0}
                className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 disabled:opacity-60 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all text-sm font-semibold shadow-sm w-full sm:w-auto justify-center"
                title="Delete All Blacklist"
              >
                <Trash2 size={15} />
                <span>Delete All</span>
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
                  <h3 className="text-sm font-bold text-red-700 mb-4 border-b border-red-100 pb-2 flex items-center gap-2"><Ban size={14} /> Block a Token</h3>
                  <form onSubmit={handleAddBlacklist} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contract / Mint Address</label>
                      <input
                        type="text"
                        value={newBlAddress}
                        onChange={(e) => setNewBlAddress(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 outline-none focus:border-red-400 text-sm font-mono"
                        placeholder="0x... or Sol mint address"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Label (Optional)</label>
                      <input
                        type="text"
                        value={newBlLabel}
                        onChange={(e) => setNewBlLabel(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 outline-none focus:border-red-400 text-sm"
                        placeholder="e.g. Pump.fun Scam"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Chain Network</label>
                      <select
                        value={newBlNetwork}
                        onChange={(e) => setNewBlNetwork(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 outline-none focus:border-red-400 text-sm font-medium"
                      >
                        <option value="Unknown">Unknown / Any</option>
                        <option value="Solana">Solana</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="BSC">BNB Smart Chain</option>
                        <option value="Base Chain">Base Network</option>
                        <option value="Robinhood">Robinhood</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={isBlSubmitting}
                      className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg shadow-sm flex justify-center items-center gap-2"
                    >
                      {isBlSubmitting ? <Loader2 size={16} className="animate-spin" /> : <><Ban size={14}/> Block Token</>}
                    </button>
                  </form>
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-red-50 border-b border-red-100 text-red-700 font-semibold">
                      <tr>
                        <th className="px-6 py-4">Label</th>
                        <th className="px-6 py-4">Contract / Mint Address</th>
                        <th className="px-6 py-4">Chain</th>
                        <th className="px-6 py-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {blacklist.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No tokens blacklisted yet. Add a spam token above to block it.</td></tr>
                      ) : (
                        blacklist.map((item, idx) => (
                          <tr key={idx} className="hover:bg-red-50/30">
                            <td className="px-6 py-4 font-bold text-slate-800">{item.label || <span className="text-slate-400 italic">No label</span>}</td>
                            <td className="px-6 py-4 font-mono text-slate-500 text-xs">{item.contract_address}</td>
                            <td className="px-6 py-4">
                              <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">{item.chain_network || 'Unknown'}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => handleRemoveBlacklist(item.contract_address)} className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-md"><Trash2 size={16} /></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MY PORTFOLIO */}
        {activeTab === 'my_wallet' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><ShieldCheck className="text-emerald-500" /> My Personal Portfolio</h2>
                <p className="text-sm text-slate-500 mt-1">Lacak aset pribadimu secara privat tanpa menyimpannya di database publik.</p>
              </div>
              {connectedWallet && (
                <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Net Worth</span>
                    <span className="text-lg font-black text-slate-800">${myWalletNetWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <button onClick={fetchMyWalletTokens} disabled={myWalletLoading} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-md text-slate-500 hover:text-blue-600 transition-colors">
                    <RefreshCw size={16} className={myWalletLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              )}
            </div>

            {!connectedWallet ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <Wallet size={32} className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">No Wallet Connected</h3>
                <p className="text-sm text-slate-500 max-w-sm mt-2 mb-6">Hubungkan dompet EVM atau Solana kamu untuk melihat seluruh aset pribadimu di sini.</p>
                <button 
                  onClick={() => setShowConnectMenu(true)} 
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-sm flex items-center gap-2"
                >
                  <Wallet size={18} /> Connect Wallet Now
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                      {connectedNetwork === 'Solana' ? (
                        <img src="https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png" className="w-5 h-5 rounded-full object-cover" alt="Sol" />
                      ) : (
                        <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" className="w-5 h-5" alt="EVM" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 font-mono">{connectedWallet}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {connectedNetwork === 'Solana' ? (
                           <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Solana</span>
                        ) : (
                           <select 
                             value={connectedNetwork || 'Omnichain'} 
                             onChange={(e) => {
                               const net = e.target.value;
                               setConnectedNetwork(net);
                               localStorage.setItem('my_connected_network', net);
                             }}
                             className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider outline-none cursor-pointer border border-blue-200"
                           >
                             <option value="Omnichain">Omnichain (All)</option>
                             <option value="Ethereum">Ethereum</option>
                             <option value="BSC">BNB Smart Chain</option>
                             <option value="Base Chain">Base Network</option>
                             <option value="Robinhood">Robinhood</option>
                           </select>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={disconnectWallet} className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1"><X size={14} /> Disconnect</button>
                </div>

                {myWalletLoading && myWalletTokens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                    <p className="text-sm font-medium">Scanning blockchain for your assets...</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Asset</th>
                        <th className="px-6 py-4 text-right">Balance</th>
                        <th className="px-6 py-4 text-right">Price</th>
                        <th className="px-6 py-4 text-right">Value (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myWalletTokens.filter(t => !t.is_spam).length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">No valuable assets found in this wallet.</td></tr>
                      ) : (
                        myWalletTokens.filter(t => !t.is_spam).map((token, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                                {token.logo ? <img src={token.logo} alt={token.symbol} className="w-full h-full object-cover" /> : <div className="text-xs font-bold text-slate-400">{token.symbol.slice(0,2)}</div>}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{token.name}</div>
                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                  <span>{token.symbol}</span>
                                  <span className="text-[10px]">•</span>
                                  <span className="font-mono">{token.contract_address.slice(0,6)}...{token.contract_address.slice(-4)}</span>
                                  {token.injected_chain && (
                                    <span className="bg-slate-200 text-slate-600 px-1 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">{token.injected_chain}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-slate-700">{token.balance}</td>
                            <td className="px-6 py-4 text-right font-medium text-slate-500">${(token.price_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900">${(token.total_value_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL HISTORY TRANSAKSI */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <History size={18} className="text-violet-600" /> Transaction History
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{historyTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Cache 5 min</span>
                <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {isFetchingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                  <Loader2 size={32} className="animate-spin text-violet-500" />
                  <p className="text-sm font-medium">Mengambil riwayat transaksi...</p>
                </div>
              ) : historyData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <Clock size={40} className="text-slate-300" />
                  <p className="text-sm font-medium">Tidak ada riwayat transaksi ditemukan</p>
                  <p className="text-xs text-slate-400">Token mungkin belum pernah ditransfer dari/ke dompet ini</p>
                </div>
              ) : (
                <table className="w-full text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0 border-b border-slate-100 z-10">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-left">Tipe</th>
                      <th className="px-5 py-3 font-semibold text-right">Jumlah</th>
                      <th className="px-5 py-3 font-semibold text-right">Nilai (USD)</th>
                      <th className="px-5 py-3 font-semibold text-left">Waktu</th>
                      <th className="px-5 py-3 font-semibold text-center">TX</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {historyData.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                            tx.type === 'IN'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {tx.type === 'IN' ? '↓ BUY / IN' : '↑ SELL / OUT'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800">
                          {tx.amount?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          {tx.symbol && <span className="text-slate-400 text-xs ml-1">{tx.symbol}</span>}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {tx.value_usd 
                            ? `$${Math.abs(tx.value_usd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : currentHistoryParams?.priceUsd
                              ? `$${(tx.amount * currentHistoryParams.priceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {tx.timestamp
                            ? new Date(tx.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {tx.explorer_url ? (
                            <a
                              href={tx.explorer_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 font-mono text-[11px] bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-100 transition-colors"
                            >
                              {tx.tx_hash?.slice(0, 6)}...{tx.tx_hash?.slice(-4)}
                              <ExternalLink size={10} />
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {historyData.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
                <span>{historyData.length} transaksi terbaru</span>
                <button
                  onClick={() => {
                    if (currentHistoryParams) {
                      setIsFetchingHistory(true);
                      handleViewHistory(
                        currentHistoryParams.walletAddress,
                        currentHistoryParams.contractAddress,
                        currentHistoryParams.chainNetwork,
                        currentHistoryParams.tokenSymbol,
                        currentHistoryParams.priceUsd,
                        true
                      );
                    }
                  }}
                  className="text-violet-600 hover:text-violet-800 font-semibold flex items-center gap-1"
                >
                  <RefreshCw size={11} /> Refresh Data
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL ADD WATCHLIST TARGET */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <h3 className="text-base font-bold text-slate-800">Add Tracking Target</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddWallet} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Target Label (Name)</label>
                <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 outline-none focus:border-blue-500 text-sm" placeholder="e.g. Whale #1" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Wallet Address (HEX)</label>
                <input type="text" value={newWallet} onChange={(e) => setNewWallet(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 outline-none focus:border-blue-500 text-sm font-mono" placeholder="0x..." required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Blockchain Network</label>
                <select value={newNetwork} onChange={(e) => setNewNetwork(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 outline-none focus:border-blue-500 text-sm font-medium">
                  <option value="EVM (ETH/BSC/RH)">EVM Omnichain (All)</option>
                  <option value="Ethereum">Ethereum Mainnet</option>
                  <option value="BSC">BNB Smart Chain</option>
                  <option value="Base Chain">Base Network</option>
                  <option value="Robinhood">Robinhood</option>
                  <option value="Solana">Solana</option>
                </select>
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50 text-sm shadow-sm flex justify-center items-center gap-2">
                {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : "Start Tracking"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TOP HOLDERS */}
      {isHoldersModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Users size={18} className="text-emerald-600" /> Top Holders</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {holdersCoinName} • {holdersCoinAddress.slice(0,6)}...{holdersCoinAddress.slice(-4)}
                  {holdersTotalCount ? ` • ${holdersTotalCount.toLocaleString()} Total Active Holders` : ''}
                </p>
              </div>
              <button onClick={() => setIsHoldersModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-0">
              {isFetchingHolders ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                  <Loader2 size={32} className="animate-spin text-emerald-500" />
                  <p className="text-sm font-medium">Fetching top holders from blockchain...</p>
                </div>
              ) : selectedCoinHolders.length > 0 ? (
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0 border-b border-slate-100 z-10">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Rank</th>
                      <th className="px-6 py-4 font-semibold">Wallet Address</th>
                      <th className="px-6 py-4 font-semibold text-right">Balance</th>
                      <th className="px-6 py-4 font-semibold text-right">Value (USD)</th>
                      <th className="px-6 py-4 font-semibold text-right">% Share</th>
                      <th className="px-6 py-4 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {selectedCoinHolders.map((holder, idx) => (
                      <tr key={holder.address} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3 font-semibold text-slate-500">#{idx + 1}</td>
                        <td className="px-6 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-mono text-xs text-slate-700">
                              {holder.address.slice(0,8)}...{holder.address.slice(-6)}
                            </span>
                            {(() => {
                              const tag = getWalletTag(holder.address);
                              return tag ? (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tag.color}`}>
                                  {tag.label}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right font-medium">{Number(holder.balance).toLocaleString(undefined, {maximumFractionDigits:2})}</td>
                        <td className="px-6 py-3 text-right font-bold text-slate-800">${holder.value_usd ? holder.value_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}</td>
                        <td className="px-6 py-3 text-right">
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold text-xs">{holder.share}%</span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <button 
                            onClick={() => handleAddHolderToWatchlist(holder.address, holdersCoinName, idx)}
                            disabled={addedHolders[holder.address]}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 mx-auto ${
                              addedHolders[holder.address] 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {addedHolders[holder.address] ? <Check size={12} /> : <Plus size={12} />}
                            {addedHolders[holder.address] ? 'Added' : 'Target'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                  <AlertTriangle size={32} className="text-amber-500" />
                  <p className="text-sm font-medium">No holders data found or unsupported chain.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}