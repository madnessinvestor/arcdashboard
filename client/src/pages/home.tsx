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
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ContractSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Fetch stats from the server
  const { data: stats, refetch: refetchStats } = useQuery<{ totalRevokes: number; totalValueSecured: string }>({
    queryKey: ['/api/stats'],
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 0, // Always consider data stale for fresh fetches
  });

  const handleStatsUpdate = useCallback(() => {
    refetchStats();
  }, [refetchStats]);

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
          
          <ConnectWallet onAccountChange={setAccount} />
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
                {stats?.totalRevokes ?? 0}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Total revokes performed</p>
          </div>

          <div className="glass-panel p-6 rounded-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Lock size={64} />
            </div>
            <h3 className="text-muted-foreground text-sm font-mono mb-2">ASSETS SECURED</h3>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-display font-bold text-green-400" data-testid="text-assets-secured">
                {formatCurrency(stats?.totalValueSecured)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Value protected by revokes</p>
          </div>

          <div className="glass-panel p-6 rounded-xl relative overflow-hidden group flex flex-col justify-center">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Search size={64} />
            </div>
            <div className="flex gap-2 relative z-10">
              <Input 
                placeholder="Enter contract address (0x...)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="bg-black/40 border-white/10 focus:border-primary/50 focus:ring-primary/20 font-mono flex-1"
                data-testid="input-search"
              />
              <Button 
                onClick={searchContract} 
                disabled={isSearching || !searchQuery.trim()}
                className="bg-primary text-black font-bold shrink-0"
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
          <ApprovalList account={account} onStatsUpdate={handleStatsUpdate} />
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-black/80 mt-12 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-muted-foreground text-sm font-mono">
            SECURED BY ARC NETWORK - TESTNET ENVIRONMENT
          </p>
        </div>
      </footer>
    </div>
  );
}
