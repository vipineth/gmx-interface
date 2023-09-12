import { BigNumber } from "ethers";
import { USD_DECIMALS } from "lib/legacy";
import { formatAmount } from "lib/numbers";

export const signedValueClassName = (num: BigNumber) => (
  num.isZero() ? "" : (num.isNegative() ? "negative" : "positive")
);

export const formatDelta = (delta: BigNumber, {
  decimals = USD_DECIMALS,
  displayDecimals = 2,
  useCommas = true,
  ...p
}: {
  decimals?: number;
  displayDecimals?: number;
  useCommas?: boolean;
  prefixoid?: string;
  signed?: boolean;
  prefix?: string;
  postfix?: string;
} = {}) => (
  `${
    p.prefixoid ? `${p.prefixoid} ` : ""
  }${
    p.signed ? (delta.eq(0) ? "" : (delta.gt(0) ? "+" : "-")) : ""
  }${
    p.prefix || ""
  }${
    formatAmount(p.signed ? delta.abs() : delta, decimals, displayDecimals, useCommas)
  }${
    p.postfix || ""
  }`
);

export const Profiler = () => {
  const start = new Date();
  const profile: [string, number][] = [];
  const registered = new Set<string>([]);
  let last = start;

  return Object.assign((msg: string) => {
    if (registered.has(msg)) {
      return;
    }
    const now = new Date();
    const time = now.getTime() - last.getTime();
    profile.push([msg, time]);
    last = now;
    registered.add(msg);
    return time;
  }, {
    getTime() {
      return last.getTime() - start.getTime();
    },
    report() {
      // eslint-disable-next-line no-console
      console.groupCollapsed(`Total profiling time: ${this.getTime()}`);
      // eslint-disable-next-line no-console
      for (const [m, time] of profile) console.info(`  • ${m}: +${time}ms`);
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  });
};
