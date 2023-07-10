import { Trans } from "@lingui/macro";
import Pagination from "components/Pagination/Pagination";
import Tab from "components/Tab/Tab";
// import { useGeneralSettledLeaderboard } from "domain/leaderboard/useGeneralLeaderboards";
// import { useChainId } from "lib/chains";
import { shortenAddress, USD_DECIMALS } from "lib/legacy";
import { formatAmount } from "lib/numbers";
// import { useDebounce } from "lib/useDebounce";
import { useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useLeaderboardContext } from "./Context";
import { AccountFilterPeriod } from "./types";
import { BigNumberish } from "ethers";

export default function GeneralSettledLeaderboard() {
  // const { chainId } = useChainId();
  const [page, setPage] = useState(1);
  // const { data: stats, loading } = useGeneralSettledLeaderboard(chainId, period);
  const perPage = 15;
  const [search, setSearch] = useState("");
  // const debouncedSearch = useDebounce(search, 300);
  const { leaderAccounts, period, setPeriod } = useLeaderboardContext();

  // const filteredStats = () => {
  //   return stats.filter((stat) => stat.account.indexOf(debouncedSearch.toLowerCase()) !== -1);
  // };

  // eslint-disable-next-line
  console.log({ leaderAccounts });

  const displayedStats = leaderAccounts.slice((page - 1) * perPage, page * perPage);
  const pageCount = Math.ceil(leaderAccounts.length / perPage);
  const handleSearchInput = ({ target }) => {
    setSearch(target.value); // TODO: update filter
  };

  return (
    <div>
      <div className="leaderboard-header">
        <div className="input-wrapper">
          <input
            type="text"
            placeholder="Search Address"
            className="leaderboard-search-input text-input input-small"
            value={search}
            onInput={handleSearchInput}
          />
          <FiSearch className="input-logo" />
        </div>
        <Tab
          className="Exchange-swap-order-type-tabs"
          type="inline"
          option={period}
          onChange={(val) => setPeriod(val)}
          options={[AccountFilterPeriod.DAY, AccountFilterPeriod.WEEK, AccountFilterPeriod.MONTH]}
          optionLabels={["24 hours", "7 days", "1 month"]}
        />
      </div>
      <table className="Exchange-list large App-box">
        <tbody>
          <tr className="Exchange-list-header">
            <th>
              <Trans>Rank</Trans>
            </th>
            <th>
              <Trans>Address</Trans>
            </th>
            <th>
              <Trans>PnL ($)</Trans>
            </th>
            <th className="text-right">
              <Trans>Win / Loss</Trans>
            </th>
          </tr>
          {/* {loading && (
            <tr>
              <td colSpan={5}>Loading...</td>
            </tr>
          )}
          {!loading && filteredStats().length === 0 && (
            <tr>
              <td colSpan={9}>Not account found</td>
            </tr>
          )} */}
          {displayedStats.length
            ? displayedStats.map(({ id, account, totalPnl, wins, losses }, i) => (
                <tr key={id}>
                  <td>{`#${i + 1}`}</td>
                  <td>{shortenAddress(account, 12)}</td>
                  <td>{formatAmount(totalPnl as BigNumberish, USD_DECIMALS, 0, true)}</td>
                  <td className="text-right">{`${wins} / ${losses}`}</td>
                </tr>
              ))
            : null}
        </tbody>
      </table>
      <Pagination page={page} pageCount={pageCount} onPageChange={(p) => setPage(p)} />
    </div>
  );
}
