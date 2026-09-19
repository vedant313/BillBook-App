import express from "express";
import { readDb, writeDb } from "../db.js";
import { randomUUID } from "crypto";

const router = express.Router();
const UPI_ID = "shamkantgopal@ybl";

const PLANS = {
  free: { id: "free", name: "Free", amount: 0, durationDays: 0 },
  pro: { id: "pro", name: "Pro", amount: 199, durationDays: 30 },
  advanced: { id: "advanced", name: "Advanced", amount: 399, durationDays: 30 },
};

router.get("/plans", (req, res) => res.json({ upiId: UPI_ID, plans: Object.values(PLANS) }));

router.get("/status", (req, res) => {
  const db = readDb();
  res.json(db.subscription || { plan: "free", status: "active", expiresAt: null });
});

router.post("/payment-request", (req, res) => {
  const { planId } = req.body || {};
  const plan = PLANS[planId];
  if (!plan || planId === "free") return res.status(400).json({ error: "Paid plan required" });
  const db = readDb();
  const request = {
    id: randomUUID(), planId: plan.id, planName: plan.name, amount: plan.amount,
    upiId: UPI_ID, status: "pending", utr: "", createdAt: new Date().toISOString(),
  };
  db.subscriptionPayments = [request, ...(db.subscriptionPayments || [])];
  writeDb(db);
  res.status(201).json(request);
});

router.post("/verify", (req, res) => {
  const { paymentId, utr } = req.body || {};
  if (!paymentId || !String(utr || "").trim()) return res.status(400).json({ error: "paymentId and UTR are required" });
  const db = readDb();
  const payment = (db.subscriptionPayments || []).find((x) => x.id === paymentId);
  if (!payment) return res.status(404).json({ error: "Payment request not found" });
  payment.utr = String(utr).trim();
  payment.status = "submitted";
  payment.submittedAt = new Date().toISOString();
  writeDb(db);
  res.json(payment);
});

router.post("/activate", (req, res) => {
  const { paymentId } = req.body || {};
  const db = readDb();
  const payment = (db.subscriptionPayments || []).find((x) => x.id === paymentId);
  if (!payment) return res.status(404).json({ error: "Payment request not found" });
  if (!["submitted", "paid"].includes(payment.status)) return res.status(400).json({ error: "Payment must be submitted before activation" });
  const plan = PLANS[payment.planId];
  const expiresAt = new Date(Date.now() + plan.durationDays * 86400000).toISOString();
  payment.status = "paid";
  payment.verifiedAt = new Date().toISOString();
  db.subscription = { plan: plan.id, planName: plan.name, status: "active", expiresAt, activatedAt: new Date().toISOString(), paymentId: payment.id };
  writeDb(db);
  res.json(db.subscription);
});

export default router;
