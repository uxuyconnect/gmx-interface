import { applySwapImpactWithCap, getPriceImpactForSwap, getSwapFee } from "domain/synthetics/fees";
import { MarketInfo, marketTokenAmountToUsd, usdToMarketTokenAmount } from "domain/synthetics/markets";
import { TokenData, convertToTokenAmount, convertToUsd, getMidPrice } from "domain/synthetics/tokens";
import { bigMath } from "lib/bigmath";
import { applyFactor } from "lib/numbers";
import { DepositAmounts } from "../types";
import { GlvMarketInfo } from "../../markets/useGlvMarkets";

export function getDepositAmounts(p: {
  marketInfo: MarketInfo;
  marketToken: TokenData;
  longToken: TokenData;
  shortToken: TokenData;
  longTokenAmount: bigint;
  shortTokenAmount: bigint;
  marketTokenAmount: bigint;
  strategy: "byCollaterals" | "byMarketToken";
  includeLongToken: boolean;
  includeShortToken: boolean;
  uiFeeFactor: bigint;
  forShift?: boolean;
  isMarketTokenDeposit: boolean;
  vaultInfo?: GlvMarketInfo;
}): DepositAmounts {
  const {
    marketInfo,
    marketToken,
    longToken,
    shortToken,
    longTokenAmount,
    shortTokenAmount,
    marketTokenAmount,
    strategy,
    includeLongToken,
    includeShortToken,
    uiFeeFactor,
    isMarketTokenDeposit,
    vaultInfo,
  } = p;

  const longTokenPrice = getMidPrice(longToken.prices);
  const shortTokenPrice = getMidPrice(shortToken.prices);

  const values: DepositAmounts = {
    longTokenAmount: 0n,
    longTokenUsd: 0n,
    shortTokenAmount: 0n,
    shortTokenUsd: 0n,
    marketTokenAmount: 0n,
    marketTokenUsd: 0n,
    swapFeeUsd: 0n,
    uiFeeUsd: 0n,
    swapPriceImpactDeltaUsd: 0n,
  };

  if (strategy === "byCollaterals") {
    if (longTokenAmount == 0n && shortTokenAmount == 0n) {
      return values;
    }

    values.longTokenAmount = longTokenAmount;
    values.longTokenUsd = convertToUsd(longTokenAmount, longToken.decimals, longTokenPrice)!;

    /**
     * If it's GM -> GLV deposit, then don't apply any fees or price impact, just convert GM to GLV
     */
    if (isMarketTokenDeposit && vaultInfo) {
      const gmTokenUsd = convertToUsd(longTokenAmount, longToken.decimals, longTokenPrice)!;
      const glvTokenAmount =
        convertToTokenAmount(gmTokenUsd, vaultInfo.indexToken.decimals, vaultInfo.indexToken.prices.minPrice) ?? 0n;
      const glvTokenUsd =
        convertToUsd(glvTokenAmount, vaultInfo.indexToken.decimals, vaultInfo.indexToken.prices.minPrice) ?? 0n;

      values.marketTokenAmount = glvTokenAmount;
      values.marketTokenUsd = glvTokenUsd;

      return values;
    }

    values.shortTokenAmount = shortTokenAmount;
    values.shortTokenUsd = convertToUsd(shortTokenAmount, shortToken.decimals, shortTokenPrice)!;

    values.swapPriceImpactDeltaUsd = getPriceImpactForSwap(
      marketInfo,
      longToken,
      shortToken,
      values.longTokenUsd,
      values.shortTokenUsd
    );

    const totalDepositUsd = values.longTokenUsd + values.shortTokenUsd;

    if (values.longTokenUsd > 0) {
      const swapFeeUsd = p.forShift
        ? 0n
        : getSwapFee(marketInfo, values.longTokenUsd, values.swapPriceImpactDeltaUsd > 0);
      values.swapFeeUsd = values.swapFeeUsd + swapFeeUsd;

      const uiFeeUsd = applyFactor(values.longTokenUsd, uiFeeFactor);
      values.uiFeeUsd = values.uiFeeUsd + uiFeeUsd;

      values.marketTokenAmount =
        values.marketTokenAmount +
        getMarketTokenAmountByCollateral({
          marketInfo,
          marketToken,
          tokenIn: longToken,
          tokenOut: shortToken,
          amount: values.longTokenAmount,
          priceImpactDeltaUsd: bigMath.mulDiv(values.swapPriceImpactDeltaUsd, values.longTokenUsd, totalDepositUsd),
          swapFeeUsd,
          uiFeeUsd,
        });
    }

    if (values.shortTokenUsd > 0) {
      const swapFeeUsd = p.forShift
        ? 0n
        : getSwapFee(marketInfo, values.shortTokenUsd, values.swapPriceImpactDeltaUsd > 0);
      values.swapFeeUsd = values.swapFeeUsd + swapFeeUsd;

      const uiFeeUsd = applyFactor(values.shortTokenUsd, uiFeeFactor);
      values.uiFeeUsd = values.uiFeeUsd + uiFeeUsd;

      values.marketTokenAmount =
        values.marketTokenAmount +
        getMarketTokenAmountByCollateral({
          marketInfo,
          marketToken,
          tokenIn: shortToken,
          tokenOut: longToken,
          amount: values.shortTokenAmount,
          priceImpactDeltaUsd: bigMath.mulDiv(values.swapPriceImpactDeltaUsd, values.shortTokenUsd, totalDepositUsd),
          swapFeeUsd,
          uiFeeUsd,
        });
    }

    values.marketTokenUsd = convertToUsd(values.marketTokenAmount, marketToken.decimals, marketToken.prices.minPrice)!;

    if (vaultInfo) {
      const glvPrice = vaultInfo.indexToken.prices.maxPrice;
      let marketTokenUsd: undefined | bigint = 0n;

      if (isMarketTokenDeposit) {
        marketTokenUsd = convertToUsd(values.longTokenAmount, longToken?.decimals, longToken?.prices.minPrice);
      } else {
        marketTokenUsd = values.marketTokenUsd;
      }
      const glvAmount = convertToTokenAmount(marketTokenUsd, vaultInfo.indexToken.decimals, glvPrice);
      if (glvAmount !== undefined && glvAmount > 0) {
        values.marketTokenAmount = glvAmount;
      }
    }
  } else if (strategy === "byMarketToken") {
    if (marketTokenAmount == 0n) {
      return values;
    }

    values.marketTokenAmount = marketTokenAmount;
    if (vaultInfo) {
      const glvPrice = vaultInfo.indexToken.prices.minPrice;
      values.marketTokenUsd = convertToUsd(marketTokenAmount, vaultInfo.indexToken.decimals, glvPrice)!;
    } else {
      values.marketTokenUsd = marketTokenAmountToUsd(marketInfo, marketToken, marketTokenAmount);
    }

    if (isMarketTokenDeposit && vaultInfo) {
      values.longTokenAmount = convertToTokenAmount(
        values.marketTokenUsd,
        marketToken.decimals,
        marketToken.prices.minPrice
      )!;
      return values;
    }

    const prevLongTokenUsd = convertToUsd(longTokenAmount, longToken.decimals, longTokenPrice)!;
    const prevShortTokenUsd = convertToUsd(shortTokenAmount, shortToken.decimals, shortTokenPrice)!;
    const prevSumUsd = prevLongTokenUsd + prevShortTokenUsd;

    if (p.forShift) {
      // Reverse the withdrawal amounts
      const longPoolAmount = marketInfo.longPoolAmount;
      const shortPoolAmount = marketInfo.shortPoolAmount;

      const longPoolUsd = convertToUsd(longPoolAmount, longToken.decimals, longToken.prices.maxPrice)!;
      const shortPoolUsd = convertToUsd(shortPoolAmount, shortToken.decimals, shortToken.prices.maxPrice)!;
      const totalPoolUsd = longPoolUsd + shortPoolUsd;

      values.longTokenUsd = bigMath.mulDiv(values.marketTokenUsd, longPoolUsd, totalPoolUsd);
      values.shortTokenUsd = bigMath.mulDiv(values.marketTokenUsd, shortPoolUsd, totalPoolUsd);
    } else if (includeLongToken && includeShortToken && prevSumUsd > 0) {
      values.longTokenUsd = bigMath.mulDiv(values.marketTokenUsd, prevLongTokenUsd, prevSumUsd);
      values.shortTokenUsd = values.marketTokenUsd - values.longTokenUsd;
    } else if (includeLongToken) {
      values.longTokenUsd = values.marketTokenUsd;
    } else if (includeShortToken) {
      values.shortTokenUsd = values.marketTokenUsd;
    }

    values.swapPriceImpactDeltaUsd = getPriceImpactForSwap(
      marketInfo,
      longToken,
      shortToken,
      values.longTokenUsd,
      values.shortTokenUsd
    );

    if (!p.forShift) {
      const swapFeeUsd = getSwapFee(marketInfo, values.marketTokenUsd, values.swapPriceImpactDeltaUsd > 0);
      values.swapFeeUsd = values.swapFeeUsd + swapFeeUsd;
    }

    const uiFeeUsd = applyFactor(values.marketTokenUsd, uiFeeFactor);
    values.uiFeeUsd = values.uiFeeUsd + uiFeeUsd;

    const totalFee = values.swapFeeUsd + values.uiFeeUsd;
    let totalDepositUsd = values.longTokenUsd + values.shortTokenUsd;

    // Adjust long and short token amounts to account for swap fee, ui fee and price impact
    if (totalDepositUsd > 0) {
      values.longTokenUsd = values.longTokenUsd + bigMath.mulDiv(totalFee, values.longTokenUsd, totalDepositUsd);
      values.shortTokenUsd = values.shortTokenUsd + bigMath.mulDiv(totalFee, values.shortTokenUsd, totalDepositUsd);

      totalDepositUsd = values.longTokenUsd + values.shortTokenUsd;

      // Ignore positive price impact
      if (values.swapPriceImpactDeltaUsd < 0 && totalDepositUsd > 0) {
        values.longTokenUsd =
          values.longTokenUsd + bigMath.mulDiv(-values.swapPriceImpactDeltaUsd, values.longTokenUsd, totalDepositUsd);

        values.shortTokenUsd =
          values.shortTokenUsd + bigMath.mulDiv(-values.swapPriceImpactDeltaUsd, values.shortTokenUsd, totalDepositUsd);
      }
    }

    values.longTokenAmount = convertToTokenAmount(values.longTokenUsd, longToken.decimals, longTokenPrice)!;
    values.shortTokenAmount = convertToTokenAmount(values.shortTokenUsd, shortToken.decimals, shortTokenPrice)!;
  }

  return values;
}

