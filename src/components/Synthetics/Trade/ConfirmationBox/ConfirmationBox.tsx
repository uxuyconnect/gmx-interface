import { t, Trans } from "@lingui/macro";
import { useWeb3React } from "@web3-react/core";
import cx from "classnames";
import { ApproveTokenButton } from "components/ApproveTokenButton/ApproveTokenButton";
import Modal from "components/Modal/Modal";
import { SubmitButton } from "components/SubmitButton/SubmitButton";
import { getContract } from "config/contracts";
import { useTokenAllowance } from "domain/synthetics/tokens/useTokenAllowance";
import {
  convertToUsdByPrice,
  formatTokenAmount,
  formatTokenAmountWithUsd,
  formatUsdAmount,
  getTokenData,
  getUsdFromTokenAmount,
  needTokenApprove,
} from "domain/synthetics/tokens/utils";
import { Token } from "domain/tokens";
import { BigNumber } from "ethers";
import { useChainId } from "lib/chains";

import { useAvailableTradeTokensData } from "domain/synthetics/tokens";

import { useUserReferralCode } from "domain/referrals";
import { Fees, getSubmitError, TradeMode, TradeType, tradeTypeLabels } from "../utils";

import { OrderType } from "config/synthetics";
import { SwapRoute } from "domain/synthetics/exchange";
import { createOrderTxn } from "domain/synthetics/orders";

import { InfoRow } from "components/InfoRow/InfoRow";
import { getMarketName, useMarketsData } from "domain/synthetics/markets";
import { USD_DECIMALS } from "lib/legacy";
import { formatAmount } from "lib/numbers";
import { TradeFees } from "../TradeFees/TradeFees";
import "./ConfirmationBox.scss";

type Props = {
  operationType: TradeType;
  mode: TradeMode;
  fees: Fees;
  fromTokenAddress?: string;
  fromTokenAmount?: BigNumber;
  toTokenAddress?: string;
  toTokenAmount?: BigNumber;
  fromTokenPrice?: BigNumber;
  toTokenPrice?: BigNumber;
  collateralTokenAddress?: string;
  sizeDeltaUsd?: BigNumber;
  entryPrice?: BigNumber;
  liqPrice?: BigNumber;
  leverage?: number;
  acceptablePrice?: BigNumber;
  triggerPrice?: BigNumber;
  swapTriggerRatio?: BigNumber;
  swapRoute?: SwapRoute;
  onClose: () => void;
  onSubmitted: () => void;
};

function getTokenText(token?: Token, tokenAmount?: BigNumber, price?: BigNumber) {
  if (!token || !price || !tokenAmount) return undefined;

  const usdAmount = convertToUsdByPrice(tokenAmount, token.decimals, price);

  return formatTokenAmountWithUsd(tokenAmount, usdAmount, token.symbol, token.decimals);
}

