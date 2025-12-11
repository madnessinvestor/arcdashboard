import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { BrowserProvider } from 'ethers';
import { switchNetwork, ARC_TESTNET } from '@/lib/arc-network';
import { Wallet, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ConnectWallet({ onAccountChange }: { onAccountChange?: (account: string | null) => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkConnection();
    
    if (window.ethereum) {
      window.ethereum.on('chainChanged', (chainId: string) => {
        checkNetwork(chainId);
      });
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
            setAccount(accounts[0]);
            onAccountChange?.(accounts[0]);
        } else {
            setAccount(null);
            onAccountChange?.(null);
        }
      });
    }
  }, []);

  const checkNetwork = async (chainId: string) => {
    // 0x4CEF22 is 5042002
    if (chainId.toLowerCase() !== ARC_TESTNET.chainId.toLowerCase()) {
        setWrongNetwork(true);
    } else {
        setWrongNetwork(false);
    }
  };

  const checkConnection = async () => {
    if (window.ethereum) {
      const provider = new BrowserProvider(window.ethereum);
      try {
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            setAccount(accounts[0].address);
            onAccountChange?.(accounts[0].address);
            
            const network = await provider.getNetwork();
            checkNetwork("0x" + network.chainId.toString(16));
        }
      } catch (e) {
        console.error("Error checking connection", e);
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
      onAccountChange?.(accounts[0]);
      
      // Switch to Arc Testnet immediately
      await switchNetwork();
      setWrongNetwork(false);
      
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
  
  const handleSwitch = async () => {
      await switchNetwork();
      setWrongNetwork(false);
  };

  if (account && wrongNetwork) {
      return (
        <Button 
          onClick={handleSwitch} 
          variant="destructive"
          className="font-bold font-display tracking-wide animate-pulse"
        >
          <AlertCircle className="mr-2 h-4 w-4" />
          SWITCH NETWORK
        </Button>
      );
  }

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
