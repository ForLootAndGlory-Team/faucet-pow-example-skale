import { randomBytes } from 'crypto';
import { BigNumber, BytesLike, ethers } from 'ethers';

const { keccak256, hexlify, isAddress, getAddress } = ethers.utils;

const CONTRACT_PAYER_TESTNET_NEBULA = '0x000E9c53C4e2e21F5063f2e232d0AA907318dccb';
const RPC_NEBULA_TESTNET = 'https://testnet.skalenodes.com/v1/lanky-ill-funny-testnet';

export async function mineGasForTransaction(
    nonce: string | number,
    gas: string | number,
    from: string
) {
    const address = getAddress(from);
    nonce = typeof nonce === 'string' && nonce.startsWith('0x') ? parseInt(nonce, 16) : Number(nonce);

    // Convertir le nonce en hexadécimal s'il n'est pas déjà en cette forme
    if (typeof nonce === 'number') {
        nonce = ethers.utils.hexlify(nonce);
    }
    gas = typeof gas === 'string' && gas.startsWith('0x') ? parseInt(gas, 16) : Number(gas);

    if (!isAddress(address)) throw new Error("Invalid Address");

    return await _mineFreeGas(gas, address, nonce);
}

async function _mineFreeGas(
    gasAmount: ethers.BigNumberish,
    address: string,
    nonce: BytesLike
) {
    // Use toString() with radix 16 for hexadecimal conversion"
    const nonceHash = BigNumber.from(keccak256(ethers.utils.hexZeroPad(nonce, 32)));
    const addressHash = BigNumber.from(keccak256(ethers.utils.solidityPack(['address'], [address])));
    const nonceAddressXOR = nonceHash.xor(addressHash);
    const divConstant = ethers.constants.MaxUint256;
    let candidate;
    let iterations = 0;

    const start = performance.now();

    while (true) {
        if (randomBytes) {
            candidate = hexlify(randomBytes(32));
        } else {
            console.error("randomBytes is undefined");
            throw new Error("Crypto module not properly loaded");
        }
        const candidateHash = BigNumber.from(keccak256(candidate));
        const resultHash = nonceAddressXOR.xor(candidateHash);
        const externalGas = divConstant.div(resultHash);

        if (externalGas.gte(gasAmount)) {
            break;
        }
        // every 2k iterations, yield to the event loop
        if (iterations++ % 5000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    const end = performance.now();

    return {
        duration: start - end,
        gasPrice: candidate
    };
}

export default async function getSFUEL(account: string, contractPayer: string, rpcUrls: string | ethers.utils.ConnectionInfo | undefined) {
    const wallet = ethers.Wallet.createRandom();

    const provider = new ethers.providers.JsonRpcProvider(rpcUrls); // Ensure this URL is correct
    const signer = wallet.connect(provider);

    const nonce = await signer.getTransactionCount();

    const { gasPrice } = await mineGasForTransaction(
        nonce,
        100000,
        wallet.address
    );

    const data = '0c11dedd000000000000000000000000' + account.slice(2);

    const tx = await signer.sendTransaction({
        to: contractPayer,
        gasPrice: gasPrice,
        gasLimit: 100000,
        data: '0x' + data
    });

    console.log(tx.hash)

    return tx.hash;
}

// Example usage:
getSFUEL('0x7131E0A24593a54041277826e9251867f7794ccA', CONTRACT_PAYER_TESTNET_NEBULA, RPC_NEBULA_TESTNET)
    .then(hash => console.log('Transaction sent with hash:', hash))
    .catch(error => console.error('Failed to send transaction:', error));