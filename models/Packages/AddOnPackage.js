const mongoose = require("mongoose");

const AddOnPackageSchema = new mongoose.Schema({
  package_id: { type: String, required: true, unique: true },
  member_id: { type: String, required: true },
  amount: { type: Number, required: true },
  
  // Independent ROI Tracking
  roi_status: { type: String, enum: ["Pending", "Active", "Completed"], default: "Active" },
  roi_payout_count: { type: Number, default: 0 },
  roi_payout_target: { type: Number, required: false }, 
  roi_last_payout_date: { type: String },
  roi_start_date: { type: String, default: () => new Date().toISOString().split('T')[0] },

  // Metadata
  request_id: { type: String }, // Reference to the original request
  approved_at: { type: Date, default: Date.now },
  admin_id: { type: String }
}, { timestamps: true, collection: "add_on_package_tbl" });

module.exports = mongoose.model("AddOnPackage", AddOnPackageSchema);
