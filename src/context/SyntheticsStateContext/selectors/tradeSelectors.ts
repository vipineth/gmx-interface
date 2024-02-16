import { NATIVE_TOKEN_ADDRESS, convertTokenAddress, getWrappedToken } from "config/tokens";
import {
  TradeFlags,
  TradeMode,
  TradeType,
  createSwapEstimator,
  findAllPaths,
  getBestSwapPath,
  getDecreasePositionAmounts,
  getIncreasePositionAmounts,
  getMarkPrice,
  getMarketsGraph,
  getMaxSwapPathLiquidity,
  getNextPositionValuesForDecreaseTrade,
  getNextPositionValuesForIncreaseTrade,
  getSwapPathStats,
} from "domain/synthetics/trade";
import { BigNumber } from "ethers";
import { getByKey } from "lib/objects";
import {
  selectChainId,
  selectMarketsInfoData,
  selectPositionConstants,
  selectPositionsInfoData,
  selectSavedIsPnlInLeverage,
  selectTokensData,
  selectUiFeeFactor,
  selectUserReferralInfo,
} from "./globalSelectors";
import { selectSavedAcceptablePriceImpactBuffer } from "./settingsSelectors";
import { TokensRatio, getTokensRatioByPrice } from "domain/synthetics/tokens";
import { createEnhancedSelector, createSelector, createSelectorFactory } from "../utils";
import { getOpenInterestUsd } from "domain/synthetics/markets";
import { PRECISION } from "lib/legacy";

export type TokenTypeForSwapRoute = "collateralToken" | "indexToken";

// dont swap addresses here
export const makeSelectSwapRoutes = createSelectorFactory(
  (fromTokenAddress: string | undefined, toTokenAddress: string | undefined) =>
    createSelector([selectChainId, selectMarketsInfoData], (chainId, marketsInfoData) => {
      const wrappedToken = getWrappedToken(chainId);

      const isWrap = fromTokenAddress === NATIVE_TOKEN_ADDRESS && toTokenAddress === wrappedToken.address;
      const isUnwrap = fromTokenAddress === wrappedToken.address && toTokenAddress === NATIVE_TOKEN_ADDRESS;
      const isSameToken = fromTokenAddress === toTokenAddress;

      const wrappedFromAddress = fromTokenAddress
        ? convertTokenAddress(chainId, fromTokenAddress, "wrapped")
        : undefined;
      const wrappedToAddress = toTokenAddress ? convertTokenAddress(chainId, toTokenAddress, "wrapped") : undefined;

      const { graph, estimator } = (() => {
        if (!marketsInfoData) {
          return {
            graph: undefined,
            estimator: undefined,
          };
        }

        return {
          graph: getMarketsGraph(Object.values(marketsInfoData)),
          estimator: createSwapEstimator(marketsInfoData),
        };
      })();

      const allRoutes = (() => {
        if (
          !marketsInfoData ||
          !graph ||
          !wrappedFromAddress ||
          !wrappedToAddress ||
          isWrap ||
          isUnwrap ||
          isSameToken
        ) {
          return undefined;
        }

        const paths = findAllPaths(marketsInfoData, graph, wrappedFromAddress, wrappedToAddress)
          ?.sort((a, b) => {
            return b.liquidity.sub(a.liquidity).gt(0) ? 1 : -1;
          })
          .slice(0, 5);

        return paths;
      })();

      const { maxLiquidity, maxLiquidityPath } = (() => {
        let maxLiquidity = BigNumber.from(0);
        let maxLiquidityPath: string[] | undefined = undefined;

        if (!allRoutes || !marketsInfoData || !wrappedFromAddress) {
          return { maxLiquidity, maxLiquidityPath };
        }

        for (const route of allRoutes) {
          const liquidity = getMaxSwapPathLiquidity({
            marketsInfoData,
            swapPath: route.path,
            initialCollateralAddress: wrappedFromAddress,
          });

          if (liquidity.gt(maxLiquidity)) {
            maxLiquidity = liquidity;
            maxLiquidityPath = route.path;
          }
        }

        return { maxLiquidity, maxLiquidityPath };
      })();

      const findSwapPath = (usdIn: BigNumber, opts: { byLiquidity?: boolean }) => {
        if (!allRoutes?.length || !estimator || !marketsInfoData || !fromTokenAddress) {
          return undefined;
        }

        let swapPath: string[] | undefined = undefined;

        if (opts.byLiquidity) {
          swapPath = allRoutes[0].path;
        } else {
          swapPath = getBestSwapPath(allRoutes, usdIn, estimator);
        }

        if (!swapPath) {
          return undefined;
        }

        const swapPathStats = getSwapPathStats({
          marketsInfoData,
          swapPath,
          initialCollateralAddress: fromTokenAddress,
          wrappedNativeTokenAddress: wrappedToken.address,
          shouldUnwrapNativeToken: toTokenAddress === NATIVE_TOKEN_ADDRESS,
          shouldApplyPriceImpact: true,
          usdIn,
        });

        if (!swapPathStats) {
          return undefined;
        }

        return swapPathStats;
      };

      return {
        maxSwapLiquidity: maxLiquidity,
        maxLiquiditySwapPath: maxLiquidityPath,
        findSwapPath,
      };
    })
);

