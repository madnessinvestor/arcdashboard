import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Loader2, RefreshCw, Coins, Copy, ExternalLink, Check, FileCode } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { ARC_TESTNET } from "@/lib/arc-network";
import { TransactionHistory } from "./TransactionHistory";
import { WalletHistoryChart } from "./WalletHistoryChart";

import sacsLogo from "@assets/sacs_1765569951347.png";
import kittyLogo from "@assets/kitty_1765569951348.png";
import doggLogo from "@assets/dogg_1765569951349.png";
import eurcLogo from "@assets/eurc_1765569951350.jpg";
import racsLogo from "@assets/racs_1765569951350.png";
import inameLogo from "@assets/INAME_1765571844408.png";
import arcsbtLogo from "@assets/ARCSBT_1765571844409.png";
import gmLogo from "@assets/GM_1765571844410.png";
import zkcodexLogo from "@assets/ZKCODEX_1765571844410.png";
import atclLogo from "@assets/ATCL_1765574269315.png";
import axoLogo from "@assets/AXO_1765574269315.png";

type PriceSource = 'fixed' | 'on-chain' | 'oracle' | 'unknown';

interface Token {
  contractAddress: string;
  name: string;
  symbol: string;
  balance?: string;
  decimals?: number;
  price?: number;
  value?: number;
  logoUrl?: string;
  priceSource?: PriceSource;
  priceTimestamp?: number;
}

interface PortfolioSnapshot {
  tokens: Token[];
  totalValue: number;
  timestamp: number;
}

interface TokenDelta {
  absoluteDelta: number;
  percentageDelta: number;
}

interface PriceInfo {
  price: number;
  source: PriceSource;
  timestamp: number;
}

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)", 
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)"
];

const POOL_PAIR_ABI = [
  "function getReserves() view returns (uint256, uint256)",
  "function tokenA() view returns (address)",
  "function tokenB() view returns (address)"
];

const POOL_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB) view returns (address)",
  "function allPools(uint256) view returns (address)",
  "function allPoolsLength() view returns (uint256)"
];

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000".toLowerCase();
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a".toLowerCase();
const POOL_FACTORY_ADDRESS = "0x34A0b64a88BBd4Bf6Acba8a0Ff8F27c8aDD67E9C";

const STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'DAI', 'BUSD', 'UST', 'FRAX', 'TUSD', 'GUSD', 'USDP', 'SUSD'];

const TOKEN_LOGOS: Record<string, string> = {
  'sacs': sacsLogo,
  'kitty': kittyLogo,
  'dogg': doggLogo,
  'eurc': eurcLogo,
  'racs': racsLogo,
  'srac': racsLogo,
  'iname': inameLogo,
  'arcsbt': arcsbtLogo,
  'gm': gmLogo,
  'zkcodex': zkcodexLogo,
  'atcl': atclLogo,
  'axo': axoLogo,
  'usdc': 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
  'usdt': 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  'dai': 'https://assets.coingecko.com/coins/images/9956/small/4943.png',
  'weth': 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
  'eth': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  'wbtc': 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
  'btc': 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
};

const getTokenLogoUrl = (address: string, symbol: string): string => {
  const symbolLower = symbol.toLowerCase();
  return TOKEN_LOGOS[symbolLower] || '';
};

interface PriceCache {
  [key: string]: {
    price: number;
    timestamp: number;
  };
}

const priceCache: PriceCache = {};
const CACHE_DURATION = 30000;
const REQUEST_DELAY = 300;
const MAX_RETRIES = 2;
const INITIAL_DELAY = 150;
const BALANCE_DELAY = 200;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const PRICE_HISTORY_KEY_PREFIX = "token_price_history_";
const PORTFOLIO_HISTORY_KEY = "portfolio_history_";

interface PriceHistoryEntry {
  price: number;
  value: number;
  timestamp: number;
}

interface TokenPriceHistory {
  [tokenAddress: string]: PriceHistoryEntry[];
}

interface PortfolioHistoryEntry {
  totalValue: number;
  timestamp: number;
  tokens: { address: string; value: number; price: number }[];
}

function getPriceHistoryKey(walletAddress: string): string {
  return `${PRICE_HISTORY_KEY_PREFIX}${walletAddress.toLowerCase()}`;
}

