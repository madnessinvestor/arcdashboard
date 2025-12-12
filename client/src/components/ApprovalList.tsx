import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, Loader2, RefreshCw, ShieldOff, AlertTriangle, Coins, DollarSign } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits } from "ethers";
import { switchNetwork, ARC_TESTNET } from "@/lib/arc-network";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Token {
  contractAddress: string;
  name: string;
  symbol: string;
  balance?: string;
  decimals?: number;
}

interface DetectedApproval {
  id: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  spenderAddress: string;
  allowance?: string;
  valueAtRisk?: number;
  balance?: string;
  isUnlimited?: boolean;
}

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

// Mock testnet token prices (in USD) - in production this would come from an oracle
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

export function ApprovalList({ account, onStatsUpdate, wrongNetwork }: { account: string | null; onStatsUpdate?: () => void; wrongNetwork?: boolean }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [detectedApprovals, setDetectedApprovals] = useState<DetectedApproval[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchRevoking, setIsBatchRevoking] = useState(false);
  const { toast } = useToast();

  const fetchTokens = useCallback(async () => {
    if (!account) return;
    setIsLoading(true);
    
    try {
      const response = await fetch(
        `https://testnet.arcscan.app/api?module=account&action=tokenlist&address=${account}`
      );
      const data = await response.json();
      
      if (data.result && Array.isArray(data.result)) {
        const provider = new JsonRpcProvider(ARC_TESTNET.rpcUrls[0]);
        const tokensWithBalances = await Promise.all(
          data.result.map(async (token: Token) => {
            try {
              const contract = new Contract(token.contractAddress, ERC20_ABI, provider);
              const [balance, decimals] = await Promise.all([
                contract.balanceOf(account),
                contract.decimals().catch(() => 18)
              ]);
              return {
                ...token,
                balance: formatUnits(balance, decimals),
                decimals
              };
            } catch (e) {
              console.error('Failed to fetch balance for', token.symbol, e);
              return { ...token, balance: '0', decimals: 18 };
            }
          })
        );
        setTokens(tokensWithBalances);
        scanForApprovals(tokensWithBalances);
      } else {
        setTokens([]);
      }
    } catch (error) {
      console.error("Failed to fetch tokens", error);
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (account) {
      fetchTokens();
      // Set up polling for real-time updates every 30 seconds
      const interval = setInterval(() => {
        fetchTokens();
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setTokens([]);
      setDetectedApprovals([]);
    }
  }, [account, fetchTokens]);

  const scanForApprovals = async (tokenList: Token[]) => {
    if (!account || tokenList.length === 0) return;
    setIsScanning(true);
    
    try {
      const provider = new JsonRpcProvider(ARC_TESTNET.rpcUrls[0]);
      const paddedOwner = account.toLowerCase().replace('0x', '').padStart(64, '0');
      const topic1 = '0x' + paddedOwner;
      const found: DetectedApproval[] = [];

      for (const token of tokenList) {
        try {
          const logsResponse = await fetch(
            `https://testnet.arcscan.app/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=${token.contractAddress}&topic0=${APPROVAL_TOPIC}&topic1=${topic1}&topic0_1_opr=and`
          );
          const logsData = await logsResponse.json();
          
          if (logsData.result && Array.isArray(logsData.result) && logsData.result.length > 0) {
            const spendersSet = new Set<string>();
            
            for (const log of logsData.result) {
              if (log.topics && log.topics[2]) {
                const spender = '0x' + log.topics[2].slice(-40);
                spendersSet.add(spender.toLowerCase());
              }
            }

            const contract = new Contract(token.contractAddress, ERC20_ABI, provider);
            const decimals = token.decimals || 18;
            
            for (const spender of Array.from(spendersSet)) {
              try {
                const allowance = await contract.allowance(account, spender);
                if (allowance > BigInt(0)) {
                  const allowanceFormatted = parseFloat(formatUnits(allowance, decimals));
                  const tokenPrice = getTokenPrice(token.symbol || '???');
                  const valueAtRisk = allowanceFormatted * tokenPrice;
                  // Consider unlimited if value exceeds 1 trillion or max uint256 threshold
                  const isUnlimited = valueAtRisk > 1e12 || allowanceFormatted > 1e15;
                  const displayValue = isUnlimited ? Infinity : valueAtRisk;
                  
                  found.push({
                    id: `${token.contractAddress}-${spender}`,
                    tokenAddress: token.contractAddress,
                    tokenName: token.name || 'Unknown',
                    tokenSymbol: token.symbol || '???',
                    spenderAddress: spender,
                    allowance: formatUnits(allowance, decimals),
                    valueAtRisk: displayValue,
                    balance: token.balance || '0',
                    isUnlimited
                  });
                }
              } catch (e) {
                console.error('Allowance check failed:', e);
              }
            }
          }
        } catch (e) {
          console.error(`Error scanning ${token.contractAddress}:`, e);
        }
      }

      setDetectedApprovals(found);
      
      if (found.length > 0) {
        toast({ 
          title: "Scan Complete", 
          description: `Found ${found.length} active approval(s)`
        });
      }
    } catch (error) {
      console.error("Scan failed", error);
    } finally {
      setIsScanning(false);
    }
  };

  const recordRevokeToServer = async (approval: DetectedApproval, txHash?: string) => {
    try {
      await apiRequest('POST', '/api/revoke', {
        walletAddress: account,
        tokenAddress: approval.tokenAddress,
        tokenSymbol: approval.tokenSymbol,
        spenderAddress: approval.spenderAddress,
        valueSecured: (approval.valueAtRisk && isFinite(approval.valueAtRisk) ? approval.valueAtRisk : 0).toFixed(2),
        txHash: txHash || null
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      onStatsUpdate?.();
    } catch (e) {
      console.error('Failed to record revoke:', e);
    }
  };

  const handleRevokeDetected = async (approval: DetectedApproval) => {
    if (!window.ethereum || !account) {
      toast({ title: "Wallet Not Connected", variant: "destructive" });
      return;
    }

    setRevokingIds(prev => new Set(prev).add(approval.id));
    
    try {
      await switchNetwork();
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(approval.tokenAddress, ERC20_ABI, signer);
      const tx = await contract.approve(approval.spenderAddress, 0);
      
      toast({ title: "Transaction Sent", description: "Confirm in wallet" });
      const receipt = await tx.wait();
      
      await recordRevokeToServer(approval, receipt?.hash);
      
      toast({ title: "Revoked", description: `${approval.tokenSymbol} approval revoked` });
      setDetectedApprovals(prev => prev.filter(a => a.id !== approval.id));
      
    } catch (err: any) {
      // Handle user rejection or any error - always reset the button state
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        toast({ title: "Cancelled", description: "Transaction was cancelled", variant: "destructive" });
      } else {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      }
      // Always remove from revoking state so user can try again
      setRevokingIds(prev => {
        const next = new Set(prev);
        next.delete(approval.id);
        return next;
      });
      return;
    }
    // Only remove on success - already handled above
    setRevokingIds(prev => {
      const next = new Set(prev);
      next.delete(approval.id);
      return next;
    });
  };

  const handleBatchRevokeDetected = async () => {
    const toRevoke = detectedApprovals.filter(a => selectedIds.has(a.id));
    if (toRevoke.length === 0) return;
    if (!window.ethereum || !account) {
      toast({ title: "Wallet Not Connected", variant: "destructive" });
      return;
    }

    setIsBatchRevoking(true);
    
    try {
      await switchNetwork();
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      let success = 0;
      const revokedIds: string[] = [];

      for (const approval of toRevoke) {
        try {
          const contract = new Contract(approval.tokenAddress, ERC20_ABI, signer);
          const tx = await contract.approve(approval.spenderAddress, 0);
          const receipt = await tx.wait();
          success++;
          revokedIds.push(approval.id);
          await recordRevokeToServer(approval, receipt?.hash);
        } catch (err) {
          console.error('Batch revoke error:', err);
        }
      }
      
      toast({ title: "Batch Complete", description: `Revoked ${success}/${toRevoke.length}` });
      setDetectedApprovals(prev => prev.filter(a => !revokedIds.includes(a.id)));
      setSelectedIds(new Set());
      
    } catch (err: any) {
      toast({ title: "Batch Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsBatchRevoking(false);
    }
  };

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

  const formatValueAtRisk = (value: number | undefined) => {
    if (value === undefined) return '-';
    if (!isFinite(value)) return 'Unlimited';
    if (value < 0.01) return '<$0.01';
    if (value < 1000) return `$${value.toFixed(2)}`;
    if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  const getTotalValueAtRisk = () => {
    const total = detectedApprovals.reduce((sum, a) => {
      if (a.valueAtRisk === undefined || !isFinite(a.valueAtRisk)) return sum;
      return sum + a.valueAtRisk;
    }, 0);
    return formatValueAtRisk(total);
  };

  const getUnlimitedCount = () => {
    return detectedApprovals.filter(a => a.isUnlimited).length;
  };

  const formatAllowance = (allowance: string | undefined, isUnlimited: boolean | undefined) => {
    if (isUnlimited) return 'Unlimited';
    if (!allowance) return '-';
    const num = parseFloat(allowance);
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`;
    if (num < 1000000000) return `${(num / 1000000).toFixed(2)}M`;
    return `${(num / 1000000000).toFixed(2)}B`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading tokens...</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <ShieldAlert size={32} className="text-primary" />
        </div>
        <h3 className="text-2xl font-display font-bold text-white">Connect Wallet</h3>
        <p className="text-muted-foreground max-w-md">Connect your wallet to view tokens</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="detected" className="w-full">
      {wrongNetwork && account && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3" data-testid="warning-wrong-network">
          <AlertTriangle className="text-red-500 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <span className="text-red-400 font-bold text-sm">Wrong Network</span>
            <p className="text-red-300/80 text-xs">Please switch to Arc Testnet to revoke approvals. Use the button in the header to switch networks.</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <TabsList className="bg-black/40">
          <TabsTrigger value="detected" className="data-[state=active]:bg-primary data-[state=active]:text-black" data-testid="tab-detected">
            Detect ({detectedApprovals.length}) {isScanning && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
          </TabsTrigger>
          <TabsTrigger value="tokens" className="data-[state=active]:bg-primary data-[state=active]:text-black" data-testid="tab-my-tokens">
            My Tokens ({tokens.length})
          </TabsTrigger>
        </TabsList>
        <Button variant="ghost" onClick={fetchTokens} className="text-muted-foreground hover:text-primary gap-2" data-testid="button-refresh">
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      <TabsContent value="detected" className="space-y-4">
        {detectedApprovals.length > 0 && (
          <div className="glass-panel p-4 rounded-lg flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30">
                <DollarSign className="text-red-400 h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-mono uppercase text-muted-foreground">Total Value at Risk</span>
                <p className="text-xl font-display font-bold text-red-400" data-testid="text-total-risk">{getTotalValueAtRisk()}</p>
                {getUnlimitedCount() > 0 && (
                  <div className="flex items-center gap-1.5 mt-1" data-testid="warning-unlimited">
                    <AlertTriangle className="h-3 w-3 text-orange-500 animate-pulse" />
                    <span className="text-[10px] font-mono text-orange-400 uppercase tracking-wide">
                      {getUnlimitedCount()} unlimited approval{getUnlimitedCount() > 1 ? 's' : ''} - High Risk
                    </span>
                  </div>
                )}
              </div>
            </div>
            {selectedIds.size > 0 && (
              <Button 
                onClick={handleBatchRevokeDetected} 
                disabled={isBatchRevoking || wrongNetwork}
                className="bg-primary text-black hover:bg-primary/90 font-bold"
                data-testid="button-batch-revoke-detected"
              >
                {isBatchRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldOff className="mr-2 h-4 w-4" />}
                Revoke Selected ({selectedIds.size})
              </Button>
            )}
          </div>
        )}

        {detectedApprovals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
              <ShieldOff size={28} className="text-green-500" />
            </div>
            <h3 className="text-xl font-display font-bold text-white">No Active Approvals Detected</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              {isScanning ? "Scanning blockchain..." : "Your wallet has no token approvals at risk"}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-black/40">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={selectedIds.size === detectedApprovals.length && detectedApprovals.length > 0}
                      onCheckedChange={() => {
                        if (selectedIds.size === detectedApprovals.length) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(detectedApprovals.map(a => a.id)));
                        }
                      }}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Token</TableHead>
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Your Balance</TableHead>
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Approved</TableHead>
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Spender</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detectedApprovals.map((approval) => (
                  <TableRow key={approval.id} className="border-white/5 hover:bg-white/5">
                    <TableCell>
                      <Checkbox 
                        checked={selectedIds.has(approval.id)}
                        onCheckedChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(approval.id)) next.delete(approval.id);
                          else next.add(approval.id);
                          setSelectedIds(next);
                        }}
                        data-testid={`checkbox-approval-${approval.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border ${approval.isUnlimited ? 'bg-orange-500/20 text-orange-500 border-orange-500/30' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                          <AlertTriangle size={14} />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-white">{approval.tokenSymbol}</span>
                          <span className="block text-[10px] text-muted-foreground font-mono">{formatAddress(approval.tokenAddress)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono text-primary font-bold" data-testid={`text-balance-${approval.id}`}>
                        {formatBalance(approval.balance || '0')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {approval.isUnlimited ? (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/20 border border-orange-500/30" data-testid={`badge-unlimited-${approval.id}`}>
                            <AlertTriangle className="h-3 w-3 text-orange-500 animate-pulse" />
                            <span className="text-xs font-bold text-orange-400 uppercase">Unlimited</span>
                          </div>
                        ) : (
                          <span className="text-sm font-mono text-white" data-testid={`text-approved-${approval.id}`}>
                            {formatAllowance(approval.allowance, approval.isUnlimited)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono text-white">{formatAddress(approval.spenderAddress)}</span>
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm"
                        onClick={() => handleRevokeDetected(approval)}
                        disabled={revokingIds.has(approval.id) || wrongNetwork}
                        className="bg-primary text-black hover:bg-primary/90 h-8 font-bold"
                        data-testid={`button-revoke-${approval.id}`}
                      >
                        {revokingIds.has(approval.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revoke'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="tokens" className="space-y-4">
        {tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <ShieldAlert size={32} className="text-primary" />
            <p className="text-muted-foreground">No tokens found</p>
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-black/40">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Token</TableHead>
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Symbol</TableHead>
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Balance</TableHead>
                  <TableHead className="text-muted-foreground font-mono uppercase text-xs">Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.contractAddress} className="border-white/5 hover:bg-white/5" data-testid={`row-token-${token.contractAddress}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                          <Coins size={14} />
                        </div>
                        <span className="text-sm font-medium text-white">{token.name || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-white">{token.symbol}</TableCell>
                    <TableCell>
                      <span className="font-mono text-sm text-primary font-bold" data-testid={`text-balance-${token.contractAddress}`}>
                        {formatBalance(token.balance || '0')}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{formatAddress(token.contractAddress)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
