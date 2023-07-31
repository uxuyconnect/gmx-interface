import { JsonRpcProvider, Web3Provider, WebSocketProvider } from "@ethersproject/providers";
import {
  ARBITRUM,
  ARBITRUM_GOERLI,
  AVALANCHE,
  AVALANCHE_FUJI,
  FALLBACK_PROVIDERS,
  getAlchemyWsUrl,
  getFallbackRpcUrl,
  getRpcUrl,
} from "config/chains";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

export function getProvider(library: Web3Provider | undefined, chainId: number) {
  let provider;

  if (library) {
    return library.getSigner();
  }

  provider = getRpcUrl(chainId);

  return new ethers.providers.StaticJsonRpcProvider(
    provider,
    // @ts-ignore incorrect Network param types
    { chainId }
  );
}

export function createWsProvider(chainId: number) {
  if (chainId === ARBITRUM) {
    return new ethers.providers.WebSocketProvider(getAlchemyWsUrl());
  }

  if (chainId === AVALANCHE) {
    return new ethers.providers.WebSocketProvider("wss://api.avax.network/ext/bc/C/ws");
  }

  if (chainId === ARBITRUM_GOERLI) {
    return new ethers.providers.WebSocketProvider("wss://arb-goerli.g.alchemy.com/v2/cZfd99JyN42V9Clbs_gOvA3GSBZH1-1j");
  }

  if (chainId === AVALANCHE_FUJI) {
    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl(AVALANCHE_FUJI));
    provider.pollingInterval = 2000;
    return provider;
  }
}

export function getFallbackProvider(chainId: number) {
  if (!FALLBACK_PROVIDERS[chainId]) {
    return;
  }

  const provider = getFallbackRpcUrl(chainId);

  return new ethers.providers.StaticJsonRpcProvider(
    provider,
    // @ts-ignore incorrect Network param types
    { chainId }
  );
}

export function useJsonRpcProvider(chainId: number) {
  const [provider, setProvider] = useState<JsonRpcProvider>();

  useEffect(() => {
    async function initializeProvider() {
      const rpcUrl = getRpcUrl(chainId);

      if (!rpcUrl) return;

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

      await provider.ready;

      setProvider(provider);
    }

    initializeProvider();
  }, [chainId]);

  return { provider };
}

export function isWebsocketProvider(provider: any): provider is WebSocketProvider {
  return provider._websocket;
}

const WS_PROVIDERS_CACHE: { [chainId: number]: WebSocketProvider | JsonRpcProvider | undefined } = {};
const WS_LAST_BLOCK_UPDATED_AT: { [chainId: number]: number } = {};
const WS_MAX_BLOCK_UPDATE_DELAY = 1000 * 5;
const WS_HEALTH_CHECK_INTERVAL = 1000;

export function useWsProvider(active: boolean, chainId: number) {
  const [provider, setProvider] = useState<WebSocketProvider | JsonRpcProvider>();
  const [needToReconnect, setNeedToReconnect] = useState(false);

  const initializeProvider = useCallback((chainId: number) => {
    const newProvider = createWsProvider(chainId);

    if (!newProvider) {
      return;
    }

    newProvider.on("block", () => {
      WS_LAST_BLOCK_UPDATED_AT[chainId] = Date.now();
    });

    if (isWebsocketProvider(newProvider)) {
      newProvider._websocket.onclose = () => {
        // eslint-disable-next-line no-console
        console.log(`ws provider for chain ${chainId} disconnected`);

        newProvider.removeAllListeners();
        WS_PROVIDERS_CACHE[chainId] = undefined;
        setNeedToReconnect(true);
      };
    }

    function healthCheck() {
      setTimeout(() => {
        const isWsReady = isWebsocketProvider(newProvider) ? newProvider._wsReady : newProvider?.network;
        const lastBlockUpdatedAt = WS_LAST_BLOCK_UPDATED_AT[chainId];

        if (
          !isWsReady ||
          !lastBlockUpdatedAt ||
          Number.isNaN(lastBlockUpdatedAt) ||
          Date.now() - lastBlockUpdatedAt > WS_MAX_BLOCK_UPDATE_DELAY
        ) {
          // eslint-disable-next-line no-console
          console.log(`ws provider health check failed for chain ${chainId}, reconnecting...`);
          setNeedToReconnect(true);
          return;
        }

        healthCheck();
      }, WS_HEALTH_CHECK_INTERVAL);
    }

    healthCheck();

    return newProvider;
  }, []);

  useEffect(
    function updateProvider() {
      const cachedProvider = WS_PROVIDERS_CACHE[chainId];

      if (cachedProvider && !needToReconnect) {
        // eslint-disable-next-line no-console
        console.log(`using cached ws provider for chain ${chainId}`, cachedProvider);
        setProvider(cachedProvider);
        return;
      }

      const newProvider = initializeProvider(chainId);

      if (!newProvider) {
        return;
      }

      WS_PROVIDERS_CACHE[chainId] = newProvider;
      WS_LAST_BLOCK_UPDATED_AT[chainId] = Date.now();

      setNeedToReconnect(false);
      setProvider(newProvider);

      // eslint-disable-next-line no-console
      console.log(`ws provider updated for chain ${chainId}`);
    },
    [active, chainId, initializeProvider, needToReconnect]
  );

  if (!active) {
    return undefined;
  }

  // eslint-disable-next-line no-console
  console.log("ws ready", (provider as WebSocketProvider)?._wsReady);

  return provider;
}