export const makeSelectIncreasePositionAmounts = createSelectorFactory(
  ({
    collateralTokenAddress,
    fixedAcceptablePriceImpactBps,
    initialCollateralTokenAddress,
    initialCollateralAmount,
    leverage,
    marketAddress,
    positionKey,
    strategy,
    indexTokenAddress,
    indexTokenAmount,
    tradeMode,
    tradeType,
    triggerPrice,
    tokenTypeForSwapRoute,
  }: {
    initialCollateralTokenAddress: string | undefined;
    indexTokenAddress: string | undefined;
    positionKey: string | undefined;
    tradeMode: TradeMode;
    tradeType: TradeType;
    collateralTokenAddress: string | undefined;
    marketAddress: string | undefined;
    initialCollateralAmount: BigNumber;
    indexTokenAmount: BigNumber | undefined;
    leverage: BigNumber | undefined;
    triggerPrice: BigNumber | undefined;
    fixedAcceptablePriceImpactBps: BigNumber | undefined;
    strategy: "leverageByCollateral" | "leverageBySize" | "independent";
    tokenTypeForSwapRoute: TokenTypeForSwapRoute;
  }) =>
    createSelector(
      [
        selectTokensData,
        selectMarketsInfoData,
        selectPositionsInfoData,
        selectSavedAcceptablePriceImpactBuffer,
        makeSelectSwapRoutes(
          initialCollateralTokenAddress,
          tokenTypeForSwapRoute === "indexToken" ? indexTokenAddress : collateralTokenAddress
        ),
        selectUserReferralInfo,
        selectUiFeeFactor,
      ],
      (
        tokensData,
        marketsInfoData,
        positionsInfoData,
        acceptablePriceImpactBuffer,
        { findSwapPath },
        userReferralInfo,
        uiFeeFactor
      ) => {
        const position = positionKey ? getByKey(positionsInfoData, positionKey) : undefined;
        const tradeFlags = createTradeFlags(tradeType, tradeMode);
        const indexToken = indexTokenAddress ? getByKey(tokensData, indexTokenAddress) : undefined;
        const initialCollateralToken = initialCollateralTokenAddress
          ? getByKey(tokensData, initialCollateralTokenAddress)
          : undefined;
        const collateralToken = collateralTokenAddress ? getByKey(tokensData, collateralTokenAddress) : undefined;
        const marketInfo = marketAddress ? getByKey(marketsInfoData, marketAddress) : undefined;

        if (
          !indexTokenAmount ||
          !tradeFlags.isIncrease ||
          !indexToken ||
          !initialCollateralToken ||
          !collateralToken ||
          !marketInfo
        ) {
          return undefined;
        }

        return getIncreasePositionAmounts({
          marketInfo,
          indexToken,
          initialCollateralToken,
          collateralToken,
          isLong: tradeFlags.isLong,
          initialCollateralAmount,
          indexTokenAmount,
          leverage,
          triggerPrice: tradeFlags.isLimit ? triggerPrice : undefined,
          position,
          fixedAcceptablePriceImpactBps,
          acceptablePriceImpactBuffer,
          findSwapPath,
          userReferralInfo,
          uiFeeFactor,
          strategy,
        });
      }
    )
);

