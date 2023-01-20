import {
  MarketsData,
  MarketsOpenInterestData,
  MarketsPoolsData,
  getMarket,
  getMarketPools,
  getOpenInterest,
  getPoolUsd,
} from "domain/synthetics/markets";
import { TokensData, convertToContractPrice, convertToUsd, getMidPrice, getTokenData } from "domain/synthetics/tokens";
import { BigNumber } from "ethers";
import { BASIS_POINTS_DIVISOR } from "lib/legacy";
import { applyFactor, bigNumberify, expandDecimals, roundUpDivision } from "lib/numbers";
import { getMarketFeesConfig } from ".";
import { MarketsFeesConfigsData, PriceImpact } from "../types";

export function applySwapImpactWithCap(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  tokensData: TokensData,
  marketAddress: string | undefined,
  tokenAddress: string | undefined,
  priceImpact: PriceImpact | undefined
) {
  const market = getMarket(marketsData, marketAddress);
  const token = getTokenData(tokensData, tokenAddress);
  const pools = getMarketPools(poolsData, marketAddress);

  if (!market || !priceImpact || !token?.prices || !pools) return undefined;

  let price = priceImpact.impactDeltaUsd.gt(0) ? token.prices.maxPrice : token.prices.minPrice;
  price = convertToContractPrice(price, token.decimals);

  if (!price.gt(0)) return undefined;

  let impactDeltaAmount: BigNumber;

  if (priceImpact.impactDeltaUsd.gt(0)) {
    // round positive impactAmount down, this will be deducted from the swap impact pool for the user
    impactDeltaAmount = priceImpact.impactDeltaUsd.div(price);

    const isLongCollateral = market.longTokenAddress === tokenAddress;

    const maxImpactAmount = isLongCollateral ? pools.swapImpactPoolAmountLong : pools.swapImpactPoolAmountShort;

    if (impactDeltaAmount > maxImpactAmount) {
      impactDeltaAmount = maxImpactAmount;
    }
  } else {
    // round negative impactAmount up, this will be deducted from the user
    impactDeltaAmount = roundUpDivision(priceImpact.impactDeltaUsd, price);
  }

  return impactDeltaAmount;
}

export function getCappedPositionImpactUsd(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  feeConfigs: MarketsFeesConfigsData,
  tokensData: TokensData,
  marketAddress: string | undefined,
  priceImpact: PriceImpact | undefined,
  sizeDeltaUsd: BigNumber | undefined
) {
  if (priceImpact && priceImpact.impactDeltaUsd.lt(0)) {
    return priceImpact.impactDeltaUsd;
  }

  const market = getMarket(marketsData, marketAddress);
  const pools = getMarketPools(poolsData, marketAddress);
  const feesConfig = getMarketFeesConfig(feeConfigs, marketAddress);
  const indexToken = getTokenData(tokensData, market?.indexTokenAddress);

  const impactPoolAmount = pools?.positionImpactPoolAmount;

  const maxPriceImpactUsdBasedOnImpactPool = convertToUsd(
    impactPoolAmount,
    indexToken?.decimals,
    indexToken?.prices?.minPrice
  );

  if (
    !market ||
    !pools ||
    !feesConfig ||
    !indexToken?.prices ||
    !priceImpact ||
    !maxPriceImpactUsdBasedOnImpactPool ||
    !sizeDeltaUsd
  ) {
    return undefined;
  }

  let cappedImpactUsd = priceImpact.impactDeltaUsd;

  if (cappedImpactUsd.gt(maxPriceImpactUsdBasedOnImpactPool)) {
    cappedImpactUsd = maxPriceImpactUsdBasedOnImpactPool;
  }

  const maxPriceImpactFactor = feesConfig.maxPositionImpactFactorPositive;
  const maxPriceImpactUsdBasedOnMaxPriceImpactFactor = applyFactor(sizeDeltaUsd, maxPriceImpactFactor);

  if (cappedImpactUsd.gt(maxPriceImpactUsdBasedOnMaxPriceImpactFactor)) {
    cappedImpactUsd = maxPriceImpactUsdBasedOnMaxPriceImpactFactor;
  }

  return cappedImpactUsd;
}

