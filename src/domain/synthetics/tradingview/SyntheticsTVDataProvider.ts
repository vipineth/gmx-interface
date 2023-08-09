import { OracleKeeperFetcher } from "config/oracleKeeper";
import { getChainlinkChartPricesFromGraph } from "domain/prices";
import { TVDataProvider } from "domain/tradingview/TVDataProvider";
import { Bar } from "domain/tradingview/types";
import { sleep } from "lib/sleep";

export class SyntheticsTVDataProvider extends TVDataProvider {
  candlesTimeout = 5000;

  override async getTokenChartPrice(chainId: number, ticker: string, period: string): Promise<Bar[]> {
    return Promise.race([
      OracleKeeperFetcher.getInstance(chainId).fetchCandles(ticker, period),
      sleep(this.candlesTimeout).then(() => Promise.reject(`Oracle candles timeout`)),
    ])
      .catch((ex) => {
        // eslint-disable-next-line no-console
        console.warn(ex, "Switching to graph chainlink data");
        return Promise.race([
          getChainlinkChartPricesFromGraph(ticker, period) as Promise<Bar[]>,
          sleep(this.candlesTimeout).then(() => Promise.reject(`Chainlink candles timeout`)),
        ]);
      })
      .catch((ex) => {
        // eslint-disable-next-line no-console
        console.warn("Load history candles failed", ex);
        return [] as Bar[];
      });
  }

  override getLimitBars(chainId: number, ticker: string, period: string, limit: number) {
    return OracleKeeperFetcher.getInstance(chainId).fetchLastOracleCandles(ticker, period, limit);
  }
}
