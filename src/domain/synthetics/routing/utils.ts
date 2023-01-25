import {
  MarketsData,
  MarketsOpenInterestData,
  MarketsPoolsData,
  getAvailableUsdLiquidityForCollateral,
  getAvailableUsdLiquidityForPosition,
  getMarkets,
} from "domain/synthetics/markets";
import { BigNumber } from "ethers";
import { MarketsFeesConfigsData, getSwapFees } from "../fees";
import { TokensData, convertToUsd, getTokenData } from "../tokens";
import { Edge, MarketsGraph, SwapEstimator } from "./types";

export function getBestMarketForPosition(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  openInterestData: MarketsOpenInterestData,
  tokensData: TokensData,
  indexTokenAddress: string,
  collateralTokenAddress?: string,
  sizeDeltaUsd?: BigNumber,
  isLong?: boolean
) {
  if (!collateralTokenAddress || !sizeDeltaUsd || !indexTokenAddress || typeof isLong === "undefined") return undefined;

  const markets = getMarkets(marketsData);

  let bestMarketAddress: string | undefined;
  let bestLiquidity: BigNumber | undefined;

  for (const m of markets) {
    if (
      [m.longTokenAddress, m.shortTokenAddress].includes(collateralTokenAddress) &&
      m.indexTokenAddress === indexTokenAddress
    ) {
      const liquidity = getAvailableUsdLiquidityForPosition(
        marketsData,
        poolsData,
        openInterestData,
        tokensData,
        m.marketTokenAddress,
        isLong
      );

      if (liquidity?.gte(sizeDeltaUsd) && (!bestLiquidity || liquidity.lt(bestLiquidity))) {
        bestMarketAddress = m.marketTokenAddress;
        bestLiquidity = liquidity;
      }
    }
  }

  return bestMarketAddress;
}

export function getMarketsGraph(marketsData: MarketsData): MarketsGraph {
  const markets = getMarkets(marketsData);

  const graph: MarketsGraph = {
    abjacencyList: {},
    edges: [],
    marketsData,
  };

  for (const m of markets) {
    const { longTokenAddress, shortTokenAddress, marketTokenAddress } = m;

    if (longTokenAddress === shortTokenAddress) {
      continue;
    }

    const longShortEdge: Edge = {
      marketAddress: marketTokenAddress,
      from: longTokenAddress,
      to: shortTokenAddress,
    };

    const shortLongEdge: Edge = {
      marketAddress: marketTokenAddress,
      from: shortTokenAddress,
      to: longTokenAddress,
    };

    graph.abjacencyList[longTokenAddress] = graph.abjacencyList[longTokenAddress] || [];
    graph.abjacencyList[longTokenAddress].push(longShortEdge);
    graph.abjacencyList[shortTokenAddress] = graph.abjacencyList[shortTokenAddress] || [];
    graph.abjacencyList[shortTokenAddress].push(shortLongEdge);

    graph.edges.push(longShortEdge, shortLongEdge);
  }

  return graph;
}

export const createSwapEstimator = (
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  openInterestData: MarketsOpenInterestData,
  tokensData: TokensData,
  feeConfigs: MarketsFeesConfigsData
) => {
  return (e: Edge, usdIn: BigNumber) => {
    const outToken = getTokenData(tokensData, e.to);

    const outLiquidity = getAvailableUsdLiquidityForCollateral(
      marketsData,
      poolsData,
      openInterestData,
      tokensData,
      e.marketAddress,
      e.to
    );

    const swapFee = getSwapFees(marketsData, poolsData, tokensData, feeConfigs, e.marketAddress, e.from, usdIn);
    const usdOut = convertToUsd(swapFee?.amountOut, outToken?.decimals, outToken?.prices?.maxPrice);

    if (!usdOut || !outLiquidity?.gt(usdOut)) {
      return BigNumber.from(0);
    }

    return usdOut;
  };
};

export function findBestSwapPath(
  graph: MarketsGraph,
  from: string,
  to: string,
  usdIn: BigNumber,
  estimator: SwapEstimator
) {
  if (from === to) {
    return [];
  }

  const path = bellmanFord(graph, from, to, usdIn, estimator);

  if (path?.length) {
    return path;
  } else {
    return undefined;
  }
}

export function bellmanFord(graph: MarketsGraph, from: string, to: string, usdIn: BigNumber, estimator: SwapEstimator) {
  const edges = graph.edges;
  const nodes = Object.keys(graph.abjacencyList);

  if (!nodes.includes(from) || !nodes.includes(to)) {
    return undefined;
  }

  const usdOut = {};
  const previous: { [token: string]: Edge | null } = {};

  for (const node of nodes) {
    usdOut[node] = BigNumber.from(0);
    previous[node] = null;
  }

  usdOut[from] = usdIn;

  for (let i = 0; i < nodes.length; i++) {
    for (const edge of edges) {
      const { from, to } = edge;
      const swapUsdOut = estimator(edge, usdOut[from]);

      if (swapUsdOut.gt(usdOut[to])) {
        usdOut[to] = swapUsdOut;
        previous[to] = edge;
      }
    }
  }

  for (const edge of edges) {
    const { from, to } = edge;
    const swapUsdOut = estimator(edge, usdOut[from]);

    if (swapUsdOut.gt(usdOut[to])) {
      throw new Error("Negative cycle detected");
    }
  }

  const path: Edge[] = [];
  let e = previous[to];

  while (e) {
    path.push(e);
    e = previous[e.from];
  }

  return path.reverse();
}
