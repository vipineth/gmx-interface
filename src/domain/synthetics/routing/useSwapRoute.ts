import { BigNumber } from "ethers";
import { useChainId } from "lib/chains";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SwapStepFees, TotalSwapFees } from "../fees";
import { useMarketsData } from "../markets";
import { getMarketsGraph } from "../exchange";

export type SwapRouteResult = {
  swapPath?: string[];
  marketAddress?: string;
  swapFees?: SwapStepFees[];
  totalSwapFees?: TotalSwapFees;
};

/**
 * cases:
 * - for swaps
 *  - find best swappath
 * - for positions increase
 *  * find best market based on collateral Amount and sizeDeltaUsd
 * - for positions decrease (receive token)
 */
export function useSwapRoute(p: {
  initialColltaralAddress?: string;
  targetCollateralAddress?: string;
  indexTokenAddress?: string;
  initialCollateralAmount?: BigNumber;
  sizeDeltaUsd?: BigNumber;
}) {
  const { chainId } = useChainId();

  const [marketAddress, setMarketAddress] = useState<string | undefined>(() => p.marketAddress || undefined);
  const [swapPath, setSwapPath] = useState<string[]>();
  const [swapFees, setSwapFees] = useState<SwapStepFees[]>();
  const [totalSwapFees, setTotalSwapFees] = useState<TotalSwapFees>();

  const { marketsData } = useMarketsData(chainId);

  const graph = useMemo(() => {
    return getMarketsGraph(marketsData);
  }, [marketsData]);

  const debouncedUpdateSwapPath = useCallback(
    debounce((swapParams: SwapParams) => {
      // const swapPath = findSwapPath(swapParams, graph);
      // setSwapPath(swapPath?.map((p) => p.market));
      // setSwapFeesUsd(swapPath?.reduce((acc, p) => acc.add(p.feeUsd), BigNumber.from(0)));
      // setMarket(undefined);
      // setFullSwapPath(swapPath);
    }, 10),
    [graph]
  );

  useEffect(function updateSwapPath() {
    // const bestSwapPathResult = findBestSwapPath(
    //   graph,
    //   p.initialColltaralAddress,
    //   p.targetCollateralAddress,
    //   p.initialCollateralAmount
    // );
  }, []);

  return {
    swapPath,
    swapFees,
    totalSwapFees,
    marketAddress,
  };
}
