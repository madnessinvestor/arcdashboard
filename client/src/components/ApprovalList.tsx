import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ExternalLink, History, ArrowUpDown, Info, Loader2, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { BrowserProvider, Contract } from "ethers";

interface Approval {
  id: string;
  contractName: string;
  contractAddress: string;
  asset: string;
  amount: string;
  risk: 'High' | 'Medium' | 'Low';
  trustValue: string;
  revokeTrends: number;
  lastUpdated: string;
  approvedAssets: number;
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
      // Try to fetch tokens from ArcScan (Blockscout API)
      const response = await fetch(`https://testnet.arcscan.app/api?module=account&action=tokenlist&address=${account}`);
      const data = await response.json();
      
      if (data.result && Array.isArray(data.result)) {
        const mappedApprovals: Approval[] = data.result.map((token: TokenItem, index: number) => ({
          id: token.contractAddress,
          contractName: token.name,
          contractAddress: token.contractAddress,
          asset: token.symbol,
          amount: "Unknown", // API doesn't give allowance, user needs to check
          risk: "Medium",
          trustValue: "$0.00",
          revokeTrends: 0,
          lastUpdated: "Just now",
          approvedAssets: 1
        }));
        setApprovals(mappedApprovals);
      } else {
        // Fallback or empty
        setApprovals([]);
      }
    } catch (error) {
      console.error("Failed to fetch approvals", error);
      // Fallback to empty state
      setApprovals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setApprovals(prev => {
        setSelectedIds(prev.map(a => a.id));
        return prev;
      });
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleRevoke = async (approvalId?: string) => {
    if (!window.ethereum) return;
    
    // Find the approval(s) to revoke
    const targets = approvalId 
      ? approvals.filter(a => a.id === approvalId)
      : approvals.filter(a => selectedIds.includes(a.id));

    if (targets.length === 0) return;

    setIsRevoking(true);
    
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const ABI = ["function approve(address spender, uint256 amount) external returns (bool)"];

      for (const target of targets) {
        // Since we don't know the SPENDER from the token list API, we can only revoke if we know the spender.
        // The simple token list API doesn't give us allowances/spenders.
        // This is a limitation of simple APIs vs Indexers.
        // However, the user wants "Revoke" to work.
        // If we don't know the spender, we can't revoke.
        
        // WORKAROUND: Ask user for spender or assume a common one? 
        // No, that's dangerous.
        // If we can't find spenders, we should direct them to Manual Revoke.
        
        // BUT, maybe the user wants to set allowance to 0 for the TOKEN itself (which means clearing *all* spenders? No, approve is per spender).
        
        // Let's prompt the user: "Enter spender for [Token]"?
        // Or, for this prototype, we can assume the user wants to use the Manual Revoke for specific targeting.
        
        // Wait, the user text file had "Token" and "Spender".
        // The list view is "By Contracts".
        // If I click "Revoke" on "USDC", which spender am I revoking? Uniswap? OpenSea?
        // Without that info, I can't build the transaction.
        
        // I will trigger a toast explaining this limitation and showing the Manual Revoke form pre-filled?
        // That's a good UX.
        
        // For the purpose of the user's request "Revoke button doesn't work", I will make it try to revoke for a *dummy* spender or prompt.
        // actually, I'll allow them to copy the address to the manual form.
        
        // BETTER: When clicking revoke, populate the ManualRevoke form!
        // I need to lift state up or use a context.
        // Or simply scroll to the manual form and fill it.
        
        // Let's make the list items clickable to "Inspect" which fills the manual form.
        
        // But the user expects the button to WORK.
        // "Não chama o revoke na wallet".
        // I'll make it call approve(0x0000000000000000000000000000000000000000, 0) ? No, that reverts.
        
        // I will assume the user wants to revoke the *Contract Itself* if it's a spender?
        // "Contract" column usually lists the Token.
        // Sometimes "Contract" lists the Spender.
        // If the list is "Active Approvals", the rows should be (Token, Spender).
        // My API fetch only gets Tokens.
        
        // I will change the UI to be honest: "My Tokens".
        // And the action is "Revoke Spender".
        // Clicking it should open a dialog to enter the spender?
        // Or simply copy the token address to the clipboard and tell the user to paste it in the manual form.
        
        toast({
            title: "Spender Required",
            description: "Please copy the Token Address and use the Manual Revoke tool to specify which Spender to revoke.",
        });
        
        // Copy to clipboard
        await navigator.clipboard.writeText(target.contractAddress);
        toast({ title: "Copied", description: "Token address copied to clipboard." });
      }
      
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsRevoking(false);
    }
  };

  if (isLoading) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Scanning Arc Testnet for tokens...</p>
        </div>
    )
  }

  if (approvals.length === 0) {
     return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
               <ShieldAlert size={32} className="text-primary" />
            </div>
            <h3 className="text-2xl font-display font-bold text-white">No Tokens Found</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              We couldn't find any tokens with potential approvals in your wallet.
            </p>
            <Button variant="outline" onClick={fetchApprovals} className="gap-2">
                <RefreshCw size={14} /> Refresh
            </Button>
        </div>
     );
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4">
            <Button variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20">
                My Tokens ({approvals.length})
            </Button>
            <Button variant="ghost" onClick={fetchApprovals} className="text-muted-foreground hover:text-primary gap-2">
                <RefreshCw size={14} /> Refresh
            </Button>
        </div>
        
        {selectedIds.length > 0 && (
           <Button 
             disabled
             className="bg-primary text-black hover:bg-primary/90 font-bold opacity-50 cursor-not-allowed"
           >
             Select specific spenders below
           </Button>
        )}
      </div>

      <div className="rounded-md border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-black/40">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider">Token</TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider">Symbol</TableHead>
              <TableHead className="text-muted-foreground font-mono uppercase text-xs tracking-wider">Address</TableHead>
              <TableHead className="w-[150px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {approvals.map((approval) => (
              <TableRow key={approval.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                <TableCell>
                  <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-primary border border-white/10">
                      <ShieldAlert size={14} />
                  </div>
                </TableCell>
                <TableCell>
                    <span className="text-sm font-medium text-white">{approval.contractName || "Unknown Token"}</span>
                </TableCell>
                <TableCell className="font-mono text-sm text-white">{approval.asset}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{approval.contractAddress}</TableCell>
                <TableCell>
                    <Button 
                        size="sm" 
                        onClick={() => {
                            navigator.clipboard.writeText(approval.contractAddress);
                            toast({ title: "Copied", description: "Token address copied! Paste it in Manual Revoke." });
                        }}
                        className="bg-primary/10 text-primary hover:bg-primary hover:text-black h-8 font-bold border border-primary/20"
                    >
                        Copy Address
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
