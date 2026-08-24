import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // 1. Validasi Brankas Kunci
  if (!token || !chatId) {
    return NextResponse.json({ error: "Kunci API Telegram hilang dari .env.local" }, { status: 500 });
  }

  // 2. Amunisi Pesan (Menggunakan format HTML agar bisa ditebalkan)
  const message = "🟢 <b>SYS.TRACKING_WALLET: ONLINE</b>\n\nKoneksi komunikasi aman telah berhasil diaktifkan. Agen menanti instruksi pengintaian selanjutnya.";
  
  // 3. Titik Sasaran API Telegram
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    // 4. Eksekusi Tembakan Sinyal
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    if (response.ok) {
      return NextResponse.json({ status: "SUCCESS", message: "Sinyal terkirim. Periksa HP Anda." });
    } else {
      const errData = await response.json();
      return NextResponse.json({ status: "FAILED", error: errData }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ status: "CRASH", error: error.message }, { status: 500 });
  }
}