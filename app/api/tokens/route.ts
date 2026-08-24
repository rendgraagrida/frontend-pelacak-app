export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getMoralisChain = (network: string) => {
  const net = network.toUpperCase();
  if (net === 'ETHEREUM' || net.includes('EVM')) return 'eth';
  if (net === 'BASE CHAIN') return 'base';
  if (net === 'BSC') return 'bsc';
  return null;
};

export async function POST(request: Request) {
  try {
    const { wallet_address, chain_network, page = 1 } = await request.json();

    if (!wallet_address || !chain_network) {
      return NextResponse.json({ error: "Data dompet tidak lengkap" }, { status: 400 });
    }

    const safeAddress = wallet_address.toString().trim();
    const chain = getMoralisChain(chain_network);
    const moralisApiKey = process.env.MORALIS_API_KEY || '';

    if (!chain || !moralisApiKey) {
      return NextResponse.json({ error: `Jaringan / API Key bermasalah` }, { status: 400 });
    }

    const headers = { "Accept": "application/json", "X-API-Key": moralisApiKey };

    // ==========================================
    // 1. SUPABASE WHITELIST (PENGAMANAN TRY/CATCH)
    // ==========================================
    let VIP_TOKENS: string[] = [];
    try {
      const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');
      const { data: whitelistData } = await supabase.from('whitelist_tokens').select('contract_address');
      
      if (whitelistData && Array.isArray(whitelistData)) {
        VIP_TOKENS = whitelistData.map((item: any) => item.contract_address?.toLowerCase() || "");
      }
    } catch (err) {
      console.error("[SYS.WARN] Gagal menarik Whitelist:", err);
    }

    // ==========================================
    // 2. TARIK DATA MORALIS (ANTI-CRASH ARRAY)
    // ==========================================
    let allTokens: any[] = [];
    try {
      const tokenUrl = `https://deep-index.moralis.io/api/v2.2/wallets/${safeAddress}/tokens?chain=${chain}&exclude_spam=true`;
      const tokenRes = await fetch(tokenUrl, { headers });
      
      if (tokenRes.ok) {
        const data = await tokenRes.json();
        // 🔴 TITIK KRITIS: Paksa data menjadi Array. Jika Moralis error, kembalikan [] kosong.
        allTokens = Array.isArray(data.result) ? data.result : Array.isArray(data) ? data : [];
      }
    } catch (err) {
      console.error("[SYS.WARN] Fetch Moralis gagal:", err);
    }

    // Jika terjadi anomali ekstrem
    if (!Array.isArray(allTokens)) allTokens = [];

    // ==========================================
    // 3. ZERO TRUST GUILLOTINE
    // ==========================================
    const cleanTokens = allTokens.filter((t: any) => {
      if (!t) return false; // Pengaman objek kosong
      
      const contract = t.token_address?.toLowerCase() || "";
      const claimedValue = t.usd_value || 0;
      
      // Bypass VIP
      if (VIP_TOKENS.includes(contract)) return true;

      // Buang spam
      if (t.possible_spam === true) return false;

      // Validasi Ekstrem Logo
      const validLogo = (typeof t.logo === 'string' && t.logo.length > 5) || 
                        (typeof t.thumbnail === 'string' && t.thumbnail.length > 5);
                        
      if (!validLogo) return false; 
      
      // Buang koin debu
      if (claimedValue < 0.01) return false;

      return true; 
    });

    const formattedTokens = cleanTokens.map((t: any) => {
      const decimals = t.decimals ? parseInt(t.decimals) : 18;
      const balanceFormatted = t.balance_formatted || (Number(t.balance) / Math.pow(10, decimals)).toFixed(4);
      return {
        contract_address: t.token_address,
        name: t.name || "Unknown",
        symbol: t.symbol || "???",
        logo: t.thumbnail || t.logo || null,
        balance: balanceFormatted,
        price_usd: t.usd_price || 0,
        total_value_usd: t.usd_value || (t.usd_price * Number(balanceFormatted)) || 0
      };
    });

    // ==========================================
    // 4. TARIK NATIVE COIN MURNI
    // ==========================================
    let nativeBalanceNum = 0;
    try {
      const nativeUrl = `https://deep-index.moralis.io/api/v2.2/${safeAddress}/balance?chain=${chain}`;
      const nativeRes = await fetch(nativeUrl, { headers });
      if (nativeRes.ok) {
        const data = await nativeRes.json();
        if (data.balance) nativeBalanceNum = Number(data.balance) / 1e18; 
      }
    } catch (err) {}

    let nativePriceUsd = 0;
    try {
        const nativeCoinId = chain === 'bsc' ? 'binancecoin' : chain === 'base' ? 'ethereum' : 'ethereum';
        const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${nativeCoinId}&vs_currencies=usd`).catch(() => null);
        if (cgRes && cgRes.ok) {
            const cgData = await cgRes.json();
            nativePriceUsd = cgData[nativeCoinId]?.usd || 0;
        }
    } catch (err) {}

    if (nativeBalanceNum > 0 && page === 1) {
        formattedTokens.push({
            contract_address: 'NATIVE_COIN',
            name: chain === 'bsc' ? 'BNB' : 'Ethereum',
            symbol: chain === 'bsc' ? 'BNB' : 'ETH',
            logo: null,
            balance: nativeBalanceNum.toFixed(4),
            price_usd: nativePriceUsd,
            total_value_usd: nativeBalanceNum * nativePriceUsd
        });
    }

    formattedTokens.sort((a: any, b: any) => (b.total_value_usd || 0) - (a.total_value_usd || 0));
    
    const limit = 20;
    const startIndex = (page - 1) * limit;
    const paginatedTokens = formattedTokens.slice(startIndex, startIndex + limit);

    return NextResponse.json({ 
      tokens: paginatedTokens, 
      hasNextPage: startIndex + limit < formattedTokens.length,
      currentPage: page
    }, { status: 200 });

  } catch (error: any) {
    console.error("[FATAL ERROR] API Tokens Crash:", error);
    return NextResponse.json({ error: `System Crash: ${error.message}` }, { status: 500 });
  }

}