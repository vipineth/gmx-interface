import { getOracleKeeperUrl } from "config/oracleKeeper";
import { getNormalizedTokenSymbol } from "config/tokens";
import { timezoneOffset } from "domain/prices";
import { Bar } from "domain/tradingview/types";

export async function fetchLastOracleCandles(
  chainId: number,
  tokenSymbol: string,
  period: string,
  limit: number
): Promise<Bar[]> {
  tokenSymbol = getNormalizedTokenSymbol(tokenSymbol);

  const url = getOracleKeeperUrl(chainId, "/prices/candles", { tokenSymbol, limit, period });

  const res = await fetch(url).then((res) => res.json());

  const result = res.candles.map(parseOracleCandle);

  return result;
}

export async function fetchOracleCandles(chainId: number, tokenSymbol: string, period: string): Promise<Bar[]> {
  tokenSymbol = getNormalizedTokenSymbol(tokenSymbol);

  const limit = 5000;

  const url = getOracleKeeperUrl(chainId, "/prices/candles", { tokenSymbol, period, limit });

  const res = await fetch(url).then((res) => res.json());

  const result = res.candles.map(parseOracleCandle).reverse();

  return result;
}

function parseOracleCandle(rawCandle: number[]): Bar {
  const [timestamp, open, high, low, close] = rawCandle;

  return {
    time: timestamp + timezoneOffset,
    open,
    high,
    low,
    close,
  };
}