function getPortfolioHistoryKey(walletAddress: string): string {
  return `${PORTFOLIO_HISTORY_KEY}${walletAddress.toLowerCase()}`;
}

function loadPriceHistory(walletAddress: string): TokenPriceHistory {
  try {
    const stored = localStorage.getItem(getPriceHistoryKey(walletAddress));
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function savePriceHistory(walletAddress: string, history: TokenPriceHistory): void {
  try {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const filtered: TokenPriceHistory = {};
    for (const [addr, entries] of Object.entries(history)) {
      filtered[addr] = entries.filter(e => e.timestamp >= cutoff).slice(-100);
    }
    localStorage.setItem(getPriceHistoryKey(walletAddress), JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to save price history:', e);
  }
}

function loadPortfolioHistory(walletAddress: string): PortfolioHistoryEntry[] {
  try {
    const stored = localStorage.getItem(getPortfolioHistoryKey(walletAddress));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePortfolioHistory(walletAddress: string, history: PortfolioHistoryEntry[]): void {
  try {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const filtered = history.filter(e => e.timestamp >= cutoff).slice(-500);
    localStorage.setItem(getPortfolioHistoryKey(walletAddress), JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to save portfolio history:', e);
  }
}

function getTokenPriceChange(tokenAddress: string, currentValue: number, priceHistory: TokenPriceHistory, timeRangeHours: number = 24): { absoluteDelta: number; percentageDelta: number } | null {
  const history = priceHistory[tokenAddress.toLowerCase()];
  if (!history || history.length < 2) return null;
  
  const now = Date.now();
  const cutoff = now - timeRangeHours * 60 * 60 * 1000;
  const oldEntries = history.filter(e => e.timestamp <= cutoff);
  
  let oldValue: number;
  if (oldEntries.length > 0) {
    oldValue = oldEntries[oldEntries.length - 1].value;
  } else {
    oldValue = history[0].value;
  }
  
  if (oldValue === 0 && currentValue === 0) return null;
  
  const absoluteDelta = currentValue - oldValue;
  const percentageDelta = oldValue > 0 ? ((currentValue - oldValue) / oldValue) * 100 : (currentValue > 0 ? 100 : 0);
  
  return { absoluteDelta, percentageDelta };
}

function getTokenPriceOscillation(tokenAddress: string, currentPrice: number, priceHistory: TokenPriceHistory, timeRangeHours: number = 24): { absoluteDelta: number; percentageDelta: number } | null {
  const history = priceHistory[tokenAddress.toLowerCase()];
  if (!history || history.length < 2) return null;
  
  const now = Date.now();
  const cutoff = now - timeRangeHours * 60 * 60 * 1000;
  const oldEntries = history.filter(e => e.timestamp <= cutoff);
  
  let oldPrice: number;
  if (oldEntries.length > 0) {
    oldPrice = oldEntries[oldEntries.length - 1].price;
  } else {
    oldPrice = history[0].price;
  }
  
  if (oldPrice === 0 && currentPrice === 0) return null;
  
  const absoluteDelta = currentPrice - oldPrice;
  const percentageDelta = oldPrice > 0 ? ((currentPrice - oldPrice) / oldPrice) * 100 : (currentPrice > 0 ? 100 : 0);
  
  return { absoluteDelta, percentageDelta };
}

class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (task) {
          try {
            await task();
          } catch (error) {
            console.error('Queue task error:', error);
          }
          await delay(REQUEST_DELAY);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  clear() {
    this.queue = [];
  }
}

const requestQueue = new RequestQueue();

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delayMs: number = REQUEST_DELAY
): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      console.log(`Attempt ${i + 1}/${retries} failed, retrying in ${delayMs}ms...`);
      if (i < retries - 1) {
        await delay(delayMs * (i + 1));
      }
    }
  }
  return null;
}

async function fetchPriceFromCoinGeckoInternal(symbol: string): Promise<number> {
  const cacheKey = `coingecko_${symbol.toLowerCase()}`;
  const cached = priceCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  const symbolToId: Record<string, string> = {
    'eurc': 'eurc',
    'usdc': 'usd-coin',
    'usdt': 'tether',
    'dai': 'dai',
    'weth': 'weth',
    'eth': 'ethereum',
    'wbtc': 'wrapped-bitcoin',
    'btc': 'bitcoin',
  };

  const coinId = symbolToId[symbol.toLowerCase()];
  if (!coinId) return 0;

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    );
    
    if (!response.ok) throw new Error('CoinGecko API failed');
    
    const data = await response.json();
    const price = data[coinId]?.usd || 0;
    
    priceCache[cacheKey] = { price, timestamp: Date.now() };
    return price;
  } catch (error) {
    console.error('CoinGecko API error:', error);
    return 0;
  }
}

