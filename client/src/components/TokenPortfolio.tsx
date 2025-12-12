import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Loader2, RefreshCw, Coins, Copy, ExternalLink, Check } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { ARC_TESTNET } from "@/lib/arc-network";

import sacsLogo from "@assets/sacs_1765569951347.png";
import kittyLogo from "@assets/kitty_1765569951348.png";
import doggLogo from "@assets/dogg_1765569951349.png";
import eurcLogo from "@assets/eurc_1765569951350.jpg";
import racsLogo from "@assets/racs_1765569951350.png";
import inameLogo from "@assets/INAME_1765571844408.png";
import arcsbtLogo from "@assets/ARCSBT_1765571844409.png";
import gmLogo from "@assets/GM_1765571844410.png";
import zkcodexLogo from "@assets/ZKCODEX_1765571844410.png";

interface Token {
  contractAddress: string;
  name: string;
  symbol: string;
  balance?: string;
  decimals?: number;
  price?: number;
  value?: number;
  logoUrl?: string;
}

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)", 
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)"
];

const UNISWAP_V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000".toLowerCase();
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a".toLowerCase();

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

async function fetchPriceFromCoinGecko(symbol: string): Promise<number> {
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

async function fetchTokenPrices(tokens: Token[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  const pricePromises = tokens.map(async (token) => {
    const upperSymbol = token.symbol?.toUpperCase() || '';
    const addressLower = token.contractAddress.toLowerCase();
    
    if (upperSymbol === 'USDC' || addressLower === USDC_ADDRESS) {
      return { address: addressLower, price: 1.0 };
    }
    
    if (STABLECOIN_SYMBOLS.includes(upperSymbol) && upperSymbol !== 'EURC') {
      return { address: addressLower, price: 1.0 };
    }
    
    const coingeckoPrice = await fetchPriceFromCoinGecko(token.symbol);
    if (coingeckoPrice > 0) {
      return { address: addressLower, price: coingeckoPrice };
    }
    
    return { address: addressLower, price: 0 };
  });
  
  const results = await Promise.all(pricePromises);
  results.forEach(({ address, price }) => {
    priceMap.set(address, price);
  });
  
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
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const tokensRef = useRef<Token[]>([]);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const walletToDisplay = searchedWallet || account;

  const fetchTokens = useCallback(async () => {
    if (!walletToDisplay) return;
    setIsLoading(true);
    setError(null);
    
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
        
        const tokensWithBalances = await Promise.all(
          data.result.map(async (token: Token) => {
            try {
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
            } catch (e) {
              console.error('Failed to fetch balance for', token.symbol, e);
              const existingToken = tokensRef.current.find(t => t.contractAddress === token.contractAddress);
              return { 
                ...token, 
                balance: existingToken?.balance || '0', 
                decimals: existingToken?.decimals || 18,
                logoUrl: getTokenLogoUrl(token.contractAddress, token.symbol || ''),
                price: 0,
                value: 0 
              };
            }
          })
        );
        
        const priceMap = await fetchTokenPrices(tokensWithBalances);
        
        const tokensWithPrices = tokensWithBalances.map(token => {
          const price = priceMap.get(token.contractAddress.toLowerCase()) || 0;
          const value = parseFloat(token.balance || '0') * price;
          return { ...token, price, value };
        });
        
        const sortedTokens = tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
        setTokens(sortedTokens);
      } else {
        setTokens([]);
      }
    } catch (error) {
      console.error("Failed to fetch tokens", error);
      setError("Failed to fetch tokens. Please try again later.");
    } finally {
      setIsLoading(false);
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
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading tokens...</p>
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
        <Button variant="ghost" onClick={fetchTokens} className="text-muted-foreground hover:text-primary gap-2" data-testid="button-refresh">
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      <div className="glass-panel p-4 rounded-lg flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
            <Coins className="text-primary h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase text-muted-foreground">Total Portfolio Value</span>
            <p className="text-2xl font-display font-bold text-primary" data-testid="text-total-value">{formatValue(getTotalValue())}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono uppercase text-muted-foreground">Tokens</span>
          <p className="text-xl font-display font-bold text-white" data-testid="text-token-count">{tokens.length}</p>
        </div>
      </div>

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
                    <span className="text-sm font-mono text-muted-foreground" data-testid={`text-price-${token.contractAddress}`}>
                      {formatPrice(token.price || 0)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-mono text-white" data-testid={`text-balance-${token.contractAddress}`}>
                      {formatBalance(token.balance || '0')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-mono font-bold text-primary" data-testid={`text-value-${token.contractAddress}`}>
                      {formatValue(token.value)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