export const createTradeFlags = (tradeType: TradeType, tradeMode: TradeMode): TradeFlags => {
  const isLong = tradeType === TradeType.Long;
  const isShort = tradeType === TradeType.Short;
  const isSwap = tradeType === TradeType.Swap;
  const isPosition = isLong || isShort;
  const isMarket = tradeMode === TradeMode.Market;
  const isLimit = tradeMode === TradeMode.Limit;
  const isTrigger = tradeMode === TradeMode.Trigger;
  const isIncrease = isPosition && (isMarket || isLimit);

  const tradeFlags: TradeFlags = {
    isLong,
    isShort,
    isSwap,
    isPosition,
    isIncrease,
    isMarket,
    isLimit,
    isTrigger,
  };

  return tradeFlags;
};

export const makeSelectDecreasePositionAmounts = createSelectorFactory(
  ({
    collateralTokenAddress,
    marketAddress,
    positionKey,
    tradeMode,
    tradeType,
    triggerPrice,
    closeSizeUsd,
    keepLeverage,
    fixedAcceptablePriceImpactBps,
  }: {
    positionKey: string | undefined;
    tradeMode: TradeMode;
    tradeType: TradeType;
    collateralTokenAddress: string | undefined;
    marketAddress: string | undefined;
    triggerPrice: BigNumber | undefined;
    closeSizeUsd: BigNumber | undefined;
    fixedAcceptablePriceImpactBps: BigNumber | undefined;
    keepLeverage: boolean | undefined;
  }) =>
    createSelector(
      [
        selectPositionsInfoData,
        selectTokensData,
        selectMarketsInfoData,
        selectPositionConstants,
        selectSavedAcceptablePriceImpactBuffer,
        selectUserReferralInfo,
        selectUiFeeFactor,
      ],
      (
        positionsInfoData,
        tokensData,
        marketsInfoData,
        { minCollateralUsd, minPositionSizeUsd },
        savedAcceptablePriceImpactBuffer,
        userReferralInfo,
        uiFeeFactor
      ) => {
        const position = positionKey ? getByKey(positionsInfoData, positionKey) : undefined;
        const tradeFlags = createTradeFlags(tradeType, tradeMode);
        const collateralToken = collateralTokenAddress ? getByKey(tokensData, collateralTokenAddress) : undefined;
        const marketInfo = marketAddress ? getByKey(marketsInfoData, marketAddress) : undefined;

        if (!closeSizeUsd || !marketInfo || !collateralToken || !minCollateralUsd || !minPositionSizeUsd) {
          return undefined;
        }

        return getDecreasePositionAmounts({
          marketInfo,
          collateralToken,
          isLong: tradeFlags.isLong,
          position,
          closeSizeUsd,
          keepLeverage: keepLeverage!,
          triggerPrice,
          fixedAcceptablePriceImpactBps,
          acceptablePriceImpactBuffer: savedAcceptablePriceImpactBuffer,
          userReferralInfo,
          minCollateralUsd,
          minPositionSizeUsd,
          uiFeeFactor,
        });
      }
    )
);

export const makeSelectMarkPrice = createSelectorFactory(
  ({
    toTokenAddress,
    tradeMode,
    tradeType,
  }: {
    toTokenAddress: string | undefined;
    tradeType: TradeType;
    tradeMode: TradeMode;
  }) =>
    createSelector([selectTokensData], (tokensData) => {
      const tradeFlags = createTradeFlags(tradeType, tradeMode);
      const toToken = toTokenAddress ? getByKey(tokensData, toTokenAddress) : undefined;

      if (!toToken) {
        return undefined;
      }

      if (tradeFlags.isSwap) {
        return toToken.prices.minPrice;
      }

      return getMarkPrice({ prices: toToken.prices, isIncrease: tradeFlags.isIncrease, isLong: tradeFlags.isLong });
    })
);

export const makeSelectTradeRatios = createSelectorFactory(
  ({
    fromTokenAddress,
    toTokenAddress,
    tradeType,
    tradeMode,
    triggerRatioValue,
  }: {
    fromTokenAddress: string | undefined;
    toTokenAddress: string | undefined;
    tradeType: TradeType;
    tradeMode: TradeMode;
    triggerRatioValue: BigNumber | undefined;
  }) =>
    createSelector(
      [
        selectTokensData,
        makeSelectMarkPrice({
          toTokenAddress,
          tradeMode,
          tradeType,
        }),
      ],
      (tokensData, markPrice) => {
        const tradeFlags = createTradeFlags(tradeType, tradeMode);
        const toToken = toTokenAddress ? getByKey(tokensData, toTokenAddress) : undefined;
        const fromToken = fromTokenAddress ? getByKey(tokensData, fromTokenAddress) : undefined;
        const fromTokenPrice = fromToken?.prices.minPrice;
        if (!tradeFlags.isSwap || !fromToken || !toToken || !fromTokenPrice || !markPrice) {
          return {};
        }
        const markRatio = getTokensRatioByPrice({
          fromToken,
          toToken,
          fromPrice: fromTokenPrice,
          toPrice: markPrice,
        });
        if (!triggerRatioValue) {
          return { markRatio };
        }
        const triggerRatio: TokensRatio = {
          ratio: triggerRatioValue?.gt(0) ? triggerRatioValue : markRatio.ratio,
          largestToken: markRatio.largestToken,
          smallestToken: markRatio.smallestToken,
        };
        return {
          markRatio,
          triggerRatio,
        };
      }
    )
);

