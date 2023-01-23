import { NATIVE_TOKEN_ADDRESS } from "config/tokens";
import { MarketsData, MarketsPoolsData, getPoolUsd } from "domain/synthetics/markets";
import {
  TokensData,
  convertToContractPrice,
  convertToTokenAmount,
  convertToUsd,
  getTokenData,
} from "domain/synthetics/tokens";
import { BigNumber } from "ethers";
import { BASIS_POINTS_DIVISOR, USD_DECIMALS } from "lib/legacy";
import { applyFactor, expandDecimals, formatAmount, formatUsd, parseValue } from "lib/numbers";
import { ExecutionFeeParams, MarketsFeesConfigsData, SwapStepFees as SwapFees, TotalSwapFees } from "../types";
import { applySwapImpactWithCap, getPriceImpactForSwap } from "./priceImpact";

export * from "./priceImpact";

export function getMarketFeesConfig(feeConfigsData: MarketsFeesConfigsData, marketAddress: string | undefined) {
  if (!marketAddress) return undefined;

  return feeConfigsData[marketAddress];
}

export function getIncreaseOrderFees() {}

export function getDecreaseOrderFees() {}

export function getSwapFees(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  tokensData: TokensData,
  feesConfigs: MarketsFeesConfigsData,
  marketAddress: string | undefined,
  tokenInAddress: string | undefined,
  tokenOutAddress: string | undefined,
  amountIn: BigNumber | undefined
): SwapFees | undefined {
  const feeConfig = getMarketFeesConfig(feesConfigs, marketAddress);
  const tokenIn = getTokenData(tokensData, tokenInAddress);
  const tokenOut = getTokenData(tokensData, tokenOutAddress);

  if (
    !feeConfig ||
    !marketAddress ||
    !tokenInAddress ||
    !tokenOutAddress ||
    !tokenIn?.prices ||
    !tokenOut?.prices ||
    !amountIn?.gt(0)
  ) {
    return undefined;
  }

  const swapFeeAmount = applyFactor(amountIn, feeConfig.swapFeeFactor);
  const swapFeeUsd = convertToUsd(swapFeeAmount, tokenIn.decimals, tokenIn.prices.maxPrice)!;

  let amountInAfterFees = amountIn.sub(swapFeeAmount);

  const priceImpact = getPriceImpactForSwap(
    marketsData,
    poolsData,
    tokensData,
    feesConfigs,
    marketAddress,
    tokenInAddress,
    tokenOutAddress,
    amountInAfterFees,
    amountInAfterFees.mul(-1)
  );

  if (!priceImpact) return undefined;

  const inPriceMin = convertToContractPrice(tokenIn.prices.minPrice, tokenIn.decimals);
  const outPriceMax = convertToContractPrice(tokenOut.prices.maxPrice, tokenOut?.decimals);

  let cappedImpactDeltaUsd: BigNumber;

  // round amountOut down
  let amountOut: BigNumber = amountIn.mul(inPriceMin).div(outPriceMax);

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

// export function getDepositFees(depositAmount: BigNumber, swapFeeFactor: BigNumber) {
// //   return getSwapFees(depositAmount, swapFeeFactor);
// }

// export function getWithdrawalFees(
//   longTokenOutAmount: BigNumber,
//   shortTokenOutAmount: BigNumber,
//   marketFeeFactor: BigNumber
// ) {
//   const longFees = getSwapFees(longTokenOutAmount, marketFeeFactor);
//   const shortFees = getSwapFees(shortTokenOutAmount, marketFeeFactor);

//   return {
//     longFees,
//     shortFees,
//   };
// }

export function getExecutionFee(tokensData: TokensData): ExecutionFeeParams | undefined {
  const nativeToken = getTokenData(tokensData, NATIVE_TOKEN_ADDRESS);

  if (!nativeToken?.prices) return undefined;

  const feeUsd = expandDecimals(1, 28);
  const feeTokenAmount = convertToTokenAmount(feeUsd, nativeToken.decimals, nativeToken.prices.maxPrice);

  return {
    feeUsd: feeUsd,
    feeTokenAmount,
    feeToken: nativeToken,
  };
}

export function getSwapFee(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  tokensData: TokensData,
  priceImpactConfigsData: any,
  market: string,
  fromToken: string,
  toToken: string,
  usdAmount: BigNumber
) {
  const fromPoolUsd = getPoolUsd(marketsData, poolsData, tokensData, market, fromToken, "midPrice");
  const toPoolUsd = getPoolUsd(marketsData, poolsData, tokensData, market, toToken, "midPrice");

  const fromDelta = usdAmount;
  const toDelta = BigNumber.from(0).sub(usdAmount);

  const priceImpact = undefined as any;

  if (!priceImpact) return undefined;

  // TODO: get swap fee from contract
  const swapFee = BigNumber.from(0).sub(parseValue("0.01", USD_DECIMALS)!);

  return {
    swapFee,
    priceImpact,
  };
}

export function formatFee(feeUsd?: BigNumber, feeBp?: BigNumber) {
  if (!feeUsd?.abs().gt(0)) {
    return "...";
  }
  const isNegative = feeUsd.lt(0);

  return feeBp ? `${isNegative ? "-" : ""}${formatAmount(feeBp, 2, 2)}% (${formatUsd(feeUsd)})` : formatUsd(feeUsd);
}
