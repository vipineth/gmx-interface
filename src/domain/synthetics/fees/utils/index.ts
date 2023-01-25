import { NATIVE_TOKEN_ADDRESS } from "config/tokens";
import { TokensData, convertToTokenAmount, getTokenData } from "domain/synthetics/tokens";
import { BigNumber } from "ethers";
import { expandDecimals, formatAmount, formatUsd } from "lib/numbers";
import { ExecutionFeeParams, MarketsFeesConfigsData } from "../types";

export * from "./priceImpact";
export * from "./swapFees";

export function getMarketFeesConfig(feeConfigsData: MarketsFeesConfigsData, marketAddress: string | undefined) {
  if (!marketAddress) return undefined;

  return feeConfigsData[marketAddress];
}

export function getIncreaseOrderFees() {}

export function getDecreaseOrderFees() {}

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

// export function getSwapFee(
//   marketsData: MarketsData,
//   poolsData: MarketsPoolsData,
//   tokensData: TokensData,
//   priceImpactConfigsData: any,
//   market: string,
//   fromToken: string,
//   toToken: string,
//   usdAmount: BigNumber
// ) {
//   const fromPoolUsd = getPoolUsd(marketsData, poolsData, tokensData, market, fromToken, "midPrice");
//   const toPoolUsd = getPoolUsd(marketsData, poolsData, tokensData, market, toToken, "midPrice");

//   const fromDelta = usdAmount;
//   const toDelta = BigNumber.from(0).sub(usdAmount);

//   const priceImpact = undefined as any;

//   if (!priceImpact) return undefined;

//   // TODO: get swap fee from contract
//   const swapFee = BigNumber.from(0).sub(parseValue("0.01", USD_DECIMALS)!);

//   return {
//     swapFee,
//     priceImpact,
//   };
// }

export function formatFee(feeUsd?: BigNumber, feeBp?: BigNumber) {
  if (!feeUsd?.abs().gt(0)) {
    return "...";
  }
  const isNegative = feeUsd.lt(0);

  return feeBp ? `${isNegative ? "-" : ""}${formatAmount(feeBp, 2, 2)}% (${formatUsd(feeUsd)})` : formatUsd(feeUsd);
}
