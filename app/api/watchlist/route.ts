// ==========================================
// ENDPOINT GET: MENGAMBIL DATA & SALDO LIVE UNTUK DASHBOARD
// ==========================================
export async function GET() {
  try {
    // 1. Tarik daftar dompet dari Supabase
    const { data, error } = await supabase.from('watchlist').select('*');
    if (error) throw error;
    
    // 2. Tarik Saldo LIVE dari Blockchain menggunakan Promise.all agar cepat
    const enrichedData = await Promise.all(data.map(async (wallet) => {
      let balance = "0";
      
      try {
        if (wallet.chain_network === 'Solana') {
          const solanaConnection = new Connection(process.env.ALCHEMY_SOL_URL!);
          const pubKey = new PublicKey(wallet.wallet_address);
          const balanceLamports = await solanaConnection.getBalance(pubKey);
          balance = (balanceLamports / LAMPORTS_PER_SOL).toString();
        } else {
          // EVM Chains
          let rpcUrl = "";
          switch (wallet.chain_network) {
            case 'Ethereum': rpcUrl = process.env.ALCHEMY_ETH_URL!; break;
            case 'BSC': rpcUrl = process.env.ALCHEMY_BSC_URL!; break;
            case 'Robinhood Chain': rpcUrl = process.env.ALCHEMY_ROBINHOOD_URL!; break;
            case 'Base Chain': rpcUrl = process.env.ALCHEMY_BASE_URL!; break;
            default: rpcUrl = ""; // Jaringan lawas/tidak dikenal (seperti EVM ETH/BSC/RH di data Anda)
          }

          if (rpcUrl) {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const rawBalance = await provider.getBalance(wallet.wallet_address);
            balance = ethers.formatEther(rawBalance);
          } else {
            balance = "0"; // Fallback jika URL RPC tidak ditemukan
          }
        }
      } catch (err) {
        console.error(`Gagal menarik saldo untuk ${wallet.wallet_address}:`, err);
        balance = "Error RPC";
      }

      // Gabungkan data Supabase dengan saldo live
      return { ...wallet, balance };
    }));

    // Kembalikan data yang sudah diperkaya dengan saldo live ke Frontend
    return NextResponse.json(enrichedData, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}