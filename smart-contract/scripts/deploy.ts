import { ethers } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deploying EazeeEscrow with account:', deployer.address)

  const balance = await ethers.provider.getBalance(deployer.address)
  console.log('Account balance:', ethers.formatEther(balance), 'CELO')

  const EazeeEscrow = await ethers.getContractFactory('EazeeEscrow')
  const contract = await EazeeEscrow.deploy()
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log('\n✅ EazeeEscrow deployed to:', address)
  console.log('📋 View on explorer: https://alfajores.celoscan.io/address/' + address)
  console.log('\nUpdate NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS in .env.local with:', address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
