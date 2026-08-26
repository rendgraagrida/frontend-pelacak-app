export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendTelegramMessage,
  formatWhaleAlert,
  formatRsiAlert,
  formatVolumeAlert,
  formatSummaryMessage
} from '@/app/lib/telegram';

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET: Telegram Bot Health Check & Connection Diagnostics
 */
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json({
      configured: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in environment variables.'
    }, { status: 200 });
  }

  try {
    const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const botData = await getMeRes.json();

    return NextResponse.json({
      configured: true,
      botOnline: botData.ok || false,
      botInfo: botData.result || null,
      targetChatId: chatId
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      configured: true,
      botOnline: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * POST: Telegram Alert Dispatcher, Webhook & Radar Scanner
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabase();

    // 1. Webhook Handler (Incoming messages sent directly by Telegram servers)
    if (body.update_id && body.message) {
      const incomingText = (body.message.text || '').trim();
      const fromChatId = body.message.chat?.id?.toString();

      if (!fromChatId) {
        return NextResponse.json({ ok: true });
      }

      if (incomingText.startsWith('/start') || incomingText.startsWith('/help')) {
        const welcome = [
          `🤖 <b>PELACAK CRYPTO RADAR BOT</b> 🤖`,
          ``,
          `Welcome to real-time portfolio & whale tracking notifications!`,
          ``,
          `<b>Available Commands:</b>`,
          `  • <code>/summary</code> — View combined net worth & tracking overview`,
          `  • <code>/watchlist</code> — List all active tracked target wallets`,
          `  • <code>/coins</code> — Real-time price & RSI indicators for tracked coins`,
          `  • <code>/scan</code> — Force immediate scan for whale moves & RSI signals`,
          `  • <code>/help</code> — Show this commands menu`,
          ``,
          `🔗 <i>Web Dashboard: <a href="https://wallettracker-one.vercel.app">wallettracker-one.vercel.app</a></i>`
        ].join('\n');

        await sendTelegramMessage(welcome, { chatId: fromChatId });
        return NextResponse.json({ ok: true });
      }

      if (incomingText.startsWith('/summary')) {
        let walletCount = 0;
        let coinCount = 0;
        let totalNetWorth = 0;
        let topWallets: any[] = [];
        let topCoins: any[] = [];

        if (supabase) {
          const { data: wallets } = await supabase.from('watchlist').select('*');
          const { data: coins } = await supabase.from('tracked_coins').select('*');
          walletCount = wallets?.length || 0;
          coinCount = coins?.length || 0;
          topWallets = (wallets || []).map(w => ({ label: w.label || 'Target', balance: w.balance || '0.00', network: w.chain_network }));
          topCoins = (coins || []).map(c => ({ symbol: c.symbol || c.label || 'Coin', priceUsd: c.price_usd }));
        }

        const msg = formatSummaryMessage({
          walletCount,
          coinCount,
          totalNetWorth,
          topWallets,
          topCoins
        });

        await sendTelegramMessage(msg, { chatId: fromChatId });
        return NextResponse.json({ ok: true });
      }

      if (incomingText.startsWith('/watchlist')) {
        let text = `🎯 <b>TRACKED TARGET WALLETS</b>\n\n`;
        if (supabase) {
          const { data: wallets } = await supabase.from('watchlist').select('*').order('created_at', { ascending: false });
          if (wallets && wallets.length > 0) {
            wallets.forEach((w, i) => {
              text += `${i + 1}. <b>${w.label || 'Target'}</b> (<code>${w.wallet_address.slice(0, 6)}...${w.wallet_address.slice(-4)}</code>)\n`;
              text += `   ⛓ ${w.chain_network} | Balance: <b>${w.balance || '0'}</b>\n\n`;
            });
          } else {
            text += `<i>No target wallets added yet.</i>\n`;
          }
        }
        await sendTelegramMessage(text, { chatId: fromChatId });
        return NextResponse.json({ ok: true });
      }

      if (incomingText.startsWith('/coins')) {
        let text = `🪙 <b>TRACKED COIN WATCHLIST</b>\n\n`;
        if (supabase) {
          const { data: coins } = await supabase.from('tracked_coins').select('*').order('created_at', { ascending: false });
          if (coins && coins.length > 0) {
            coins.forEach((c, i) => {
              text += `${i + 1}. <b>${c.name || c.symbol || 'Coin'} (${c.symbol?.toUpperCase() || '?'})</b>\n`;
              text += `   💵 Price: <b>$${c.price_usd || '0.00'}</b> | 24h: <b>${c.price_change_h24 || 0}%</b>\n\n`;
            });
          } else {
            text += `<i>No coins tracked yet.</i>\n`;
          }
        }
        await sendTelegramMessage(text, { chatId: fromChatId });
        return NextResponse.json({ ok: true });
      }

      if (incomingText.startsWith('/scan')) {
        const scanRes = await executeRadarScan(supabase);
        await sendTelegramMessage(
          `🔍 <b>RADAR SCAN COMPLETED</b>\n\nChecked <b>${scanRes.scannedCoins} coins</b> and <b>${scanRes.scannedWallets} wallets</b>.\nAlerts dispatched: <b>${scanRes.alertsSent}</b>.`,
          { chatId: fromChatId }
        );
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: true });
    }

    // 2. Action: Test Telegram Connection
    if (body.action === 'test') {
      const testMsg = [
        `🟢 <b>PELACAK RADAR BOT: CONNECTION ACTIVE</b>`,
        ``,
        `Your Telegram alert notifications are successfully connected and online.`,
        `Real-time triggers for whale transactions, RSI extremes, and volume surges are enabled.`,
        ``,
        `⏱ <i>Time: ${new Date().toUTCString()}</i>`
      ].join('\n');

      const sendResult = await sendTelegramMessage(testMsg);
      if (sendResult.success) {
        return NextResponse.json({ success: true, message: 'Test message sent to Telegram successfully!' });
      } else {
        return NextResponse.json({ success: false, error: sendResult.error }, { status: 500 });
      }
    }

    // 3. Action: Run On-Demand Radar Scanner
    if (body.action === 'scan_and_alert') {
      const scanRes = await executeRadarScan(supabase);
      return NextResponse.json({
        success: true,
        scannedWallets: scanRes.scannedWallets,
        scannedCoins: scanRes.scannedCoins,
        alertsSent: scanRes.alertsSent,
        alerts: scanRes.alertSummaries
      });
    }

    // 4. Action: Custom Alert Dispatch
    if (body.action === 'send_alert' && body.type) {
      let msg = '';
      if (body.type === 'whale' && body.params) {
        msg = formatWhaleAlert(body.params);
      } else if (body.type === 'rsi' && body.params) {
        msg = formatRsiAlert(body.params);
      } else if (body.type === 'volume' && body.params) {
        msg = formatVolumeAlert(body.params);
      } else if (body.type === 'custom' && body.text) {
        msg = body.text;
      }

      if (msg) {
        const sendResult = await sendTelegramMessage(msg);
        return NextResponse.json({ success: sendResult.success, error: sendResult.error });
      }
    }

    return NextResponse.json({ error: 'Invalid or missing action parameter.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Core scanning routine that inspects database records and dispatches alerts
 */
async function executeRadarScan(supabase: any) {
  let scannedWallets = 0;
  let scannedCoins = 0;
  let alertsSent = 0;
  const alertSummaries: string[] = [];

  if (!supabase) {
    return { scannedWallets, scannedCoins, alertsSent, alertSummaries };
  }

  // 1. Scan Tracked Coins for RSI Extremes and Volume Surges
  try {
    const { data: coins } = await supabase.from('tracked_coins').select('*');
    if (coins && coins.length > 0) {
      scannedCoins = coins.length;

      for (const coin of coins) {
        // RSI Extreme check (simulated / stored in DB or recent indicator)
        if (coin.rsi !== undefined && coin.rsi !== null) {
          if (coin.rsi <= 30 || coin.rsi >= 70) {
            const rsiMsg = formatRsiAlert({
              symbol: coin.symbol || 'COIN',
              name: coin.name || coin.label || 'Tracked Asset',
              chain: coin.chain_network || 'Ethereum',
              rsi: Number(coin.rsi),
              priceUsd: coin.price_usd,
              change24h: coin.price_change_h24,
              contractAddress: coin.contract_address
            });
            await sendTelegramMessage(rsiMsg);
            alertsSent++;
            alertSummaries.push(`RSI alert sent for ${coin.symbol} (${coin.rsi})`);
          }
        }

        // Volume Surge check (> $1M)
        if (coin.volume_h24 && coin.volume_h24 >= 1_000_000) {
          const volMsg = formatVolumeAlert({
            symbol: coin.symbol || 'COIN',
            name: coin.name || coin.label || 'Tracked Asset',
            chain: coin.chain_network || 'Ethereum',
            volumeUsd: Number(coin.volume_h24),
            priceUsd: coin.price_usd,
            contractAddress: coin.contract_address
          });
          await sendTelegramMessage(volMsg);
          alertsSent++;
          alertSummaries.push(`Volume surge alert sent for ${coin.symbol} ($${coin.volume_h24})`);
        }
      }
    }
  } catch (err) {
    console.error('[RADAR SCAN] Error scanning coins:', err);
  }

  // 2. Scan Tracked Wallets
  try {
    const { data: wallets } = await supabase.from('watchlist').select('*');
    if (wallets) {
      scannedWallets = wallets.length;
    }
  } catch (err) {
    console.error('[RADAR SCAN] Error scanning wallets:', err);
  }

  return { scannedWallets, scannedCoins, alertsSent, alertSummaries };
}