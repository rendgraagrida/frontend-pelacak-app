import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

const fetchAlchemy = async (url: string, method: string, params: any[]) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};

export async function POST(request: Request) {
  try {
    const { wallet_address, chain_network, page = 1 } = await request.json();

    if (!wallet_address || !chain_network) {
      return NextResponse.json({ error: "Data dompet tidak lengkap" }, { status: 400 });
    }

    const safeNetwork = chain_network.toString().trim().toUpperCase();
    const safeAddress = wallet_address.toString().trim(); 
    
    let rpcUrl = "";
    let nativeCoinId = "ethereum";
    let nativeSymbol = "ETH";
    let nativeName = "Ethereum";

    if (safeNetwork === 'ETHEREUM' || safeNetwork.includes('EVM')) {
      rpcUrl = process.env.ALCHEMY_ETH_URL!;
    } else if (safeNetwork === 'BASE CHAIN') {
      rpcUrl = process.env.ALCHEMY_BASE_URL!;
    } else if (safeNetwork === 'BSC') {
      rpcUrl = process.env.ALCHEMY_BSC_URL!;
      nativeCoinId = "binancecoin";
      nativeSymbol = "BNB";
      nativeName = "BNB";
    } else {
      return NextResponse.json({ error: `Jaringan tidak didukung` }, { status: 400 });
    }

    // ==========================================
    // 1. ISOLASI MUTLAK NATIVE COIN
    // ==========================================
    let finalTokens: any[] = [];
    
    if (page === 1) {
      try {
        // Tarik saldo
        const nativeBalanceRaw = await fetchAlchemy(rpcUrl, "eth_getBalance", [safeAddress, "latest"]);
        let nativeBalanceNum = 0;
        if (nativeBalanceRaw && nativeBalanceRaw !== "0x") {
          nativeBalanceNum = parseFloat(ethers.formatEther(nativeBalanceRaw));
        }

        // Tarik harga independen
        let nativePriceUsd = 0;
        try {
          const nativeRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${nativeCoinId}&vs_currencies=usd`);
          if (nativeRes.ok) {
            const data = await nativeRes.json();
            nativePriceUsd = data[nativeCoinId]?.usd || 0;
          }
        } catch (e) {
          console.error("CoinGecko Native gagal");
        }

        // PAKSA SUNTIK JIKA SALDO > 0 (bahkan 0.0002 akan masuk!)
        if (nativeBalanceNum > 0) {
          finalTokens.push({
            contract_address: 'NATIVE_COIN',
            name: nativeName,
            symbol: nativeSymbol,
            logo: null,
            balance: nativeBalanceNum.toFixed(4),
            price_usd: nativePriceUsd,
            total_value_usd: nativePriceUsd * nativeBalanceNum
          });
        }
      } catch (err) {
        console.error("Native Coin Fatal Error:", err);
      }
    }

    // ==========================================
    // 2. PROSES ERC-20 (Jika gagal, Native tetap aman)
    // ==========================================
    try {
      const res = await fetchAlchemy(rpcUrl, "alchemy_getTokenBalances", [safeAddress]);
      const rawTokens = res?.tokenBalances || [];
      
      const activeTokens = rawTokens.filter((t: any) => {
        try { return t.tokenBalance && BigInt(t.tokenBalance) > BigInt(0); } 
        catch { return false; }
      }).slice(0, 50); // Batasi 50 untuk performa ekstrem

      if (activeTokens.length > 0) {
        const enrichedTokens = await Promise.all(activeTokens.map(async (token: any) => {
          try {
            const meta = await fetchAlchemy(rpcUrl, "alchemy_getTokenMetadata", [token.contractAddress]);
            const bal = parseFloat(ethers.formatUnits(token.tokenBalance, meta.decimals || 18));
            return {
              contract_address: token.contractAddress,
              name: meta.name || "Unknown",
              symbol: meta.symbol || "???",
              logo: meta.logo || null,
              balance: bal.toFixed(4),
              price_usd: 0,
              total_value_usd: 0
            };
          } catch {
            return null;
          }
        }));

        const validErc20 = enrichedTokens.filter(t => t !== null);
        finalTokens = [...finalTokens, ...validErc20];
      }
    } catch (err) {
      console.error("ERC-20 Terabaikan karena error");
    }

    // 3. PENGURUTAN FINAL
    finalTokens.sort((a, b) => b.total_value_usd - a.total_value_usd);

    const limit = 20;
    const startIndex = (page - 1) * limit;
    const paginatedTokens = finalTokens.slice(startIndex, startIndex + limit);
    const hasNextPage = startIndex + limit < finalTokens.length;

    return NextResponse.json({ 
      tokens: paginatedTokens, 
      hasNextPage,
      currentPage: page
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: `Server Crash: ${error.message}` }, { status: 500 });
  }
}