function getMarketTokenAmountByCollateral(p: {
  marketInfo: MarketInfo;
  marketToken: TokenData;
  tokenIn: TokenData;
  tokenOut: TokenData;
  amount: bigint;
  priceImpactDeltaUsd: bigint;
  swapFeeUsd: bigint;
  uiFeeUsd: bigint;
}): bigint {
  const { marketInfo, marketToken, tokenIn, tokenOut, amount, priceImpactDeltaUsd, swapFeeUsd, uiFeeUsd } = p;

  const swapFeeAmount = convertToTokenAmount(swapFeeUsd, tokenIn.decimals, tokenIn.prices.minPrice)!;
  const uiFeeAmount = convertToTokenAmount(uiFeeUsd, tokenIn.decimals, tokenIn.prices.minPrice)!;

  let amountInAfterFees = amount - swapFeeAmount - uiFeeAmount;
  let mintAmount = 0n;

  if (priceImpactDeltaUsd > 0) {
    const { impactDeltaAmount: positiveImpactAmount } = applySwapImpactWithCap(
      marketInfo,
      tokenOut,
      priceImpactDeltaUsd
    );

    const usdValue = convertToUsd(positiveImpactAmount, tokenOut.decimals, tokenOut.prices.maxPrice)!;

    mintAmount =
      mintAmount +
      // TODO: poolValue for deposit
      usdToMarketTokenAmount(marketInfo, marketToken, usdValue);
  } else {
    const { impactDeltaAmount: negativeImpactAmount } = applySwapImpactWithCap(
      marketInfo,
      tokenIn,
      priceImpactDeltaUsd
    );
    amountInAfterFees = amountInAfterFees + negativeImpactAmount;
  }

  const usdValue = convertToUsd(amountInAfterFees, tokenIn.decimals, tokenIn.prices.minPrice)!;
  mintAmount = mintAmount + usdToMarketTokenAmount(marketInfo, marketToken, usdValue);

  return mintAmount;
}
