import { Trans, t } from "@lingui/macro";
import Modal from "components/Modal/Modal";
import { SubmitButton } from "components/SubmitButton/SubmitButton";
import { helperToast } from "lib/helperToast";
import { BASIS_POINTS_DIVISOR } from "lib/legacy";
import { useState } from "react";

type Props = {
  onClose: () => void;
  savedAcceptablePriceImpactBps: number;
  saveAcceptablePriceImpactBps: (acceptablePriceImpactBps: number) => void;
};

export function AcceptbablePriceImpactEditor(p: Props) {
  const parsedSavedValue = (parseInt(p.savedAcceptablePriceImpactBps!.toString()) / BASIS_POINTS_DIVISOR) * 100;

  const [inputValue, setInputValue] = useState(parsedSavedValue.toString());

  function onSubmit() {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      helperToast.error(t`Invalid acceptable price impact value`);
      return;
    }

    const bps = (parsed * BASIS_POINTS_DIVISOR) / 100;
    if (parseInt(bps.toString()) !== parseFloat(bps.toString())) {
      helperToast.error(t`Max acceptable price impact precision is 0.01%`);
      return;
    }

    p.saveAcceptablePriceImpactBps(bps);
    p.onClose();
  }

  return (
    <Modal className="App-settings" isVisible={true} setIsVisible={p.onClose} label={t`Edit`}>
      <div className="App-settings-row">
        <div>
          <Trans>Acceptable Price Impact</Trans>
        </div>
        <div className="App-slippage-tolerance-input-container">
          <input
            type="number"
            className="App-slippage-tolerance-input"
            min="0"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <div className="App-slippage-tolerance-input-percent">%</div>
        </div>
      </div>

      <SubmitButton onClick={onSubmit}>{t`Save`}</SubmitButton>
    </Modal>
  );
}