export const makeSelectNextPositionValuesForIncrease = createSelectorFactory(
  ({
    collateralTokenAddress,
    fixedAcceptablePriceImpactBps,
    initialCollateralTokenAddress,
    initialCollateralAmount,
    leverage,
    marketAddress,
    positionKey,
    increaseStrategy,
    indexTokenAddress,
    indexTokenAmount,
    tradeMode,
    tradeType,
    triggerPrice,
    tokenTypeForSwapRoute,
    isPnlInLeverage: overridedIsPnlInLeverage,
  }: {
    initialCollateralTokenAddress: string | undefined;
    indexTokenAddress: string | undefined;
    positionKey: string | undefined;
    tradeMode: TradeMode;
    tradeType: TradeType;
    collateralTokenAddress: string | undefined;
    marketAddress: string | undefined;
    initialCollateralAmount: BigNumber;
    indexTokenAmount: BigNumber | undefined;
    leverage: BigNumber | undefined;
    triggerPrice: BigNumber | undefined;
    fixedAcceptablePriceImpactBps: BigNumber | undefined;
    increaseStrategy: "leverageByCollateral" | "leverageBySize" | "independent";
    tokenTypeForSwapRoute: TokenTypeForSwapRoute;
    isPnlInLeverage?: boolean;
  }) =>
    createSelector(
      [
        selectPositionConstants,
        selectMarketsInfoData,
        selectTokensData,
        makeSelectIncreasePositionAmounts({
          collateralTokenAddress,
          fixedAcceptablePriceImpactBps,
          initialCollateralTokenAddress,
          initialCollateralAmount,
          leverage,
          marketAddress,
          positionKey,
          strategy: increaseStrategy,
          indexTokenAddress,
          indexTokenAmount,
          tradeMode,
          tradeType,
          triggerPrice,
          tokenTypeForSwapRoute,
        }),
        selectPositionsInfoData,
        selectSavedIsPnlInLeverage,
        selectUserReferralInfo,
      ],
      (
        { minCollateralUsd },
        marketsInfoData,
        tokensData,
        increaseAmounts,
        positionsInfoData,
        defaultIsPnlInLeverage,
        userReferralInfo
      ) => {
        const isPnlInLeverage = overridedIsPnlInLeverage ?? defaultIsPnlInLeverage;
        const tradeFlags = createTradeFlags(tradeType, tradeMode);
        const marketInfo = getByKey(marketsInfoData, marketAddress);
        const collateralToken = collateralTokenAddress ? getByKey(tokensData, collateralTokenAddress) : undefined;
        const position = positionKey ? getByKey(positionsInfoData, positionKey) : undefined;

        if (!tradeFlags.isPosition || !minCollateralUsd || !marketInfo || !collateralToken) {
          return undefined;
        }

        if (tradeFlags.isIncrease && increaseAmounts?.acceptablePrice && initialCollateralAmount.gt(0)) {
          return getNextPositionValuesForIncreaseTrade({
            marketInfo,
            collateralToken,
            existingPosition: position,
            isLong: tradeFlags.isLong,
            collateralDeltaUsd: increaseAmounts.collateralDeltaUsd,
            collateralDeltaAmount: increaseAmounts.collateralDeltaAmount,
            sizeDeltaUsd: increaseAmounts.sizeDeltaUsd,
            sizeDeltaInTokens: increaseAmounts.sizeDeltaInTokens,
            indexPrice: increaseAmounts.indexPrice,
            showPnlInLeverage: isPnlInLeverage,
            minCollateralUsd,
            userReferralInfo,
          });
        }
      }
    )
);

