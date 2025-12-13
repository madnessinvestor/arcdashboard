import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink, ArrowUpRight, ArrowDownLeft, FileCode, Check, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import React, { useState, useEffect, useCallback } from "react";
import { ARC_TESTNET } from "@/lib/arc-network";

const TRANSACTIONS_PER_PAGE = 10;

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  timeStamp: string;
  isError: string;
  functionName: string;
  input: string;
  contractAddress: string;
}

interface TransactionHistoryProps {
  walletAddress: string | null;
}

export function TransactionHistory({ walletAddress }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE);
  const startIndex = (currentPage - 1) * TRANSACTIONS_PER_PAGE;
  const endIndex = startIndex + TRANSACTIONS_PER_PAGE;
  const currentTransactions = transactions.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getVisiblePageNumbers = () => {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      if (end - start < maxVisiblePages - 1) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'UTC'
    }) + ' (UTC)';
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = Date.now();
    const txTime = parseInt(timestamp) * 1000;
    const diff = now - txTime;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) {
      return `${days}d ${hours % 24}hrs ago`;
    } else if (hours > 0) {
      return `${hours}hrs ${minutes % 60}mins ago`;
    } else if (minutes > 0) {
      return `${minutes}mins ago`;
    } else {
      return 'Just now';
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  
  const formatHash = (hash: string) => `${hash.slice(0, 6)}...${hash.slice(-4)}`;

  const formatGasFee = (gasUsed: string, gasPrice: string): string => {
    const gasFeeWei = BigInt(gasUsed) * BigInt(gasPrice);
    const gasFeeEth = Number(gasFeeWei) / 1e18;
    if (gasFeeEth < 0.0001) return '<0.0001 USDC';
    return `${gasFeeEth.toFixed(4)} USDC`;
  };

  const formatValue = (valueWei: string): string => {
    const value = Number(valueWei) / 1e18;
    if (value === 0) return '0';
    if (value < 0.0001) return '<0.0001';
    if (value < 1) return value.toFixed(4);
    if (value < 1000) return value.toFixed(2);
    if (value < 1000000) return `${(value / 1000).toFixed(2)}K`;
    return `${(value / 1000000).toFixed(2)}M`;
  };

  const getTransactionType = (tx: Transaction, walletAddress: string): { type: string; icon: React.ReactNode; color: string } => {
    const fromLower = tx.from.toLowerCase();
    const toLower = tx.to?.toLowerCase() || '';
    const walletLower = walletAddress.toLowerCase();
    
    if (tx.input && tx.input !== '0x' && tx.input.length > 10) {
      if (tx.functionName?.toLowerCase().includes('approve')) {
        return { 
          type: 'Approval', 
          icon: <Check className="h-3 w-3" />, 
          color: 'text-yellow-500' 
        };
      }
      if (tx.functionName?.toLowerCase().includes('swap')) {
        return { 
          type: 'Swap', 
          icon: <ArrowUpRight className="h-3 w-3" />, 
          color: 'text-purple-500' 
        };
      }
      if (tx.functionName?.toLowerCase().includes('transfer')) {
        return fromLower === walletLower
          ? { type: 'Send', icon: <ArrowUpRight className="h-3 w-3" />, color: 'text-red-500' }
          : { type: 'Receive', icon: <ArrowDownLeft className="h-3 w-3" />, color: 'text-green-500' };
      }
      return { 
        type: 'Contract', 
        icon: <FileCode className="h-3 w-3" />, 
        color: 'text-blue-500' 
      };
    }
    
    if (fromLower === walletLower) {
      return { 
        type: 'Send', 
        icon: <ArrowUpRight className="h-3 w-3" />, 
        color: 'text-red-500' 
      };
    }
    
    return { 
      type: 'Receive', 
      icon: <ArrowDownLeft className="h-3 w-3" />, 
      color: 'text-green-500' 
    };
  };

  const fetchTransactions = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `https://testnet.arcscan.app/api?module=account&action=txlist&address=${walletAddress}&sort=desc`
      );
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === "0" && data.message === "No transactions found") {
        setTransactions([]);
        setLastUpdatedAt(new Date());
        return;
      }
      
      if (data.result && Array.isArray(data.result)) {
        setTransactions(data.result.slice(0, 50));
        setLastUpdatedAt(new Date());
      } else {
        setTransactions([]);
        setLastUpdatedAt(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch transactions", err);
      setError("Failed to fetch transactions. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      setCurrentPage(1);
      fetchTransactions();
    } else {
      setTransactions([]);
      setCurrentPage(1);
    }
  }, [walletAddress, fetchTransactions]);

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <FileCode size={32} className="text-primary" />
        </div>
        <h3 className="text-2xl font-display font-bold text-white">Connect Wallet</h3>
        <p className="text-muted-foreground max-w-md">Connect your wallet or search for an address to view transactions</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading transactions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h3 className="text-2xl font-display font-bold text-white">Error Loading Transactions</h3>
        <p className="text-muted-foreground max-w-md">{error}</p>
        <Button onClick={fetchTransactions} className="bg-primary text-black font-bold" data-testid="button-retry-tx">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="text-xs font-mono uppercase text-muted-foreground">Transaction History</span>
          <p className="text-lg font-display font-bold text-white">{transactions.length} transactions</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdatedAt && (
            <span className="text-xs font-mono text-muted-foreground" data-testid="text-tx-last-updated">
              Last updated at {formatTimestamp(lastUpdatedAt)}
            </span>
          )}
          <Button 
            variant="ghost" 
            onClick={fetchTransactions} 
            disabled={isLoading}
            className="text-muted-foreground hover:text-primary gap-2" 
            data-testid="button-refresh-tx"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-muted/20 flex items-center justify-center border border-muted/30">
            <FileCode size={28} className="text-muted-foreground" />
          </div>
          <h3 className="text-xl font-display font-bold text-white">No Transactions Found</h3>
          <p className="text-muted-foreground text-sm max-w-md">
            This wallet has no transactions on Arc Testnet
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-black/40">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-mono uppercase text-xs">Time</TableHead>
                <TableHead className="text-muted-foreground font-mono uppercase text-xs">Hash</TableHead>
                <TableHead className="text-muted-foreground font-mono uppercase text-xs">Type</TableHead>
                <TableHead className="text-muted-foreground font-mono uppercase text-xs">From/To</TableHead>
                <TableHead className="text-muted-foreground font-mono uppercase text-xs text-right">Value</TableHead>
                <TableHead className="text-muted-foreground font-mono uppercase text-xs text-right">Gas Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentTransactions.map((tx) => {
                const txType = getTransactionType(tx, walletAddress);
                const isOutgoing = tx.from.toLowerCase() === walletAddress.toLowerCase();
                return (
                  <TableRow key={tx.hash} className="border-white/5 hover:bg-white/5" data-testid={`row-tx-${tx.hash}`}>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground" data-testid={`text-tx-time-${tx.hash}`}>
                        {formatTimeAgo(tx.timeStamp)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <a 
                        href={`${ARC_TESTNET.blockExplorerUrls[0]}/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                        data-testid={`link-tx-${tx.hash}`}
                      >
                        {formatHash(tx.hash)}
                        <ExternalLink size={10} />
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1.5 ${txType.color}`}>
                        {txType.icon}
                        <span className="text-xs font-medium">{txType.type}</span>
                        {tx.isError === "1" && (
                          <span className="text-xs text-red-500">(Failed)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          {isOutgoing ? 'To: ' : 'From: '}
                          <a 
                            href={`${ARC_TESTNET.blockExplorerUrls[0]}/address/${isOutgoing ? tx.to : tx.from}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-white hover:text-primary transition-colors"
                          >
                            {formatAddress(isOutgoing ? (tx.to || 'Contract Creation') : tx.from)}
                          </a>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs font-mono text-white" data-testid={`text-tx-value-${tx.hash}`}>
                        {formatValue(tx.value)} USDC
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs font-mono text-muted-foreground" data-testid={`text-tx-gas-${tx.hash}`}>
                        {formatGasFee(tx.gasUsed, tx.gasPrice)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {transactions.length > TRANSACTIONS_PER_PAGE && (
        <div className="flex items-center justify-center gap-2 pt-4" data-testid="pagination-container">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="text-muted-foreground"
            data-testid="button-first-page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="text-muted-foreground"
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-1">
            {getVisiblePageNumbers().map((pageNum) => (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "ghost"}
                size="sm"
                onClick={() => goToPage(pageNum)}
                className={currentPage === pageNum ? "bg-primary text-black" : "text-muted-foreground"}
                data-testid={`button-page-${pageNum}`}
              >
                {pageNum}
              </Button>
            ))}
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="text-muted-foreground"
            data-testid="button-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            className="text-muted-foreground"
            data-testid="button-last-page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
          
          <span className="text-xs text-muted-foreground ml-2" data-testid="text-page-info">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
