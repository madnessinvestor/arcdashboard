import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Loader2, RefreshCw, Coins, Copy, ExternalLink, Check } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { ARC_TESTNET } from "@/lib/arc-network";

interface Token {
  contractAddress: string;
  name: string;
  symbol: string;
  balance?: string;
  decimals?: number;
  price?: number;
  value?: number;
}

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)", 
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)"
];

const TESTNET_PRICES: Record<string, number> = {
  'USDC': 1.00,
  'USDT': 1.00,
  'DAI': 1.00,
  'WETH': 2200,
  'ETH': 2200,
  'WBTC': 43000,
  'BTC': 43000,
  'ARC': 0.50,
  'TEST': 0.10,
};

const getTokenPrice = (symbol: string): number => {
  const upperSymbol = symbol.toUpperCase();
  return TESTNET_PRICES[upperSymbol] || 0.01;
};

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
              const price = getTokenPrice(token.symbol || '???');
              const value = parseFloat(formattedBalance) * price;
              return {
                ...token,
                balance: formattedBalance,
                decimals,
                price,
                value
              };
            } catch (e) {
              console.error('Failed to fetch balance for', token.symbol, e);
              const existingToken = tokensRef.current.find(t => t.contractAddress === token.contractAddress);
              return { 
                ...token, 
                balance: existingToken?.balance || '0', 
                decimals: existingToken?.decimals || 18,
                price: getTokenPrice(token.symbol || '???'),
                value: 0 
              };
            }
          })
        );
        const sortedTokens = tokensWithBalances.sort((a, b) => (b.value || 0) - (a.value || 0));
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
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Coins size={14} className="text-primary" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-white">{token.symbol}</span>
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
