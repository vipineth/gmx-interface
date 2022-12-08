import Multicall from "abis/Multicall.json";
import Token from "abis/Token.json";
import { getContract } from "config/contracts";
import { Account } from "domain/account";
import { BigNumber } from "ethers";
import { isAddressZero } from "lib/legacy";
import { useMulticall } from "lib/multicall";
import { useMemo } from "react";
import { TokenBalancesData } from "./types";

export function useTokenBalances(chainId: number, p: { account?: Account; addresses?: string[] }): TokenBalancesData {
  const { account, addresses = [] } = p;
  const key = account && addresses.length > 0 ? [p.account, addresses.join("-")] : null;

  const { data: tokenBalances } = useMulticall(chainId, "useTokenBalances", {
    key,
    request: () =>
      addresses.reduce((requests, address) => {
        if (isAddressZero(address)) {
          requests[address] = {
            contractAddress: getContract(chainId, "Multicall"),
            abi: Multicall.abi,
            calls: {
              balance: {
                methodName: "getEthBalance",
                params: [p.account],
              },
            },
          };
        } else {
          requests[address] = {
            contractAddress: address,
            abi: Token.abi,
            calls: {
              balance: {
                methodName: "balanceOf",
                params: [p.account],
              },
            },
          };
        }

        return requests;
      }, {}),
    parseResponse: (res) =>
      Object.keys(res).reduce((balances, address) => {
        balances[address] = res[address].balance.returnValues[0];

        return balances;
      }, {} as { [address: string]: BigNumber }),
  });

  return useMemo(() => {
    return {
      tokenBalances: tokenBalances || {},
    };
  }, [tokenBalances]);
}
