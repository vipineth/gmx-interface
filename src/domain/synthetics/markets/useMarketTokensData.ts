import { getContract } from "config/contracts";
import { useMulticall } from "lib/multicall";
import SyntheticsReader from "abis/SyntheticsReader.json";
import Token from "abis/Token.json";
import { TokenPriceData } from "../tokens/types";
import { useWhitelistedTokensData } from "../tokens/useTokensData";
import { getTokenPriceData, tryWrapToken } from "../tokens/utils";
import { useMarkets } from "./useMarkets";
import { getMarket, getMarkets } from "./utils";
import { Account } from "domain/account";
import { BigNumber } from "ethers";
import { useMemo } from "react";
import { SyntheticsMarket } from "./types";

export type MarketTokensData = {
  markets: {
    [address: string]: SyntheticsMarket;
  };
  poolAmounts: {
    [address: string]: {
      long: BigNumber;
      short: BigNumber;
    };
  };
  balances: {
    [address: string]: BigNumber;
  };
  price: {
    [address: string]: {
      minPrice: BigNumber;
      maxPrice: BigNumber;
    };
  };
  totalSupplies: {
    [address: string]: BigNumber;
  };
};

export function useMarketTokensData(chainId: number, p: { account?: Account }) {
  const dataStoreAddress = getContract(chainId, "DataStore");
  const tokensData = useWhitelistedTokensData(chainId, {});
  const marketsData = useMarkets(chainId);

  const markets = getMarkets(marketsData);
  const marketAddresses = markets.map((market) => market.marketTokenAddress);

  const { data: marketTokensData } = useMulticall(chainId, "useMarketTokensData", {
    key: marketAddresses.length > 0 ? [p.account, marketAddresses.join("-")] : null,
    request: marketAddresses.reduce((requests, marketAddress) => {
      const market = getMarket(marketsData, marketAddress);

      const longPrice = formatPriceData(getTokenPriceData(tokensData, market!.longTokenAddress));
      const shortPrice = formatPriceData(getTokenPriceData(tokensData, market!.shortTokenAddress));
      const indexPrice = formatPriceData(getTokenPriceData(tokensData, market!.indexTokenAddress));

      const marketProps = {
        marketToken: market!.marketTokenAddress,
        longToken: tryWrapToken(chainId, market!.longTokenAddress),
        shortToken: tryWrapToken(chainId, market!.shortTokenAddress),
        indexToken: market!.indexTokenAddress,
        data: market!.data,
      };

      const includePrices = Boolean(longPrice && shortPrice && indexPrice);

      requests[`${marketAddress}-reader`] = {
        contractAddress: getContract(chainId, "SyntheticsReader"),
        abi: SyntheticsReader.abi,
        calls: {
          longPoolAmount: {
            methodName: "getPoolAmount",
            params: [dataStoreAddress, marketAddress, market!.longTokenAddress],
          },
          shortPoolAmount: {
            methodName: "getPoolAmount",
            params: [dataStoreAddress, marketAddress, market!.shortTokenAddress],
          },
          minPrice: includePrices
            ? {
                methodName: "getMarketTokenPrice",
                params: [dataStoreAddress, marketProps, longPrice, shortPrice, indexPrice, false],
              }
            : undefined,
          maxPrice: includePrices
            ? {
                methodName: "getMarketTokenPrice",
                params: [dataStoreAddress, marketProps, longPrice, shortPrice, indexPrice, true],
              }
            : undefined,
        },
      };

      requests[`${marketAddress}-token`] = {
        contractAddress: marketAddress,
        abi: Token.abi,
        calls: {
          totalSupply: {
            methodName: "totalSupply",
            params: [],
          },
          balance: p.account
            ? {
                methodName: "balanceOf",
                params: [p.account],
              }
            : undefined,
        },
      };

      return requests;
    }, {}),
    parseResponse: (res) =>
      marketAddresses.reduce(
        (marketTokensData, address) => {
          const readerData = res[`${address}-reader`];
          const tokenData = res[`${address}-token`];

          marketTokensData.poolAmount[address] = {
            long: readerData.longPoolAmount.returnValues[0],
            short: readerData.shortPoolAmount.returnValues[0],
          };

          if (readerData.minPrice && readerData.maxPrice) {
            marketTokensData.prices[address] = {
              minPrice: readerData.minPrice.returnValues[0],
              maxPrice: readerData.maxPrice.returnValues[0],
            };
          }

          marketTokensData.poolAmount[address] = {
            long: readerData.longPoolAmount.returnValues[0],
            short: readerData.shortPoolAmount.returnValues[0],
          };

          marketTokensData.totalSupplies[address] = tokenData.totalSupply.returnValues[0];
          marketTokensData.balances[address] = tokenData.balance?.returnValues[0];

          return marketTokensData;
        },
        { poolAmount: {}, balances: {}, totalSupplies: {}, prices: {} } as any
      ),
  });

  return useMemo(() => {
    return (
      marketTokensData || {
        poolAmount: {},
        balances: {},
        totalSupplies: {},
        prices: {},
      }
    );
  }, [marketTokensData]);
}

function formatPriceData(price?: TokenPriceData) {
  if (!price) return undefined;

  return {
    min: price.minPrice,
    max: price.maxPrice,
  };
}
