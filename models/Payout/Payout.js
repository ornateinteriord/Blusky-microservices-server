const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    payout_id: Number,
    date: { type: Date, default: Date.now },
    memberId: String,
    payout_type: String,
    ref_no: { type: String },
    amount: Number,
    count: Number,
    days: Number,
    status: { type: String, default: "Approved" },
    level: { type: Number }, 
    sponsored_member_id: { type: String }, 
    sponsor_id: { type: String },
    description: { type: String }
  },
  { timestamps: true, collection: "payouts" }
);

const PayoutModel = mongoose.model("Payout", payoutSchema);
module.exports = PayoutModel;