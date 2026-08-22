'use client';

import React, { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import { Terminal, Plus, X, ChevronDown, ChevronUp, Loader2, Copy, Check, ExternalLink } from 'lucide-react';

interface WalletItem {
  id?: number;
  wallet_address: string;
  chain_network: string;
  balance?: string;
}

interface TokenItem {
  contract_address: string;
  name: string;
  symbol: string;
  logo: string | null;
  balance: string;
  price_usd?: number;
  total_value_usd?: number;
}

export default function Dashboard() {
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWallet, setNewWallet] = useState('');
  const [newNetwork, setNewNetwork] = useState('Ethereum');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [walletTokens, setWalletTokens] = useState<Record<string, TokenItem[]>>({});
  const [loadingTokens, setLoadingTokens] = useState<Record<string, boolean>>({});
  
  const [walletPages, setWalletPages] = useState<Record<string, number>>({});
  const [walletHasNext, setWalletHasNext] = useState<Record<string, boolean>>({});
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const fetchWatchlist = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/watchlist');
      setWallets(response.data);
    } catch (error) {
      console.error("Gagal mengambil data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const fetchTokens = async (walletAddress: string, chainNetwork: string, page: number) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;

    try {
      setLoadingTokens((prev) => ({ ...prev, [memoryKey]: true }));
      const response = await axios.post('/api/tokens', {
        wallet_address: walletAddress,
        chain_network: chainNetwork,
        page: Number(page)
      });
      
      const newTokens = response.data.tokens;
      const hasNext = response.data.hasNextPage;

      setWalletTokens((prev) => {
        if (page === 1) return { ...prev, [memoryKey]: newTokens };
        const existing = prev[memoryKey] || [];
        return { ...prev, [memoryKey]: [...existing, ...newTokens] };
      });

      setWalletHasNext((prev) => ({ ...prev, [memoryKey]: hasNext }));
      setWalletPages((prev) => ({ ...prev, [memoryKey]: page }));
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      alert(`[ERROR] Gagal memuat halaman ${page}: ${errorMsg}`);
    } finally {
      setLoadingTokens((prev) => ({ ...prev, [memoryKey]: false }));
    }
  };

  const handleToggleTokens = async (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    if (expandedWallet === memoryKey) {
      setExpandedWallet(null);
      return;
    }
    setExpandedWallet(memoryKey);
    
    // Toleransi huruf kapital untuk keamanan pencegahan bug
    const safeNet = chainNetwork.toUpperCase();
    if (!['ETHEREUM', 'BASE CHAIN', 'BSC'].includes(safeNet) && !safeNet.includes('EVM')) return;
    
    if (!walletTokens[memoryKey]) {
      await fetchTokens(walletAddress, chainNetwork, 1);
    }
  };

  const handleLoadMore = async (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    const currentPage = walletPages[memoryKey] || 1;
    await fetchTokens(walletAddress, chainNetwork, currentPage + 1);
  };

  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWallet) return alert("[ERROR] Alamat tidak boleh kosong!");
    try {
      setIsSubmitting(true);
      await axios.post('/api/watchlist', { wallet_address: newWallet, chain_network: newNetwork });
      setIsModalOpen(false);
      setNewWallet('');
      fetchWatchlist(); 
    } catch (error: any) {
      alert(error.response?.data?.error || "[ERROR] Gagal menambahkan target");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWallet = async (walletAddress: string, chainNetwork: string) => {
    const memoryKey = `${walletAddress}-${chainNetwork}`;
    if (!confirm(`[WARNING] Hapus target ${walletAddress.slice(0,6)}... dari database?`)) return;
    try {
      await axios.delete('/api/watchlist', {
        data: { wallet_address: walletAddress, chain_network: chainNetwork }
      });
      if (expandedWallet === memoryKey) setExpandedWallet(null);
      fetchWatchlist();
    } catch (error: any) {
      alert("[ERROR] Eksekusi penghapusan gagal.");
    }
  };

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // FUNGSI TAUTAN FORENSIK CERDAS
  const getExplorerUrl = (network: string, tokenAddress: string, walletAddress: string) => {
    const net = network.toUpperCase();
    let baseUrl = 'https://etherscan.io';
    
    if (net === 'BASE CHAIN') baseUrl = 'https://basescan.org';
    else if (net === 'BSC') baseUrl = 'https://bscscan.com';

    if (tokenAddress === 'NATIVE_COIN') {
      return `${baseUrl}/address/${walletAddress}`;
    }
    return `${baseUrl}/token/${tokenAddress}?a=${walletAddress}`;
  };

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono p-6 sm:p-10 selection:bg-green-500 selection:text-black">
      {/* Efek CRT Scanline */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-10 bg-[linear-gradient(rgba(0,255,65,0.1)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-green-500 pb-4 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-3 uppercase tracking-widest text-green-400 drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]">
            <Terminal className="text-green-500" />
            SYS.TRACKING_WALLET <span className="animate-pulse">_</span>
          </h1>
          <p className="text-xs text-green-700 mt-1 uppercase">Connection: Secured | Status: Active</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="border border-green-500 text-green-500 hover:bg-green-500 hover:text-black px-4 py-2 flex items-center gap-2 transition-colors uppercase text-sm font-bold tracking-wider"
        >
          <Plus size={16} />
          [ ADD_TARGET ]
        </button>
      </header>

      <main>
        <div className="border border-green-800 bg-black p-1">
          <div className="border border-green-900 p-4">
            <h2 className="text-sm font-bold mb-4 uppercase tracking-widest text-green-600 border-b border-green-900 pb-2">
              &gt; ACTIVE_WATCHLIST_TARGETS
            </h2>
            
            {loading ? (
              <p className="text-green-700 animate-pulse text-sm">&gt; Initializing database scan...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-green-700 border-b border-green-900">
                      <th className="pb-2 font-normal">[ ADDRESS ]</th>
                      <th className="pb-2 font-normal">[ NET ]</th>
                      <th className="pb-2 text-right font-normal">[ BALANCE ]</th>
                      <th className="pb-2 text-center font-normal">[ EXE ]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-green-900">
                          NO_TARGETS_FOUND
                        </td>
                      </tr>
                    ) : (
                      wallets.map((wallet, index) => {
                        const memoryKey = `${wallet.wallet_address}-${wallet.chain_network}`;
                        const isExpanded = expandedWallet === memoryKey;
                        const safeNet = wallet.chain_network.toUpperCase();
                        const isSupported = ['ETHEREUM', 'BASE CHAIN', 'BSC'].includes(safeNet) || safeNet.includes('EVM');
                        const isLoadingToken = loadingTokens[memoryKey];
                        const tokens = walletTokens[memoryKey] || [];
                        const hasNext = walletHasNext[memoryKey];

                        return (
                          <Fragment key={index}>
                            <tr className={`border-b border-green-950 transition-colors ${isExpanded ? 'bg-green-950/20' : 'hover:bg-green-950/10'}`}>
                              <td className="py-3 text-green-400">
                                {wallet.wallet_address}
                              </td>
                              <td className="py-3 uppercase text-green-600 text-xs">
                                {wallet.chain_network}
                              </td>
                              <td className="py-3 text-right font-bold text-green-300">
                                {wallet.balance === "Error RPC" ? "ERR_RPC" : wallet.balance ? parseFloat(wallet.balance).toFixed(4) : "0.0000"}
                              </td>
                              <td className="py-3 text-center flex items-center justify-center gap-2">
                                {isSupported ? (
                                  <button
                                    onClick={() => handleToggleTokens(wallet.wallet_address, wallet.chain_network)}
                                    className="inline-flex items-center gap-1 text-xs border border-green-800 hover:bg-green-500 hover:text-black px-2 py-1 transition-colors"
                                  >
                                    SCAN {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>
                                ) : (
                                  <span className="text-xs text-green-900 mr-2">N/A</span>
                                )}
                                
                                <button
                                  onClick={() => handleDeleteWallet(wallet.wallet_address, wallet.chain_network)}
                                  className="inline-flex items-center text-xs border border-red-900 text-red-600 hover:bg-red-600 hover:text-black px-2 py-1 transition-colors"
                                  title="Delete Target"
                                >
                                  [ DEL ]
                                </button>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="bg-black">
                                <td colSpan={4} className="p-0 border-b border-green-900">
                                  <div className="p-4 border-l-2 border-green-500 ml-4 my-4 bg-green-950/5">
                                    <h4 className="text-xs font-bold text-green-600 mb-4 uppercase tracking-widest">
                                      &gt;&gt; EXTRACTED_TOKENS ({wallet.chain_network})
                                    </h4>

                                    {tokens.length === 0 && !isLoadingToken ? (
                                      <p className="text-xs text-green-800">NO_ASSETS_FOUND.</p>
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {tokens.map((token, tIdx) => (
                                          <div key={`${token.contract_address}-${tIdx}`} className={`p-3 border ${token.contract_address === 'NATIVE_COIN' ? 'border-green-400 bg-green-900/10' : 'border-green-900 bg-black'} hover:border-green-500 transition-colors group`}>
                                            <div className="flex justify-between items-start mb-2">
                                              <div>
                                                <p className="text-sm font-bold text-green-400 group-hover:text-green-300">
                                                  {token.symbol} {token.contract_address === 'NATIVE_COIN' && <span className="text-[10px] bg-green-900 text-black px-1 ml-1">CORE</span>}
                                                </p>
                                                
                                                <div className="flex items-center gap-2 mt-1">
                                                  {token.contract_address !== 'NATIVE_COIN' ? (
                                                    <button 
                                                      onClick={() => handleCopy(token.contract_address)}
                                                      className="text-[10px] text-green-700 hover:text-black hover:bg-green-500 flex items-center gap-1 border border-green-900 px-1 transition-colors"
                                                      title="Copy Address"
                                                    >
                                                      {token.contract_address.slice(0, 6)}...{token.contract_address.slice(-4)}
                                                      {copiedAddress === token.contract_address ? <Check size={10} /> : <Copy size={10} />}
                                                    </button>
                                                  ) : (
                                                    <span className="text-[10px] text-green-700 border border-green-900 px-1">NATIVE_ASSET</span>
                                                  )}
                                                  
                                                  {/* TOMBOL FORENSIK TERBARU */}
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      window.open(getExplorerUrl(wallet.chain_network, token.contract_address, wallet.wallet_address), '_blank');
                                                    }}
                                                    className="text-green-700 hover:text-green-400 transition-colors"
                                                    title="Validasi Forensik di Block Explorer"
                                                  >
                                                    <ExternalLink size={12} />
                                                  </button>
                                                </div>

                                              </div>
                                              <div className="text-right">
                                                <p className="text-sm font-bold text-green-300">
                                                  {token.total_value_usd && token.total_value_usd > 0 ? `$${token.total_value_usd.toFixed(2)}` : '$0.00'}
                                                </p>
                                              </div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-green-700 border-t border-green-900/50 pt-2 mt-2">
                                              <span>QTY: {token.balance}</span>
                                              <span>{token.price_usd && token.price_usd > 0 ? `@ $${token.price_usd.toFixed(2)}` : 'UNKNOWN_VAL'}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <div className="mt-4 flex items-center gap-4">
                                      {isLoadingToken ? (
                                        <div className="flex items-center gap-2 text-xs text-green-500 animate-pulse">
                                          <Loader2 size={14} className="animate-spin" />
                                          DOWNLOADING_BLOCKCHAIN_DATA...
                                        </div>
                                      ) : hasNext ? (
                                        <button 
                                          onClick={() => handleLoadMore(wallet.wallet_address, wallet.chain_network)}
                                          className="text-xs border border-green-700 text-green-600 hover:bg-green-700 hover:text-black px-3 py-1 uppercase transition-colors"
                                        >
                                          [ LOAD_PAGE_{walletPages[memoryKey] + 1} ]
                                        </button>
                                      ) : tokens.length > 0 && (
                                        <span className="text-xs text-green-900">EOF (END_OF_FILE).</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL ADD */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-black border-2 border-green-500 p-6 w-full max-w-md shadow-[0_0_20px_rgba(0,255,65,0.2)]">
            <div className="flex justify-between items-center mb-6 border-b border-green-500 pb-2">
              <h3 className="text-lg font-bold tracking-widest uppercase">&gt; INPUT_NEW_TARGET</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-green-700 hover:text-green-400">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddWallet} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs text-green-600 mb-1 uppercase tracking-wider">TARGET_ADDRESS (HEX)</label>
                <input 
                  type="text" 
                  value={newWallet}
                  onChange={(e) => setNewWallet(e.target.value)}
                  className="w-full bg-black border border-green-800 rounded-none p-2 text-green-400 outline-none focus:border-green-400 text-sm font-mono placeholder:text-green-900"
                  placeholder="0x..."
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs text-green-600 mb-1 uppercase tracking-wider">NETWORK_PROTOCOL</label>
                <select 
                  value={newNetwork}
                  onChange={(e) => setNewNetwork(e.target.value)}
                  className="w-full bg-black border border-green-800 rounded-none p-2 text-green-400 outline-none focus:border-green-400 text-sm font-mono"
                >
                  <option value="Ethereum">ETH_MAINNET</option>
                  <option value="BSC">BSC_MAINNET</option>
                  <option value="Base Chain">BASE_NETWORK</option>
                  <option value="EVM (ETH/BSC/RH)">EVM_OMNICHAIN</option>
                  <option value="Solana">SOLANA_NETWORK</option>
                </select>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full border border-green-500 hover:bg-green-500 hover:text-black text-green-500 font-bold py-2 px-4 mt-4 disabled:opacity-50 transition-colors uppercase tracking-widest text-sm"
              >
                {isSubmitting ? "EXECUTING..." : "[ INITIATE_TRACKING ]"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}