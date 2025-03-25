import { FordefiWeb3Provider, EvmChainId, FordefiProviderConfig } from '@fordefi/web3-provider';
import {FusionSDK, NetworkEnum, OrderStatus, BlockchainProviderConnector, EIP712TypedData} from "@1inch/fusion-sdk";
import { formatUnits } from "ethers";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Configure the Fordefi provider
const config: FordefiProviderConfig = {
  chainId: EvmChainId.NUMBER_8453, // Base in this example
  address: '0x8BFCF9e2764BC84DE4BBd0a0f5AAF19F47027A73', // The Fordefi EVM Vault that will sign the message
  apiUserToken: process.env.FORDEFI_API_USER_TOKEN ?? (() => { throw new Error('FORDEFI_API_USER_TOKEN is not set'); })(), 
  apiPayloadSignKey: fs.readFileSync('./fordefi_secret/private.pem', 'utf8') ?? (() => { throw new Error('PEM_PRIVATE_KEY is not set'); })(),
  rpcUrl: 'https://base.llamarpc.com',
  skipPrediction: false 
};

// We need an adaptor to make our FordefiProvider compatible with the 1inch SDK
class FordefiProviderAdapter implements BlockchainProviderConnector {
    private provider: FordefiWeb3Provider;
    private address: string;
  
    constructor(provider: FordefiWeb3Provider, address: string) {
      this.provider = provider;
      this.address = address;
    }
  
    async signTypedData(
        walletAddress: string, 
        typedData: EIP712TypedData
      ): Promise<string> {
        const signerAddress = walletAddress || this.address;
        return this.provider.request({
          method: 'eth_signTypedData_v4',
          params: [signerAddress, JSON.stringify(typedData)],
        });
      }
  
      async ethCall(
        contractAddress: string,
        callData: string,
        tag?: string
      ): Promise<string> {
        const params = [{
          to: contractAddress,
          data: callData
        }, tag || 'latest'];
        
        const result = await this.provider.request({
          method: 'eth_call',
          params
        });
        
        if (result === null || result === undefined) {
          throw new Error('Null result received from eth_call');
        }
        
        return result as string;
      }
  }

let provider = new FordefiWeb3Provider(config);
let providerAdapter = new FordefiProviderAdapter(provider, config.address);

const sdk = new FusionSDK({
    url: 'https://api.1inch.dev/fusion',
    network: NetworkEnum.COINBASE,
    blockchainProvider: providerAdapter,
    authKey: process.env.DEV_PORTAL_API_TOKEN || ""
})

// Utility function to sleep/delay execution to avoid rate limits since we're on the free plan
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {

    const params = {
        fromTokenAddress: '0x4200000000000000000000000000000000000006', // wETH
        toTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // USDC
        amount: '100000000000000', // 0.0001 ETH in wei (10^18)
        walletAddress: "0x8BFCF9e2764BC84DE4BBd0a0f5AAF19F47027A73",
        source: '1inch'
    }

    const quote = await sdk.getQuote(params)
    
    await sleep(1000); // 1 second delay
    
    const dstTokenDecimals = 6 // USDC on Base has 6 decimals
    console.log('Auction start amount', formatUnits(quote?.presets?.[quote?.recommendedPreset]?.auctionStartAmount || '0', dstTokenDecimals))
    console.log('Auction end amount', formatUnits(quote?.presets?.[quote?.recommendedPreset]?.auctionEndAmount || '0', dstTokenDecimals))
    
    const preparedOrder = await sdk.createOrder(params)
    console.log("Order ready!", preparedOrder.quoteId )
    
    await sleep(1000); // 1 second delay
    
    const info = await sdk.submitOrder(preparedOrder.order, preparedOrder.quoteId)
    console.log('OrderHash', info.orderHash)
    
    const start = Date.now()
    
    while (true) {
        try {
            await sleep(1000); // 1 second delay
            const data = await sdk.getOrderStatus(info.orderHash)
            
            if (data.status === OrderStatus.Filled) {
                console.log('fills', data.fills)
                break
            }
            
            if (data.status === OrderStatus.Expired) {
                console.log('Order Expired')
                break
            }
            
            if (data.status === OrderStatus.Cancelled) {
                console.log('Order Cancelled')
                break
            }
            await sleep(2000); // 2 second delay between status checks
        } catch (e) {
            console.log("Ouch!")
            console.log(e)
            await sleep(5000); // 5 second delay after error
        }
    }
    
    console.log('Order executed for', (Date.now() - start) / 1000, 'sec')
}


main().catch(console.error);