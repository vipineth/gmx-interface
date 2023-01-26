import { getMarketName, useMarketsData, useMarketsPoolsData, useOpenInterestData } from "domain/synthetics/markets";
import { convertToUsd, getTokenData, useAvailableTokensData } from "domain/synthetics/tokens";
import { BigNumber } from "ethers";
import { useChainId } from "lib/chains";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMarketsFeesConfigs } from "../fees/useMarketsFeesConfigs";
import {
  createSwapEstimator,
  findBestSwapPath,
  getBestMarketForPosition,
  getMarketsGraph,
  getMostAbundantMarketForSwap,
} from "./utils";
import { convertTokenAddress } from "config/tokens";

export type SwapRoute = {
  swapPath?: string[];
  positionMarketAddress?: string;
  mostLiquidMarketAddressForSwap?: string;
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

  const [positionMarketAddress, setPositionMarketAddress] = useState<string | undefined>();
  const [mostAbundantSwapMarketAddress, setMostAbundantSwapMarketAddress] = useState<string>();
  const [swapPath, setSwapPath] = useState<string[]>();

  const { marketsData } = useMarketsData(chainId);
  const { poolsData } = useMarketsPoolsData(chainId);
  const { openInterestData } = useOpenInterestData(chainId);
  const { marketsFeesConfigs } = useMarketsFeesConfigs(chainId);

  const { tokensData } = useAvailableTokensData(chainId);

  const isPosition =
    p.indexTokenAddress && p.initialColltaralAddress && p.targetCollateralAddress && p.isLong !== undefined;
  const isSwap = p.initialColltaralAddress && p.targetCollateralAddress && p.initialCollateralAmount;

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

      setSwapPath(swapPath);

      console.log(
        "swapPath",
        swapPath?.map((p) => getMarketName(marketsData, tokensData, p, false, false))
      );
    }, 10),
    [graph, marketsData, poolsData, openInterestData, tokensData, marketsFeesConfigs]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updatePositionMarketAddress = useCallback(
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

      setPositionMarketAddress(marketAddress);

      console.log("marketAddress", marketAddress);
    }, 300),
    [marketsData, poolsData, openInterestData, tokensData]
  );

  useEffect(
    function updateRoute() {
      if (isPosition) {
        const indexTokenAddress = convertTokenAddress(chainId, p.indexTokenAddress!, "wrapped");
        const initialCollateralAddress = convertTokenAddress(chainId, p.initialColltaralAddress!, "wrapped");
        const targetCollateralAddress = convertTokenAddress(chainId, p.targetCollateralAddress!, "wrapped");

        updateSwapPath(initialCollateralAddress, targetCollateralAddress, p.initialCollateralAmount);
        updatePositionMarketAddress(indexTokenAddress, targetCollateralAddress, p.sizeDeltaUsd, p.isLong);
      }

      if (isSwap) {
        const initialCollateralAddress = convertTokenAddress(chainId, p.initialColltaralAddress!, "wrapped");
        const targetCollateralAddress = convertTokenAddress(chainId, p.targetCollateralAddress!, "wrapped");

        updateSwapPath(initialCollateralAddress, targetCollateralAddress, p.initialCollateralAmount);
      }
    },
    [
      chainId,
      isPosition,
      isSwap,
      p.indexTokenAddress,
      p.initialCollateralAmount,
      p.initialColltaralAddress,
      p.isLong,
      p.sizeDeltaUsd,
      p.targetCollateralAddress,
      updatePositionMarketAddress,
      updateSwapPath,
    ]
  );

  useEffect(() => {
    const targetCollateralAddress = convertTokenAddress(chainId, p.targetCollateralAddress!, "wrapped");

    const market = getMostAbundantMarketForSwap(
      marketsData,
      poolsData,
      openInterestData,
      tokensData,
      targetCollateralAddress
    );

    setMostAbundantSwapMarketAddress(market);
  }, [chainId, marketsData, openInterestData, p.targetCollateralAddress, poolsData, tokensData]);

  return {
    swapPath,
    positionMarketAddress,
    mostLiquidMarketAddressForSwap: mostAbundantSwapMarketAddress,
  };
}
