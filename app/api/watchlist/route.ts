export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

export async function GET() {
  try {
    // 🔴 FIX: Menghapus .catch() dari rantai query dan menggunakan struktur try-catch standar
    const { data, error } = await supabase.from('watchlist').select('*').order('created_at', { ascending: false });
    if (error) return NextResponse.json([]); 
    return NextResponse.json(data || []);
  } catch (err) {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const { wallet_address, chain_network, label } = await request.json();
    if (!wallet_address || !chain_network) return NextResponse.json({ error: "Data kosong" }, { status: 200 });

    const safeAddress = wallet_address.toString().trim();
    const net = chain_network.toUpperCase();
    const walletLabel = label || "Unknown Target";
    
    let networksToInsert = [chain_network];
    if (net.includes('EVM')) networksToInsert = ['Ethereum', 'BSC', 'Base Chain'];

    const insertData = networksToInsert.map((network) => {
      return { wallet_address: safeAddress, chain_network: network, label: walletLabel };
    });

    const { data, error } = await supabase.from('watchlist').insert(insertData);
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: "Target sudah ada!" }, { status: 200 });
      throw error;
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { wallet_address, chain_network } = await request.json();
    const { error } = await supabase.from('watchlist').delete().match({ wallet_address: wallet_address.toString().trim(), chain_network });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}