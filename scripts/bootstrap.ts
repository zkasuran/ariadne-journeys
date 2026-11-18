// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { mkdir, writeFile } from 'node:fs/promises';
import { ASSET, HOUSE } from '../src/telegraph.js';

if (process.env.ARIADNE_APPROVED_MINT !== '10') throw new Error('Approval for minting 10 test USDC is required.');
const key = process.env.HOUSE_WALLET_PRIVATE_KEY;
if (!key || !/^0x[0-9a-f]{64}$/i.test(key)) throw new Error('House signer is unavailable.');
const account = privateKeyToAccount(key as `0x${string}`);
if (account.address.toLowerCase() !== HOUSE.toLowerCase()) throw new Error('The signer is not the house wallet.');
const transport = http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 30000 });
const publicClient = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ account, chain: sepolia, transport });
const abi = parseAbi(['function mint(address,uint256)', 'function balanceOf(address) view returns (uint256)', 'function name() view returns (string)']);
const name = await publicClient.readContract({ address: ASSET, abi, functionName: 'name' });
if (name !== 'USD Coin') throw new Error('Unexpected test-token contract.');
const { request } = await publicClient.simulateContract({ account, address: ASSET, abi, functionName: 'mint', args: [account.address, 10000000n] });
const gas = await publicClient.estimateContractGas(request);
const fees = await publicClient.estimateFeesPerGas();
if (gas > 180000n || fees.maxFeePerGas > 20000000000n) throw new Error('Testnet setup is outside the gas ceiling.');
const hash = await wallet.writeContract({ address: ASSET, abi, functionName: 'mint', args: [account.address, 10000000n], gas: gas + gas / 10n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: 'eip1559' });
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120000 });
if (receipt.status !== 'success') throw new Error('Test-token mint did not succeed.');
const balance = await publicClient.readContract({ address: ASSET, abi, functionName: 'balanceOf', args: [account.address] });
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/testnet-bootstrap.json', JSON.stringify({ at: new Date().toISOString(), network: 'Ethereum Sepolia', address: account.address, token: ASSET, transaction: hash, balanceAtomic: balance.toString(), gasUsed: receipt.gasUsed.toString() }, null, 2));
console.log(JSON.stringify({ network: 'Ethereum Sepolia', transaction: hash, testUsdcBalance: Number(balance) / 1000000 }, null, 2));
