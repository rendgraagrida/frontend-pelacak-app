import { NextResponse } from 'next/server';
import { RSI, MACD } from 'technicalindicators';

const NETWORK_MAP: Record<string, string> = {
  'ethereum': 'eth',
  'bsc': 'bsc',
  'base chain': 'base',
  'base': 'base',
  'robinhood': 'robinhood',
  'rh': 'robinhood',
  'solana': 'solana',
  'arbitrum': 'arbitrum',
  'polygon': 'polygon_pos'
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contract_address = searchParams.get('contract_address');
  const chain_network = searchParams.get('chain_network');

  if (!contract_address || !chain_network) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const networkSlug = NETWORK_MAP[chain_network.toLowerCase()] || 'eth';
  const cleanAddress = contract_address.trim().toLowerCase(); 
  const addr = chain_network.toLowerCase() === 'solana' ? contract_address.trim() : cleanAddress;

  try {
    // 1. Fetch Top Pool for the Token
    const poolRes = await fetch(`https://api.geckoterminal.com/api/v2/networks/${networkSlug}/tokens/${addr}/pools?page=1`, {
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    if (!poolRes.ok) {
      return NextResponse.json({ rsi: null, macd: null, error: 'Failed to fetch pools (GeckoTerminal)' }, { status: 200 });
    }
    
    const poolJson = await poolRes.json();
    const pools = poolJson.data;

    if (!pools || pools.length === 0) {
      return NextResponse.json({ rsi: null, macd: null, error: 'No pools found for this token' }, { status: 200 });
    }

    const topPoolAddress = pools[0].attributes.address;

    // 2. Fetch OHLCV data (Hourly)
    const ohlcvRes = await fetch(`https://api.geckoterminal.com/api/v2/networks/${networkSlug}/pools/${topPoolAddress}/ohlcv/hour?limit=100`, {
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    if (!ohlcvRes.ok) {
      return NextResponse.json({ rsi: null, macd: null, error: 'Failed to fetch OHLCV (GeckoTerminal)' }, { status: 200 });
    }

    const ohlcvJson = await ohlcvRes.json();
    const ohlcvList = ohlcvJson.data?.attributes?.ohlcv_list; // [timestamp, open, high, low, close, volume][]

    if (!ohlcvList || ohlcvList.length === 0) {
      return NextResponse.json({ rsi: null, macd: null, error: 'No OHLCV data available' }, { status: 200 });
    }

    // GeckoTerminal OHLCV is returned newest to oldest. We need oldest to newest.
    const reversedList = [...ohlcvList].reverse();
    const closes = reversedList.map((candle: number[]) => candle[4]);

    // 3. Calculate Technical Indicators
    const rsiInput = { values: closes, period: 14 };
    const rsiResult = RSI.calculate(rsiInput);

    const macdInput = {
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    };
    const macdResult = MACD.calculate(macdInput);

    const latestRSI = rsiResult.length > 0 ? rsiResult[rsiResult.length - 1] : null;
    const latestMACD = macdResult.length > 0 ? macdResult[macdResult.length - 1] : null;

    return NextResponse.json({
      rsi: latestRSI,
      macd: latestMACD,
      pool: topPoolAddress
    });

  } catch (error: any) {
    console.error('Error fetching indicators:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