async function fetchPriceFromCoinGecko(symbol: string): Promise<number> {
  return requestQueue.add(() => fetchPriceFromCoinGeckoInternal(symbol));
}

async function fetchPriceFromPoolInternal(tokenAddress: string): Promise<number> {
  const cacheKey = `pool_${tokenAddress.toLowerCase()}`;
  const cached = priceCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  try {
    const provider = new JsonRpcProvider(ARC_TESTNET.rpcUrls[0]);
    const factory = new Contract(POOL_FACTORY_ADDRESS, POOL_FACTORY_ABI, provider);
    
    const poolAddress = await factory.getPool(tokenAddress, USDC_ADDRESS);
    
    if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
      console.log(`No pool found for ${tokenAddress} with USDC`);
      return 0;
    }

    const pairContract = new Contract(poolAddress, POOL_PAIR_ABI, provider);
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
    
    const [reserves, tokenAAddress, tokenDecimals] = await Promise.all([
      pairContract.getReserves(),
      pairContract.tokenA(),
      tokenContract.decimals().catch(() => 18)
    ]);

    const reserve0 = reserves[0];
    const reserve1 = reserves[1];
    
    const isTokenA = tokenAAddress.toLowerCase() === tokenAddress.toLowerCase();
    
    const tokenReserve = isTokenA ? reserve0 : reserve1;
    const usdcReserve = isTokenA ? reserve1 : reserve0;
    
    const decimals = Number(tokenDecimals);
    const tokenReserveFormatted = parseFloat(formatUnits(tokenReserve, decimals));
    const usdcReserveFormatted = parseFloat(formatUnits(usdcReserve, 6));
    
    if (tokenReserveFormatted === 0) return 0;
    
    const price = usdcReserveFormatted / tokenReserveFormatted;
    
    priceCache[cacheKey] = { price, timestamp: Date.now() };
    console.log(`Pool price for ${tokenAddress} (${decimals} decimals): $${price.toFixed(6)}`);
    return price;
  } catch (error) {
    console.error('Pool price fetch error:', error);
    return 0;
  }
}

async function fetchPriceFromPool(tokenAddress: string): Promise<number> {
  return requestQueue.add(() => fetchPriceFromPoolInternal(tokenAddress));
}

async function fetchTokenPrices(
  tokens: Token[],
  onProgress?: (current: number, total: number, tokenSymbol: string) => void
): Promise<Map<string, PriceInfo>> {
  const priceMap = new Map<string, PriceInfo>();
  const total = tokens.length;
  const now = Date.now();
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upperSymbol = token.symbol?.toUpperCase() || '';
    const addressLower = token.contractAddress.toLowerCase();
    
    onProgress?.(i + 1, total, token.symbol || 'Unknown');
    
    if (upperSymbol === 'USDC' || addressLower === USDC_ADDRESS) {
      priceMap.set(addressLower, { price: 1.0, source: 'fixed', timestamp: now });
      continue;
    }
    
    if (STABLECOIN_SYMBOLS.includes(upperSymbol) && upperSymbol !== 'EURC') {
      priceMap.set(addressLower, { price: 1.0, source: 'fixed', timestamp: now });
      continue;
    }
    
    const coingeckoPrice = await fetchWithRetry(() => fetchPriceFromCoinGecko(token.symbol));
    if (coingeckoPrice && coingeckoPrice > 0) {
      priceMap.set(addressLower, { price: coingeckoPrice, source: 'oracle', timestamp: now });
      await delay(REQUEST_DELAY);
      continue;
    }
    
    const poolPrice = await fetchWithRetry(() => fetchPriceFromPool(token.contractAddress));
    if (poolPrice && poolPrice > 0) {
      priceMap.set(addressLower, { price: poolPrice, source: 'on-chain', timestamp: now });
    } else {
      priceMap.set(addressLower, { price: 0, source: 'unknown', timestamp: now });
    }
    
    await delay(REQUEST_DELAY);
  }
  
  return priceMap;
}

