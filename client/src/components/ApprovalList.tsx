import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, RefreshCw, ShieldOff, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { BrowserProvider, Contract, JsonRpcProvider, ethers } from "ethers";
import { switchNetwork, ARC_TESTNET } from "@/lib/arc-network";

interface TokenApproval {
  id: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  spenderAddress: string;
  allowance: string;
}

interface TokenItem {
  contractAddress: string;
  name: string;
  symbol: string;
}

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

export function ApprovalList({ account }: { account: string | null }) {
  const [approvals, setApprovals] = useState<TokenApproval[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchRevoking, setIsBatchRevoking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (account) {
      scanApprovals();
    } else {
      setApprovals([]);
    }
  }, [account]);

  const scanApprovals = async () => {
    if (!account) return;
    setIsLoading(true);
    setApprovals([]);
    
    try {
      const provider = new JsonRpcProvider(ARC_TESTNET.rpcUrls[0]);
      
      const tokenResponse = await fetch(
        `https://testnet.arcscan.app/api?module=account&action=tokenlist&address=${account}`
      );
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.result || !Array.isArray(tokenData.result)) {
        setApprovals([]);
        return;
      }

      const tokens: TokenItem[] = tokenData.result;
      const foundApprovals: TokenApproval[] = [];

      for (const token of tokens) {
        try {
          const paddedOwner = ethers.zeroPadValue(account.toLowerCase(), 32);
          
          let logs;
          try {
            logs = await provider.getLogs({
              address: token.contractAddress,
              topics: [APPROVAL_TOPIC, paddedOwner],
              fromBlock: 0,
              toBlock: 'latest'
            });
          } catch (e) {
            logs = await provider.getLogs({
              address: token.contractAddress,
              topics: [APPROVAL_TOPIC, paddedOwner],
              fromBlock: 'latest'
            });
          }

          const spenders = new Set<string>();
          for (const log of logs) {
            if (log.topics[2]) {
              const spender = ethers.getAddress('0x' + log.topics[2].slice(26));
              spenders.add(spender);
            }
          }

          const contract = new Contract(token.contractAddress, ERC20_ABI, provider);
          
          for (const spender of Array.from(spenders)) {
            try {
              const allowance = await contract.allowance(account, spender);
              if (allowance > BigInt(0)) {
                foundApprovals.push({
                  id: `${token.contractAddress}-${spender}`,
                  tokenAddress: token.contractAddress,
                  tokenName: token.name || 'Unknown Token',
                  tokenSymbol: token.symbol || '???',
                  spenderAddress: spender,
                  allowance: allowance.toString()
                });
              }
            } catch (e) {
              console.error(`Error checking allowance for ${spender}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error scanning token ${token.contractAddress}:`, e);
        }
      }

      setApprovals(foundApprovals);
      
      if (foundApprovals.length === 0) {
        toast({ 
          title: "Scan Complete", 
          description: "No active approvals found"
        });
      } else {
        toast({ 
          title: "Scan Complete", 
          description: `Found ${foundApprovals.length} active approval(s)`
        });
      }
      
    } catch (error) {
      console.error("Failed to scan approvals", error);
      toast({ 
        title: "Scan Failed", 
        description: "Could not scan for approvals",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (approval: TokenApproval) => {
    if (!window.ethereum || !account) {
      toast({ 
        title: "Wallet Not Connected", 
        description: "Please connect your wallet",
        variant: "destructive" 
      });
      return;
    }

    setRevokingIds(prev => new Set(prev).add(approval.id));
    
    try {
      await switchNetwork();
      
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const contract = new Contract(approval.tokenAddress, ERC20_ABI, signer);
      const tx = await contract.approve(approval.spenderAddress, 0);
      
      toast({ title: "Transaction Sent", description: "Confirm in your wallet" });
      
      await tx.wait();
      
      toast({ 
        title: "Revoked", 
        description: `${approval.tokenSymbol} approval revoked`
      });

      setApprovals(prev => prev.filter(a => a.id !== approval.id));
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 4001) {
        toast({ title: "Rejected", description: "Transaction rejected", variant: "destructive" });
      } else {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setRevokingIds(prev => {
        const next = new Set(prev);
        next.delete(approval.id);
        return next;
      });
    }
  };

  const handleBatchRevoke = async () => {
    const toRevoke = approvals.filter(a => selectedIds.has(a.id));
    
    if (toRevoke.length === 0) return;

    if (!window.ethereum || !account) {
      toast({ 
        title: "Wallet Not Connected", 
        description: "Please connect your wallet",
        variant: "destructive" 
      });
      return;
    }

    setIsBatchRevoking(true);
    
    try {
      await switchNetwork();
      
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      let successCount = 0;
      const revokedIds: string[] = [];

      for (const approval of toRevoke) {
        try {
          const contract = new Contract(approval.tokenAddress, ERC20_ABI, signer);
          const tx = await contract.approve(approval.spenderAddress, 0);
          await tx.wait();
          successCount++;
          revokedIds.push(approval.id);
        } catch (err) {
          console.error(`Failed to revoke ${approval.id}:`, err);
        }
      }
      
      toast({ 
        title: "Batch Complete", 
        description: `Revoked ${successCount}/${toRevoke.length} approvals`
      });

      setApprovals(prev => prev.filter(a => !revokedIds.includes(a.id)));
      setSelectedIds(new Set());
      
    } catch (err: any) {
      console.error(err);
      toast({ title: "Batch Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsBatchRevoking(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === approvals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvals.map(a => a.id)));
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Scanning blockchain for approvals...</p>
        <p className="text-xs text-muted-foreground">This may take a moment</p>
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
        <p className="text-muted-foreground max-w-md">
          Connect your wallet to scan for token approvals
        </p>
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
          <ShieldOff size={32} className="text-green-500" />
        </div>
        <h3 className="text-2xl font-display font-bold text-white">No Active Approvals</h3>
        <p className="text-muted-foreground max-w-md mb-4">
          No token approvals found for your wallet
        </p>
        <Button variant="outline" onClick={scanApprovals} className="gap-2" data-testid="button-refresh">
          <RefreshCw size={14} /> Scan Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex gap-4 flex-wrap">
          <Button variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20">
            Active Approvals ({approvals.length})
          </Button>
          <Button variant="ghost" onClick={scanApprovals} className="text-muted-foreground hover:text-primary gap-2" data-testid="button-scan">
            <RefreshCw size={14} /> Rescan
          </Button>
        </div>

        {selectedIds.size > 0 && (
          <Button 
            onClick={handleBatchRevoke} 
            disabled={isBatchRevoking}
            className="bg-primary text-black hover:bg-primary/90 font-bold"
            data-testid="button-revoke-batch"
          >
            {isBatchRevoking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ShieldOff className="mr-2 h-4 w-4" />
                Revoke Selected ({selectedIds.size})
              </>
            )}
          </Button>
        )}
      </div>

      <div className="rounded-md border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-black/40">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="w-[50px]">
                <Checkbox 
                  checked={selectedIds.size === approvals.length && approvals.length > 0}
                  onCheckedChange={toggleSelectAll}
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider">Token</TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider">Spender</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {approvals.map((approval) => (
              <TableRow key={approval.id} className="border-white/5 hover:bg-white/5 transition-colors">
                <TableCell>
                  <Checkbox 
                    checked={selectedIds.has(approval.id)}
                    onCheckedChange={() => toggleSelection(approval.id)}
                    data-testid={`checkbox-${approval.id}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 shrink-0">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">{approval.tokenSymbol}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{formatAddress(approval.tokenAddress)}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-mono text-white">{formatAddress(approval.spenderAddress)}</span>
                    <span className="text-[10px] text-muted-foreground">Has unlimited access</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button 
                    size="sm" 
                    onClick={() => handleRevoke(approval)}
                    disabled={revokingIds.has(approval.id)}
                    className="bg-primary text-black hover:bg-primary/90 h-8 font-bold"
                    data-testid={`button-revoke-${approval.id}`}
                  >
                    {revokingIds.has(approval.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Revoke'
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
