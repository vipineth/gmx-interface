import { Trans } from "@lingui/macro";
import { useTradeHistory } from "domain/synthetics/tradeHistory";
import { useChainId } from "lib/chains";
import { TradeHistoryRow } from "../TradeHistoryRow/TradeHistoryRow";
import { useState } from "react";

const PAGE_SIZE = 100;

type Props = {
  shouldShowPaginationButtons: boolean;
};

export function TradeHistory(p: Props) {
  const { shouldShowPaginationButtons } = p;
  const { chainId } = useChainId();
  const [pageIndex, setPageIndex] = useState(0);

  const { tradeActions, isLoading } = useTradeHistory(chainId, { pageIndex, pageSize: PAGE_SIZE });

  const isEmpty = !isLoading && !tradeActions?.length;

  return (
    <div className="TradeHistory">
      {isEmpty && (
        <div className="TradeHistoryRow App-box">
          <Trans>No trades yet</Trans>
        </div>
      )}
      {tradeActions?.map((tradeAction) => (
        <TradeHistoryRow key={tradeAction.id} tradeAction={tradeAction} />
      ))}
      {shouldShowPaginationButtons && (
        <div>
          {pageIndex > 0 && (
            <button className="App-button-option App-card-option" onClick={() => setPageIndex((old) => old - 1)}>
              <Trans>Prev</Trans>
            </button>
          )}
          {tradeActions && tradeActions.length >= PAGE_SIZE && (
            <button className="App-button-option App-card-option" onClick={() => setPageIndex((old) => old + 1)}>
              <Trans>Next</Trans>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
