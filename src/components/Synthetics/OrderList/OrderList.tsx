import { Trans, t } from "@lingui/macro";
import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useMedia } from "react-use";

import { useSubaccount, useSubaccountCancelOrdersDetailsMessage } from "context/SubaccountContext/SubaccountContext";
import {
  useIsOrdersLoading,
  useMarketsInfoData,
  usePositionsInfoData,
  useTokensData,
} from "context/SyntheticsStateContext/hooks/globalsHooks";
import {
  useCancellingOrdersKeysState,
  useEditingOrderKeyState,
} from "context/SyntheticsStateContext/hooks/orderEditorHooks";
import { selectEditingOrder } from "context/SyntheticsStateContext/selectors/orderEditorSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { cancelOrdersTxn } from "domain/synthetics/orders/cancelOrdersTxn";
import useWallet from "lib/wallets/useWallet";

import Checkbox from "components/Checkbox/Checkbox";
import { selectAccount, selectChainId } from "context/SyntheticsStateContext/selectors/globalSelectors";
import { useOrdersInfoRequest } from "domain/synthetics/orders/useOrdersInfo";
import { values } from "lodash";
import { OrderEditor } from "../OrderEditor/OrderEditor";
import { OrderItem } from "../OrderItem/OrderItem";
import { MarketFilterLongShort, MarketFilterLongShortItemData } from "../TableMarketFilter/MarketFilterLongShort";
import { ExchangeTable, ExchangeTd, ExchangeTh, ExchangeTheadTr } from "./ExchangeTable";

type Props = {
  hideActions?: boolean;
  setSelectedOrdersKeys?: Dispatch<SetStateAction<{ [key: string]: boolean }>>;
  selectedOrdersKeys?: { [key: string]: boolean };
  setPendingTxns: (txns: any) => void;
  selectedPositionOrderKey?: string;
  setSelectedPositionOrderKey?: Dispatch<SetStateAction<string | undefined>>;
};

export function OrderList(p: Props) {
  const { setSelectedOrdersKeys, selectedPositionOrderKey, setSelectedPositionOrderKey } = p;
  const positionsData = usePositionsInfoData();
  const isLoading = useIsOrdersLoading();

  const isMobile = useMedia("(max-width: 1000px)");

  const chainId = useSelector(selectChainId);
  const { signer } = useWallet();

  const subaccount = useSubaccount(null);
  const account = useSelector(selectAccount);

  const [cancellingOrdersKeys, setCanellingOrdersKeys] = useCancellingOrdersKeysState();
  const [, setEditingOrderKey] = useEditingOrderKeyState();
  const editingOrder = useSelector(selectEditingOrder);

  const [marketsDirectionsFilter, setMarketsDirectionsFilter] = useState<MarketFilterLongShortItemData[]>([]);

  const ordersRaw = useOrdersInfoRequest(chainId, {
    account: subaccount?.address ?? account,
    marketsDirectionsFilter,
    marketsInfoData: useMarketsInfoData(),
    tokensData: useTokensData(),
  });
  const orders = useMemo(() => values(ordersRaw.ordersInfoData ?? {}), [ordersRaw.ordersInfoData]);

  const isAllOrdersSelected = orders.length > 0 && orders.every((o) => p.selectedOrdersKeys?.[o.key]);
  const cancelOrdersDetailsMessage = useSubaccountCancelOrdersDetailsMessage(undefined, 1);

  const orderRefs = useRef<{ [key: string]: HTMLTableRowElement | null }>({});

  useEffect(() => {
    if (selectedPositionOrderKey) {
      const orderElement = orderRefs.current[selectedPositionOrderKey];
      if (orderElement) {
        const rect = orderElement.getBoundingClientRect();
        const isInViewPort =
          rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;

        if (!isInViewPort) {
          orderElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    return () => {
      setSelectedPositionOrderKey?.(undefined);
    };
  }, [selectedPositionOrderKey, setSelectedPositionOrderKey]);

  function onSelectOrder(key: string) {
    setSelectedOrdersKeys?.((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function onSelectAllOrders() {
    if (isAllOrdersSelected) {
      setSelectedOrdersKeys?.({});
      return;
    }

    const allSelectedOrders = orders.reduce((acc, order) => ({ ...acc, [order.key]: true }), {});

    setSelectedOrdersKeys?.(allSelectedOrders);
  }

  function onCancelOrder(key: string) {
    if (!signer) return;
    setCanellingOrdersKeys((prev) => [...prev, key]);

    cancelOrdersTxn(chainId, signer, subaccount, {
      orderKeys: [key],
      setPendingTxns: p.setPendingTxns,
      detailsMsg: cancelOrdersDetailsMessage,
    }).finally(() => {
      setCanellingOrdersKeys((prev) => prev.filter((k) => k !== key));
      setSelectedOrdersKeys?.({});
    });
  }

  return (
    <>
      {orders.length === 0 && (
        <div className="Exchange-empty-positions-list-note App-card small">
          {isLoading ? t`Loading...` : t`No open orders`}
        </div>
      )}
      {isMobile && (
        <div className="Exchange-list Orders small">
          {!isLoading &&
            orders.map((order) => (
              <OrderItem
                key={order.key}
                order={order}
                isLarge={false}
                isSelected={p.selectedOrdersKeys?.[order.key]}
                onSelectOrder={() => onSelectOrder(order.key)}
                isCanceling={cancellingOrdersKeys.includes(order.key)}
                onCancelOrder={() => onCancelOrder(order.key)}
                positionsInfoData={positionsData}
                hideActions={p.hideActions}
              />
            ))}
        </div>
      )}

      {!isMobile && (
        <ExchangeTable>
          <thead>
            <ExchangeTheadTr>
              {!p.hideActions && orders.length > 0 && (
                <ExchangeTh>
                  <div className="checkbox-inline">
                    <Checkbox isChecked={isAllOrdersSelected} setIsChecked={onSelectAllOrders} />
                  </div>
                </ExchangeTh>
              )}
              <ExchangeTh>
                <MarketFilterLongShort value={marketsDirectionsFilter} onChange={setMarketsDirectionsFilter} />
              </ExchangeTh>
              <ExchangeTh>
                <Trans>Type</Trans>
              </ExchangeTh>
              <ExchangeTh>
                <Trans>Order</Trans>
              </ExchangeTh>
              <ExchangeTh>
                <Trans>Trigger Price</Trans>
              </ExchangeTh>
              <ExchangeTh>
                <Trans>Mark Price</Trans>
              </ExchangeTh>
            </ExchangeTheadTr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <ExchangeTd colSpan={5}>{isLoading ? t`Loading...` : t`No open orders`}</ExchangeTd>
              </tr>
            )}
            {!isLoading &&
              orders.map((order) => (
                <OrderItem
                  isLarge
                  isSelected={p.selectedOrdersKeys?.[order.key]}
                  key={order.key}
                  order={order}
                  onSelectOrder={() => onSelectOrder(order.key)}
                  isCanceling={cancellingOrdersKeys.includes(order.key)}
                  onCancelOrder={() => onCancelOrder(order.key)}
                  hideActions={p.hideActions}
                  positionsInfoData={positionsData}
                  setRef={(el) => (orderRefs.current[order.key] = el)}
                />
              ))}
          </tbody>
        </ExchangeTable>
      )}

      {editingOrder && (
        <OrderEditor
          order={editingOrder}
          onClose={() => setEditingOrderKey(undefined)}
          setPendingTxns={p.setPendingTxns}
        />
      )}
    </>
  );
}
