import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });
dotenv.config({ path: "./.env" });

const DEFAULT_CELO_SEPOLIA_RPC_URL =
  "https://forno.celo-sepolia.celo-testnet.org/";

const BLOCKSCOUT_API_KEY =
  String(process.env.BLOCKSCOUT_API_KEY || "").trim() ||
  String(process.env.ETHERSCAN_API_KEY || "").trim() ||
  String(process.env.CELOSCAN_API_KEY || "").trim() ||
  "PLACEHOLDER";

function resolveCeloSepoliaRpcUrl(): string {
  const configured = String(process.env.CELO_SEPOLIA_RPC_URL || "").trim();

  if (!configured) {
    return DEFAULT_CELO_SEPOLIA_RPC_URL;
  }

  if (configured.includes("alfajores-forno.celo-testnet.org")) {
    return DEFAULT_CELO_SEPOLIA_RPC_URL;
  }

  return configured;
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    celoSepolia: {
      url: resolveCeloSepoliaRpcUrl(),
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 11142220,
    },
    celoSepoliaBlockscout: {
      url: resolveCeloSepoliaRpcUrl(),
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 11142220,
    },
    celo: {
      url: "https://forno.celo.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 42220,
    },
  },
  paths: {
    sources: "./contracts",
  },
  etherscan: {
    apiKey: {
      celoSepolia: BLOCKSCOUT_API_KEY,
      celoSepoliaBlockscout: BLOCKSCOUT_API_KEY,
      celo: BLOCKSCOUT_API_KEY,
    },
    customChains: [
      {
        network: "celoSepoliaBlockscout",
        chainId: 11142220,
        urls: {
          apiURL: "https://celo-sepolia.blockscout.com/api",
          browserURL: "https://celo-sepolia.blockscout.com",
        },
      },
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://celo.blockscout.com/api",
          browserURL: "https://celo.blockscout.com",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
