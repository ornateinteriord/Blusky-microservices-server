const mongoose = require("mongoose");
require("dotenv").config();

const TransactionModel = require("../models/Transaction/Transaction");
const PayoutModel = require("../models/Payout/Payout");
const connectDB = require("../models/db");

async function cleanupDescriptions() {
  try {
    await connectDB();
    console.log("Connected to DB...");

    // Pattern to match "Add-On [ID] ..."
    const pattern = /Add-On \[[^\]]+\]/g;

    // 1. Update Transactions
    const txs = await TransactionModel.find({ description: { $regex: /Add-On \[/ } });
    console.log(`Found ${txs.length} transactions with ID in brackets.`);

    for (const tx of txs) {
      tx.description = tx.description.replace(pattern, "Add-On");
      await tx.save();
    }

    // 2. Update Payouts
    const payouts = await PayoutModel.find({ description: { $regex: /Add-On \[/ } });
    console.log(`Found ${payouts.length} payouts with ID in brackets.`);

    for (const p of payouts) {
      p.description = p.description.replace(pattern, "Add-On");
      await p.save();
    }

    console.log("Cleanup complete.");
    process.exit(0);
  } catch (error) {
    console.error("Cleanup failed:", error.message);
    process.exit(1);
  }
}

cleanupDescriptions();
