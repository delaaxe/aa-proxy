import { utils, Wallet, Contract, Provider, EIP712Signer } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { Eip712Meta } from "zksync-web3/build/src/types";

// An example of a deploy script deploys and calls a simple contract.
export default async function (hre: HardhatRuntimeEnvironment) {
  let wallet = new Wallet(process.env.PRIVATE_KEY as string);
  console.log("wallet address is", wallet.address);

  const deployer = new Deployer(hre, wallet);
  const factoryArtifact = await deployer.loadArtifact("AAFactory");
  const accountArtifact = await deployer.loadArtifact("TwoUserMultisig");
  const proxyArtifact = await deployer.loadArtifact("Proxy");

  // Getting the bytecodeHash of the proxy
  const bytecodeHash = utils.hashBytecode(proxyArtifact.bytecode);
  const factory = await deployer.deploy(
    factoryArtifact,
    [bytecodeHash],
    undefined,
    [proxyArtifact.bytecode]
  );

  console.log(`AA factory address: ${factory.address}`);

  const implementation = await deployer.deploy(accountArtifact, []);
  console.log(`implementation address: ${implementation.address}`);

  // The two owners of the multisig
  const owner1 = Wallet.createRandom();
  const owner2 = Wallet.createRandom();

  // For the simplicity of the tutorial, we will use zero hash as salt
  const salt = ethers.constants.HashZero;
  let tx = await factory.deployAccount(salt, implementation.address, owner1.address, owner2.address);
  await tx.wait();

  // Getting the address of the deployed contract
  const interface_ = new ethers.utils.Interface(accountArtifact.abi);
  const initdata = interface_.encodeFunctionData("initialize", [owner1.address, owner2.address]);

  const abiCoder = new ethers.utils.AbiCoder();
  const input = abiCoder.encode(["address", "bytes"], [implementation.address, initdata]);
  const multisigAddress = utils.create2Address(factory.address, bytecodeHash, salt, input);
  console.log(`Multisig deployed on address ${multisigAddress}`);

  // Send funds to the contract
  const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork);
  wallet = wallet.connect(provider);
  tx = await wallet.sendTransaction({
    to: multisigAddress,
    value: ethers.utils.parseEther("0.0001"),
  });
  await tx.wait();

  const account = new Contract(multisigAddress, accountArtifact.abi, wallet);

  // Changing the greeting value from "hello" to "hola"
  let aaTx = await account.populateTransaction.setGreeting("hola");

  const gasLimit = await provider.estimateGas(aaTx);
  const gasPrice = await provider.getGasPrice();
  const { chainId } = await provider.getNetwork();
  const nonce = await provider.getTransactionCount(multisigAddress);
  const customData: Eip712Meta = {
    ergsPerPubdata: "1",
    feeToken: utils.ETH_ADDRESS,
  };

  aaTx = {
    ...aaTx,
    gasLimit,
    gasPrice,
    chainId,
    nonce,
    type: 113,
    customData,
    value: ethers.BigNumber.from(0),
  };

  const signature = ethers.utils.concat([
    await new EIP712Signer(owner1, chainId).sign(aaTx),
    await new EIP712Signer(owner2, chainId).sign(aaTx),
  ]);

  aaTx.customData = {
    ...customData,
    aaParams: {
      from: multisigAddress,
      signature,
    },
  };

  console.log(`Greeting before is: ${await account.greeting()}`);

  tx = await provider.sendTransaction(utils.serialize(aaTx));
  await tx.wait();

  console.log(`Greeting after is:  ${await account.greeting()}`);

  // Fails with message: Failed to include transaction in the system. Most likely not enough funds to cover the fee or wrong signature
}
