import { BigNumber, ethers } from "ethers";
import SyntheticsReader from "abis/SyntheticsReader.json";
import { MAX_ALLOWED_LEVERAGE } from "config/factors";
import { getContract } from "config/contracts";
import { getBasisPoints } from "lib/numbers";
import { getByKey } from "lib/objects";
import { getMarkPrice } from "../trade";
import { getPositionFee, getPriceImpactForPosition } from "../fees";
import { TokensData, convertToTokenAmount, convertToUsd } from "../tokens";
import { ContractMarketPrices, MarketsInfoData, useMarketsInfo } from "../markets";
import {
  PositionsData,
  PositionsInfoData,
  getEntryPrice,
  getLeverage,
  getLiquidationPrice,
  getPositionKey,
  getPositionNetValue,
  getPositionPendingFeesUsd,
  getPositionPnlUsd,
  usePositionsConstants
} from "../positions";
import { useMulticall } from "lib/multicall";
import { useEffect, useState } from "react";

type PositionsResult = {
  isLoading: boolean;
  data: PositionsInfoData;
  error: Error | null;
};

type PositionJson = { [key: string]: any, [key: number]: any };

function parsePositionsInfo(
  positionKeys: string[] = [],
  positions: PositionJson[] = [],
  marketsInfoData: MarketsInfoData,
  tokensData: TokensData,
  minCollateralUsd: BigNumber,
  showPnlInLeverage: boolean = true,
) {
  return positions.reduce((positionsMap: PositionsInfoData, positionInfo, i) => {
    const { position: { addresses, numbers, flags, data }, fees } = positionInfo;
    const { account, market: marketAddress, collateralToken: collateralTokenAddress } = addresses;

    // Empty position
    if (BigNumber.from(numbers.increasedAtBlock).eq(0)) {
      return positionsMap;
    }

    const positionKey = getPositionKey(account, marketAddress, collateralTokenAddress, flags.isLong);
    const contractPositionKey = positionKeys[i];
    const position = {
      key: positionKey,
      contractKey: contractPositionKey,
      account,
      marketAddress,
      collateralTokenAddress,
      sizeInUsd: BigNumber.from(numbers.sizeInUsd),
      sizeInTokens: BigNumber.from(numbers.sizeInTokens),
      collateralAmount: BigNumber.from(numbers.collateralAmount),
      increasedAtBlock: BigNumber.from(numbers.increasedAtBlock),
      decreasedAtBlock: BigNumber.from(numbers.decreasedAtBlock),
      isLong: flags.isLong,
      pendingBorrowingFeesUsd: BigNumber.from(fees.borrowing.borrowingFeeUsd),
      fundingFeeAmount: BigNumber.from(fees.funding.fundingFeeAmount),
      claimableLongTokenAmount: BigNumber.from(fees.funding.claimableLongTokenAmount),
      claimableShortTokenAmount: BigNumber.from(fees.funding.claimableShortTokenAmount),
      data,
    };

    const marketInfo = getByKey(marketsInfoData, position.marketAddress);
    const indexToken = marketInfo?.indexToken;
    const pnlToken = position.isLong ? marketInfo?.longToken : marketInfo?.shortToken;
    const collateralToken = getByKey(tokensData, position.collateralTokenAddress);

    if (!marketInfo || !indexToken || !pnlToken || !collateralToken) {
      return positionsMap;
    }

    const markPrice = getMarkPrice({ prices: indexToken.prices, isLong: position.isLong, isIncrease: false });
    const collateralMinPrice = collateralToken.prices.minPrice;

    const entryPrice = getEntryPrice({
      sizeInTokens: position.sizeInTokens,
      sizeInUsd: position.sizeInUsd,
      indexToken,
    });

    const pendingFundingFeesUsd = convertToUsd(
      position.fundingFeeAmount,
      collateralToken.decimals,
      collateralToken.prices.minPrice
    )!;

    const pendingClaimableFundingFeesLongUsd = convertToUsd(
      position.claimableLongTokenAmount,
      marketInfo.longToken.decimals,
      marketInfo.longToken.prices.minPrice
    )!;
    const pendingClaimableFundingFeesShortUsd = convertToUsd(
      position.claimableShortTokenAmount,
      marketInfo.shortToken.decimals,
      marketInfo.shortToken.prices.minPrice
    )!;

    const pendingClaimableFundingFeesUsd = pendingClaimableFundingFeesLongUsd?.add(
      pendingClaimableFundingFeesShortUsd
    );

    const totalPendingFeesUsd = getPositionPendingFeesUsd({
      pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
      pendingFundingFeesUsd,
    });

    const closingPriceImpactDeltaUsd = getPriceImpactForPosition(
      marketInfo,
      position.sizeInUsd.mul(-1),
      position.isLong,
      { fallbackToZero: true }
    );

    const positionFeeInfo = getPositionFee(
      marketInfo,
      position.sizeInUsd,
      closingPriceImpactDeltaUsd.gt(0),
      undefined, // userReferralInfo
    );

    const closingFeeUsd = positionFeeInfo.positionFeeUsd;

    const collateralUsd = convertToUsd(position.collateralAmount, collateralToken.decimals, collateralMinPrice)!;

    const remainingCollateralUsd = collateralUsd.sub(totalPendingFeesUsd);

    const remainingCollateralAmount = convertToTokenAmount(
      remainingCollateralUsd,
      collateralToken.decimals,
      collateralMinPrice
    )!;

    const pnl = getPositionPnlUsd({
      marketInfo: marketInfo,
      sizeInUsd: position.sizeInUsd,
      sizeInTokens: position.sizeInTokens,
      markPrice,
      isLong: position.isLong,
    });

    const pnlPercentage =
      collateralUsd && !collateralUsd.eq(0) ? getBasisPoints(pnl, collateralUsd) : BigNumber.from(0);

    const netValue = getPositionNetValue({
      collateralUsd: collateralUsd,
      pnl,
      pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
      pendingFundingFeesUsd: pendingFundingFeesUsd,
      closingFeeUsd,
    });

    const pnlAfterFees = pnl.sub(totalPendingFeesUsd).sub(closingFeeUsd);
    const pnlAfterFeesPercentage = !collateralUsd.eq(0)
      ? getBasisPoints(pnlAfterFees, collateralUsd.add(closingFeeUsd))
      : BigNumber.from(0);

    const leverage = getLeverage({
      sizeInUsd: position.sizeInUsd,
      collateralUsd: collateralUsd,
      pnl: showPnlInLeverage ? pnl : undefined,
      pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
      pendingFundingFeesUsd: pendingFundingFeesUsd,
    });

    const hasLowCollateral = leverage?.gt(MAX_ALLOWED_LEVERAGE) || false;

    const liquidationPrice = getLiquidationPrice({
      marketInfo,
      collateralToken,
      sizeInUsd: position.sizeInUsd,
      sizeInTokens: position.sizeInTokens,
      collateralUsd,
      collateralAmount: position.collateralAmount,
      userReferralInfo: undefined,
      minCollateralUsd,
      pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
      pendingFundingFeesUsd,
      isLong: position.isLong,
    });

    positionsMap[positionKey] = {
      ...position,
      marketInfo,
      indexToken,
      collateralToken,
      pnlToken,
      markPrice,
      entryPrice,
      liquidationPrice,
      collateralUsd,
      remainingCollateralUsd,
      remainingCollateralAmount,
      hasLowCollateral,
      leverage,
      pnl,
      pnlPercentage,
      pnlAfterFees,
      pnlAfterFeesPercentage,
      netValue,
      closingFeeUsd,
      pendingFundingFeesUsd,
      pendingClaimableFundingFeesUsd,
    };

    return positionsMap;
  },
  {} as PositionsData);
};

