import { ethers } from 'ethers';

const ARCSCAN_API = 'https://testnet.arcscan.app/api';
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const APPROVE_SELECTOR = '0x095ea7b3';

interface RevokeTransaction {
  tokenAddress: string;
  tokenSymbol: string;
  spenderAddress: string;
  txHash: string;
  timestamp: number;
  walletAddress: string;
}

interface BlockchainStats {
  totalRevokes: number;
  totalValueSecured: string;
  recentRevokes: RevokeTransaction[];
}

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)'
];

const tokenInfoCache = new Map<string, { symbol: string; name: string }>();

async function getTokenInfo(tokenAddress: string): Promise<{ symbol: string; name: string }> {
  const cached = tokenInfoCache.get(tokenAddress.toLowerCase());
  if (cached) return cached;
  
  try {
    const provider = new ethers.JsonRpcProvider('https://rpc.testnet.arc.network');
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [symbol, name] = await Promise.all([
      contract.symbol().catch(() => 'TOKEN'),
      contract.name().catch(() => 'Unknown Token')
    ]);
    const info = { symbol: symbol || 'TOKEN', name: name || 'Unknown Token' };
    tokenInfoCache.set(tokenAddress.toLowerCase(), info);
    return info;
  } catch {
    const info = { symbol: 'TOKEN', name: 'Unknown Token' };
    tokenInfoCache.set(tokenAddress.toLowerCase(), info);
    return info;
  }
}

export async function fetchRevokeStatsFromBlockchain(walletAddress: string): Promise<BlockchainStats> {
  const revokes: RevokeTransaction[] = [];
  
  try {
    console.log(`[Blockchain] Fetching revokes for wallet: ${walletAddress}`);
    
    const txListUrl = `${ARCSCAN_API}?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=latest&page=1&offset=500&sort=desc`;
    
    console.log(`[Blockchain] Fetching transactions from: ${txListUrl}`);
    const response = await fetch(txListUrl);
    const data = await response.json();
    
    console.log(`[Blockchain] API Response status: ${data.status}, message: ${data.message}, result count: ${data.result?.length || 0}`);
    
    if (data.result && Array.isArray(data.result)) {
      for (const tx of data.result) {
        if (tx.input && tx.input.startsWith(APPROVE_SELECTOR) && tx.input.length >= 138) {
          const amountHex = '0x' + tx.input.slice(74);
          try {
            const amount = BigInt(amountHex);
            if (amount === BigInt(0)) {
              const spenderHex = tx.input.slice(10, 74);
              const spenderAddress = '0x' + spenderHex.slice(-40).toLowerCase();
              const tokenAddress = tx.to?.toLowerCase() || '';
              
              if (tokenAddress && spenderAddress) {
                const tokenInfo = await getTokenInfo(tokenAddress);
                revokes.push({
                  tokenAddress,
                  tokenSymbol: tokenInfo.symbol,
                  spenderAddress,
                  txHash: tx.hash || '',
                  timestamp: parseInt(tx.timeStamp, 10) || 0,
                  walletAddress: walletAddress.toLowerCase()
                });
                console.log(`[Blockchain] Found revoke: ${tokenInfo.symbol} - spender: ${spenderAddress.slice(0, 10)}...`);
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }
    
    console.log(`[Blockchain] Total revokes found: ${revokes.length}`);
    
    if (revokes.length === 0) {
      const paddedOwner = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
      const topic1 = '0x' + paddedOwner;
      
      const logsUrl = `${ARCSCAN_API}?module=logs&action=getLogs&fromBlock=0&toBlock=latest&topic0=${APPROVAL_TOPIC}&topic1=${topic1}&topic0_1_opr=and`;
      
      console.log(`[Blockchain] Fetching logs from: ${logsUrl}`);
      const logsResponse = await fetch(logsUrl);
      const logsData = await logsResponse.json();
      
      console.log(`[Blockchain] Logs API Response: ${logsData.status}, count: ${logsData.result?.length || 0}`);
      
      if (logsData.result && Array.isArray(logsData.result)) {
        for (const log of logsData.result) {
          if (!log.data) continue;
          
          try {
            const amount = BigInt(log.data);
            if (amount === BigInt(0)) {
              const tokenAddress = log.address?.toLowerCase() || '';
              const spender = log.topics?.[2] ? ('0x' + log.topics[2].slice(-40)).toLowerCase() : '';
              const txHash = log.transactionHash || '';
              const timestamp = parseInt(log.timeStamp, 16) || parseInt(log.timeStamp, 10) || 0;
              
              if (tokenAddress && spender) {
                const alreadyExists = revokes.some(r => 
                  r.tokenAddress === tokenAddress && 
                  r.spenderAddress === spender &&
                  r.txHash === txHash
                );
                
                if (!alreadyExists) {
                  const tokenInfo = await getTokenInfo(tokenAddress);
                  revokes.push({
                    tokenAddress,
                    tokenSymbol: tokenInfo.symbol,
                    spenderAddress: spender,
                    txHash,
                    timestamp,
                    walletAddress: walletAddress.toLowerCase()
                  });
                  console.log(`[Blockchain] Found revoke from logs: ${tokenInfo.symbol}`);
                }
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }
    
    revokes.sort((a, b) => b.timestamp - a.timestamp);
    
    const estimatedValuePerRevoke = 75;
    const totalValueSecured = (revokes.length * estimatedValuePerRevoke).toFixed(2);
    
    console.log(`[Blockchain] Final result: ${revokes.length} revokes, $${totalValueSecured} secured`);
    
    return {
      totalRevokes: revokes.length,
      totalValueSecured,
      recentRevokes: revokes.slice(0, 20)
    };
  } catch (error) {
    console.error('[Blockchain] Error fetching stats:', error);
    return {
      totalRevokes: 0,
      totalValueSecured: '0',
      recentRevokes: []
    };
  }
}

export async function getAllRevokeStats(): Promise<{ totalRevokes: number; totalValueSecured: string }> {
  return {
    totalRevokes: 0,
    totalValueSecured: '0'
  };
}
