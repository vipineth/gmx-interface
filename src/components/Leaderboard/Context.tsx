import { createContext, FC, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from "react";

import { BigNumber, utils } from "ethers";
import { ApolloClient, InMemoryCache, NormalizedCacheObject } from "@apollo/client";
import { queryAccountOpenPositions, queryAccountPerformance } from "../../graphql";
import {
  AccountFilterPeriod,
  AccountOpenPosition,
  AccountOpenPositionJson,
  AccountPerf,
  AccountPerfByPeriod,
  AccountPerfJson,
  LeaderboardContextType,
  TopAccountParams,
  TopPositionParams,
} from "./types";

import { useTokenRecentPrices } from "domain/synthetics/tokens";
import { ARBITRUM_GOERLI } from "config/chains";

export const LeaderboardContext = createContext<LeaderboardContextType>({
  leaderPositions: [],
  leaderAccounts: [],
  period: AccountFilterPeriod.DAY,
  setPeriod: () => {},
});

export const useLeaderboardContext = () => useContext(LeaderboardContext);

const DATA_ENDPOINT = "https://api.thegraph.com/subgraphs/name/ullin-oi/leaderboards"; // TODO: replace with prod url

export const LeaderboardContextProvider: FC<PropsWithChildren> = ({ children }) => {
  const [period, _setPeriod] = useState<AccountFilterPeriod>(AccountFilterPeriod.DAY);
  const [_leaderPositions, setLeaderPositions] = useState<Array<AccountOpenPosition>>([]);
  const [leaderAccountsByPeriod, setLeaderAccountsByPeriod] = useState<AccountPerfByPeriod>({});
  const { pricesData } = useTokenRecentPrices(ARBITRUM_GOERLI);
  const leaderAccounts = leaderAccountsByPeriod[period] || [];
  const graph = useRef<ApolloClient<NormalizedCacheObject>>(
    new ApolloClient({
      uri: DATA_ENDPOINT,
      cache: new InMemoryCache(),
    })
  ); // TODO: use common graph api client

  const leaderPositions =
    pricesData && Object.keys(pricesData).length
      ? _leaderPositions
          .map((p) => {
            const collateralToken = utils.getAddress(p.collateralToken);
            if (!(collateralToken in pricesData)) {
              throw new Error(`Unable to find price for token ${collateralToken}`);
            }

            const value = p.sizeInTokens.mul(pricesData[collateralToken].minPrice);
            return {
              ...p,
              unrealizedPnl: (p.isLong ? p.sizeInUsd.sub(value) : value.sub(p.sizeInUsd)).add(p.realizedPnl),
            };
          })
          .sort((a, b) => (b.unrealizedPnl.sub(a.unrealizedPnl).isNegative() ? -1 : 1))
      : [];

  const fetchTopAccounts = useCallback(
    async ({
      period = "hourly",
      pageSize = 100,
      offset = 0,
      orderBy = "totalPnl",
      orderDirection = "desc",
      since = 0,
    }: TopAccountParams = {}): Promise<Array<AccountPerf>> => {
      const res = await graph.current.query<{ accountPerfs: Array<AccountPerfJson> }>({
        query: queryAccountPerformance,
        variables: { pageSize, offset, period, orderBy, orderDirection, since },
      });
      // TODO: cache
      // TODO: handle errors
      return res.data.accountPerfs.map((a) => ({
        ...a,
        wins: BigNumber.from(a.wins),
        losses: BigNumber.from(a.losses),
        volume: BigNumber.from(a.volume),
        totalPnl: BigNumber.from(a.totalPnl),
        maxCollateral: BigNumber.from(a.maxCollateral),
      }));
    },
    []
  );

  const fetchTopPositions = useCallback(
    async ({
      pageSize = 100,
      offset = 0,
      orderBy = "sizeInUsd",
      orderDirection = "desc",
    }: TopPositionParams = {}): Promise<Array<AccountOpenPosition>> => {
      const res = await graph.current.query<{ accountOpenPositions: Array<AccountOpenPositionJson> }>({
        query: queryAccountOpenPositions,
        variables: { pageSize, offset, orderBy, orderDirection },
      });
      // TODO: cache
      // TODO: handle errors
      return res.data.accountOpenPositions.map((p) => ({
        ...p,
        sizeInTokens: BigNumber.from(p.sizeInTokens),
        sizeInUsd: BigNumber.from(p.sizeInUsd),
        realizedPnl: BigNumber.from(p.realizedPnl),
      }));
    },
    []
  );

  const daysAgo = (x: number) => new Date(Date.now() - 1000 * 60 * 60 * 24 * x).setHours(0, 0, 0, 0) / 1000;

  const setPeriod = useCallback(
    async (selectedPeriod: AccountFilterPeriod): Promise<void> => {
      const filtersByPeriod: { [key in AccountFilterPeriod]: TopAccountParams } = {
        [AccountFilterPeriod.DAY]: { period: "hourly", since: daysAgo(1) },
        [AccountFilterPeriod.WEEK]: { period: "daily", since: daysAgo(7) },
        [AccountFilterPeriod.MONTH]: { period: "daily", since: daysAgo(30) },
        [AccountFilterPeriod.TOTAL]: { period: "daily" },
      };

      if (!(selectedPeriod in filtersByPeriod)) {
        throw new Error(`Invalid period: ${selectedPeriod}`);
      }

      _setPeriod(selectedPeriod);
      const leaders = await fetchTopAccounts(filtersByPeriod[selectedPeriod]);
      setLeaderAccountsByPeriod((others) => ({ ...others, [selectedPeriod]: leaders }));
    },
    [_setPeriod, fetchTopAccounts, setLeaderAccountsByPeriod]
  );

  useEffect(() => {
    void (async () => {
      setPeriod(AccountFilterPeriod.DAY);
      const positions = await fetchTopPositions({});
      // TODO: get distinct markets from positions
      // TODO: fetch matket prices
      // TODO: calculate position pnls
      // TODO: sort, split
      setLeaderPositions(positions);
    })();
  }, [fetchTopPositions, setPeriod]);

  const context: LeaderboardContextType = {
    leaderAccounts,
    leaderPositions,
    period,
    setPeriod,
  };

  return <LeaderboardContext.Provider value={context}>{children}</LeaderboardContext.Provider>;
};
