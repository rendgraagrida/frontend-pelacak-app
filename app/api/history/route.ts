import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet_address = searchParams.get('wallet_address');
  const contract_address = searchParams.get('contract_address');
  let chain_network = searchParams.get('chain_network');

  if (!wallet_address || !contract_address || !chain_network) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // Auto-detect Solana if wallet address doesn't start with '0x'
  if (!wallet_address.startsWith('0x')) {
    chain_network = 'solana';
  }

  const chain = chain_network.toLowerCase();

  try {
    if (chain === 'solana') {
      const heliusKey = process.env.HELIUS_API_KEY;
      if (!heliusKey) return NextResponse.json({ error: 'Missing HELIUS_API_KEY' }, { status: 500 });

      // Removed &type=TRANSFER so we also get swaps and other transactions that move tokens
      const url = `https://api.helius.xyz/v0/addresses/${wallet_address}/transactions?api-key=${heliusKey}&limit=50`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({ error: `Helius API error: ${errText}` }, { status: 502 });
      }

      const txList: any[] = await res.json();
      const mintLower = contract_address.toLowerCase();
      const history: any[] = [];

      for (const tx of txList) {
        const transfers: any[] = tx.tokenTransfers || [];
        for (const t of transfers) {
          if (t.mint?.toLowerCase() !== mintLower) continue;
          const isBuy = t.toUserAccount?.toLowerCase() === wallet_address.toLowerCase();
          history.push({
            type: isBuy ? 'IN' : 'OUT',
            amount: t.tokenAmount || 0,
            symbol: null,
            value_usd: null,
            timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null,
            tx_hash: tx.signature,
            explorer_url: `https://solscan.io/tx/${tx.signature}`,
            from: t.fromUserAccount || null,
            to: t.toUserAccount || null,
          });
        }
      }

      return NextResponse.json({ history: history.slice(0, 25) });
    }

    // EVM via Alchemy (Fast) or Covalent (Fallback)
    let chainId = 1;
    if (chain === 'bsc' || chain === 'binance') chainId = 56;
    else if (chain === 'base chain' || chain === 'base') chainId = 8453;
    else if (chain === 'robinhood' || chain.includes('robinhood') || chain === 'rh') chainId = 4663;
    else if (chain === 'polygon' || chain === 'matic') chainId = 137;
    else if (chain === 'arbitrum') chainId = 42161;

    const explorerMap: Record<number, string> = {
      1: 'https://etherscan.io/tx',
      56: 'https://bscscan.com/tx',
      8453: 'https://basescan.org/tx',
      4663: 'https://explorer.robinhood.com/tx',
      137: 'https://polygonscan.com/tx',
      42161: 'https://arbiscan.io/tx',
    };
    const explorerBase = explorerMap[chainId] || 'https://etherscan.io/tx';

    // Build Alchemy URL
    const alchemyKey = process.env.ALCHEMY_ETH_URL?.split('/').pop() || 'alch_N9FL-z41qp-r45WkzqTfZ';
    let alchemyUrl = '';
    if (chainId === 1) alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    else if (chainId === 56) alchemyUrl = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    else if (chainId === 8453) alchemyUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    else if (chainId === 137) alchemyUrl = `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    else if (chainId === 42161) alchemyUrl = `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    if (alchemyUrl) {
      // Use Alchemy
      const fetchAlchemyTransfers = async (isOut: boolean) => {
        const params: any = {
          fromBlock: "0x0",
          toBlock: "latest",
          contractAddresses: [contract_address],
          category: ["erc20"],
          withMetadata: true,
          maxCount: "0x64" // max 100 tx
        };
        if (isOut) params.fromAddress = wallet_address;
        else params.toAddress = wallet_address;

        const req = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getAssetTransfers',
            params: [params]
          })
        });
        if (!req.ok) return [];
        const res = await req.json();
        return res.result?.transfers || [];
      };

      const [inTransfers, outTransfers] = await Promise.all([
        fetchAlchemyTransfers(false),
        fetchAlchemyTransfers(true)
      ]);

      const history: any[] = [];
      const formatTx = (t: any, type: string) => ({
        type,
        amount: t.value || 0,
        symbol: t.asset || '?',
        value_usd: null,
        timestamp: t.metadata?.blockTimestamp || null,
        tx_hash: t.hash,
        explorer_url: `${explorerBase}/${t.hash}`,
        from: t.from || null,
        to: t.to || null,
      });

      for (const t of inTransfers) history.push(formatTx(t, 'IN'));
      for (const t of outTransfers) history.push(formatTx(t, 'OUT'));

      // Sort DESC by timestamp
      history.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });

      return NextResponse.json({ history: history.slice(0, 25) });
    }

    // Fallback to Covalent if chain not supported by Alchemy
    const covalentKey = process.env.COVALENT_API_KEY;
    if (!covalentKey) return NextResponse.json({ error: 'Missing COVALENT_API_KEY' }, { status: 500 });

    const url = `https://api.covalenthq.com/v1/${chainId}/address/${wallet_address}/transfers_v2/?contract-address=${contract_address}&page-size=25&key=${covalentKey}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `Covalent returned status ${res.status}`;
      try {
        if (errText) {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error_message || errMsg;
        }
      } catch (e) {
        errMsg = errText || errMsg;
      }
      
      if (res.status === 500 || res.status === 504) {
         errMsg = "Timeout: Dompet ini terlalu sibuk/memiliki terlalu banyak transaksi sehingga gagal diproses oleh API.";
      }
      return NextResponse.json({ error: `Covalent API error: ${errMsg}` }, { status: 502 });
    }

    const json = await res.json();
    const items: any[] = json.data?.items || [];
    const history: any[] = [];

    for (const item of items) {
      const transfers: any[] = item.transfers || [];
      for (const t of transfers) {
        const decimals = t.contract_decimals || 18;
        const rawAmount = BigInt(t.delta || '0');
        const amount = Number(rawAmount) / 10 ** decimals;
        history.push({
          type: t.transfer_type === 'IN' ? 'IN' : 'OUT',
          amount,
          symbol: t.contract_ticker_symbol || '?',
          value_usd: t.delta_quote || 0,
          timestamp: t.block_signed_at || item.block_signed_at,
          tx_hash: item.tx_hash,
          explorer_url: `${explorerBase}/${item.tx_hash}`,
          from: item.from_address || null,
          to: item.to_address || null,
        });
      }
    }

    return NextResponse.json({ history: history.slice(0, 25) });

  } catch (error: any) {
    console.error('Error fetching history:', error.message);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
