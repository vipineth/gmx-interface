import { BigNumber } from "ethers";

export type AccountPerfJson = {
  id: string;
  timestamp: number;
  period: "hourly" | "daily";
  account: string;
  wins: string;
  losses: string;
  volume: string;
  totalPnl: string;
  maxCollateral: string;
};

export type AccountPerf = {
  id: string;
  timestamp: number;
  period: "hourly" | "daily";
  account: string;
  wins: BigNumber;
  losses: BigNumber;
  volume: BigNumber;
  totalPnl: BigNumber;
  maxCollateral: BigNumber;
};

export type AccountOpenPositionJson = {
  id: string;
  account: string;
  market: string;
  collateralToken: string;
  isLong: boolean;
  sizeInTokens: string;
  sizeInUsd: string;
  realizedPnl: string;
};

export type AccountOpenPosition = {
  id: string;
  account: string;
  market: string;
  collateralToken: string;
  isLong: boolean;
  sizeInTokens: BigNumber;
  sizeInUsd: BigNumber;
  realizedPnl: BigNumber;
};

export enum AccountFilterPeriod {
  DAY,
  WEEK,
  MONTH,
  TOTAL,
}

export type AccountPerfByPeriod = {
  [key in AccountFilterPeriod]?: AccountPerf[];
};

export type TopAccountParams = {
  period?: "daily" | "hourly";
  pageSize?: number;
  offset?: number;
  orderBy?: "totalPnl";
  orderDirection?: "desc";
  since?: number;
};

export type TopPositionParams = {
  pageSize?: number;
  offset?: number;
  orderBy?: "sizeInUsd";
  orderDirection?: "desc";
};

export type LeaderboardContextType = {
  leaderPositions: Array<AccountOpenPosition & { unrealizedPnl: BigNumber }>;
  leaderAccounts: Array<AccountPerf>;
  period: AccountFilterPeriod;
  setPeriod: (_: AccountFilterPeriod) => void;
};
