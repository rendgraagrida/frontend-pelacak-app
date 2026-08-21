import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';

// 1. Jembatan Supabase
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ENDPOINT GET: MENGAMBIL DATA & SALDO LIVE UNTUK DASHBOARD
// ==========================================
export async function GET() {
  try {
    const { data, error } = await supabase.from('watchlist').select('*');
    if (error) throw error;
    
    const enrichedData = await Promise.all(data.map(async (wallet) => {
      let balance = "0";
      
      try {
        if (wallet.chain_network === 'Solana') {
          const solanaConnection = new Connection(process.env.ALCHEMY_SOL_URL!);
          const pubKey = new PublicKey(wallet.wallet_address);
          const balanceLamports = await solanaConnection.getBalance(pubKey);
          balance = (balanceLamports / LAMPORTS_PER_SOL).toString();
        } else {
          let rpcUrl = "";
          switch (wallet.chain_network) {
            case 'Ethereum': rpcUrl = process.env.ALCHEMY_ETH_URL!; break;
            case 'BSC': rpcUrl = process.env.ALCHEMY_BSC_URL!; break;
            case 'Robinhood Chain': rpcUrl = process.env.ALCHEMY_ROBINHOOD_URL!; break;
            case 'Base Chain': rpcUrl = process.env.ALCHEMY_BASE_URL!; break;
            default: rpcUrl = ""; 
          }

          if (rpcUrl) {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const rawBalance = await provider.getBalance(wallet.wallet_address);
            balance = ethers.formatEther(rawBalance);
          } else {
            balance = "0"; 
          }
        }
      } catch (err) {
        console.error(`Gagal menarik saldo untuk ${wallet.wallet_address}:`, err);
        balance = "Error RPC";
      }

      return { ...wallet, balance };
    }));

    return NextResponse.json(enrichedData, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==========================================
// ENDPOINT POST: MENERIMA DOMPET BARU & CEK SALDO
// ==========================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { wallet_address, chain_network } = body;

    if (!wallet_address || !chain_network) {
      return NextResponse.json(
        { error: "wallet_address dan chain_network wajib dikirim oleh Frontend!" }, 
        { status: 400 }
      );
    }

    let balance = "0";

    if (chain_network === 'Solana') {
      const solanaConnection = new Connection(process.env.ALCHEMY_SOL_URL!);
      const pubKey = new PublicKey(wallet_address);
      const balanceLamports = await solanaConnection.getBalance(pubKey);
      balance = (balanceLamports / LAMPORTS_PER_SOL).toString();
    } else {
      let rpcUrl = "";
      switch (chain_network) {
        case 'Ethereum': rpcUrl = process.env.ALCHEMY_ETH_URL!; break;
        case 'BSC': rpcUrl = process.env.ALCHEMY_BSC_URL!; break;
        case 'Robinhood Chain': rpcUrl = process.env.ALCHEMY_ROBINHOOD_URL!; break;
        case 'Base Chain': rpcUrl = process.env.ALCHEMY_BASE_URL!; break;
        default:
          return NextResponse.json({ error: "Network tidak didukung" }, { status: 400 });
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const rawBalance = await provider.getBalance(wallet_address);
      balance = ethers.formatEther(rawBalance);
    }

    const { data: existingData } = await supabase
      .from('watchlist')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('chain_network', chain_network);

    if (existingData && existingData.length > 0) {
      return NextResponse.json(
        { message: "Wallet sudah ada di watchlist", balance }, 
        { status: 200 }
      );
    }

    const { error: insertError } = await supabase
      .from('watchlist')
      .insert([{ wallet_address, chain_network }]);

    if (insertError) throw insertError;

    return NextResponse.json({
      message: "Berhasil ditambahkan ke Database!",
      wallet_address,
      chain_network,
      balance
    }, { status: 201 });

  } catch (error: any) {
    console.error("❌ [Backend API Error]:", error);
    return NextResponse.json({ error: "Gagal memproses permintaan" }, { status: 500 });
  }
}