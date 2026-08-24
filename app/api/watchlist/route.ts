export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

const getMoralisChain = (network: string) => {
  const net = network.toUpperCase();
  if (net === 'ETHEREUM' || net.includes('EVM')) return 'eth';
  if (net === 'BASE CHAIN') return 'base';
  if (net === 'BSC') return 'bsc';
  return null;
};

export async function GET() {
  const { data, error } = await supabase.from('watchlist').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json([]); // 🔴 ANTI-CRASH
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  try {
    const { wallet_address, chain_network } = await request.json();
    if (!wallet_address || !chain_network) return NextResponse.json({ error: "Data kosong" }, { status: 200 });

    const safeAddress = wallet_address.toString().trim();
    const net = chain_network.toUpperCase();
    
    let networksToInsert = [chain_network];
    if (net.includes('EVM')) networksToInsert = ['Ethereum', 'BSC', 'Base Chain'];

    const moralisApiKey = process.env.MORALIS_API_KEY || '';

    const insertData = await Promise.all(networksToInsert.map(async (network) => {
      let balance = "0.0000";
      const chain = getMoralisChain(network);
      if (chain && moralisApiKey) {
        try {
          const url = `https://deep-index.moralis.io/api/v2.2/${safeAddress}/balance?chain=${chain}`;
          const res = await fetch(url, { headers: { "Accept": "application/json", "X-API-Key": moralisApiKey } });
          if (res.ok) {
            const bData = await res.json();
            if (bData.balance) balance = (Number(bData.balance) / 1e18).toFixed(4);
          }
        } catch (e) { balance = "ERR_RPC"; }
      }
      return { wallet_address: safeAddress, chain_network: network, balance: balance };
    }));

    const { data, error } = await supabase.from('watchlist').insert(insertData);
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: "Target sudah ada!" }, { status: 200 });
      throw error;
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 200 }); // 🔴 Diredam ke 200
  }
}

export async function DELETE(request: Request) {
  try {
    const { wallet_address, chain_network } = await request.json();
    const { error } = await supabase.from('watchlist').delete().match({ wallet_address: wallet_address.toString().trim(), chain_network });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 200 }); // 🔴 Diredam ke 200
  }
}