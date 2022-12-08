import { getTokensMap, getWhitelistedTokens } from "config/tokens";
import { Account } from "domain/account";
import { useMemo } from "react";
import { TokensData } from "./types";
import { useTokenBalances } from "./useTokenBalances";
import { useTokenRecentPrices } from "./useTokenRecentPrices";

export function useTokensData(chainId: number, p: { account?: Account; addresses?: string[] }): TokensData {
  const balancesData = useTokenBalances(chainId, { account: p.account, addresses: p.addresses });
  const pricesData = useTokenRecentPrices(chainId);
  const tokenConfigs = getTokensMap(chainId);

  const result = useMemo(
    () => ({ ...balancesData, ...pricesData, tokenConfigs }),
    [balancesData, pricesData, tokenConfigs]
  );

  return result;
}

export function useWhitelistedTokensData(chainId: number, p: { account?: string | null }) {
  const addresses = getWhitelistedTokens(chainId).map((token) => token.address);

  return useTokensData(chainId, { account: p.account, addresses });
}
