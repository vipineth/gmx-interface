import { MarketsData, MarketsPoolsData, getMarket, getOppositeCollateral } from "domain/synthetics/markets";
import { TokensData, convertToTokenAmount, convertToUsd, getTokenData } from "domain/synthetics/tokens";
import { BigNumber } from "ethers";
import { BASIS_POINTS_DIVISOR } from "lib/legacy";
import { applyFactor } from "lib/numbers";
import { getMarketFeesConfig } from ".";
import { MarketsFeesConfigsData, SwapStepFees as SwapFees, TotalSwapFees } from "../types";
import { applySwapImpactWithCap, getPriceImpactForSwap } from "./priceImpact";

export function getSwapPathFees(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  tokensData: TokensData,
  feesConfigs: MarketsFeesConfigsData,
  swapPath: string[] | undefined,
  tokenInAddress: string,
  amountIn: BigNumber | undefined
) {
  if (!swapPath?.length) return undefined;

  const swapStepsFees: SwapFees[] = [];

  let _amountIn = amountIn;
  let _tokenInAddress = tokenInAddress;

  for (let i = 0; i < swapPath.length - 1; i++) {
    const marketAddress = swapPath[i];

    const swapStepFees = getSwapFees(
      marketsData,
      poolsData,
      tokensData,
      feesConfigs,
      marketAddress,
      _tokenInAddress,
      _amountIn
    );

    if (!swapStepFees) return undefined;

    _amountIn = swapStepFees.amountOut;
    _tokenInAddress = swapStepFees.tokenOutAddress;

    swapStepsFees.push(swapStepFees);
  }

  return getTotalSwapFees(swapStepsFees);
}

export function getSwapFees(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  tokensData: TokensData,
  feesConfigs: MarketsFeesConfigsData,
  marketAddress: string | undefined,
  tokenInAddress: string | undefined,
  usdIn: BigNumber | undefined
): SwapFees | undefined {
  const feeConfig = getMarketFeesConfig(feesConfigs, marketAddress);
  const market = getMarket(marketsData, marketAddress);
  const tokenOutAddress = getOppositeCollateral(market, tokenInAddress);

  const tokenIn = getTokenData(tokensData, tokenInAddress);
  const tokenOut = getTokenData(tokensData, tokenOutAddress);

  if (
    !usdIn ||
    !feeConfig ||
    !marketAddress ||
    !tokenInAddress ||
    !tokenOutAddress ||
    !tokenIn?.prices ||
    !tokenOut?.prices
  ) {
    return undefined;
  }

  const amountIn = convertToTokenAmount(usdIn, tokenIn.decimals, tokenIn.prices.minPrice)!;

  const swapFeeAmount = applyFactor(amountIn, feeConfig.swapFeeFactor);
  const swapFeeUsd = convertToUsd(swapFeeAmount, tokenIn.decimals, tokenIn.prices.minPrice)!;
  const usdInAfterFees = usdIn.sub(swapFeeUsd);

  let amountInAfterFees = amountIn.sub(swapFeeAmount);
  let amountOut = convertToTokenAmount(usdInAfterFees, tokenOut.decimals, tokenOut.prices.maxPrice)!;

  const priceImpact = getPriceImpactForSwap(
    marketsData,
    poolsData,
    tokensData,
    feesConfigs,
    marketAddress,
    tokenInAddress,
    amountInAfterFees,
    amountOut.mul(-1)
  );

  if (!priceImpact) return undefined;

  let cappedImpactDeltaUsd: BigNumber;

  if (priceImpact.impactDeltaUsd.gt(0)) {
    const positiveImpactAmount = applySwapImpactWithCap(
      marketsData,
      poolsData,
      tokensData,
      marketAddress,
      tokenOutAddress,
      priceImpact
    );

    if (!positiveImpactAmount) return undefined;

    cappedImpactDeltaUsd = convertToUsd(positiveImpactAmount, tokenOut.decimals, tokenOut.prices.maxPrice)!;

    amountOut = amountOut.add(positiveImpactAmount);
  } else {
    const negativeImpactAmount = applySwapImpactWithCap(
      marketsData,
      poolsData,
      tokensData,
      marketAddress,
      tokenInAddress,
      priceImpact
    );

    if (!negativeImpactAmount) return undefined;

    cappedImpactDeltaUsd = convertToUsd(negativeImpactAmount, tokenIn.decimals, tokenIn.prices.minPrice)!;
    amountInAfterFees = amountInAfterFees.sub(negativeImpactAmount.mul(-1));
    amountOut = amountOut.sub(
      convertToTokenAmount(cappedImpactDeltaUsd.mul(-1), tokenOut.decimals, tokenOut.prices.maxPrice)!
    );
  }

  if (amountOut.lt(0)) {
    amountOut = BigNumber.from(0);
  }

  const totalFeeUsd = swapFeeUsd.add(cappedImpactDeltaUsd);

  return {
    swapFeeUsd,
    swapFeeAmount,
    totalFeeUsd,
    marketAddress,
    tokenInAddress,
    tokenOutAddress,
    cappedImpactDeltaUsd,
    amountInAfterFees,
    amountOut,
  };
}

export function getTotalSwapFees(swapStepsFees?: SwapFees[]): TotalSwapFees | undefined {
  if (!swapStepsFees?.length) return undefined;

  const totalFees: TotalSwapFees = {
    swaps: swapStepsFees,
    totalPriceImpact: {
      impactDeltaUsd: BigNumber.from(0),
      basisPoints: BigNumber.from(0),
    },
    totalSwapFeeUsd: BigNumber.from(0),
    totalFeeUsd: BigNumber.from(0),
    tokenInAddress: swapStepsFees[0].tokenInAddress,
    tokenOutAddress: swapStepsFees[swapStepsFees.length - 1].tokenOutAddress,
    amountOut: swapStepsFees[swapStepsFees.length - 1].amountOut,
  };

  for (const swapStep of swapStepsFees) {
    totalFees.totalSwapFeeUsd = totalFees.totalSwapFeeUsd.add(swapStep.swapFeeUsd);
    totalFees.totalPriceImpact.impactDeltaUsd = totalFees.totalPriceImpact.impactDeltaUsd.add(
      swapStep.cappedImpactDeltaUsd
    );
    totalFees.totalFeeUsd = totalFees.totalFeeUsd.add(swapStep.totalFeeUsd);
  }

  const amountIn = swapStepsFees[0].amountInAfterFees;

  totalFees.totalPriceImpact.basisPoints = amountIn.gt(0)
    ? totalFees.totalPriceImpact.impactDeltaUsd.mul(BASIS_POINTS_DIVISOR).div(amountIn)
    : BigNumber.from(0);

  return totalFees;
}
