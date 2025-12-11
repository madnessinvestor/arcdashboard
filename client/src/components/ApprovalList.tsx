import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { BrowserProvider, Contract } from "ethers";
import { Input } from "@/components/ui/input";
import { switchNetwork } from "@/lib/arc-network";

interface Approval {
  id: string;
  contractName: string;
  contractAddress: string;
  asset: string;
  spenderAddress: string;
}

interface TokenItem {
  contractAddress: string;
  name: string;
  symbol: string;
  balance: string;
  decimals: string;
}

export function ApprovalList({ account }: { account: string | null }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [revokingTokens, setRevokingTokens] = useState<Set<string>>(new Set());
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [isBatchRevoking, setIsBatchRevoking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (account) {
      fetchApprovals();
    }
  }, [account]);

  const fetchApprovals = async () => {
    if (!account) return;
    setIsLoading(true);
    
    try {
      const response = await fetch(`https://testnet.arcscan.app/api?module=account&action=tokenlist&address=${account}`);
      const data = await response.json();
      
      if (data.result && Array.isArray(data.result)) {
        const mappedApprovals: Approval[] = data.result.map((token: TokenItem) => ({
          id: token.contractAddress,
          contractName: token.name,
          contractAddress: token.contractAddress,
          asset: token.symbol,
          spenderAddress: ''
        }));
        setApprovals(mappedApprovals);
      } else {
        setApprovals([]);
      }
    } catch (error) {
      console.error("Failed to fetch approvals", error);
      setApprovals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSpenderAddress = (tokenAddress: string, spender: string) => {
    setApprovals(prev => prev.map(a => 
      a.contractAddress === tokenAddress ? { ...a, spenderAddress: spender } : a
    ));
  };

  const handleRevokeSingle = async (tokenAddress: string, spenderAddress: string) => {
    if (!spenderAddress) {
      toast({ 
        title: "Spender Required", 
        description: "Enter the spender address for this token",
        variant: "destructive" 
      });
      return;
    }

    if (!window.ethereum || !account) {
      toast({ 
        title: "Wallet Not Connected", 
        description: "Please connect your wallet first",
        variant: "destructive" 
      });
      return;
    }

    setRevokingTokens(prev => new Set(prev).add(tokenAddress));
    
    try {
      await switchNetwork();
      
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const ABI = ["function approve(address spender, uint256 amount) external returns (bool)"];
      const contract = new Contract(tokenAddress, ABI, signer);

      const tx = await contract.approve(spenderAddress, 0);
      toast({ title: "Transaction Sent", description: "Confirm in your wallet" });
      
      await tx.wait();
      
      toast({ 
        title: "Revoke Successful", 
        description: `Revoked permission for ${spenderAddress.slice(0,6)}...${spenderAddress.slice(-4)}`
      });
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 4001) {
        toast({ title: "Rejected", description: "Transaction rejected", variant: "destructive" });
      } else {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setRevokingTokens(prev => {
        const next = new Set(prev);
        next.delete(tokenAddress);
        return next;
      });
    }
  };

  const handleRevokeBatch = async () => {
    const tokensToRevoke = approvals.filter(a => 
      selectedTokens.has(a.contractAddress) && a.spenderAddress
    );

    if (tokensToRevoke.length === 0) {
      toast({ 
        title: "No Valid Selection", 
        description: "Select tokens and enter spender addresses",
        variant: "destructive" 
      });
      return;
    }

    if (!window.ethereum || !account) {
      toast({ 
        title: "Wallet Not Connected", 
        description: "Please connect your wallet first",
        variant: "destructive" 
      });
      return;
    }

    setIsBatchRevoking(true);
    
    try {
      await switchNetwork();
      
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const ABI = ["function approve(address spender, uint256 amount) external returns (bool)"];
      
      let successCount = 0;

      for (const token of tokensToRevoke) {
        try {
          const contract = new Contract(token.contractAddress, ABI, signer);
          const tx = await contract.approve(token.spenderAddress, 0);
          await tx.wait();
          successCount++;
        } catch (err) {
          console.error(`Failed to revoke ${token.contractAddress}:`, err);
        }
      }
      
      toast({ 
        title: "Batch Complete", 
        description: `Revoked ${successCount}/${tokensToRevoke.length} tokens`
      });

      setSelectedTokens(new Set());
      
    } catch (err: any) {
      console.error(err);
      toast({ title: "Batch Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsBatchRevoking(false);
    }
  };

  const toggleTokenSelection = (tokenAddress: string) => {
    const newSelected = new Set(selectedTokens);
    if (newSelected.has(tokenAddress)) {
      newSelected.delete(tokenAddress);
    } else {
      newSelected.add(tokenAddress);
    }
    setSelectedTokens(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTokens.size === approvals.length) {
      setSelectedTokens(new Set());
    } else {
      setSelectedTokens(new Set(approvals.map(a => a.contractAddress)));
    }
  };

  const selectedWithSpender = approvals.filter(a => 
    selectedTokens.has(a.contractAddress) && a.spenderAddress
  ).length;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Scanning Arc Testnet for tokens...</p>
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <ShieldAlert size={32} className="text-primary" />
        </div>
        <h3 className="text-2xl font-display font-bold text-white">No Tokens Found</h3>
        <p className="text-muted-foreground max-w-md mb-4">
          No tokens found in your wallet.
        </p>
        <Button variant="outline" onClick={fetchApprovals} className="gap-2" data-testid="button-refresh">
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex gap-4 flex-wrap">
          <Button variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20">
            My Tokens ({approvals.length})
          </Button>
          <Button variant="ghost" onClick={fetchApprovals} className="text-muted-foreground hover:text-primary gap-2" data-testid="button-refresh-list">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        {selectedTokens.size > 0 && (
          <Button 
            onClick={handleRevokeBatch} 
            disabled={isBatchRevoking || selectedWithSpender === 0}
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
                Revoke Selected ({selectedWithSpender})
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
                  checked={selectedTokens.size === approvals.length && approvals.length > 0}
                  onCheckedChange={toggleSelectAll}
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider">Token</TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider">Symbol</TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider min-w-[200px]">Spender Address</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {approvals.map((approval) => (
              <TableRow key={approval.id} className="border-white/5 hover:bg-white/5 transition-colors">
                <TableCell>
                  <Checkbox 
                    checked={selectedTokens.has(approval.contractAddress)}
                    onCheckedChange={() => toggleTokenSelection(approval.contractAddress)}
                    data-testid={`checkbox-token-${approval.contractAddress}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-primary border border-white/10 shrink-0">
                      <ShieldAlert size={14} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">{approval.contractName || "Unknown"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{approval.contractAddress.slice(0,10)}...</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm text-white">{approval.asset}</TableCell>
                <TableCell>
                  <Input 
                    placeholder="0x..." 
                    value={approval.spenderAddress}
                    onChange={(e) => updateSpenderAddress(approval.contractAddress, e.target.value)}
                    className="bg-black/50 border-white/20 focus:border-primary font-mono text-xs h-8"
                    data-testid={`input-spender-${approval.contractAddress}`}
                  />
                </TableCell>
                <TableCell>
                  <Button 
                    size="sm" 
                    onClick={() => handleRevokeSingle(approval.contractAddress, approval.spenderAddress)}
                    disabled={revokingTokens.has(approval.contractAddress) || !approval.spenderAddress}
                    className="bg-primary text-black hover:bg-primary/90 h-8 font-bold disabled:opacity-50"
                    data-testid={`button-revoke-${approval.contractAddress}`}
                  >
                    {revokingTokens.has(approval.contractAddress) ? (
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
