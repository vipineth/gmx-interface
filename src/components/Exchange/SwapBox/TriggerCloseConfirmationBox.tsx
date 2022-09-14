import { useState } from "react"
import { getTokenInfo } from "../../../lib/legacy";
import Modal from "../../Modal/Modal"

type Props = {
    onConfirmationClick: () => void,
    orderOption: string,
    swapOption: string,
    toTokenAddress: string,
    infoTokens: any,
}

export function TriggerCloseConfirmationBox(p: Props) {
    const [isConfirming, setIsConfirming] = useState(false);

    const toToken = getTokenInfo(p.infoTokens, p.toTokenAddress);

    function getTitle() {
        const orderName = p.orderOption;
        const swapType = p.swapOption;
        const token = toToken.symbol;

        return `Open ${orderName} order for ${token} ${swapType}`;
    }

    return (
        <div className="Confirmation-box">
            <Modal isVisible={true} setIsVisible={() => setIsConfirming(false)} label={getTitle()}>
                <div className="Confirmation-box-row">
                    <button
                        onClick={p.onConfirmationClick}
                        className="App-cta Confirmation-box-button"
                        disabled={false}
                    >
                        Confirm
                    </button>
                </div>
            </Modal>
      </div>
    )
}