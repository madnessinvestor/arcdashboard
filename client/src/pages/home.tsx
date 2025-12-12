import { ConnectWallet } from "@/components/ConnectWallet";
import { ApprovalList } from "@/components/ApprovalList";
import { ShieldCheck, Search, Activity, Lock, FileCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import generatedImage from '@assets/generated_images/futuristic_abstract_dark_crypto_background_with_neon_networks.png';
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { ARC_TESTNET } from "@/lib/arc-network";

interface ContractSearchResult {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  isToken: boolean;
}

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)"
];

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ContractSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { data: stats, refetch: refetchStats } = useQuery<{ totalRevokes: number; totalValueSecured: string }>({
    queryKey: ['/api/stats', account],
    queryFn: async () => {
      const url = account ? `/api/stats?wallet=${account}` : '/api/stats';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: true,
  });

  const handleStatsUpdate = useCallback(() => {
    refetchStats();
  }, [refetchStats]);

  useEffect(() => {
    if (account) {
      refetchStats();
    }
  }, [account, refetchStats]);

  const formatCurrency = (value: string | undefined) => {
    if (!value) return "$0.00";
    const num = parseFloat(value);
    if (num < 1000) return `$${num.toFixed(2)}`;
    if (num < 1000000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${(num / 1000000).toFixed(2)}M`;
  };

  const searchContract = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const provider = new JsonRpcProvider(ARC_TESTNET.rpcUrls[0]);
      const address = searchQuery.trim();

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        setSearchError("Invalid address format. Please enter a valid contract address.");
        setIsSearching(false);
        return;
      }

      // Check if it's a contract
      const code = await provider.getCode(address);
      if (code === "0x") {
        setSearchError("No contract found at this address on Arc Testnet.");
        setIsSearching(false);
        return;
      }

      // Try to get ERC20 info
      const contract = new Contract(address, ERC20_ABI, provider);
      let name = "", symbol = "", decimals = 18, totalSupply = "0";
      let isToken = false;

      try {
        [name, symbol, decimals, totalSupply] = await Promise.all([
          contract.name().catch(() => "Unknown Contract"),
          contract.symbol().catch(() => "???"),
          contract.decimals().catch(() => 18),
          contract.totalSupply().catch(() => BigInt(0))
        ]);
        isToken = true;
      } catch (e) {
        name = "Unknown Contract";
        symbol = "???";
      }

      setSearchResult({
        address,
        name,
        symbol,
        decimals,
        totalSupply: isToken ? formatUnits(totalSupply, decimals) : "N/A",
        isToken
      });
    } catch (error) {
      console.error("Search error:", error);
      setSearchError("Failed to search contract. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchContract();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <div 
        className="fixed inset-0 z-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url(${generatedImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      <nav className="relative z-10 border-b border-white/10 bg-black/50 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/50 shadow-[0_0_15px_rgba(0,243,255,0.3)]">
              <ShieldCheck className="text-primary h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-display font-bold text-white tracking-widest">
                ARC<span className="text-primary">REVOKE</span>
              </h1>
              <span className="text-[10px] text-muted-foreground tracking-[0.2em] font-mono">TESTNET SECURE PROTOCOL</span>
            </div>
          </div>
          
          <ConnectWallet onAccountChange={setAccount} onNetworkChange={setWrongNetwork} />
        </div>
      </nav>

      <main className="relative z-10 container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="glass-panel p-6 rounded-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <FileCheck size={64} />
            </div>
            <h3 className="text-muted-foreground text-sm font-mono mb-2">REVOKED CONTRACTS</h3>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-display font-bold text-primary" data-testid="text-revoked-count">
                {account ? (stats?.totalRevokes ?? 0) : '-'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {account ? 'Your revokes on-chain' : 'Connect wallet to view'}
            </p>
          </div>

          <div className="glass-panel p-6 rounded-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Lock size={64} />
            </div>
            <h3 className="text-muted-foreground text-sm font-mono mb-2">ASSETS SECURED</h3>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-display font-bold text-green-400" data-testid="text-assets-secured">
                {account ? formatCurrency(stats?.totalValueSecured) : '-'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {account ? 'Value protected on-chain' : 'Connect wallet to view'}
            </p>
          </div>

          <div className="glass-panel p-6 rounded-xl relative overflow-hidden group flex flex-col justify-center">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Search size={64} />
            </div>
            <div className="flex flex-col gap-2 relative z-10">
              <Input 
                placeholder="Enter contract address (0x...)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="bg-black/40 border-white/10 focus:border-primary/50 focus:ring-primary/20 font-mono w-full"
                data-testid="input-search"
              />
              <Button 
                onClick={searchContract} 
                disabled={isSearching || !searchQuery.trim()}
                className="bg-primary text-black font-bold w-full"
                data-testid="button-search"
              >
                {isSearching ? "..." : "Search"}
              </Button>
            </div>
            
            {searchError && (
              <p className="text-red-400 text-xs mt-2 font-mono">{searchError}</p>
            )}
            
            {searchResult && (
              <div className="mt-4 p-3 bg-black/40 rounded-lg border border-white/10 relative">
                <button
                  onClick={() => setSearchResult(null)}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-white transition-colors"
                  data-testid="button-close-search"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2 mb-2 pr-6">
                  <Activity className="text-primary h-4 w-4" />
                  <span className="text-white font-medium text-sm">{searchResult.name}</span>
                  {searchResult.isToken && (
                    <span className="text-primary text-xs font-mono">({searchResult.symbol})</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono break-all">{searchResult.address}</p>
                {searchResult.isToken && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Total Supply: {parseFloat(searchResult.totalSupply || '0').toLocaleString()} {searchResult.symbol}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6 md:p-8 min-h-[500px]">
          <ApprovalList account={account} onStatsUpdate={handleStatsUpdate} wrongNetwork={wrongNetwork} />
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-black/80 mt-12 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/50">
                <ShieldCheck className="text-primary h-4 w-4" />
              </div>
              <span className="text-xl font-display font-bold text-white tracking-widest">
                ARC<span className="text-primary">REVOKE</span>
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <a 
                href="https://x.com/madnessinvestor" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-twitter"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a 
                href="https://github.com/madnessinvestor" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-github"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <a 
                href="https://www.youtube.com/@madnessinvestor" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-youtube"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
              <a 
                href="https://farcaster.xyz/madnessinvestor" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-farcaster"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 3h18v18H3V3zm3.5 4v10h2.6v-4.2h5.8V17h2.6V7h-2.6v3.3H9.1V7H6.5z"/>
                </svg>
              </a>
              <a 
                href="https://www.instagram.com/madnessinvestor" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-instagram"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a 
                href="https://web.telegram.org/k/#@madnessinvestor" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-telegram"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </a>
              <a 
                href="https://discord.com/users/madnessinvestor" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-discord"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
              </a>
            </div>
            
            <p className="text-muted-foreground text-sm font-mono text-center">
              2025 ArcRevoke - Built on Arc Network. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