export function getPriceImpactForPosition(
  openInterestData: MarketsOpenInterestData,
  feesConfigs: MarketsFeesConfigsData,
  marketAddress: string | undefined,
  sizeDeltaUsd: BigNumber | undefined,
  isLong: boolean
) {
  const openInterest = getOpenInterest(openInterestData, marketAddress);
  const feesConfig = getMarketFeesConfig(feesConfigs, marketAddress);

  const { longInterestUsd, shortInterestUsd } = openInterest || {};

  const longDeltaUsd = isLong ? sizeDeltaUsd : BigNumber.from(0);
  const shortDeltaUsd = !isLong ? sizeDeltaUsd : BigNumber.from(0);

  // todo: separate validation
  if (isLong && sizeDeltaUsd?.lt(0) && longInterestUsd?.add(sizeDeltaUsd).lt(0)) {
    return undefined;
  }

  if (!isLong && sizeDeltaUsd?.lt(0) && shortInterestUsd?.add(sizeDeltaUsd).lt(0)) {
    return undefined;
  }

  return getPriceImpactUsd({
    currentLongUsd: longInterestUsd,
    currentShortUsd: shortInterestUsd,
    longDeltaUsd,
    shortDeltaUsd,
    factorPositive: feesConfig?.positionImpactFactorPositive,
    factorNegative: feesConfig?.positionImpactFactorNegative,
    exponentFactor: feesConfig?.positionImpactExponentFactor,
  });
}

export function getPriceImpactForSwap(
  marketsData: MarketsData,
  poolsData: MarketsPoolsData,
  tokensData: TokensData,
  feesConfigs: MarketsFeesConfigsData,
  marketAddress: string | undefined,
  fromTokenAddress: string | undefined,
  toTokenAddress: string | undefined,
  fromDeltaAmount: BigNumber | undefined,
  toDeltaAmount: BigNumber | undefined
) {
  const market = getMarket(marketsData, marketAddress);
  const feesConfig = getMarketFeesConfig(feesConfigs, marketAddress);

  const longToken = getTokenData(tokensData, market?.longTokenAddress);
  const shortToken = getTokenData(tokensData, market?.shortTokenAddress);

  const longPoolUsd = getPoolUsd(
    marketsData,
    poolsData,
    tokensData,
    marketAddress,
    market?.longTokenAddress,
    "midPrice"
  );

  const shortPoolUsd = getPoolUsd(
    marketsData,
    poolsData,
    tokensData,
    marketAddress,
    market?.shortTokenAddress,
    "midPrice"
  );

  if (!market || !longToken?.prices || !shortToken?.prices) return undefined;

  const longDeltaAmount = fromTokenAddress === market.longTokenAddress ? fromDeltaAmount : toDeltaAmount;
  const shortDeltaAmount = fromTokenAddress === market.shortTokenAddress ? fromDeltaAmount : toDeltaAmount;

  const longDeltaUsd = convertToUsd(longDeltaAmount, longToken.decimals, getMidPrice(longToken.prices));
  const shortDeltaUsd = convertToUsd(shortDeltaAmount, shortToken.decimals, getMidPrice(shortToken.prices));

  return getPriceImpactUsd({
    currentLongUsd: longPoolUsd,
    currentShortUsd: shortPoolUsd,
    longDeltaUsd,
    shortDeltaUsd,
    factorPositive: feesConfig?.swapImpactFactorPositive,
    factorNegative: feesConfig?.swapImpactFactorNegative,
    exponentFactor: feesConfig?.swapImpactExponentFactor,
  });
}

/**
 * @see https://github.com/gmx-io/gmx-synthetics/blob/updates/contracts/pricing/SwapPricingUtils.sol
 *
 */