// @todo instead of all these params have just one argument Tradebox | PositionSeller | OrderEditor
export const makeSelectNextPositionValuesForDecrease = createSelectorFactory(
  ({
    closeSizeUsd,
    collateralTokenAddress,
    fixedAcceptablePriceImpactBps,
    keepLeverage,
    marketAddress,
    positionKey,
    tradeMode,
    tradeType,
    triggerPrice,
    isPnlInLeverage: overridedIsPnlInLeverage,
  }: {
    closeSizeUsd: BigNumber | undefined;
    collateralTokenAddress: string | undefined;
    fixedAcceptablePriceImpactBps: BigNumber | undefined;
    keepLeverage: boolean | undefined;
    marketAddress: string | undefined;
    positionKey: string | undefined;
    tradeMode: TradeMode;
    tradeType: TradeType;
    triggerPrice: BigNumber | undefined;
    isPnlInLeverage?: boolean;
  }) =>
    createSelector(
      [
        selectPositionConstants,
        selectMarketsInfoData,
        selectTokensData,
        makeSelectDecreasePositionAmounts({
          closeSizeUsd,
          collateralTokenAddress,
          fixedAcceptablePriceImpactBps,
          keepLeverage,
          marketAddress,
          positionKey,
          tradeMode,
          tradeType,
          triggerPrice,
        }),
        selectPositionsInfoData,
        selectSavedIsPnlInLeverage,
        selectUserReferralInfo,
      ],
      (
        { minCollateralUsd },
        marketsInfoData,
        tokensData,
        decreaseAmounts,
        positionsInfoData,
        defaultIsPnlInLeverage,
        userReferralInfo
      ) => {
        const isPnlInLeverage = overridedIsPnlInLeverage ?? defaultIsPnlInLeverage;
        const tradeFlags = createTradeFlags(tradeType, tradeMode);
        const marketInfo = getByKey(marketsInfoData, marketAddress);
        const collateralToken = collateralTokenAddress ? getByKey(tokensData, collateralTokenAddress) : undefined;
        const position = positionKey ? getByKey(positionsInfoData, positionKey) : undefined;

        if (!tradeFlags.isPosition || !minCollateralUsd || !marketInfo || !collateralToken) {
          return undefined;
        }

        if (!closeSizeUsd) throw new Error("makeSelectNextPositionValuesForDecrease: closeSizeUsd is undefined");

        if (decreaseAmounts?.acceptablePrice && closeSizeUsd.gt(0)) {
          return getNextPositionValuesForDecreaseTrade({
            existingPosition: position,
            marketInfo,
            collateralToken,
            sizeDeltaUsd: decreaseAmounts.sizeDeltaUsd,
            sizeDeltaInTokens: decreaseAmounts.sizeDeltaInTokens,
            estimatedPnl: decreaseAmounts.estimatedPnl,
            realizedPnl: decreaseAmounts.realizedPnl,
            collateralDeltaUsd: decreaseAmounts.collateralDeltaUsd,
            collateralDeltaAmount: decreaseAmounts.collateralDeltaAmount,
            payedRemainingCollateralUsd: decreaseAmounts.payedRemainingCollateralUsd,
            payedRemainingCollateralAmount: decreaseAmounts.payedRemainingCollateralAmount,
            showPnlInLeverage: isPnlInLeverage,
            isLong: tradeFlags.isLong,
            minCollateralUsd,
            userReferralInfo,
          });
        }
      }
    )
);

export const makeSelectMinCollateralFactorForPosition = createSelectorFactory((positionKey: string | undefined) =>
  !positionKey
    ? () => undefined
    : createEnhancedSelector((q) => {
        const position = q((state) => state.globals.positionsInfo?.positionsInfoData?.[positionKey]);

        if (!position) return undefined;
        const marketInfo = position.marketInfo;
        const isLong = position.isLong;
        const openInterest = getOpenInterestUsd(marketInfo, isLong);
        const minCollateralFactorMultiplier = isLong
          ? marketInfo.minCollateralFactorForOpenInterestLong
          : marketInfo.minCollateralFactorForOpenInterestShort;
        let minCollateralFactor = openInterest.mul(minCollateralFactorMultiplier).div(PRECISION);
        const minCollateralFactorForMarket = marketInfo.minCollateralFactor;

        if (minCollateralFactorForMarket.gt(minCollateralFactor)) {
          minCollateralFactor = minCollateralFactorForMarket;
        }

        return minCollateralFactor;
      })
);
