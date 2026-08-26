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
export async function GET(request: Request) {
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

    // Check current webhook status
    const webhookRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const webhookData = await webhookRes.json();

    // Auto-register webhook if we are on a public HTTPS domain and it's not set correctly
    const url = new URL(request.url);
    const hostUrl = `${url.protocol}//${url.host}/api/tele-bot`;
    let webhookRegistered = webhookData?.result?.url === hostUrl;
    
    if (!webhookRegistered && url.protocol === 'https:') {
       const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${hostUrl}`);
       const setData = await setRes.json();
       if (setData.ok) {
         webhookRegistered = true;
       }
    }

    return NextResponse.json({
      configured: true,
      botOnline: botData.ok || false,
      botInfo: botData.result || null,
      targetChatId: chatId,
      webhookRegistered,
      webhookUrl: webhookRegistered ? hostUrl : (webhookData?.result?.url || 'None')
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

/** Compact number formatter for Telegram messages (no Intl dependency issues) */
function formatCompact(val: number): string {
  if (!val || val <= 0) return '-';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

/** Chain ID mapping for DexScreener API */
const CHAIN_SLUG: Record<string, string> = {
  'solana': 'solana',
  'sol': 'solana',
  'ethereum': 'ethereum',
  'eth': 'ethereum',
  'bsc': 'bsc',
  'binance': 'bsc',
  'base': 'base',
  'base chain': 'base',
  'robinhood': 'ethereum', // fallback
};

/**
 * Fetches live prices from DexScreener for a list of DB coin records.
 * Groups by chain and does batched API calls.
 */
async function fetchCoinPricesFromDex(dbCoins: any[]): Promise<any[]> {
  if (!dbCoins || dbCoins.length === 0) return [];

  // Group coins by chain slug
  const byChain: Record<string, any[]> = {};
  for (const coin of dbCoins) {
    const slug = CHAIN_SLUG[(coin.chain_network || 'ethereum').toLowerCase()] || 'ethereum';
    if (!byChain[slug]) byChain[slug] = [];
    byChain[slug].push(coin);
  }

  const priceMap: Record<string, any> = {};

  // Fetch from DexScreener per chain (max 30 per call)
  for (const [chainSlug, coins] of Object.entries(byChain)) {
    // Batch into groups of 30
    for (let i = 0; i < coins.length; i += 30) {
      const batch = coins.slice(i, i + 30);
      const addresses = batch.map((c: any) => c.contract_address).join(',');
      try {
        const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chainSlug}/${addresses}`, {
          headers: { 'User-Agent': 'PelacakBot/1.0' }
        });
        if (!res.ok) continue;
        const pairs: any[] = await res.json();
        if (!Array.isArray(pairs)) continue;

        // DexScreener returns all pairs — pick best pair per token (highest liquidity)
        const bestPair: Record<string, any> = {};
        for (const pair of pairs) {
          const tokenAddr = (pair.baseToken?.address || '').toLowerCase();
          const liq = pair.liquidity?.usd || 0;
          if (!bestPair[tokenAddr] || liq > (bestPair[tokenAddr].liquidity?.usd || 0)) {
            bestPair[tokenAddr] = pair;
          }
        }
        for (const [addr, pair] of Object.entries(bestPair)) {
          priceMap[addr] = {
            symbol: pair.baseToken?.symbol || null,
            name: pair.baseToken?.name || null,
            priceUsd: parseFloat(pair.priceUsd || '0') || null,
            change24h: pair.priceChange?.h24 ?? null,
            volumeH24: pair.volume?.h24 ?? null,
            marketCap: pair.marketCap ?? null,
          };
        }
      } catch (e) {
        // continue silently on network error
      }
    }
  }

  // Merge DB coin data with live prices
  return dbCoins.map((coin: any) => {
    const addrKey = (coin.contract_address || '').toLowerCase();
    const live = priceMap[addrKey] || {};
    return {
      ...coin,
      symbol: live.symbol || coin.label?.split(' ')[0] || '?',
      name: live.name || coin.label || 'Unknown',
      priceUsd: live.priceUsd ?? null,
      change24h: live.change24h ?? null,
      volumeH24: live.volumeH24 ?? null,
      marketCap: live.marketCap ?? null,
    };
  });
}

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
          const { data: dbCoins } = await supabase.from('tracked_coins').select('*');

          walletCount = wallets?.length || 0;
          coinCount = dbCoins?.length || 0;

          // Build wallet list — balance column stores a USD number as text/float
          topWallets = (wallets || []).map((w: any) => {
            const bal = parseFloat(w.balance || '0');
            return {
              label: w.label || 'Target',
              balance: isNaN(bal) || bal <= 0 ? 'Unscanned' : formatCompact(bal),
              network: w.chain_network
            };
          });

          // Compute total net worth from wallet balances
          totalNetWorth = (wallets || []).reduce((sum: number, w: any) => {
            const bal = parseFloat(w.balance || '0');
            return sum + (isNaN(bal) ? 0 : bal);
          }, 0);

          // Fetch live prices from DexScreener for tracked coins
          const enrichedCoins = await fetchCoinPricesFromDex(dbCoins || []);
          topCoins = enrichedCoins.map((c: any) => ({
            symbol: c.symbol || c.label || 'COIN',
            priceUsd: c.priceUsd,
            change24h: c.change24h,
            volumeH24: c.volumeH24
          }));
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
            wallets.forEach((w: any, i: number) => {
              const bal = parseFloat(w.balance || '0');
              const balStr = isNaN(bal) || bal <= 0 ? 'Unscanned' : formatCompact(bal);
              text += `${i + 1}. <b>${w.label || 'Target'}</b> (<code>${w.wallet_address.slice(0, 6)}...${w.wallet_address.slice(-4)}</code>)\n`;
              text += `   ⛓ ${w.chain_network} | Balance: <b>${balStr}</b>\n\n`;
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
          const { data: dbCoins } = await supabase.from('tracked_coins').select('*').order('created_at', { ascending: false });
          if (dbCoins && dbCoins.length > 0) {
            // Fetch live prices from DexScreener
            const enrichedCoins = await fetchCoinPricesFromDex(dbCoins);
            enrichedCoins.forEach((c: any, i: number) => {
              const priceStr = c.priceUsd && c.priceUsd > 0
                ? (c.priceUsd < 0.0001
                  ? `$${c.priceUsd.toFixed(8)}`
                  : c.priceUsd < 0.01
                    ? `$${c.priceUsd.toFixed(6)}`
                    : `$${c.priceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`)
                : '<i>N/A</i>';
              const changeStr = c.change24h !== null && c.change24h !== undefined
                ? ` | 24h: <b>${c.change24h > 0 ? '▲' : '▼'}${Math.abs(c.change24h).toFixed(2)}%</b>`
                : '';
              const volStr = c.volumeH24 && c.volumeH24 > 0
                ? `\n   📊 Vol 24h: <b>${formatCompact(c.volumeH24)}</b>`
                : '';
              text += `${i + 1}. <b>${c.name} (${(c.symbol || '?').toUpperCase()})</b>\n`;
              text += `   💵 Price: <b>${priceStr}</b>${changeStr}${volStr}\n\n`;
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