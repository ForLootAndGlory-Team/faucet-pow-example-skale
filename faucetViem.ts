import { randomBytes } from 'crypto';

import {
	bytesToHex,
	createWalletClient,
	encodePacked,
	hexToBigInt,
	hexToNumber,
	http,
	isAddress,
	isHex,
	keccak256,
	maxUint256,
	numberToHex,
	publicActions,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { skaleNebulaTestnet } from 'viem/chains';

export async function mineGasForTransaction(
	nonce: bigint | number,
	gas: bigint | number,
	from: `0x${string}`
) {
	const address = from;
	nonce = isHex(nonce) ? hexToNumber(nonce) : nonce;
	gas = isHex(gas) ? hexToNumber(gas) : gas;

	if (!isAddress(address)) throw new Error('Invalid Address');

	return await _mineFreeGas(gas, address, nonce);
}

async function _mineFreeGas(
	gasAmount: bigint | number,
	address: `0x${string}`,
	nonce: bigint | number
) {
	const nonceHash = hexToBigInt(keccak256(numberToHex(nonce, { size: 32 })));
	const addressHash = hexToBigInt(
		keccak256(encodePacked(['address'], [address]))
	);
	const nonceAddressXOR = nonceHash ^ addressHash;
	const divConstant = maxUint256;
	let candidate;
	let iterations = 0;

	const start = performance.now();

	while (true) {
		if (randomBytes) {
			candidate = bytesToHex(new Uint8Array(randomBytes(32)));
		} else {
			console.error('randomBytes is undefined');
			throw new Error('Crypto module not properly loaded');
		}
		const candidateHash = hexToBigInt(keccak256(candidate));
		const resultHash = nonceAddressXOR ^ candidateHash;
		const externalGas = divConstant / resultHash;

		if (externalGas >= gasAmount) {
			break;
		}
		// every 2k iterations, yield to the event loop
		if (iterations++ % 5_000 === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}

	const end = performance.now();

	return {
		duration: start - end,
		gasPrice: BigInt(candidate),
	};
}

export default async function getSFUEL(account: `0x${string}`) {
	const pk = generatePrivateKey();
	const accountTemp = privateKeyToAccount(pk);

	const wallet = createWalletClient({
		account: accountTemp,
		chain: skaleNebulaTestnet,
		transport: http(),
	}).extend(publicActions);

	const nonce = await wallet.getTransactionCount(accountTemp);
	const contractPayer = '0x000E9c53C4e2e21F5063f2e232d0AA907318dccb';

	const { gasPrice } = await mineGasForTransaction(
		nonce,
		100000,
		accountTemp.address
	);

	const data = '0c11dedd000000000000000000000000' + account.slice(2);

	const hash = await wallet.sendTransaction({
		to: contractPayer,
		gasPrice: gasPrice,
		gasLimit: BigInt(100000),
		account: accountTemp,
		nonce: nonce,
		data: `0x${data}`,
	});
	return hash;
}
