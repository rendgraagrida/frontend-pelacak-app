'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Wallet, Activity, Plus, X } from 'lucide-react';

export default function Dashboard() {
  // Variabel 'wallets' dideklarasikan di sini. JANGAN DIHAPUS.
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWallet, setNewWallet] = useState('');
  const [newNetwork, setNewNetwork] = useState('Ethereum');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWallet) return alert("Alamat wallet tidak boleh kosong!");

    try {
      setIsSubmitting(true);
      const response = await axios.post('/api/watchlist', {
        wallet_address: newWallet,
        chain_network: newNetwork
      });
      
      alert(response.data.message + `\nSaldo: ${response.data.balance}`);
      
      setIsModalOpen(false);
      setNewWallet('');
      fetchWatchlist(); 
    } catch (error: any) {
      alert(error.response?.data?.error || "Gagal menambahkan wallet");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 relative">
      <header className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="text-green-400" />
          Crypto Tracker
        </h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Tambah Wallet
        </button>
      </header>

      <main>
        <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Wallet className="text-gray-400" />
            Watchlist Anda
          </h2>
          
          {loading ? (
            <p className="text-gray-400 animate-pulse">Memuat data dari database...</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-3">Address</th>
                  <th className="pb-3">Network</th>
                  <th className="pb-3 text-right">Balance (Native)</th>
                </tr>
              </thead>
              <tbody>
                {wallets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">
                      Belum ada wallet di watchlist.
                    </td>
                  </tr>
                ) : (
                  wallets.map((wallet: any, index: number) => (
                    <tr key={index} className="border-b border-gray-750 hover:bg-gray-750 transition-colors">
                      <td className="py-4 font-mono text-sm truncate max-w-[300px]" title={wallet.wallet_address}>
                        {wallet.wallet_address}
                      </td>
                      <td className="py-4 capitalize">
                        <span className="bg-gray-700 px-2 py-1 rounded text-xs font-semibold">
                          {wallet.chain_network}
                        </span>
                      </td>
                      <td className="py-4 text-right font-bold text-green-400">
                        {wallet.balance === "Error RPC" 
                          ? <span className="text-red-400 text-xs">Error RPC</span> 
                          : wallet.balance 
                            ? parseFloat(wallet.balance).toFixed(4) 
                            : "0.0000"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* MODAL FORM TAMBAH WALLET */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Tambah Dompet Baru</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAddWallet} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Alamat Dompet</label>
                <input 
                  type="text" 
                  value={newWallet}
                  onChange={(e) => setNewWallet(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500"
                  placeholder="0x..."
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Jaringan (Network)</label>
                <select 
                  value={newNetwork}
                  onChange={(e) => setNewNetwork(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500"
                >
                  <option value="Ethereum">Ethereum</option>
                  <option value="BSC">BSC</option>
                  <option value="Robinhood Chain">Robinhood Chain</option>
                  <option value="Base Chain">Base Chain</option>
                  <option value="Solana">Solana</option>
                </select>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-2 disabled:opacity-50"
              >
                {isSubmitting ? "Memproses & Melacak..." : "Simpan Wallet"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}