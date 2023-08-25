import useSWR from "swr";
import { BigNumber } from "ethers";
import { getAddress } from "ethers/lib/utils";
import { queryAccountOpenPositions } from "./queries"
import { arbitrumGoerliLeaderboardsClient as graph } from "lib/subgraph/clients";
import { AccountOpenPositionJson, AccountOpenPosition } from "./types";
import { ContractMarketPrices, getContractMarketPrices, useMarketsInfo } from "../markets";
import { convertToUsd } from "../tokens";
import { useChainId } from "lib/chains";
import { usePositionsInfo } from "./usePositionsInfo";
import { PositionsInfoData, getPositionKey } from "../positions";
import { useEffect, useState } from "react";

const fetchAccountOpenPositionsPage = async (
  first: number,
  skip: number,
  orderBy: string = "sizeInUsd",
  orderDirection: "asc" | "desc" = "desc",
): Promise<Array<AccountOpenPositionJson>> => {
  const res = await graph.query<{ accountOpenPositions: Array<AccountOpenPositionJson> }>({
    query: queryAccountOpenPositions,
    variables: {
      first,
      skip,
      orderBy,
      orderDirection,
    },
  });

  return res.data.accountOpenPositions;
};

const parseAccountOpenPositions = (
  positionsData: AccountOpenPositionJson[],
  positionsByKey: PositionsInfoData,
): AccountOpenPosition[] => {
  const positions: AccountOpenPosition[] = [];

  for (const p of positionsData) {
    const accountAddress = getAddress(p.account);
    const key = getPositionKey(
      accountAddress,
      getAddress(p.market),
      getAddress(p.collateralToken),
      p.isLong
    );

    const positionInfo = positionsByKey[key];
    const collateralAmount = BigNumber.from(p.collateralAmount);
    const collateralAmountUsd = convertToUsd(
      collateralAmount,
      positionInfo.collateralToken.decimals,
      positionInfo.collateralToken.prices.minPrice,
    )!;

    const currSuzeInUsd = convertToUsd(
      BigNumber.from(p.sizeInTokens),
      positionInfo.indexToken.decimals,
      positionInfo.indexToken.prices[p.isLong ? "minPrice" : "maxPrice"],
    )!;

    const prevSizeInUsd = BigNumber.from(p.sizeInUsd);
    const unrealizedPnl = p.isLong
      ? currSuzeInUsd.sub(prevSizeInUsd)
      : prevSizeInUsd.sub(currSuzeInUsd);

    positions.push({
      key,
      account: accountAddress,
      isLong: p.isLong,
      marketInfo: positionInfo.marketInfo,
      collateralToken: positionInfo.collateralToken,
      unrealizedPnl,
      entryPrice: positionInfo.entryPrice!, // BigNumber.from(p.entryPrice),
      sizeInUsd: currSuzeInUsd,
      collateralAmount,
      collateralAmountUsd,
      maxSize: BigNumber.from(p.maxSize),
      priceImpactUsd: BigNumber.from(p.priceImpactUsd),
      collectedBorrowingFeesUsd: BigNumber.from(p.borrowingFeeUsd),
      collectedFundingFeesUsd: BigNumber.from(p.fundingFeeUsd),
      collectedPositionFeesUsd: BigNumber.from(p.positionFeeUsd),
      liquidationPrice: positionInfo.liquidationPrice,
      unrealizedPnlAfterFees: positionInfo.pnlAfterFees,
      closingFeeUsd: positionInfo.closingFeeUsd,
      pendingFundingFeesUsd: positionInfo.pendingFundingFeesUsd,
      pendingClaimableFundingFeesUsd: positionInfo.pendingClaimableFundingFeesUsd,
      pendingBorrowingFeesUsd: positionInfo.pendingBorrowingFeesUsd,
    });
  }

  return positions;
};

const fetchAccountOpenPositions = async () => {
  const pageSize = 1000;
  let data: Array<AccountOpenPositionJson> = [];
  let skip = 0;

  while (true) {
    const page = await fetchAccountOpenPositionsPage(pageSize, skip);
    if (!page || !page.length) {
      break;
    }
    data = data.concat(page);
    skip += pageSize;
  }

  return data;
};

export function useAccountOpenPositions() {
  const { chainId } = useChainId();
  const { tokensData, marketsInfoData, pricesUpdatedAt } = useMarketsInfo(chainId);
  const positions = useSWR('/leaderboards/positions', fetchAccountOpenPositions);
  const [keys, setKeys] = useState<string[]>([]);
  const [prices, setPrices] = useState<ContractMarketPrices[]>([]);
  const [data, setData] = useState<AccountOpenPosition[]>([]);

  let positionKeys: string = "";

  for (const {id} of positions.data || []) {
    positionKeys += id;
  }

  useEffect(() => {
    if (!marketsInfoData || !tokensData) {
      return;
    }

    const keys: string[] = [];
    const prices: ContractMarketPrices[] = [];
    for (const p of positions.data || []) {
      const marketData = marketsInfoData[getAddress(p.market)];
      const contractMarketPrices = getContractMarketPrices(tokensData, marketData);
      if (contractMarketPrices) {
        keys.push(p.id);
        prices.push(contractMarketPrices);
      }
    }
    setKeys(keys);
    setPrices(prices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricesUpdatedAt, chainId, positionKeys]);

  const positionsInfo = usePositionsInfo(chainId, keys, prices);
  const error = positions.error || positionsInfo.error;
  const isLoading = !error && !(
    tokensData &&
    positions.data &&
    marketsInfoData &&
    positionsInfo.data &&
    positions.data.length === Object.keys(positionsInfo.data).length
  );

  useEffect(() => {
    if (!isLoading && !error) {
      setData(parseAccountOpenPositions(positions.data!, positionsInfo.data));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, error, pricesUpdatedAt, chainId, positionKeys]);

  return { isLoading, error, data };
};