export function usePositionsInfo(
  chainId: number,
  positionKeys: string[],
  marketPrices: ContractMarketPrices[],
): PositionsResult {
  const keys = [...positionKeys].sort((a, b) => a < b ? -1 : 1).join("-");
  const { minCollateralUsd } = usePositionsConstants(chainId);
  const { marketsInfoData, tokensData, pricesUpdatedAt } = useMarketsInfo(chainId);
  const [positions, setPositions] = useState<PositionsInfoData>();
  const positionsData = useMulticall(chainId, "usePositionsData", {
    key: [keys, pricesUpdatedAt],
    refreshInterval: null, // Refresh on every prices update
    request: () => ({
      reader: {
        contractAddress: getContract(chainId, "SyntheticsReader"),
        abi: SyntheticsReader.abi,
        calls: positionKeys && positionKeys.length ? {
          positions: {
            methodName: "getAccountPositionInfoList",
            params: [
              getContract(chainId, "DataStore"),
              getContract(chainId, "ReferralStorage"),
              positionKeys,
              marketPrices,
              ethers.constants.AddressZero, // uiFeeReceiver
            ],
          },
        } : {},
      },
    }),
  });

  useEffect(() => {
    const positions = positionsData?.data?.data?.reader?.positions?.returnValues;
    if (positions && marketsInfoData && tokensData && minCollateralUsd) {
      const parsedData = parsePositionsInfo(
        positionKeys,
        positions as Array<PositionJson>,
        marketsInfoData,
        tokensData,
        minCollateralUsd
      );
      setPositions(parsedData);
    }
  // The dependencies below derive from the values used within the effect callback
  // eslint-disable-next-line
  }, [
    keys,
    pricesUpdatedAt,
    positionsData?.data?.data?.reader?.positions?.returnValues,
  ]);

  const isLoading = !(positions && marketsInfoData && tokensData && minCollateralUsd);

  return { isLoading, error: null, data: isLoading ? {} : positions };
}