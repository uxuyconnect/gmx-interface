import { Trans } from "@lingui/macro";
import DataStore from "abis/DataStore.json";
import { getContract } from "config/contracts";
import {
  SUBACCOUNT_ORDER_ACTION,
  maxAllowedSubaccountActionCountKey,
  subaccountActionCountKey,
  subaccountAutoTopUpAmountKey,
  subaccountListKey,
} from "config/dataStore";
import { getSubaccountConfigKey } from "config/localStorage";
import { getNativeToken, getWrappedToken } from "config/tokens";
import cryptoJs from "crypto-js";
import { useTransactionPending } from "domain/synthetics/common/useTransactionReceipt";
import {
  ExecutionFee,
  estimateExecuteIncreaseOrderGasLimit,
  getExecutionFee,
  useGasLimits,
  useGasPrice,
} from "domain/synthetics/fees";
import { getStringForSign } from "domain/synthetics/subaccount/onClickTradingUtils";
import { SubaccountSerializedConfig } from "domain/synthetics/subaccount/types";
import { useTokenBalances, useTokensData } from "domain/synthetics/tokens";
import { BigNumber, ethers } from "ethers";
import { useChainId } from "lib/chains";
import { useLocalStorageSerializeKey } from "lib/localStorage";
import { useMulticall } from "lib/multicall";
import { getByKey } from "lib/objects";
import { getProvider } from "lib/rpc";
import useWallet from "lib/wallets/useWallet";
import { Context, PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { createContext, useContextSelector } from "use-context-selector";

export type Subaccount = ReturnType<typeof useSubaccount>;

type SubaccountNotificationState =
  | "generating"
  | "activating"
  | "activated"
  | "activationFailed"
  | "generationFailed"
  | "deactivating"
  | "deactivated"
  | "deactivationFailed"
  | "none";

export type SubaccountContext = {
  activeTx: string | null;
  baseExecutionFee: ExecutionFee | null;
  contractData: {
    isSubaccountActive: boolean;
    maxAllowedActions: BigNumber;
    currentActionsCount: BigNumber;
    currentAutoTopUpAmount: BigNumber;
  } | null;
  subaccount: {
    address: string;
    privateKey: string;
  } | null;
  modalOpen: boolean;
  notificationState: SubaccountNotificationState;

  clearSubaccount: () => void;
  generateSubaccount: () => Promise<string | null>;
  setActiveTx: (tx: string | null) => void;
  setModalOpen: (v: boolean) => void;
  setNotificationState: (state: SubaccountNotificationState) => void;
};

const context = createContext<SubaccountContext | null>(null);

export function SubaccountContextProvider({ children }: PropsWithChildren) {
  const [modalOpen, setModalOpen] = useState(false);
  const [notificationState, setNotificationState] = useState<SubaccountNotificationState>("none");

  const { signer, account } = useWallet();
  const { chainId } = useChainId();
  const [config, setConfig] = useLocalStorageSerializeKey<SubaccountSerializedConfig>(
    getSubaccountConfigKey(chainId, account),
    null
  );

  const { gasPrice } = useGasPrice(chainId);
  const { gasLimits } = useGasLimits(chainId);
  const { tokensData } = useTokensData(chainId);

  // execution fee that is used as a basis to calculate
  // costs of subaccount actions
  const baseExecutionFee = useMemo(() => {
    if (!gasLimits || !tokensData || !gasPrice) return null;
    const estimatedGas = estimateExecuteIncreaseOrderGasLimit(gasLimits, {
      swapsCount: 3,
    });
    return getExecutionFee(chainId, gasLimits, tokensData, estimatedGas, gasPrice);
  }, [chainId, gasLimits, gasPrice, tokensData]);

  const generateSubaccount = useCallback(async () => {
    if (!account) throw new Error("Account is not set");

    const signature = await signer?.signMessage(getStringForSign());

    if (!signature) return null;

    const pk = ethers.utils.keccak256(signature);
    const subWallet = new ethers.Wallet(pk);

    const encrypted = cryptoJs.AES.encrypt(pk, account);

    setConfig({
      privateKey: encrypted.toString(),
      address: subWallet.address,
    });

    return subWallet.address;
  }, [account, setConfig, signer]);

  const clearSubaccount = useCallback(() => {
    setConfig(null);
  }, [setConfig]);

  const [activeTx, setActiveTx] = useState<string | null>(null);
  const [contractData, setContractData] = useState<SubaccountContext["contractData"] | null>(null);
  const isTxPending = useTransactionPending(activeTx);

  const { data: fetchedContractData, isLoading } = useMulticall(chainId, "useSubaccountsFromContracts", {
    key:
      account && config?.address ? [account, config.address, activeTx, isTxPending ? "pending" : "not-pending"] : null,
    request: () => {
      return {
        dataStore: {
          contractAddress: getContract(chainId, "DataStore"),
          abi: DataStore.abi,
          calls: {
            isSubaccountActive: {
              methodName: "containsAddress",
              params: [subaccountListKey(account!), config!.address],
            },
            maxAllowedActionsCount: {
              methodName: "getUint",
              params: [maxAllowedSubaccountActionCountKey(account!, config!.address, SUBACCOUNT_ORDER_ACTION)],
            },
            currentActionsCount: {
              methodName: "getUint",
              params: [subaccountActionCountKey(account!, config!.address, SUBACCOUNT_ORDER_ACTION)],
            },
            currentAutoTopUpAmount: {
              methodName: "getUint",
              params: [subaccountAutoTopUpAmountKey(account!, config!.address)],
            },
          },
        },
      };
    },
    parseResponse: (res) => {
      const isSubaccountActive = Boolean(res.data.dataStore.isSubaccountActive.returnValues[0]);
      const maxAllowedActions = BigNumber.from(res.data.dataStore.maxAllowedActionsCount.returnValues[0]);
      const currentActionsCount = BigNumber.from(res.data.dataStore.currentActionsCount.returnValues[0]);
      const currentAutoTopUpAmount = BigNumber.from(res.data.dataStore.currentAutoTopUpAmount.returnValues[0]);

      return { isSubaccountActive, maxAllowedActions, currentActionsCount, currentAutoTopUpAmount };
    },
  });

  useEffect(() => {
    if (isLoading) return;

    setContractData(fetchedContractData ?? null);
  }, [fetchedContractData, isLoading]);

  const value: SubaccountContext = useMemo(() => {
    return {
      modalOpen,
      setModalOpen,
      baseExecutionFee: baseExecutionFee ?? null,
      subaccount: config
        ? {
            address: config.address,
            privateKey: config.privateKey,
          }
        : null,
      contractData: config && contractData ? contractData : null,
      generateSubaccount,
      clearSubaccount,
      notificationState,
      activeTx,
      setActiveTx,
      setNotificationState,
    };
  }, [
    activeTx,
    baseExecutionFee,
    clearSubaccount,
    config,
    contractData,
    generateSubaccount,
    modalOpen,
    notificationState,
  ]);

  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useSubaccountSelector<Selected>(selector: (s: SubaccountContext) => Selected) {
  return useContextSelector(context as Context<SubaccountContext>, selector);
}

export function useSubaccountModalOpen() {
  return [useSubaccountSelector((s) => s.modalOpen), useSubaccountSelector((s) => s.setModalOpen)] as const;
}

export function useSubaccountGenerateSubaccount() {
  return useSubaccountSelector((s) => s.generateSubaccount);
}

export function useSubaccountState() {
  return useSubaccountSelector((s) => s);
}

export function useSubaccountAddress() {
  return useSubaccountSelector((s) => s.subaccount?.address ?? null);
}

export function useSubaccountPrivateKey() {
  const encryptedString = useSubaccountSelector((s) => s.subaccount?.privateKey ?? null);
  const { account } = useWallet();
  return useMemo(() => {
    if (!account || !encryptedString) return null;

    return cryptoJs.AES.decrypt(encryptedString, account).toString(cryptoJs.enc.Utf8);
  }, [account, encryptedString]);
}

export function useIsSubaccountActive() {
  return useSubaccountSelector((s) => s.contractData?.isSubaccountActive ?? false);
}

function useSubaccountBaseExecutionFeeTokenAmount() {
  return useSubaccountSelector((s) => s.baseExecutionFee?.feeTokenAmount);
}

export function useSubaccount(requiredBalance: BigNumber | null, requiredActions = 1) {
  const address = useSubaccountAddress();
  const active = useIsSubaccountActive();
  const privateKey = useSubaccountPrivateKey();
  const { chainId } = useChainId();
  const defaultRequiredBalance = useSubaccountBaseExecutionFeeTokenAmount();
  const insufficientFunds = useSubaccountInsufficientFunds(requiredBalance ?? defaultRequiredBalance);

  const { remaining } = useSubaccountActionCounts();

  return useMemo(() => {
    if (!address || !active || !privateKey || insufficientFunds || remaining?.lt(Math.max(1, requiredActions)))
      return null;

    const wallet = new ethers.Wallet(privateKey);
    const provider = getProvider(undefined, chainId);
    const signer = wallet.connect(provider);

    return {
      address,
      active,
      signer,
    };
  }, [address, active, privateKey, insufficientFunds, remaining, requiredActions, chainId]);
}

export function useSubaccountInsufficientFunds(requiredBalance: BigNumber | undefined) {
  const { chainId } = useChainId();
  const subaccountAddress = useSubaccountAddress();
  const subBalances = useTokenBalances(chainId, subaccountAddress ?? undefined);
  const nativeToken = useMemo(() => getNativeToken(chainId), [chainId]);
  const nativeTokenBalance = getByKey(subBalances.balancesData, nativeToken.address);
  const isSubaccountActive = useIsSubaccountActive();

  if (!requiredBalance) return false;
  if (!isSubaccountActive) return false;
  if (!nativeTokenBalance) return false;

  return requiredBalance.gt(nativeTokenBalance);
}

export function useMainAccountInsufficientFunds(requiredBalance: BigNumber | undefined) {
  const { chainId } = useChainId();
  const { account: address } = useWallet();
  const subBalances = useTokenBalances(chainId, address);
  const wrappedToken = useMemo(() => getWrappedToken(chainId), [chainId]);
  const wntBalance = getByKey(subBalances.balancesData, wrappedToken.address);
  const isSubaccountActive = useIsSubaccountActive();

  if (!requiredBalance) return false;
  if (!isSubaccountActive) return false;
  if (!wntBalance) return false;

  return requiredBalance.gt(wntBalance);
}

export function useSubaccountActionCounts() {
  const current = useSubaccountSelector((s) => s.contractData?.currentActionsCount ?? null);
  const max = useSubaccountSelector((s) => s.contractData?.maxAllowedActions ?? null);
  const remaining = max?.sub(current ?? 0) ?? null;

  return {
    current,
    max,
    remaining,
  };
}

export function useSubaccountPendingTx() {
  return [useSubaccountSelector((s) => s.activeTx), useSubaccountSelector((s) => s.setActiveTx)] as const;
}

export function useIsLastSubaccountAction(requiredActions = 1) {
  const { remaining } = useSubaccountActionCounts();
  return remaining?.eq(Math.max(requiredActions, 1)) ?? false;
}

export function useSubaccountCancelOrdersDetailsMessage(
  overridedRequiredBalance: BigNumber | undefined,
  actionCount: number
) {
  const defaultRequiredBalance = useSubaccountBaseExecutionFeeTokenAmount();
  const requiredBalance = overridedRequiredBalance ?? defaultRequiredBalance;
  const isLastAction = useIsLastSubaccountAction(actionCount);
  const mainAccountInsufficientFunds = useMainAccountInsufficientFunds(requiredBalance);
  const subaccountInsufficientFunds = useSubaccountInsufficientFunds(requiredBalance);
  const [, setOpenSubaccountModal] = useSubaccountModalOpen();
  const openSubaccountModal = useCallback(() => {
    setOpenSubaccountModal(true);
  }, [setOpenSubaccountModal]);

  return useMemo(() => {
    if (isLastAction) {
      return (
        <Trans>
          Max Action Count Reached.{" "}
          <span onClick={openSubaccountModal} className="link-underline">
            Click here
          </span>{" "}
          to update.
        </Trans>
      );
    } else if (subaccountInsufficientFunds) {
      return (
        <Trans>
          There are insufficient funds in your Subaccount for One-Click Trading.{" "}
          <span onClick={openSubaccountModal} className="link-underline">
            Click here
          </span>{" "}
          to top-up.
        </Trans>
      );
    } else if (mainAccountInsufficientFunds) {
      return (
        <Trans>
          There are insufficient funds in your Main account for One-Click Trading auto top-ups.{" "}
          <span onClick={openSubaccountModal} className="link-underline">
            Click here
          </span>{" "}
          to convert.
        </Trans>
      );
    }

    return null;
  }, [isLastAction, mainAccountInsufficientFunds, openSubaccountModal, subaccountInsufficientFunds]);
}

export function useSubaccountNotificationState() {
  return [
    useSubaccountSelector((s) => s.notificationState),
    useSubaccountSelector((s) => s.setNotificationState),
  ] as const;
}