export function getPriceImpactUsd(p: {
  currentLongUsd: BigNumber | undefined;
  currentShortUsd: BigNumber | undefined;
  longDeltaUsd: BigNumber | undefined;
  shortDeltaUsd: BigNumber | undefined;
  factorPositive: BigNumber | undefined;
  factorNegative: BigNumber | undefined;
  exponentFactor: BigNumber | undefined;
}): PriceImpact | undefined {
  if (
    !p.currentLongUsd ||
    !p.currentShortUsd ||
    !p.longDeltaUsd ||
    !p.shortDeltaUsd ||
    (p.longDeltaUsd.eq(0) && p.shortDeltaUsd.eq(0)) ||
    !p.factorPositive ||
    !p.factorNegative ||
    !p.exponentFactor
  ) {
    return undefined;
  }

  const nextLong = p.currentLongUsd.add(p.longDeltaUsd);
  const nextShort = p.currentShortUsd.add(p.shortDeltaUsd);

  const currentDiff = p.currentLongUsd.sub(p.currentShortUsd).abs();
  const nextDiff = nextLong.sub(nextShort).abs();

  const isSameSideRebalance = p.currentLongUsd.lt(p.currentShortUsd) === nextLong.lt(nextShort);

  let impactUsd: BigNumber | undefined;

  if (isSameSideRebalance) {
    const hasPositiveImpact = nextDiff.lt(currentDiff);
    const factor = hasPositiveImpact ? p.factorPositive : p.factorNegative;

    impactUsd = calculateImpactForSameSideRebalance({
      currentDiff,
      nextDiff,
      hasPositiveImpact,
      factor,
      exponentFactor: p.exponentFactor,
    });
  } else {
    impactUsd = calculateImpactForCrossoverRebalance({
      currentDiff,
      nextDiff,
      factorPositive: p.factorPositive,
      factorNegative: p.factorNegative,
      exponentFactor: p.exponentFactor,
    });
  }

  if (!impactUsd) return undefined;

  const totalTradeSize = p.longDeltaUsd.abs().add(p.shortDeltaUsd.abs());

  const basisPoints = totalTradeSize.gt(0)
    ? impactUsd.abs().mul(BASIS_POINTS_DIVISOR).div(totalTradeSize)
    : BigNumber.from(0);

  return {
    impactDeltaUsd: impactUsd,
    basisPoints,
  };
}

/**
 *  @see https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
export function calculateImpactForSameSideRebalance(p: {
  currentDiff: BigNumber;
  nextDiff: BigNumber;
  hasPositiveImpact: boolean;
  factor: BigNumber;
  exponentFactor: BigNumber;
}) {
  const { currentDiff, nextDiff, hasPositiveImpact, factor, exponentFactor } = p;

  const currentImpact = applyImpactFactor(currentDiff, factor, exponentFactor);
  const nextImpact = applyImpactFactor(nextDiff, factor, exponentFactor);

  if (!currentImpact || !nextImpact) return undefined;

  const deltaDiff = currentImpact.sub(nextImpact).abs();

  return hasPositiveImpact ? deltaDiff : BigNumber.from(0).sub(deltaDiff);
}

/**
 *  @see  https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
export function calculateImpactForCrossoverRebalance(p: {
  currentDiff: BigNumber;
  nextDiff: BigNumber;
  factorPositive: BigNumber;
  factorNegative: BigNumber;
  exponentFactor: BigNumber;
}) {
  const { currentDiff, nextDiff, factorNegative, factorPositive, exponentFactor } = p;

  const positiveImpact = applyImpactFactor(currentDiff, factorPositive, exponentFactor);
  const negativeImpactUsd = applyImpactFactor(nextDiff, factorNegative, exponentFactor);

  if (!positiveImpact || !negativeImpactUsd) {
    return undefined;
  }

  const deltaDiffUsd = positiveImpact.sub(negativeImpactUsd).abs();

  return positiveImpact.gt(negativeImpactUsd) ? deltaDiffUsd : BigNumber.from(0).sub(deltaDiffUsd);
}

// TODO: big numbers?
export function applyImpactFactor(diff: BigNumber, factor: BigNumber, exponent: BigNumber) {
  // Convert diff and exponent to float js numbers
  const _diff = Number(diff) / 10 ** 30;
  const _exponent = Number(exponent) / 10 ** 30;

  // Pow and convert back to BigNumber with 30 decimals
  let result = bigNumberify(BigInt(Math.round(_diff ** _exponent * 10 ** 30)));

  result = result?.mul(factor).div(expandDecimals(1, 30)).div(2);

  return result;
}
