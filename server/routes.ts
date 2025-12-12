import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRevokeHistorySchema } from "@shared/schema";
import { fetchRevokeStatsFromBlockchain } from "./blockchain";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/stats", async (req, res) => {
    try {
      const walletAddress = req.query.wallet as string | undefined;
      
      if (walletAddress) {
        const blockchainStats = await fetchRevokeStatsFromBlockchain(walletAddress);
        return res.json({
          totalRevokes: blockchainStats.totalRevokes,
          totalValueSecured: blockchainStats.totalValueSecured
        });
      }
      
      res.json({
        totalRevokes: 0,
        totalValueSecured: "0"
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/stats/blockchain", async (req, res) => {
    try {
      const walletAddress = req.query.wallet as string | undefined;
      
      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet address is required" });
      }
      
      const stats = await fetchRevokeStatsFromBlockchain(walletAddress);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching blockchain stats:", error);
      res.status(500).json({ error: "Failed to fetch blockchain stats" });
    }
  });

  app.post("/api/revoke", async (req, res) => {
    try {
      const parsed = insertRevokeHistorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error });
      }
      
      const record = await storage.recordRevoke(parsed.data);
      res.json(record);
    } catch (error) {
      console.error("Error recording revoke:", error);
      res.status(500).json({ error: "Failed to record revoke" });
    }
  });

  app.get("/api/revokes/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const revokes = await storage.getRecentRevokes(limit);
      res.json(revokes);
    } catch (error) {
      console.error("Error fetching recent revokes:", error);
      res.status(500).json({ error: "Failed to fetch recent revokes" });
    }
  });

  return httpServer;
}
