const mongoose = require("mongoose");

const GlobalIncomeQueueSchema = new mongoose.Schema({
  member_id: { type: String, required: true },
  package_amount: { type: Number, required: true },
  queue_index: { type: Number, required: true },
}, { timestamps: true, collection: "global_income_queue_tbl" });

// Create a compound index to quickly find the next queue_index per package amount
GlobalIncomeQueueSchema.index({ package_amount: 1, queue_index: 1 }, { unique: true });

module.exports = mongoose.model("GlobalIncomeQueue", GlobalIncomeQueueSchema);
