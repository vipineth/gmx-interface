import { OracleKeeperFetcher } from "config/oracleKeeper";
import useSWR from "swr";
import { TokenPricesData } from "./types";

type TokenPricesDataResult = {
  pricesData?: TokenPricesData;
  updatedAt?: number;
};

export function useTokenRecentPrices(chainId: number): TokenPricesDataResult {
  const { data } = useSWR([chainId], {
    fetcher: async (chainId) => {
      const pricesData = await OracleKeeperFetcher.getInstance(chainId).fetchTickers();

      return {
        pricesData: pricesData.data,
        updatedAt: Date.now(),
      };
    },
  });

  return {
    pricesData: data?.pricesData,
    updatedAt: data?.updatedAt,
  };
}
