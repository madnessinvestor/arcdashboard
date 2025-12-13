import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

interface HistoryDataPoint {
  timestamp: number;
  value: number;
  formattedDate: string;
}

interface WalletHistoryChartProps {
  currentValue: number;
  walletAddress: string;
}

type TimeRange = "24h" | "1W" | "1M";

const PORTFOLIO_HISTORY_KEY = "portfolio_history_";

interface PortfolioHistoryEntry {
  totalValue: number;
  timestamp: number;
  tokens: { address: string; value: number; price: number }[];
}

function loadPortfolioHistory(walletAddress: string): PortfolioHistoryEntry[] {
  try {
    const stored = localStorage.getItem(`${PORTFOLIO_HISTORY_KEY}${walletAddress.toLowerCase()}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function WalletHistoryChart({ currentValue, walletAddress }: WalletHistoryChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);

  const formatDateForRange = useCallback((timestamp: number, range: TimeRange): string => {
    const date = new Date(timestamp);
    if (range === "24h") {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (range === "1W") {
      return date.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }, []);

  const filterDataByRange = useCallback((data: PortfolioHistoryEntry[], range: TimeRange): HistoryDataPoint[] => {
    const now = Date.now();
    let cutoff: number;
    
    if (range === "24h") {
      cutoff = now - 24 * 60 * 60 * 1000;
    } else if (range === "1W") {
      cutoff = now - 7 * 24 * 60 * 60 * 1000;
    } else {
      cutoff = now - 30 * 24 * 60 * 60 * 1000;
    }
    
    const filtered = data.filter((p) => p.timestamp >= cutoff);
    return filtered.map((p) => ({
      timestamp: p.timestamp,
      value: p.totalValue,
      formattedDate: formatDateForRange(p.timestamp, range),
    }));
  }, [formatDateForRange]);

  useEffect(() => {
    if (!walletAddress || currentValue <= 0) {
      setHistoryData([]);
      return;
    }

    const portfolioHistory = loadPortfolioHistory(walletAddress);
    
    if (portfolioHistory.length === 0) {
      const now = Date.now();
      setHistoryData([{
        timestamp: now,
        value: currentValue,
        formattedDate: formatDateForRange(now, timeRange)
      }]);
      return;
    }

    const rangeData = filterDataByRange(portfolioHistory, timeRange);
    
    if (rangeData.length > 0) {
      const lastPoint = rangeData[rangeData.length - 1];
      if (lastPoint.value !== currentValue) {
        rangeData[rangeData.length - 1] = {
          ...lastPoint,
          value: currentValue
        };
      }
    }
    
    setHistoryData(rangeData);
  }, [walletAddress, currentValue, timeRange, formatDateForRange, filterDataByRange]);

  const calculateChange = () => {
    if (historyData.length < 2) return { absolute: 0, percentage: 0 };
    
    const firstValue = historyData[0].value;
    const lastValue = historyData[historyData.length - 1].value;
    const absolute = lastValue - firstValue;
    const percentage = firstValue > 0 ? (absolute / firstValue) * 100 : 0;
    
    return { absolute, percentage };
  };

  const change = calculateChange();
  const isPositive = change.absolute >= 0;

  const formatValue = (value: number) => {
    if (value < 1000) return `$${value.toFixed(2)}`;
    if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  const formatAxisValue = (value: number) => {
    if (value < 1000) return `$${value.toFixed(0)}`;
    if (value < 1000000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${(value / 1000000).toFixed(1)}M`;
  };

  const getTimeRangeLabel = () => {
    const now = new Date();
    if (timeRange === "24h") {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return `${yesterday.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} - ${now.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    } else if (timeRange === "1W") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return `${weekAgo.toLocaleDateString([], { month: "short", day: "numeric" })} - ${now.toLocaleDateString([], { month: "short", day: "numeric" })}`;
    } else {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return `${monthAgo.toLocaleDateString([], { month: "short", day: "numeric" })} - ${now.toLocaleDateString([], { month: "short", day: "numeric" })}`;
    }
  };

  if (currentValue <= 0 || historyData.length === 0) {
    return null;
  }

  return (
    <div className="glass-panel rounded-lg p-4 space-y-4" data-testid="wallet-history-chart">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="text-xs font-mono uppercase text-muted-foreground">Net Worth</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-display font-bold text-white" data-testid="text-chart-value">
              {formatValue(currentValue)}
            </span>
            <div className={`flex items-center gap-1 ${isPositive ? "text-green-500" : "text-red-500"}`} data-testid="text-chart-change">
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span className="text-sm font-mono">
                {isPositive ? "+" : ""}{change.percentage.toFixed(2)}% ({isPositive ? "+" : ""}{formatValue(Math.abs(change.absolute))})
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
          {(["24h", "1W", "1M"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-md text-sm font-mono transition-all ${
                timeRange === range
                  ? "bg-primary text-black font-bold"
                  : "text-muted-foreground hover:text-white"
              }`}
              data-testid={`button-range-${range}`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="h-48" data-testid="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={historyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="formattedDate"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickFormatter={formatAxisValue}
              domain={["dataMin * 0.95", "dataMax * 1.05"]}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0, 0, 0, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "8px 12px",
              }}
              labelStyle={{ color: "#9ca3af", fontSize: 12 }}
              formatter={(value: number) => [formatValue(value), "Value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isPositive ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              fill="url(#colorValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
        <span>{getTimeRangeLabel()}</span>
        {historyData.length > 1 && (
          <span>{historyData.length} data points</span>
        )}
      </div>
    </div>
  );
}