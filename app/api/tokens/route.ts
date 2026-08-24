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
    if (!wallet_address || !chain_network) return NextResponse.json({ error: "Data dompet tidak lengkap" }, { status: 400 });

    const safeAddress = wallet_address.toString().trim();
    const chain = getMoralisChain(chain_network);
    const moralisApiKey = process.env.MORALIS_API_KEY || '';

    if (!chain || !moralisApiKey) return NextResponse.json({ error: `Jaringan bermasalah` }, { status: 400 });
    const headers = { "Accept": "application/json", "X-API-Key": moralisApiKey };

    let VIP_TOKENS: string[] = [];
    try {
      const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');
      const { data: whitelistData } = await supabase.from('whitelist_tokens').select('contract_address');
      if (whitelistData && Array.isArray(whitelistData)) VIP_TOKENS = whitelistData.map((item: any) => item.contract_address?.toLowerCase() || "");
    } catch (err) {}

    let allTokens: any[] = [];
    try {
      // 🔴 FIX: Mematikan exclude_spam agar koin spam tetap tertarik untuk dikarantina
      const tokenUrl = `https://deep-index.moralis.io/api/v2.2/wallets/${safeAddress}/tokens?chain=${chain}&exclude_spam=false`;
      const tokenRes = await fetch(tokenUrl, { headers });
      if (tokenRes.ok) {
        const data = await tokenRes.json();
        allTokens = Array.isArray(data.result) ? data.result : Array.isArray(data) ? data : [];
      }
    } catch (err) {}
    if (!Array.isArray(allTokens)) allTokens = [];

    // 🔴 FIX: Bukan di-filter (dibuang), tapi di-map (diberi bendera SPAM)
    const formattedTokens = allTokens.map((t: any) => {
      const contract = t.token_address?.toLowerCase() || "";
      const claimedValue = t.usd_value || 0;
      let isSpam = false;

      if (VIP_TOKENS.includes(contract)) {
        isSpam = false;
      } else {
        const validLogo = (typeof t.logo === 'string' && t.logo.length > 5) || (typeof t.thumbnail === 'string' && t.thumbnail.length > 5);
        if (t.possible_spam === true) isSpam = true;
        else if (!validLogo && claimedValue > 0) isSpam = true;
        else if (claimedValue < 0.01 && !validLogo) isSpam = true;
      }

      const decimals = t.decimals ? parseInt(t.decimals) : 18;
      const balanceFormatted = t.balance_formatted || (Number(t.balance) / Math.pow(10, decimals)).toFixed(4);
      
      return {
        contract_address: t.token_address,
        name: t.name || "Unknown",
        symbol: t.symbol || "???",
        logo: t.thumbnail || t.logo || null,
        balance: balanceFormatted,
        price_usd: t.usd_price || 0,
        total_value_usd: t.usd_value || (t.usd_price * Number(balanceFormatted)) || 0,
        is_spam: isSpam // Bendera Karantina
      };
    });

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
            total_value_usd: nativeBalanceNum * nativePriceUsd,
            is_spam: false
        });
    }

    // Sort: Koin asli di atas, Spam di bawah, lalu berdasarkan USD value
    formattedTokens.sort((a: any, b: any) => {
        if (a.is_spam && !b.is_spam) return 1;
        if (!a.is_spam && b.is_spam) return -1;
        return (b.total_value_usd || 0) - (a.total_value_usd || 0);
    });
    
    const limit = 30; // Ditingkatkan agar spam terlihat
    const startIndex = (page - 1) * limit;
    const paginatedTokens = formattedTokens.slice(startIndex, startIndex + limit);

    return NextResponse.json({ 
      tokens: paginatedTokens, 
      hasNextPage: startIndex + limit < formattedTokens.length,
      currentPage: page
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ tokens: [], error: `System Crash` }, { status: 200 });
  }
}