interface TokenPortfolioProps {
  account: string | null;
  searchedWallet?: string | null;
  wrongNetwork?: boolean;
}

export function TokenPortfolio({ account, searchedWallet, wrongNetwork }: TokenPortfolioProps) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ phase: string; current: number; total: number; detail?: string }>({ phase: '', current: 0, total: 0 });
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [activeInnerTab, setActiveInnerTab] = useState("tokens");
  const { toast } = useToast();
  
  const tokensRef = useRef<Token[]>([]);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'UTC'
    }) + ' (UTC)';
  };

  const calculateTokenDelta = (currentValue: number, tokenAddress: string): TokenDelta | null => {
    if (!walletToDisplay) return null;
    const priceHistory = loadPriceHistory(walletToDisplay);
    const result = getTokenPriceChange(tokenAddress, currentValue, priceHistory, 24);
    return result;
  };

  const calculateTokenPriceOscillation = (currentPrice: number, tokenAddress: string): TokenDelta | null => {
    if (!walletToDisplay) return null;
    const priceHistory = loadPriceHistory(walletToDisplay);
    const result = getTokenPriceOscillation(tokenAddress, currentPrice, priceHistory, 24);
    return result;
  };

  const calculateTotalDelta = (): TokenDelta | null => {
    if (!walletToDisplay) return null;
    const portfolioHistory = loadPortfolioHistory(walletToDisplay);
    if (portfolioHistory.length < 2) return null;
    
    const currentTotal = tokens.reduce((sum, t) => sum + (t.value || 0), 0);
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    const oldEntries = portfolioHistory.filter(e => e.timestamp <= cutoff);
    
    let oldTotal: number;
    if (oldEntries.length > 0) {
      oldTotal = oldEntries[oldEntries.length - 1].totalValue;
    } else {
      oldTotal = portfolioHistory[0].totalValue;
    }
    
    if (oldTotal === 0 && currentTotal === 0) return null;
    
    const absoluteDelta = currentTotal - oldTotal;
    const percentageDelta = oldTotal > 0 
      ? ((currentTotal - oldTotal) / oldTotal) * 100 
      : (currentTotal > 0 ? 100 : 0);
    
    return { absoluteDelta, percentageDelta };
  };

  const formatDelta = (delta: TokenDelta | null, symbol: string = 'USDC'): string => {
    if (!delta) return '';
    if (Math.abs(delta.absoluteDelta) < 0.01 && Math.abs(delta.percentageDelta) < 0.01) return 'No change';
    
    const sign = delta.absoluteDelta >= 0 ? '+' : '';
    const absFormatted = Math.abs(delta.absoluteDelta) < 0.01 
      ? '<0.01' 
      : delta.absoluteDelta.toFixed(2);
    const pctFormatted = Math.abs(delta.percentageDelta) < 0.01 
      ? '<0.01' 
      : Math.abs(delta.percentageDelta).toFixed(2);
    
    return `${sign}${absFormatted} ${symbol} (${sign}${pctFormatted}%)`;
  };


  const walletToDisplay = searchedWallet || account;

  const fetchTokens = useCallback(async () => {
    if (!walletToDisplay) return;
    setIsLoading(true);
    setError(null);
    setLoadingProgress({ phase: 'Fetching token list...', current: 0, total: 0 });
    
    try {
      const response = await fetch(
        `https://testnet.arcscan.app/api?module=account&action=tokenlist&address=${walletToDisplay}`
      );
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === "0" && data.message === "No tokens found") {
        setTokens([]);
        return;
      }
      
      if (data.result && Array.isArray(data.result)) {
        const provider = new JsonRpcProvider(ARC_TESTNET.rpcUrls[0]);
        const tokenList = data.result as Token[];
        const totalTokens = tokenList.length;
        const tokensWithBalances: Token[] = [];
        
        setLoadingProgress({ phase: 'Loading balances', current: 0, total: totalTokens });
        
        for (let i = 0; i < tokenList.length; i++) {
          const token = tokenList[i];
          setLoadingProgress({ 
            phase: 'Loading balances', 
            current: i + 1, 
            total: totalTokens,
            detail: token.symbol || 'Unknown'
          });
          
          if (i > 0) {
            await delay(BALANCE_DELAY);
          }
          
          const result = await fetchWithRetry(async () => {
            const contract = new Contract(token.contractAddress, ERC20_ABI, provider);
            const [balance, decimals] = await Promise.all([
              contract.balanceOf(walletToDisplay),
              contract.decimals().catch(() => 18)
            ]);
            const formattedBalance = formatUnits(balance, decimals);
            const logoUrl = getTokenLogoUrl(token.contractAddress, token.symbol || '');
            return {
              ...token,
              balance: formattedBalance,
              decimals,
              logoUrl,
              price: 0,
              value: 0
            };
          });
          
          if (result) {
            tokensWithBalances.push(result);
          } else {
            const existingToken = tokensRef.current.find(t => t.contractAddress === token.contractAddress);
            tokensWithBalances.push({ 
              ...token, 
              balance: existingToken?.balance || '0', 
              decimals: existingToken?.decimals || 18,
              logoUrl: getTokenLogoUrl(token.contractAddress, token.symbol || ''),
              price: 0,
              value: 0 
            });
          }
          
          await delay(REQUEST_DELAY);
        }
        
        setLoadingProgress({ phase: 'Loading prices', current: 0, total: totalTokens });
        
        const priceMap = await fetchTokenPrices(tokensWithBalances, (current, total, tokenSymbol) => {
          setLoadingProgress({ phase: 'Loading prices', current, total, detail: tokenSymbol });
        });
        
        const tokensWithPrices = tokensWithBalances.map(token => {
          const priceInfo = priceMap.get(token.contractAddress.toLowerCase());
          const price = priceInfo?.price || 0;
          const value = parseFloat(token.balance || '0') * price;
          return { 
            ...token, 
            price, 
            value,
            priceSource: priceInfo?.source,
            priceTimestamp: priceInfo?.timestamp
          };
        });
        
        const sortedTokens = tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
        
        if (tokensRef.current.length > 0) {
          setPreviousSnapshot({
            tokens: [...tokensRef.current],
            totalValue: tokensRef.current.reduce((sum, t) => sum + (t.value || 0), 0),
            timestamp: Date.now()
          });
        }
        
        const now = Date.now();
        const priceHistory = loadPriceHistory(walletToDisplay);
        for (const token of sortedTokens) {
          const addr = token.contractAddress.toLowerCase();
          if (!priceHistory[addr]) {
            priceHistory[addr] = [];
          }
          priceHistory[addr].push({
            price: token.price || 0,
            value: token.value || 0,
            timestamp: now
          });
        }
        savePriceHistory(walletToDisplay, priceHistory);
        
        const portfolioHistory = loadPortfolioHistory(walletToDisplay);
        const totalValue = sortedTokens.reduce((sum, t) => sum + (t.value || 0), 0);
        portfolioHistory.push({
          totalValue,
          timestamp: now,
          tokens: sortedTokens.map(t => ({
            address: t.contractAddress.toLowerCase(),
            value: t.value || 0,
            price: t.price || 0
          }))
        });
        savePortfolioHistory(walletToDisplay, portfolioHistory);
        
        setTokens(sortedTokens);
        setLastUpdatedAt(new Date());
      } else {
        setTokens([]);
        setLastUpdatedAt(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch tokens", error);
      setError("Failed to fetch tokens. Please try again later.");
    } finally {
      setIsLoading(false);
      setLoadingProgress({ phase: '', current: 0, total: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletToDisplay]);

  useEffect(() => {
    if (walletToDisplay) {
      fetchTokens();
    } else {
      setTokens([]);
    }
  }, [walletToDisplay, fetchTokens]);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  
  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`;
    return `${(num / 1000000).toFixed(2)}M`;
  };

  const formatPrice = (price: number) => {
    if (price < 0.01) return '<$0.01';
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatValue = (value: number | undefined) => {
    if (value === undefined || value === 0) return '$0.00';
    if (value < 0.01) return '<$0.01';
    if (value < 1000) return `$${value.toFixed(2)}`;
    if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  const getTotalValue = () => {
    return tokens.reduce((sum, t) => sum + (t.value || 0), 0);
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast({ title: "Copied", description: "Address copied to clipboard" });
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const openExplorer = (address: string) => {
    window.open(`${ARC_TESTNET.blockExplorerUrls[0]}/address/${address}`, '_blank');
  };

  if (isLoading) {
    const progressPercent = loadingProgress.total > 0 
      ? Math.round((loadingProgress.current / loadingProgress.total) * 100) 
      : 0;
    
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{loadingProgress.phase || 'Loading tokens...'}</p>
        {loadingProgress.total > 0 && (
          <>
            <div className="w-64 h-2 bg-muted/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {loadingProgress.current} / {loadingProgress.total}
              {loadingProgress.detail && ` - ${loadingProgress.detail}`}
            </p>
          </>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
          <Coins size={32} className="text-red-500" />
        </div>
        <h3 className="text-2xl font-display font-bold text-white">Error Loading Tokens</h3>
        <p className="text-muted-foreground max-w-md">{error}</p>
        <Button onClick={fetchTokens} className="bg-primary text-black font-bold" data-testid="button-retry">
          Try Again
        </Button>
      </div>
    );
  }

  if (!walletToDisplay) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <Wallet size={32} className="text-primary" />
        </div>
        <h3 className="text-2xl font-display font-bold text-white">Connect Wallet</h3>
        <p className="text-muted-foreground max-w-md">Connect your wallet or search for an address to view token holdings</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
            <Wallet className="text-primary h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-white" data-testid="text-wallet-address">{formatAddress(walletToDisplay)}</span>
              <button 
                onClick={() => copyAddress(walletToDisplay)}
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="button-copy-address"
              >
                {copiedAddress === walletToDisplay ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
              <button 
                onClick={() => openExplorer(walletToDisplay)}
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="button-explorer"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {searchedWallet ? "Searched Wallet" : "Connected Wallet"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdatedAt && (
            <span className="text-xs font-mono text-muted-foreground" data-testid="text-last-updated">
              Last updated at {formatTimestamp(lastUpdatedAt)}
            </span>
          )}
          <Button 
            variant="ghost" 
            onClick={fetchTokens} 
            disabled={isLoading}
            className="text-muted-foreground hover:text-primary gap-2" 
            data-testid="button-refresh"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="glass-panel p-4 rounded-lg flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
            <Coins className="text-primary h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase text-muted-foreground">Total Portfolio Value</span>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-display font-bold text-primary" data-testid="text-total-value">{formatValue(getTotalValue())}</p>
              {(() => {
                const delta = calculateTotalDelta();
                if (!delta) return null;
                const isPositive = delta.absoluteDelta > 0;
                const isNegative = delta.absoluteDelta < 0;
                const isNoChange = Math.abs(delta.absoluteDelta) < 0.01;
                return (
                  <span 
                    className={`text-xs font-mono ${isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground'}`}
                    data-testid="text-total-delta"
                  >
                    {isNoChange ? 'No change' : (
                      <>
                        {isPositive ? '\u2191' : '\u2193'} {formatDelta(delta)}
                      </>
                    )}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono uppercase text-muted-foreground">Tokens</span>
          <p className="text-xl font-display font-bold text-white" data-testid="text-token-count">{tokens.length}</p>
        </div>
      </div>

      <WalletHistoryChart currentValue={getTotalValue()} walletAddress={walletToDisplay} />

      <Tabs value={activeInnerTab} onValueChange={setActiveInnerTab} className="w-full">
        <TabsList className="bg-black/40 mb-4">
          <TabsTrigger 
            value="tokens" 
            className="data-[state=active]:bg-primary data-[state=active]:text-black gap-2"
            data-testid="tab-inner-tokens"
          >
            <Coins className="h-4 w-4" />
            Tokens
          </TabsTrigger>
          <TabsTrigger 
            value="transactions" 
            className="data-[state=active]:bg-primary data-[state=active]:text-black gap-2"
            data-testid="tab-inner-transactions"
          >
            <FileCode className="h-4 w-4" />
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="mt-0">
          {tokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-muted/20 flex items-center justify-center border border-muted/30">
                <Coins size={28} className="text-muted-foreground" />
              </div>
              <h3 className="text-xl font-display font-bold text-white">No Tokens Found</h3>
              <p className="text-muted-foreground text-sm max-w-md">
                This wallet has no tokens on Arc Testnet
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-black/40">
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-mono uppercase text-xs">Token</TableHead>
                    <TableHead className="text-muted-foreground font-mono uppercase text-xs text-right">Price</TableHead>
                    <TableHead className="text-muted-foreground font-mono uppercase text-xs text-right">Amount</TableHead>
                    <TableHead className="text-muted-foreground font-mono uppercase text-xs text-right">USD Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => (
                    <TableRow key={token.contractAddress} className="border-white/5 hover:bg-white/5" data-testid={`row-token-${token.contractAddress}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 overflow-hidden">
                            {token.logoUrl ? (
                              <img 
                                src={token.logoUrl} 
                                alt={token.symbol} 
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <Coins size={14} className={`text-primary fallback-icon ${token.logoUrl ? 'hidden' : ''}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-white">{token.symbol}</span>
                              <a 
                                href={`${ARC_TESTNET.blockExplorerUrls[0]}/token/${token.contractAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors"
                                data-testid={`link-contract-${token.contractAddress}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={12} />
                              </a>
                            </div>
                            <span className="block text-[10px] text-muted-foreground">{token.name || 'Unknown'}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-mono text-muted-foreground" data-testid={`text-price-${token.contractAddress}`}>
                            {formatPrice(token.price || 0)}
                          </span>
                          {(() => {
                            const priceOsc = calculateTokenPriceOscillation(token.price || 0, token.contractAddress);
                            if (!priceOsc) return null;
                            const isPositive = priceOsc.absoluteDelta > 0;
                            const isNegative = priceOsc.absoluteDelta < 0;
                            const absValue = Math.abs(priceOsc.absoluteDelta);
                            const pctValue = Math.abs(priceOsc.percentageDelta);
                            if (absValue < 0.0001 && pctValue < 0.01) return null;
                            return (
                              <span 
                                className={`text-[10px] font-mono ${isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground/70'}`}
                                data-testid={`text-price-change-${token.contractAddress}`}
                              >
                                {isPositive ? '+' : isNegative ? '-' : ''}
                                {absValue < 0.0001 ? '<0.0001' : absValue < 0.01 ? absValue.toFixed(4) : absValue.toFixed(2)} USDC ({isPositive ? '+' : isNegative ? '-' : ''}{pctValue < 0.01 ? '0.00' : pctValue.toFixed(2)}%)
                              </span>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-mono text-white" data-testid={`text-balance-${token.contractAddress}`}>
                          {formatBalance(token.balance || '0')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-mono font-bold text-primary" data-testid={`text-value-${token.contractAddress}`}>
                            {formatValue(token.value)}
                          </span>
                          {(() => {
                            const delta = calculateTokenDelta(token.value || 0, token.contractAddress);
                            const isPositive = delta ? delta.absoluteDelta > 0 : false;
                            const isNegative = delta ? delta.absoluteDelta < 0 : false;
                            const absoluteValue = delta ? Math.abs(delta.absoluteDelta) : 0;
                            const percentageValue = delta ? delta.percentageDelta : 0;
                            return (
                              <span 
                                className={`text-[10px] font-mono ${isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground/70'}`}
                                data-testid={`text-delta-${token.contractAddress}`}
                              >
                                {isPositive ? '+' : isNegative ? '-' : '+'}
                                {absoluteValue < 0.01 ? '0.00' : absoluteValue.toFixed(2)} ({isPositive ? '+' : isNegative ? '-' : '+'}{Math.abs(percentageValue) < 0.01 ? '0.00' : Math.abs(percentageValue).toFixed(2)}%)
                              </span>
                            );
                          })()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="mt-0">
          <TransactionHistory walletAddress={walletToDisplay} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
