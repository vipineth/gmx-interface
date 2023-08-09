import { sleep } from "lib/sleep";
import { ARBITRUM, ARBITRUM_GOERLI, AVALANCHE, AVALANCHE_FUJI } from "./chains";
import { sample } from "lodash";
import queryString from "query-string";
import { NATIVE_TOKEN_ADDRESS, getNormalizedTokenSymbol, getToken, getV2Tokens, getWrappedToken } from "./tokens";
import { timezoneOffset } from "domain/prices";
import { Bar } from "domain/tradingview/types";
import { TokenPricesData, parseOraclePrice } from "domain/synthetics/tokens";
import { expandDecimals } from "lib/numbers";
import { USD_DECIMALS } from "lib/legacy";

const ORACLE_KEEPER_URLS = {
  [ARBITRUM]: ["https://arbitrum.gmx-oracle.io", "https://arbitrum-2.gmx-oracle.io"],

  [AVALANCHE]: ["https://avalanche.gmx-oracle.io", "https://avalanche-2.gmx-oracle.io"],

  [ARBITRUM_GOERLI]: ["https://oracle-api-arb-goerli-xyguy.ondigitalocean.app"],

  [AVALANCHE_FUJI]: ["https://gmx-oracle-keeper-ro-avax-fuji-d4il9.ondigitalocean.app"],

  default: ["https://gmx-oracle-keeper-ro-avax-fuji-d4il9.ondigitalocean.app"],
};

export function getOracleKeeperRandomUrl(chainId: number, bannedUrls?: string[]) {
  const urls = ORACLE_KEEPER_URLS[chainId] || ORACLE_KEEPER_URLS.default;

  if (bannedUrls?.length && bannedUrls.length < urls.length) {
    return urls.filter((url) => !bannedUrls.includes(url))[0];
  }

  return sample(urls);

  // const qs = query ? `?${queryString.stringify(query)}` : "";

  // return `${baseUrl}${path}${qs}`;
}

type TickersResponse = {
  minPrice: string;
  maxPrice: string;
  oracleDecimals: number;
  tokenSymbol: string;
  tokenAddress: string;
  updatedAt: number;
}[];

export class OracleKeeperFetcher {
  bannedUrls: string[] = [];
  currentUrl: string;

  static instances: { [chainId: number]: OracleKeeperFetcher } = {};

  static getInstance(chainId: number) {
    if (!OracleKeeperFetcher.instances[chainId]) {
      OracleKeeperFetcher.instances[chainId] = new OracleKeeperFetcher(chainId);
    }

    return OracleKeeperFetcher.instances[chainId];
  }

  constructor(public chainId: number) {
    this.currentUrl = getOracleKeeperRandomUrl(chainId);
  }

  public async fetchTickers() {
    const data = await this.request("/prices/tickers", { validate: (data) => Array.isArray(data) && data.length > 0 });

    const result = this.parseTickers(data);

    return {
      data: result,
    };
  }

  public async fetchCandles(tokenSymbol: string, period: string): Promise<Bar[]> {
    tokenSymbol = getNormalizedTokenSymbol(tokenSymbol);
    const limit = 5000;

    const data = await this.request("/prices/candles", {
      query: { tokenSymbol, period, limit },
      validate: (data) => Array.isArray(data.candles) && data.candles.length > 0,
    });

    const result = data.candles.map((candle) => this.parseOracleCandle(candle)).reverse();

    return result;
  }

  public async fetchLastOracleCandles(tokenSymbol: string, period: string, limit: number): Promise<Bar[]> {
    tokenSymbol = getNormalizedTokenSymbol(tokenSymbol);

    const data = await this.request("/prices/candles", {
      query: { tokenSymbol, period, limit },
      validate: (data) => Array.isArray(data.candles) && data.candles.length > 0,
    });

    const result = data.candles.map((candle) => this.parseOracleCandle(candle));

    return result;
  }

  parseOracleCandle(rawCandle: number[]): Bar {
    const [timestamp, open, high, low, close] = rawCandle;

    return {
      time: timestamp + timezoneOffset,
      open,
      high,
      low,
      close,
    };
  }

  parseTickers(data: { minPrice: string; maxPrice: string; oracleDecimals: number; tokenAddress: string }[]) {
    const result: TokenPricesData = {};

    data.forEach((priceItem) => {
      let tokenConfig: any;

      try {
        tokenConfig = getToken(this.chainId, priceItem.tokenAddress);
      } catch (e) {
        // ignore unknown token errors
        return;
      }

      result[tokenConfig.address] = {
        minPrice: parseOraclePrice(priceItem.minPrice, tokenConfig.decimals, priceItem.oracleDecimals),
        maxPrice: parseOraclePrice(priceItem.maxPrice, tokenConfig.decimals, priceItem.oracleDecimals),
      };
    });

    const stableTokens = getV2Tokens(this.chainId).filter((token) => token.isStable);

    stableTokens.forEach((token) => {
      if (!result[token.address]) {
        result[token.address] = {
          minPrice: expandDecimals(1, USD_DECIMALS),
          maxPrice: expandDecimals(1, USD_DECIMALS),
        };
      }
    });

    const wrappedToken = getWrappedToken(this.chainId);

    if (result[wrappedToken.address] && !result[NATIVE_TOKEN_ADDRESS]) {
      result[NATIVE_TOKEN_ADDRESS] = result[wrappedToken.address];
    }

    return result;
  }

  // check for attempts
  request(
    path: string,
    opts: { query?: any; timeout?: number; validate?: (data: any) => boolean; retries?: number } = {}
  ) {
    const { query, timeout = 2000, validate } = opts;

    const requestFn = () => {
      const url = this.buildUrl(path, query);

      return Promise.race([
        fetch(url),
        sleep(timeout).then(() => Promise.reject(`oracle keeper request timeout ${url}`)),
      ])
        .then((res) => res.json())
        .then((data) => {
          if (validate && !validate(data)) {
            return Promise.reject(`oracle keeper request validation failed ${url}`);
          }

          return data;
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error("oracle keeper request failed", e);

          this.fallback();

          return requestFn();
        });
    };

    return requestFn();
  }

  buildUrl(path: string, query?: any) {
    const qs = query ? `?${queryString.stringify(query)}` : "";

    return `${this.currentUrl}${path}${qs}`;
  }

  fallback() {
    this.bannedUrls.push(this.currentUrl);
    this.currentUrl = getOracleKeeperRandomUrl(this.chainId, this.bannedUrls);
  }
}
