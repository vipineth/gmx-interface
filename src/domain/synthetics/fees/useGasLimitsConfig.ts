import { getContract } from "config/contracts";
import DataStore from "abis/DataStore.json";
import { useMulticall } from "lib/multicall";
import {
  ESTIMATED_GAS_FEE_BASE_AMOUNT,
  ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR,
  decreaseOrderGasLimitKey,
  depositGasLimitKey,
  increaseOrderGasLimitKey,
  singleSwapGasLimitKey,
  swapOrderGasLimitKey,
  withdrawalGasLimitKey,
} from "config/dataStore";
import { BigNumber } from "ethers";
import { useMemo } from "react";
import { GasLimitsConfig } from "./types";

type GasLimitsResult = {
  gasLimits: GasLimitsConfig | undefined;
  isLoading: boolean;
};

export function useGasLimitsConfig(chainId: number): GasLimitsResult {
  const { data, isLoading } = useMulticall(chainId, "useGasLimitsConfig", {
    key: [],
    request: {
      dataStore: {
        contractAddress: getContract(chainId, "DataStore"),
        abi: DataStore.abi,
        calls: {
          depositSingleToken: {
            methodName: "getUint",
            params: [depositGasLimitKey(true)],
          },
          depositMultiToken: {
            methodName: "getUint",
            params: [depositGasLimitKey(false)],
          },
          withdrawalSingleToken: {
            methodName: "getUint",
            params: [withdrawalGasLimitKey(true)],
          },
          withdrawalMultiToken: {
            methodName: "getUint",
            params: [withdrawalGasLimitKey(false)],
          },
          singleSwap: {
            methodName: "getUint",
            params: [singleSwapGasLimitKey()],
          },
          swapOrder: {
            methodName: "getUint",
            params: [swapOrderGasLimitKey()],
          },
          increaseOrder: {
            methodName: "getUint",
            params: [increaseOrderGasLimitKey()],
          },
          decreaseOrder: {
            methodName: "getUint",
            params: [decreaseOrderGasLimitKey()],
          },
          estimatedFeeBaseGasLimit: {
            methodName: "getUint",
            params: [ESTIMATED_GAS_FEE_BASE_AMOUNT],
          },
          estimatedFeeMultiplierFactor: {
            methodName: "getUint",
            params: [ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR],
          },
        },
      },
    },
    parseResponse: (res) => {
      const results = res.dataStore;

      return {
        depositSingleToken: results.depositSingleToken.returnValues[0] as BigNumber,
        depositMultiToken: results.depositMultiToken.returnValues[0] as BigNumber,
        withdrawalSingleToken: results.withdrawalSingleToken.returnValues[0] as BigNumber,
        withdrawalMultiToken: results.withdrawalMultiToken.returnValues[0] as BigNumber,
        singleSwap: results.singleSwap.returnValues[0] as BigNumber,
        swapOrder: results.swapOrder.returnValues[0] as BigNumber,
        increaseOrder: results.increaseOrder.returnValues[0] as BigNumber,
        decreaseOrder: results.decreaseOrder.returnValues[0] as BigNumber,
        estimatedFeeBaseGasLimit: results.estimatedFeeBaseGasLimit.returnValues[0] as BigNumber,
        estimatedFeeMultiplierFactor: results.estimatedFeeMultiplierFactor.returnValues[0] as BigNumber,
      };
    },
  });

  return useMemo(() => {
    return {
      gasLimits: data,
      isLoading,
    };
  }, [data, isLoading]);
}