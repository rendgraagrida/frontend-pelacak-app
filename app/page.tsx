'use client';

import React, { useState, useEffect, Fragment, useRef } from 'react';
import axios from 'axios';
import { 
  LayoutGrid, ShieldCheck, Plus, X, ChevronDown, ChevronUp, 
  Loader2, Copy, Check, ExternalLink, Wallet, Trash2, ArrowUpDown, Filter, AlertTriangle, Shield, Ban
} from 'lucide-react';

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
}

interface WhitelistItem {
  contract_address: string;
  label: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'watchlist' | 'whitelist' | 'blacklist'>('watchlist');

  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWallet, setNewWallet] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newNetwork, setNewNetwork] = useState('EVM (ETH/BSC/RH)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [networkFilter, setNetworkFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'net_worth', direction: 'desc' });

  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [walletTokens, setWalletTokens] = useState<Record<string, TokenItem[]>>({});
  const [loadingTokens, setLoadingTokens] = useState<Record<string, boolean>>({});
  const [walletPages, setWalletPages] = useState<Record<string, number>>({});
  const [walletHasNext, setWalletHasNext] = useState<Record<string, boolean>>({});
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  const [showSpam, setShowSpam] = useState<Record<string, boolean>>({});

  const isSyncing = useRef(false);

  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [newWlAddress, setNewWlAddress] = useState('');
  const [newWlLabel, setNewWlLabel] = useState('');
  const [isWlSubmitting, setIsWlSubmitting] = useState(false);

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

  useEffect(() => {
    fetchWatchlist();
    fetchWhitelist();
    fetchBlacklist();
  }, []);

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
        if (!['ETHEREUM', 'BASE CHAIN', 'BSC', 'SOLANA'].includes(safeNet) && !safeNet.includes('EVM')) continue;
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
      // 🔄 Clear cache: paksa semua wallet re-fetch dengan blacklist terbaru
      setWalletTokens({});
      setExpandedWallet(null);
      isSyncing.current = false;
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
      // 🔄 Clear cache: paksa semua wallet re-fetch dengan blacklist terbaru
      setWalletTokens({});
      setExpandedWallet(null);
      isSyncing.current = false;
    } catch (error) {}
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
    if (net === 'BASE CHAIN') baseUrl = 'https://basescan.org';
    else if (net === 'BSC') baseUrl = 'https://bscscan.com';
    if (tokenAddress === 'NATIVE_COIN') return `${baseUrl}/address/${walletAddress}`;
    return `${baseUrl}/token/${tokenAddress}?a=${walletAddress}`;
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

  const filteredWallets = wallets.filter(w => networkFilter === 'All' || w.chain_network === networkFilter);
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
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button onClick={() => setActiveTab('watchlist')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${activeTab === 'watchlist' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><LayoutGrid size={16} /> Targets</button>
              <button onClick={() => setActiveTab('whitelist')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${activeTab === 'whitelist' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><ShieldCheck size={16} /> Whitelist</button>
              <button onClick={() => setActiveTab('blacklist')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${activeTab === 'blacklist' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Ban size={16} /> Blacklist</button>
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
                  <Filter size={16} className="text-slate-400" />
                  <select value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                    <option value="All">All Networks</option>
                    <option value="Ethereum">Ethereum</option>
                    <option value="BSC">BSC</option>
                    <option value="Base Chain">Base Chain</option>
                    <option value="Solana">Solana</option>
                  </select>
                </div>
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
                        const isSupported = ['ETHEREUM', 'BASE CHAIN', 'BSC', 'SOLANA'].includes(wallet.chain_network.toUpperCase()) || wallet.chain_network.toUpperCase().includes('EVM');
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
                                  <span className="font-bold text-blue-600 text-base">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(netWorth)}</span>
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
                                        <div key={`valid-${tIdx}`} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                                          <div className="flex justify-between items-start mb-3">
                                            <div>
                                              <h5 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                {token.symbol} 
                                                {token.contract_address === 'NATIVE_COIN' && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-bold">CORE</span>}
                                              </h5>
                                              <div className="flex items-center gap-2 mt-1">
                                                {token.contract_address !== 'NATIVE_COIN' && (
                                                  <button onClick={() => handleCopy(token.contract_address)} className="text-[11px] font-mono text-slate-500 hover:text-blue-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center gap-1">
                                                    {token.contract_address.slice(0, 6)}...{token.contract_address.slice(-4)}
                                                  </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); window.open(getExplorerUrl(wallet.chain_network, token.contract_address, wallet.wallet_address), '_blank'); }} className="text-slate-400 hover:text-blue-600"><ExternalLink size={12} /></button>
                                              </div>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-sm font-bold text-slate-900">{token.total_value_usd && token.total_value_usd > 0 ? `$${token.total_value_usd.toFixed(2)}` : '$0.00'}</p>
                                            </div>
                                          </div>
                                          <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-100 pt-3">
                                            <span className="font-medium">Qty: {token.balance}</span>
                                            <span>{token.price_usd && token.price_usd > 0 ? `@ $${token.price_usd.toFixed(2)}` : 'Unknown Price'}</span>
                                          </div>
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
                                              <div key={`spam-${tIdx}`} className="bg-white p-3 rounded-lg border border-red-100 opacity-75 hover:opacity-100 transition-opacity">
                                                <div className="flex justify-between items-start mb-2">
                                                  <div>
                                                    <h5 className="text-xs font-bold text-slate-700">{token.symbol}</h5>
                                                    <span className="text-[10px] font-mono text-slate-400 mt-1 block">{token.contract_address.slice(0, 6)}...{token.contract_address.slice(-4)}</span>
                                                  </div>
                                                  <div className="text-right">
                                                    <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider line-through">
                                                      Fake: ${token.total_value_usd?.toFixed(0)}
                                                    </span>
                                                  </div>
                                                </div>
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

        {/* TAB 2: WHITELIST */}
        {activeTab === 'whitelist' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Whitelist Configuration</h2>
              <p className="text-sm text-slate-500 mt-1">Tokens added here will bypass the Spam Quarantine.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Add New Token</h3>
                  <form onSubmit={handleAddWhitelist} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contract Address</label>
                      <input type="text" value={newWlAddress} onChange={(e) => setNewWlAddress(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 outline-none focus:border-blue-500 text-sm font-mono" placeholder="0x..." required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Project Name / Label</label>
                      <input type="text" value={newWlLabel} onChange={(e) => setNewWlLabel(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 outline-none focus:border-blue-500 text-sm" placeholder="e.g. IDOS Token" required />
                    </div>
                    <button type="submit" disabled={isWlSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg shadow-sm flex justify-center items-center gap-2">
                      {isWlSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Add to Whitelist"}
                    </button>
                  </form>
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-6 py-4">Label</th>
                        <th className="px-6 py-4">Contract Address</th>
                        <th className="px-6 py-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {whitelist.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No tokens whitelisted yet.</td></tr>
                      ) : (
                        whitelist.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-bold text-slate-800">{item.label}</td>
                            <td className="px-6 py-4 font-mono text-slate-500 text-xs">{item.contract_address}</td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => handleRemoveWhitelist(item.contract_address)} className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-md"><Trash2 size={16} /></button>
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

        {/* TAB 3: BLACKLIST */}
        {activeTab === 'blacklist' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Blacklist Configuration</h2>
              <p className="text-sm text-slate-500 mt-1">Tokens added here will be <strong className="text-red-600">force-marked as Spam</strong> and excluded from all net worth calculations.</p>
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
      </main>

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
    </div>
  );
}