import Web3 from 'web3';
import BN from 'bn.js';
import { isAddress as isAddressValidator } from 'web3-validator';
import { Transaction } from 'web3';

interface GasResult {
    duration: number;
    gasPrice: string;
}

const CONTRACT_PAYER_TESTNET_NEBULA = '0x000E9c53C4e2e21F5063f2e232d0AA907318dccb';
const RPC_NEBULA_TESTNET = 'https://testnet.skalenodes.com/v1/lanky-ill-funny-testnet';

const web3 = new Web3(new Web3.providers.HttpProvider(RPC_NEBULA_TESTNET));

function mineGasForTransaction(nonce: string | number | bigint, gas: string | number, from: string): Promise<GasResult> {
    const address = web3.utils.toChecksumAddress(from);
    let nonceValue = typeof nonce === 'bigint' ? nonce.toString() : (typeof nonce === 'string' && nonce.startsWith('0x') ? parseInt(nonce, 16) : Number(nonce));

    nonceValue = web3.utils.numberToHex(nonceValue);
    
    gas = typeof gas === 'string' && gas.startsWith('0x') ? parseInt(gas, 16) : Number(gas);

    if (!isAddressValidator(address)) throw new Error("Invalid Address");

    return _mineFreeGas(gas.toString(), address, nonceValue as string);
}

async function _mineFreeGas(gasAmount: string, address: string, nonce: string): Promise<GasResult> {
    const ensureHex = (hex: string) => hex.startsWith('0x') ? hex : '0x' + hex;
    const cleanHex = (hex: string) => hex.replace(/^0x/, '').replace(/[^0-9a-fA-F]/g, '');

    const nonceHash = new BN(cleanHex(ensureHex(web3.utils.soliditySha3({ type: 'bytes32', value: web3.utils.padLeft(nonce, 64) }) || '0')), 16);
    const addressHash = new BN(cleanHex(ensureHex(web3.utils.soliditySha3({ type: 'address', value: address }) || '0')), 16);
    const divConstant = new BN(2).pow(new BN(256).sub(new BN(1)));

    const nonceAddressXOR = nonceHash.xor(addressHash);
    let candidate: string;
    let iterations = 0;

    const start = performance.now();

    while (true) {
        candidate = web3.utils.randomHex(32);
        const candidateHash = new BN(cleanHex(ensureHex(web3.utils.soliditySha3({ type: 'bytes32', value: candidate }) || '0')), 16);
        const resultHash = nonceAddressXOR.xor(candidateHash);
        const externalGas = divConstant.div(resultHash);

        if (externalGas.gte(new BN(gasAmount))) {
            break;
        }
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

async function getSFUEL(account: string, contractPayer: string, rpcUrl: string): Promise<string> {
    const wallet = web3.eth.accounts.create();

    web3.setProvider(new Web3.providers.HttpProvider(rpcUrl));

    const nonce = await web3.eth.getTransactionCount(wallet.address);

    const { gasPrice } = await mineGasForTransaction(
        nonce,
        100000,
        wallet.address
    );

    const data = '0c11dedd' + account.slice(2).padStart(64, '0');

    const txObject: Transaction = {
        from: wallet.address,
        to: contractPayer,
        gasPrice: gasPrice,
        gas: web3.utils.toHex(100000),
        data: '0x' + data,
        nonce: web3.utils.toHex(nonce),
        chainId: await web3.eth.getChainId() // Assurez-vous que le chainId est correct pour le réseau
    };

    // Signer la transaction
    const signedTx = await wallet.signTransaction(txObject);

    try {
        // Envoyer la transaction signée
        const txHash = await web3.eth.sendSignedTransaction(signedTx.rawTransaction!);
        console.log('Transaction Hash:', txHash.transactionHash);
        return txHash.transactionHash.toString();
    } catch (error) {
        console.error('Error sending transaction:', error);
        throw error; // Ré-élever l'erreur pour permettre au catch externe de la capturer
    }
}

// Example usage:
getSFUEL('0x7131E0A24593a54041277826e9251867f7794ccA', CONTRACT_PAYER_TESTNET_NEBULA, RPC_NEBULA_TESTNET)
    .then(hash => console.log('Transaction sent with hash:', hash))
    .catch(error => console.error('Failed to send transaction:', error));