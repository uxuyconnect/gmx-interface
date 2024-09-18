import { getDefaultConfig, WalletList } from "@rainbow-me/rainbowkit";
import {

  uxuyWallet,

} from "@rainbow-me/rainbowkit/wallets";
import once from "lodash/once";
import { isDevelopment } from "config/env";
import { http } from "viem";
import { arbitrum, arbitrumGoerli, avalanche, avalancheFuji } from "viem/chains";


const WALLET_CONNECT_PROJECT_ID = "de24cddbaf2a68f027eae30d9bb5df58";
const APP_NAME = "GMX";

const popularWalletList: WalletList = [
  {
    // Group name with standard name is localized by rainbow kit
    groupName: "Popular",
    wallets: [
      uxuyWallet,
    ],
  },
];

const othersWalletList: WalletList = [
  {
    groupName: "Others",
    wallets: [],
  },
];

export const getRainbowKitConfig = once(() =>
  getDefaultConfig({
    appName: APP_NAME,
    projectId: WALLET_CONNECT_PROJECT_ID,
    chains: [arbitrum, avalanche, ...(isDevelopment() ? [arbitrumGoerli, avalancheFuji] : [])],
    transports: {
      [arbitrum.id]: http(),
      [avalanche.id]: http(),
      [arbitrumGoerli.id]: http(),
      [avalancheFuji.id]: http(),
    },
    wallets: [...popularWalletList, ...othersWalletList],
  })
);
