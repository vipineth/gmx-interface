import { TradeMode, TradeType } from "domain/synthetics/trade/types";
import { OrderOption } from "domain/synthetics/trade/usePositionSellerState";
import { USD_DECIMALS } from "lib/legacy";
import { parseValue } from "lib/numbers";
import { SyntheticsTradeState } from "../SyntheticsStateContextProvider";
import { createEnhancedSelector } from "../utils";
import { selectClosingPositionKey, selectPositionsInfoData } from "./globalSelectors";
import {
  makeSelectDecreasePositionAmounts,
  makeSelectMinCollateralFactorForPosition,
  makeSelectNextPositionValuesForDecrease,
} from "./tradeSelectors";
import { willPositionCollateralBeSufficient } from "domain/synthetics/positions";

export const selectPositionSeller = (state: SyntheticsTradeState) => state.positionSeller;

export const selectPositionSellerOrderOption = (state: SyntheticsTradeState) => state.positionSeller.orderOption;
export const selectPositionSellerTriggerPriceInputValue = (state: SyntheticsTradeState) =>
  state.positionSeller.triggerPriceInputValue;
export const selectPositionSellerKeepLeverageRaw = (state: SyntheticsTradeState) => state.positionSeller.keepLeverage;
export const selectPositionSellerDefaultTriggerAcceptablePriceImpactBps = (state: SyntheticsTradeState) =>
  state.positionSeller.defaultTriggerAcceptablePriceImpactBps;
export const selectPositionSellerSelectedTriggerAcceptablePriceImpactBps = (state: SyntheticsTradeState) =>
  state.positionSeller.selectedTriggerAcceptablePriceImpactBps;
export const selectPositionSellerCloseUsdInputValue = (state: SyntheticsTradeState) =>
  state.positionSeller.closeUsdInputValue;
export const selectPositionSellerReceiveTokenAddress = (state: SyntheticsTradeState) =>
  state.positionSeller.receiveTokenAddress;
export const selectPositionSellerAllowedSlippage = (state: SyntheticsTradeState) =>
  state.positionSeller.allowedSlippage;
export const selectPositionSellerIsSubmitting = (state: SyntheticsTradeState) => state.positionSeller.isSubmitting;
export const selectPositionSellerPosition = createEnhancedSelector((q) => {
  const positionKey = q(selectClosingPositionKey);
  return q((s) => (positionKey ? selectPositionsInfoData(s)?.[positionKey] : undefined));
});

export const selectPositionSellerNextPositionValuesForDecrease = createEnhancedSelector((q) => {
  const decreaseAmountArgs = q(selectPositionSellerDecreaseAmountArgs);
  const keepLeverage = q(selectPositionSellerKeepLeverageRaw);

  if (!decreaseAmountArgs) return undefined;

  const selector = makeSelectNextPositionValuesForDecrease({ ...decreaseAmountArgs, keepLeverage });
  return q(selector);
});

export const selectPositionSellerNextPositionValuesForDecreaseWithoutKeepLeverage = createEnhancedSelector((q) => {
  const decreaseAmountArgs = q(selectPositionSellerDecreaseAmountArgs);

  if (!decreaseAmountArgs) return undefined;

  const selector = makeSelectNextPositionValuesForDecrease({ ...decreaseAmountArgs, keepLeverage: false });

  return q(selector);
});

const selectPositionSellerDecreaseAmountArgs = createEnhancedSelector((q) => {
  const position = q(selectPositionSellerPosition);

  if (!position) return undefined;

  const selectedTriggerAcceptablePriceImpactBps = q(selectPositionSellerSelectedTriggerAcceptablePriceImpactBps);
  const positionKey = q(selectClosingPositionKey);
  const orderOption = q(selectPositionSellerOrderOption);
  const tradeType = position.isLong ? TradeType.Long : TradeType.Short;
  const collateralTokenAddress = position.collateralTokenAddress;
  const marketAddress = position.marketInfo.marketTokenAddress;
  const triggerPriceInputValue = q(selectPositionSellerTriggerPriceInputValue);
  const closeSizeInputValue = q(selectPositionSellerCloseUsdInputValue);

  const closeSizeUsd = parseValue(closeSizeInputValue || "0", USD_DECIMALS)!;
  const triggerPrice = parseValue(triggerPriceInputValue, USD_DECIMALS);

  return {
    collateralTokenAddress,
    fixedAcceptablePriceImpactBps: selectedTriggerAcceptablePriceImpactBps,
    marketAddress,
    positionKey,
    tradeMode: orderOption === OrderOption.Market ? TradeMode.Market : TradeMode.Trigger,
    tradeType,
    triggerPrice,
    closeSizeUsd,
  };
});

export const selectPositionSellerDecreaseAmounts = createEnhancedSelector((q) => {
  const decreaseAmountArgs = q(selectPositionSellerDecreaseAmountArgs);
  const keepLeverage = q(selectPositionSellerKeepLeverageRaw);

  if (!decreaseAmountArgs) return undefined;

  const selector = makeSelectDecreasePositionAmounts({ ...decreaseAmountArgs, keepLeverage });

  return q(selector);
});

const selectPositionSellerDecreaseAmountsWithKeepLeverage = createEnhancedSelector((q) => {
  const decreaseAmountArgs = q(selectPositionSellerDecreaseAmountArgs);

  if (!decreaseAmountArgs) return undefined;

  const selector = makeSelectDecreasePositionAmounts({ ...decreaseAmountArgs, keepLeverage: true });

  return q(selector);
});

export const selectPositionSellerKeepLeverage = createEnhancedSelector((q) => {
  const position = q(selectPositionSellerPosition);

  if (!position) return false;

  const keepLeverage = q(selectPositionSellerKeepLeverageRaw);

  if (!keepLeverage) return false;

  const disabledByCollateral = q(selectPositionSellerLeverageDisabledByCollateral);

  return !disabledByCollateral;
});

export const selectPositionSellerLeverageDisabledByCollateral = createEnhancedSelector((q) => {
  const position = q(selectPositionSellerPosition);

  if (!position) return false;

  const keepLeverageRaw = q(selectPositionSellerKeepLeverageRaw);

  if (!keepLeverageRaw) return false;

  const minCollateralFactor = q(makeSelectMinCollateralFactorForPosition(position.key));

  if (!minCollateralFactor) return false;

  const decreaseAmountsWithKeepLeverage = q(selectPositionSellerDecreaseAmountsWithKeepLeverage);

  if (!decreaseAmountsWithKeepLeverage) return false;

  if (decreaseAmountsWithKeepLeverage.sizeDeltaUsd.gte(position.sizeInUsd)) return false;

  return !willPositionCollateralBeSufficient(
    position,
    decreaseAmountsWithKeepLeverage.collateralDeltaAmount,
    decreaseAmountsWithKeepLeverage.realizedPnl,
    minCollateralFactor
  );
});