export function ConfirmationBox(p: Props) {
  const { library, account } = useWeb3React();
  const { chainId } = useChainId();
  const routerAddress = getContract(chainId, "SyntheticsRouter");

  const tokensData = useAvailableTradeTokensData(chainId);
  const marketsData = useMarketsData(chainId);
  const referralCodeData = useUserReferralCode(library, chainId, account);

  const tokenAllowanceData = useTokenAllowance(chainId, {
    spenderAddress: routerAddress,
    tokenAddresses: p.fromTokenAddress ? [p.fromTokenAddress] : [],
  });

  const fromToken = getTokenData(tokensData, p.fromTokenAddress);
  const toToken = getTokenData(tokensData, p.toTokenAddress);

  const collateralUsd = getUsdFromTokenAmount(tokensData, fromToken?.address, p.fromTokenAmount);

  const fromTokenText = getTokenText(fromToken, p.fromTokenAmount, fromToken?.prices?.minPrice);
  const toTokenText = getTokenText(toToken, p.toTokenAmount, toToken?.prices?.maxPrice);

  const isAllowanceLoaded = Object.keys(tokenAllowanceData).length > 0;

  const needFromTokenApproval = needTokenApprove(tokenAllowanceData, p.fromTokenAddress, p.fromTokenAmount);

  const isSwap = p.operationType === TradeType.Swap;
  const isPosition = [TradeType.Long, TradeType.Short].includes(p.operationType);
  const isLimit = p.mode === TradeMode.Limit;
  const isLong = p.operationType === TradeType.Long;

  function getReceiveText() {
    if (p.operationType === TradeType.Swap) {
      return t`Receive`;
    }

    return p.operationType === TradeType.Long ? t`Long` : t`Short`;
  }

  function getSubmitButtonState(): { text: string; disabled?: boolean; onClick?: () => void } {
    const error = getSubmitError({
      operationType: p.operationType,
      mode: p.mode,
      tokensData,
      fromTokenAddress: p.fromTokenAddress,
      fromTokenAmount: p.fromTokenAmount,
      toTokenAddress: p.toTokenAddress,
      swapPath: p.swapRoute?.swapPath,
      triggerPrice: p.triggerPrice,
      swapTriggerRatio: p.swapTriggerRatio,
    });

    if (error) {
      return {
        text: error,
        disabled: true,
      };
    }

    if (!isAllowanceLoaded || !fromToken || !toToken) {
      return {
        text: t`Loading...`,
        disabled: true,
      };
    }

    if (needFromTokenApproval) {
      return {
        text: t`Pending ${fromToken?.symbol} approval`,
        disabled: true,
      };
    }

    let text = "";

    if (isSwap) {
      text = t`Swap`;
    } else if (isLimit) {
      text = t`Create Limit Order`;
    } else {
      text = isLong ? t`Long` : t`Short`;
    }

    return {
      text,
      onClick: onSubmit,
    };
  }

  function onSubmit() {
    if (
      !account ||
      !p.fromTokenAddress ||
      !p.toTokenAddress ||
      !p.fees.executionFee?.feeTokenAmount ||
      !p.swapRoute ||
      !p.fromTokenAmount
    )
      return;

    function applySlippage(price: BigNumber) {
      return isLong ? price.add(price.div(10)) : price.div(10);
    }

    if ([TradeType.Long, TradeType.Short].includes(p.operationType)) {
      if ([TradeMode.Market, TradeMode.Limit].includes(p.mode)) {
        const { market, swapPath } = p.swapRoute;

        if (!market || !p.sizeDeltaUsd || !p.acceptablePrice) return;

        const orderType = p.mode === TradeMode.Limit ? OrderType.LimitIncrease : OrderType.MarketIncrease;
        const isLong = p.operationType === TradeType.Long;

        const triggerPrice = p.triggerPrice ? p.triggerPrice : undefined;
        const acceptablePrice = applySlippage(triggerPrice || p.acceptablePrice);

        // eslint-disable-next-line no-console
        console.log("order params", {
          marketAddress: getMarketName(marketsData, tokensData, market),
          initialCollateralAddress: getTokenData(tokensData, p.fromTokenAddress)?.symbol,
          initialCollateralAmount: formatTokenAmount(
            p.fromTokenAmount,
            getTokenData(tokensData, p.fromTokenAddress)?.decimals
          ),
          swapPath: swapPath.map((market) => getMarketName(marketsData, tokensData, market)),
          indexTokenAddress: getTokenData(tokensData, p.toTokenAddress)?.symbol,
          sizeDeltaUsd: formatUsdAmount(p.sizeDeltaUsd),
          triggerPrice: formatUsdAmount(triggerPrice),
          acceptablePrice: formatUsdAmount(acceptablePrice),
          executionFee: p.fees.executionFee?.feeTokenAmount,
          isLong,
          orderType,
        });

        createOrderTxn(chainId, library, {
          account,
          marketAddress: market,
          initialCollateralAddress: p.fromTokenAddress,
          initialCollateralAmount: p.fromTokenAmount,
          swapPath: swapPath,
          indexTokenAddress: p.toTokenAddress,
          sizeDeltaUsd: p.sizeDeltaUsd,
          triggerPrice,
          acceptablePrice,
          executionFee: p.fees.executionFee.feeTokenAmount,
          isLong,
          orderType,
          referralCode: referralCodeData?.userReferralCodeString,
        }).then(p.onSubmitted);
      }
    }

    if (p.operationType === TradeType.Swap) {
      const orderType = p.mode === TradeMode.Limit ? OrderType.LimitSwap : OrderType.MarketSwap;

      const { swapPath } = p.swapRoute;

      createOrderTxn(chainId, library, {
        account,
        initialCollateralAddress: p.fromTokenAddress,
        initialCollateralAmount: p.fromTokenAmount,
        swapPath: swapPath,
        receiveTokenAddress: p.toTokenAddress,
        executionFee: p.fees.executionFee.feeTokenAmount,
        orderType,
        minOutputAmount: p.toTokenAmount?.sub(p.toTokenAmount.div(90)) || BigNumber.from(0),
        referralCode: referralCodeData?.userReferralCodeString,
      }).then(p.onSubmitted);
    }
  }

  const submitButtonState = getSubmitButtonState();

  return (
    <div className="Confirmation-box">
      <Modal
        isVisible={true}
        setIsVisible={p.onClose}
        label={t`Confirm ${tradeTypeLabels[p.operationType]}`}
        allowContentTouchMove
      >
        <div className={cx("Confirmation-box-main ConfirmationBox-main")}>
          <div>
            <Trans>Pay</Trans>&nbsp;{fromTokenText}
          </div>
          <div className="Confirmation-box-main-icon"></div>
          <div>
            {getReceiveText()}&nbsp;{toTokenText}
          </div>
        </div>

        {isSwap && (
          <>
            <InfoRow
              label={t`Min Receive`}
              value={formatTokenAmount(p.toTokenAmount, toToken?.decimals, toToken?.symbol)}
            />

            {p.swapTriggerRatio?.gt(0) && (
              <InfoRow label={t`Price`} value={formatAmount(p.swapTriggerRatio, USD_DECIMALS, 4)} />
            )}

            <InfoRow label={t`${fromToken?.symbol} Price`} value={formatUsdAmount(p.fromTokenPrice)} />
            <InfoRow label={t`${toToken?.symbol} Price`} value={formatUsdAmount(p.toTokenPrice)} />
          </>
        )}

        {isPosition && (
          <>
            <InfoRow label={t`Collateral In`} value={getTokenData(tokensData, p.collateralTokenAddress)?.symbol} />
            <InfoRow label={t`Collateral`} value={collateralUsd ? formatUsdAmount(collateralUsd) : "..."} />

            {p.leverage && <InfoRow label={t`Leverage`} value={`${p.leverage?.toFixed(2)}x`} />}

            <div className="App-card-divider" />

            {p.entryPrice && !isLimit && <InfoRow label={t`Entry price`} value={formatUsdAmount(p.entryPrice)} />}

            {p.triggerPrice && <InfoRow label={t`Trigger price`} value={formatUsdAmount(p.triggerPrice)} />}

            {p.liqPrice && <InfoRow label={t`Liq price`} value={formatUsdAmount(p.liqPrice)} />}
          </>
        )}

        <div className="App-card-divider" />

        <TradeFees fees={p.fees} />

        {needFromTokenApproval && fromToken && (
          <>
            <div className="App-card-divider" />

            <div className="ConfirmationBox-approve-tokens">
              <div className="ConfirmationBox-approve-token">
                <ApproveTokenButton
                  tokenAddress={fromToken.address}
                  tokenSymbol={fromToken.symbol}
                  spenderAddress={routerAddress}
                />
              </div>
            </div>

            <div className="App-card-divider" />
          </>
        )}
        <div className="Confirmation-box-row">
          <SubmitButton onClick={submitButtonState.onClick} disabled={submitButtonState.disabled}>
            {submitButtonState.text}
          </SubmitButton>
        </div>
      </Modal>
    </div>
  );
}
