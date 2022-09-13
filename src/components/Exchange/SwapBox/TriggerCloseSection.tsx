import { Trans} from "@lingui/macro";
import { BigNumber } from "ethers";
import { formatAmount, formatAmountFree, USD_DECIMALS } from "../../../lib/legacy";
import TokenSelector from "../TokenSelector";

type Props = {
    chainId: string,
    tokens: any[],
    infoTokens: any,
    tokenAddress: string,
    onSelectToken: (token: any) => void,
    closeSize: string,
    closeSizeUsd: BigNumber,
    onSizeChanged: (val: string) => void,
    priceValue: number,
    entryMarkPrice: BigNumber,
    onPriceChanged: (val: string) => void,
}

export function TriggerCloseSection(p: Props) {
    return (
        <>
            <div className="Exchange-swap-section">
              <div className="Exchange-swap-section-top">
                <div className="muted">
                  {p.closeSizeUsd && (
                    <div className="Exchange-swap-usd">Close: {formatAmount(p.closeSizeUsd, USD_DECIMALS, 2, true)} USD</div>
                  )}
                  {!p.closeSizeUsd && "Close"}
                </div>
              </div>
              <div className="Exchange-swap-section-bottom">
                <div className="Exchange-swap-input-container">
                  <input
                    type="number"
                    min="0"
                    placeholder="0.0"
                    className="Exchange-swap-input"
                    value={p.closeSize}
                    onChange={(e) => p.onSizeChanged(e.target.value)}
                  />
                </div>
                <div>
                  <TokenSelector
                    label="Market"
                    chainId={p.chainId}
                    tokenAddress={p.tokenAddress}
                    onSelectToken={p.onSelectToken}
                    tokens={p.tokens}
                    infoTokens={p.infoTokens}
                    showMintingCap={false}
                    showTokenImgInDropdown={true}
                  />
                </div>
              </div>
            </div>

            <div className="Exchange-swap-section">
                <div className="Exchange-swap-section-top">
                <div className="muted">
                    <Trans>Price</Trans>
                </div>
                <div
                    className="muted align-right clickable"
                    onClick={() => {
                        p.onPriceChanged(formatAmountFree(p.entryMarkPrice, USD_DECIMALS, 2));
                    }}
                >
                    Mark: {formatAmount(p.entryMarkPrice, USD_DECIMALS, 2, true)}
                </div>
                </div>
                <div className="Exchange-swap-section-bottom">
                <div className="Exchange-swap-input-container">
                    <input
                        type="number"
                        min="0"
                        placeholder="0.0"
                        className="Exchange-swap-input"
                        value={p.priceValue}
                        onChange={(e) => p.onPriceChanged(e.target.value)}
                    />
                </div>
                <div className="PositionEditor-token-symbol">USD</div>
                </div>
            </div>
        </>
    )
}