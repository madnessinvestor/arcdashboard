import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { BrowserProvider } from 'ethers';
import { switchNetwork } from '@/lib/arc-network';
import { Wallet, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ConnectWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (window.ethereum) {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        setAccount(accounts[0].address);
      }
    }
  };

  const connect = async () => {
    if (!window.ethereum) {
      toast({
        title: "Wallet not found",
        description: "Please install MetaMask or Rabby wallet.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      
      // Switch to Arc Testnet immediately
      await switchNetwork();
      
      toast({
        title: "Connected",
        description: "Wallet connected successfully.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect wallet.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <Button 
      onClick={connect} 
      disabled={isConnecting}
      className="bg-primary hover:bg-primary/90 text-black font-bold font-display tracking-wide glow-effect"
    >
      {isConnecting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Wallet className="mr-2 h-4 w-4" />
      )}
      {account ? formatAddress(account) : "CONNECT WALLET"}
    </Button>
  );
}

// Add types for window.ethereum
declare global {
  interface Window {
    ethereum: any;
  }
}
