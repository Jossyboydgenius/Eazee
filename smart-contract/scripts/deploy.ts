import { ethers } from "hardhat";

function parseAddressList(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function resolveSupportedTokens(networkName: string): string[] {
  const networkSpecificEnvVar =
    networkName === "celo"
      ? "CELO_MAINNET_SUPPORTED_TOKENS"
      : "CELO_SEPOLIA_SUPPORTED_TOKENS";

  const networkSpecificTokens = parseAddressList(
    process.env[networkSpecificEnvVar],
  );

  if (networkSpecificTokens.length > 0) {
    for (const tokenAddress of networkSpecificTokens) {
      if (!ethers.isAddress(tokenAddress)) {
        throw new Error(
          `Invalid token address in ${networkSpecificEnvVar}: ${tokenAddress}`,
        );
      }
    }

    return networkSpecificTokens;
  }

  const sharedTokens = parseAddressList(process.env.EAZEE_SUPPORTED_TOKENS);
  for (const tokenAddress of sharedTokens) {
    if (!ethers.isAddress(tokenAddress)) {
      throw new Error(
        `Invalid token address in EAZEE_SUPPORTED_TOKENS: ${tokenAddress}`,
      );
    }
  }

  return sharedTokens;
}

async function main() {
  const networkName = (await ethers.provider.getNetwork()).name;
  const explorerBaseUrl =
    networkName === "celo"
      ? "https://celo.blockscout.com/address/"
      : "https://celo-sepolia.blockscout.com/address/";

  const signers = await ethers.getSigners();
  const [deployer] = signers;

  if (!deployer) {
    throw new Error(
      "No deployer account configured. Add DEPLOYER_PRIVATE_KEY to smart-contract/.env.local and retry.",
    );
  }

  console.log("Deploying EazeeEscrow with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "CELO");

  const EazeeEscrow = await ethers.getContractFactory("EazeeEscrow");
  const contract = await EazeeEscrow.deploy();
  await contract.waitForDeployment();

  const supportedTokens = resolveSupportedTokens(networkName);
  if (supportedTokens.length === 0) {
    throw new Error(
      `No supported token addresses configured for ${networkName}. Set CELO_SEPOLIA_SUPPORTED_TOKENS or CELO_MAINNET_SUPPORTED_TOKENS (comma-separated) in smart-contract/.env.local.`,
    );
  }

  console.log("Configuring supported tokens:", supportedTokens.join(", "));
  for (const tokenAddress of supportedTokens) {
    const tx = await contract.setTokenSupport(tokenAddress, true);
    await tx.wait();
  }

  const address = await contract.getAddress();
  console.log("\n✅ EazeeEscrow deployed to:", address);
  console.log("🌐 Network:", networkName);
  console.log("📋 View on explorer: " + explorerBaseUrl + address);
  console.log(
    "\nUpdate NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS in frontend/.env.local with:",
    address,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
