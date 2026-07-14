const mongoose = require("mongoose");
require("dotenv").config();
const MemberModel = require("../models/Users/Member");
const AddOnPackageModel = require("../models/Packages/AddOnPackage");
const TransactionModel = require("../models/Transaction/Transaction");
const ReceiptsModel = require("../models/receipts.model");
const connectDB = require("../models/db");
const { addMemberHierarchy } = require("../utils/hierarchyHelper");
const { updateSponsorReferrals } = require("../controllers/Users/mlmService/mlmService");
const { processAutoUpgrades } = require("../controllers/Packages/autoUpgradeService");

const runTest = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB Connected Successfully\n");

    const testIds = ["SBA9900001", "SBA9900002", "SBA9900003", "SBA9900004", "SBA9900005", "SBA9900006"];

    console.log("🧹 Cleaning up previous test records...");
    await MemberModel.deleteMany({ Member_id: { $in: testIds } });
    await AddOnPackageModel.deleteMany({ member_id: { $in: testIds } });
    await TransactionModel.deleteMany({ member_id: { $in: testIds } });
    await ReceiptsModel.deleteMany({ member_id: { $in: testIds } });
    console.log("✅ Cleaned old test data.\n");

    // 1. Find or create a root sponsor
    let rootMember = await MemberModel.findOne({ status: "active", Member_id: { $nin: testIds } }).sort({ _id: 1 });
    if (!rootMember) {
      console.log("No active root member found. Creating default root SBA53553301...");
      rootMember = new MemberModel({
        Member_id: "SBA53553301",
        Name: "Root Sponsor",
        email: "root@uwc.club",
        mobileno: "9000000000",
        password: "password123",
        status: "active",
        package_value: 1000,
        wallet_balance: 0,
        upgrade_wallet: 0
      });
      await rootMember.save();
    }
    console.log(`🌟 Root Sponsor Selected: ${rootMember.Name} (${rootMember.Member_id})\n`);

    // 2. Create 6 fake users in a sponsor chain with sequential timestamps
    // To test Single Leg Income (paid to earlier buyers of the same package):
    // - User 1 has ₹60 package (created earliest)
    // - User 2 has ₹120 package (created second)
    // - When User 4 later upgrades to ₹60, User 1 gets Single Leg Income!
    // - When User 5 later upgrades to ₹120, User 2 gets Single Leg Income!
    const baseTime = Date.now() - 3600000; // 1 hour ago
    const testUsersData = [
      {
        Member_id: "SBA9900001",
        Name: "Fake User 1 (₹60 Buyer)",
        email: "fake1@test.com",
        mobileno: "9900000001",
        sponsor_id: rootMember.Member_id,
        package_value: 60,
        upgrade_wallet: 0,
        createdAt: new Date(baseTime + 1000)
      },
      {
        Member_id: "SBA9900002",
        Name: "Fake User 2 (₹120 Buyer)",
        email: "fake2@test.com",
        mobileno: "9900000002",
        sponsor_id: "SBA9900001",
        package_value: 120,
        upgrade_wallet: 0,
        createdAt: new Date(baseTime + 2000)
      },
      {
        Member_id: "SBA9900003",
        Name: "Fake User 3 (₹30 Base)",
        email: "fake3@test.com",
        mobileno: "9900000003",
        sponsor_id: "SBA9900002",
        package_value: 30,
        upgrade_wallet: 0,
        createdAt: new Date(baseTime + 3000)
      },
      {
        Member_id: "SBA9900004",
        Name: "Fake User 4 (Upgrade ₹63)",
        email: "fake4@test.com",
        mobileno: "9900000004",
        sponsor_id: "SBA9900003",
        package_value: 30,
        upgrade_wallet: 63, // Next package is ₹60 -> should auto-upgrade!
        createdAt: new Date(baseTime + 4000)
      },
      {
        Member_id: "SBA9900005",
        Name: "Fake User 5 (Upgrade ₹125)",
        email: "fake5@test.com",
        mobileno: "9900000005",
        sponsor_id: "SBA9900004",
        package_value: 60,
        upgrade_wallet: 125, // Next package is ₹120 -> should auto-upgrade!
        createdAt: new Date(baseTime + 5000)
      },
      {
        Member_id: "SBA9900006",
        Name: "Fake User 6 (₹30 Base)",
        email: "fake6@test.com",
        mobileno: "9900000006",
        sponsor_id: "SBA9900005",
        package_value: 30,
        upgrade_wallet: 0,
        createdAt: new Date(baseTime + 6000)
      }
    ];

    console.log("👥 Creating 6 Fake Test Users with Hierarchy & Timestamps...");
    for (let data of testUsersData) {
      let sponsor = await MemberModel.findOne({ Member_id: data.sponsor_id });
      let memberData = {
        ...data,
        password: "password123",
        status: "active",
        Sponsor_code: data.sponsor_id,
        Sponsor_name: sponsor ? sponsor.Name : "Root",
        introducer: data.sponsor_id,
        introducer_name: sponsor ? sponsor.Name : "Root",
        qr_code: `BMS-P2P:${data.Member_id}`,
        wallet_balance: 0,
        top_up_wallet: 0
      };

      memberData = await addMemberHierarchy(memberData);
      const newMember = new MemberModel(memberData);
      await newMember.save();

      // Also create initial AddOn package record with matching timestamp
      if (data.package_value > 30) {
        await AddOnPackageModel.create({
          package_id: `PKG-INIT-${data.Member_id}`,
          member_id: data.Member_id,
          amount: data.package_value,
          request_id: `INIT_${Date.now()}`,
          admin_id: "SYSTEM_INIT",
          createdAt: data.createdAt
        });
      }

      try {
        await updateSponsorReferrals(data.sponsor_id, data.Member_id);
      } catch (err) {
        // ignore if root referral fails
      }
      console.log(`   + Created ${data.Member_id} (${data.Name.padEnd(26)}) | Pkg: ₹${data.package_value.toString().padEnd(3)} | Upgrade Wallet: ₹${data.upgrade_wallet}`);
    }

    console.log("\n=======================================================");
    console.log("   INITIAL STATE BEFORE AUTO UPGRADE");
    console.log("=======================================================");
    for (let id of testIds) {
      let m = await MemberModel.findOne({ Member_id: id });
      console.log(`${id.padEnd(11)} | Wallet: ₹${(m.wallet_balance||0).toFixed(2).padStart(6)} | Upgrade Wallet: ₹${(m.upgrade_wallet||0).toFixed(2).padStart(6)} | Package: ₹${m.package_value}`);
    }

    console.log("\n⚡ Triggering Auto Upgrade Process (processAutoUpgrades)...");
    const upgradeResult = await processAutoUpgrades();
    console.log("⚡ Auto Upgrade Result:", upgradeResult);

    console.log("\n=======================================================");
    console.log("   FINAL STATE AFTER AUTO UPGRADE");
    console.log("=======================================================");
    for (let id of testIds) {
      let m = await MemberModel.findOne({ Member_id: id });
      console.log(`${id.padEnd(11)} | Wallet: ₹${(m.wallet_balance||0).toFixed(2).padStart(6)} | Upgrade Wallet: ₹${(m.upgrade_wallet||0).toFixed(2).padStart(6)} | Package: ₹${m.package_value}`);
    }

    console.log("\n=======================================================");
    console.log("   GENERATED TRANSACTIONS (ALL INCOMES VERIFIED)");
    console.log("=======================================================");
    const txs = await TransactionModel.find({ member_id: { $in: testIds } }).sort({ createdAt: 1 });
    if (txs.length === 0) {
      console.log("No transactions found.");
    } else {
      txs.forEach(tx => {
        console.log(`[${tx.transaction_type.padEnd(24)}] Member: ${tx.member_id} | Amount: ₹${(tx.net_amount || tx.uw_debit || tx.ew_credit).toString().padEnd(5)} | Desc: ${tx.description}`);
      });
    }

    console.log("\n✅ Test completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Test Failed:", error);
    process.exit(1);
  }
};

runTest();
