import { useMarketsData, useMarketsPoolsData, useOpenInterestData } from "domain/synthetics/markets";
import { convertToUsd, getTokenData, useAvailableTokensData } from "domain/synthetics/tokens";
import { BigNumber } from "ethers";
import { useChainId } from "lib/chains";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TotalSwapFees, getSwapPathFees } from "../fees";
import { useMarketsFeesConfigs } from "../fees/useMarketsFeesConfigs";
import { createSwapEstimator, findBestSwapPath, getBestMarketForPosition, getMarketsGraph } from "./utils";

export type SwapRoute = {
  swapPath?: string[];
  marketAddress?: string;
  totalSwapFees?: TotalSwapFees;
};

export function useSwapRoute(p: {
  initialColltaralAddress: string | undefined;
  targetCollateralAddress: string | undefined;
  indexTokenAddress: string | undefined;
  initialCollateralAmount: BigNumber | undefined;
  sizeDeltaUsd: BigNumber | undefined;
  isLong: boolean | undefined;
}): SwapRoute {
  const { chainId } = useChainId();

  const [marketAddress, setMarketAddress] = useState<string | undefined>();
  const [swapPath, setSwapPath] = useState<string[]>();
  const [totalSwapFees, setTotalSwapFees] = useState<TotalSwapFees>();

  const { marketsData } = useMarketsData(chainId);
  const { poolsData } = useMarketsPoolsData(chainId);
  const { openInterestData } = useOpenInterestData(chainId);
  const { tokensData } = useAvailableTokensData(chainId);
  const { marketsFeesConfigs } = useMarketsFeesConfigs(chainId);

  const graph = useMemo(() => {
    return getMarketsGraph(marketsData);
  }, [marketsData]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateSwapPath = useCallback(
    debounce((from: string, to: string, amountIn: BigNumber) => {
      const fromToken = getTokenData(tokensData, from);

      const estimator = createSwapEstimator(marketsData, poolsData, openInterestData, tokensData, marketsFeesConfigs);

      const usdIn = convertToUsd(amountIn, fromToken?.decimals, fromToken?.prices?.minPrice);

      if (!usdIn) {
        return;
      }

      const swapPathEdges = findBestSwapPath(graph, from, to, usdIn, estimator);
      const swapPath = swapPathEdges?.map((e) => e.marketAddress);
      const totalSwapFees = getSwapPathFees(
        marketsData,
        poolsData,
        tokensData,
        marketsFeesConfigs,
        swapPath,
        from,
        amountIn
      );

      setSwapPath(swapPath);
      setTotalSwapFees(totalSwapFees);

      console.log("swapPath", {
        swapPath,
        totalSwapFees,
      });
    }, 300),
    [graph, marketsData, poolsData, openInterestData, tokensData, marketsFeesConfigs]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateMarketAddress = useCallback(
    debounce((indexToken: string, collateralToken: string, sizeDeltaUsd: BigNumber, isLong: boolean) => {
      const marketAddress = getBestMarketForPosition(
        marketsData,
        poolsData,
        openInterestData,
        tokensData,
        indexToken,
        collateralToken,
        sizeDeltaUsd,
        isLong
      );

      setMarketAddress(marketAddress);

      console.log("marketAddress", marketAddress);
    }, 300),
    [marketsData, poolsData, openInterestData, tokensData]
  );

  useEffect(
    function update() {
      const isPosition = p.indexTokenAddress && p.initialCollateralAmount && p.sizeDeltaUsd && p.isLong !== undefined;
      const isSwap = p.initialColltaralAddress && p.targetCollateralAddress && p.initialCollateralAmount;

      if (isPosition) {
        updateSwapPath(p.initialColltaralAddress, p.targetCollateralAddress, p.initialCollateralAmount);
        updateMarketAddress(p.indexTokenAddress, p.initialColltaralAddress, p.sizeDeltaUsd, p.isLong);
      }

      if (isSwap) {
        updateSwapPath(p.initialColltaralAddress, p.targetCollateralAddress, p.initialCollateralAmount);
      }
    },
    [
      p.indexTokenAddress,
      p.initialCollateralAmount,
      p.initialColltaralAddress,
      p.isLong,
      p.sizeDeltaUsd,
      p.targetCollateralAddress,
      updateMarketAddress,
      updateSwapPath,
    ]
  );

  return {
    swapPath,
    totalSwapFees,
    marketAddress,
  };
}
