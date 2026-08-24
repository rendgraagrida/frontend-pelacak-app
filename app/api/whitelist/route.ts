export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

export async function GET() {
  // 🔴 FIX: Menghapus .order('created_at') karena kolom tersebut tidak ada di DB Anda
  const { data, error } = await supabase.from('whitelist_tokens').select('*');
  if (error) return NextResponse.json([]); 
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  try {
    const { contract_address, label } = await request.json();
    const { data, error } = await supabase.from('whitelist_tokens').insert([{ contract_address: contract_address.toLowerCase().trim(), label: label.trim() }]);
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 200 }); 
  }
}

export async function DELETE(request: Request) {
  try {
    const { contract_address } = await request.json();
    const { error } = await supabase.from('whitelist_tokens').delete().eq('contract_address', contract_address.toLowerCase().trim());
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 200 }); 
  }
}