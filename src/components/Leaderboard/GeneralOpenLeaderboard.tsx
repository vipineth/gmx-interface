import { Trans } from "@lingui/macro";
import Pagination from "components/Pagination/Pagination";
// import { useGeneralOpenLeaderboard } from "domain/leaderboard/useGeneralLeaderboards";
// import { useChainId } from "lib/chains";
import { shortenAddress, USD_DECIMALS } from "lib/legacy";
import { formatAmount } from "lib/numbers";
// import { useDebounce } from "lib/useDebounce";
import { useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useLeaderboardContext } from "./Context";
import { BigNumber } from "ethers";

export default function GeneralOpenLeaderboard() {
  // const { chainId } = useChainId();
  // const { data: stats, loading } = useGeneralOpenLeaderboard(chainId, 0);
  const [page, setPage] = useState(1);
  const perPage = 15;
  // const [search, setSearch] = useState("");
  // const debouncedSearch = useDebounce(search, 300);
  const { leaderPositions } = useLeaderboardContext();

  // const filteredStats = () => {
  //   return stats.filter((stat) => stat.address.indexOf(debouncedSearch.toLowerCase()) !== -1);
  // };

  const displayedStats = leaderPositions.slice((page - 1) * perPage, page * perPage);
  const pageCount = leaderPositions.length / perPage;

  // const handleSearchInput = ({ target }) => {
  //   setSearch(target.value);
  // };

  return (
    <div>
      <div className="leaderboard-header">
        <div className="input-wrapper">
          <input
            type="text"
            placeholder="Search Address"
            className="leaderboard-search-input text-input input-small"
            value={""}
            onInput={() => {}}
          />
          <FiSearch className="input-logo" />
        </div>
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
            <th>
              <Trans>Token</Trans>
            </th>
            <th>
              <Trans>Entry Price ($)</Trans>
            </th>
            <th>
              <Trans>Size ($)</Trans>
            </th>
            <th className="text-right">
              <Trans>Liq. Price ($)</Trans>
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
          {displayedStats.map(({ id, account, unrealizedPnl, isLong, market, sizeInUsd }, i) => (
            <tr key={id}>
              <td>{`#${i + 1}`}</td>
              <td>{shortenAddress(account, 12)}</td>
              <td>{formatAmount(unrealizedPnl, USD_DECIMALS, 0, true)}</td>
              <td>{`${isLong ? "Long" : "Short"} ${shortenAddress(market, 12)}`}</td>
              <td>{formatAmount(BigNumber.from(0), USD_DECIMALS, 2, true)}</td>
              <td>{formatAmount(sizeInUsd, USD_DECIMALS, 0, true)}</td>
              <td className="text-right">{formatAmount(BigNumber.from(0), USD_DECIMALS, 2, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={page} pageCount={pageCount} onPageChange={(p) => setPage(p)} />
    </div>
  );
}
