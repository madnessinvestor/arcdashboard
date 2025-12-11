import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ExternalLink, CheckCircle2, History } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Approval {
  id: string;
  contractName: string;
  contractAddress: string;
  asset: string;
  amount: string;
  risk: 'High' | 'Medium' | 'Low';
  lastUpdated: string;
  approvedAssets: number;
}

export function RevokeCard({ approval }: { approval: Approval }) {
  const [isRevoking, setIsRevoking] = useState(false);
  const { toast } = useToast();

  const handleRevoke = async () => {
    setIsRevoking(true);
    
    // Simulate transaction delay
    setTimeout(() => {
      setIsRevoking(false);
      toast({
        title: "Revoke Successful",
        description: `Successfully revoked approval for ${approval.contractName}`,
      });
    }, 2000);
    
    // In a real app, we would call:
    // const contract = new Contract(tokenAddress, ERC20_ABI, signer);
    // await contract.approve(spenderAddress, 0);
  };

  return (
    <div className="group relative overflow-hidden rounded-lg bg-card/40 border border-white/5 hover:border-primary/50 transition-all duration-300 backdrop-blur-sm p-4 hover:shadow-[0_0_20px_rgba(0,243,255,0.1)]">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
            <ShieldAlert size={20} />
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-medium font-display">{approval.contractName}</h3>
              <a href={`https://testnet.arcscan.app/address/${approval.contractAddress}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink size={14} />
              </a>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{approval.contractAddress}</span>
          </div>
        </div>

        <div className="hidden md:flex flex-col items-end gap-1 min-w-[100px]">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Risk Level</span>
          <Badge variant="outline" className={`
            ${approval.risk === 'High' ? 'border-red-500 text-red-500 bg-red-500/10' : 
              approval.risk === 'Medium' ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : 
              'border-green-500 text-green-500 bg-green-500/10'}
          `}>
            {approval.risk} Risk
          </Badge>
        </div>

        <div className="hidden md:flex flex-col items-end gap-1 min-w-[120px]">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Approved Amount</span>
          <span className="text-sm font-mono text-white">{approval.amount} {approval.asset}</span>
        </div>

        <div className="hidden md:flex flex-col items-end gap-1 min-w-[100px]">
           <span className="text-xs text-muted-foreground uppercase tracking-wider">Last Updated</span>
           <span className="text-xs text-muted-foreground">{approval.lastUpdated}</span>
        </div>

        <Button 
          onClick={handleRevoke}
          disabled={isRevoking}
          variant="outline"
          className="ml-4 border-primary/50 text-primary hover:bg-primary hover:text-black font-bold tracking-wide min-w-[100px]"
        >
          {isRevoking ? "REVOKING..." : "REVOKE"}
        </Button>
      </div>
    </div>
  );
}

export function ApprovalList() {
  const mockApprovals: Approval[] = [
    {
      id: "1",
      contractName: "Unknown Contract",
      contractAddress: "0xaf88d0...8e5831",
      asset: "USDC",
      amount: "Unlimited",
      risk: "High",
      lastUpdated: "25 days ago",
      approvedAssets: 1
    },
    {
      id: "2",
      contractName: "OpenSea Registry",
      contractAddress: "0x1e0049...003c71",
      asset: "WETH",
      amount: "Unlimited",
      risk: "Low",
      lastUpdated: "1 year ago",
      approvedAssets: 1
    },
    {
      id: "3",
      contractName: "Z Protocol",
      contractAddress: "0xf9ca71...4a77f5",
      asset: "USDT",
      amount: "5000.00",
      risk: "Medium",
      lastUpdated: "1 year ago",
      approvedAssets: 1
    },
    {
      id: "4",
      contractName: "Felix Exchange",
      contractAddress: "0x56a346...0779ab",
      asset: "ARC",
      amount: "100.00",
      risk: "Low",
      lastUpdated: "1 month ago",
      approvedAssets: 1
    }
  ];

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
          <History className="text-primary" />
          Active Approvals
          <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary hover:bg-primary/30">
            {mockApprovals.length}
          </Badge>
        </h2>
        
        <div className="flex gap-2">
           <Button variant="ghost" className="text-muted-foreground hover:text-primary">
             Refresh List
           </Button>
           <Button variant="destructive" className="bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/50">
             Revoke All
           </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {mockApprovals.map((approval) => (
          <RevokeCard key={approval.id} approval={approval} />
        ))}
      </div>
    </div>
  );
}
