const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Member = require('../models/Users/Member');
const Transaction = require('../models/Transaction/Transaction');
const Payout = require('../models/Payout/Payout');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
};

const populateMissingInfo = async () => {
    try {
        await connectDB();

        console.log('🔍 Fetching all members for mapping...');
        const members = await Member.find({}, 'Member_id Name mobileno');
        const memberMap = new Map();
        members.forEach(m => {
            memberMap.set(m.Member_id, { name: m.Name, mobile: m.mobileno });
        });
        console.log(`✅ Loaded ${memberMap.size} members into memory.`);

        // --- Update Transactions ---
        console.log('⏳ Checking transactions for missing names...');
        const transactions = await Transaction.find({
            $or: [
    { Name: { $exists: false } },
    { Name: "" },
    { Name: null },
    { mobileno: { $exists: false } },
    { mobileno: "" },
    { mobileno: null }
]
        });

console.log(`📊 Found ${transactions.length} transactions needing updates.`);

let txCount = 0;
for (const tx of transactions) {
    const memberInfo = memberMap.get(tx.member_id);
    if (memberInfo) {
        await Transaction.updateOne(
            { _id: tx._id },
            { 
                        $set: {
                    Name: memberInfo.name,
                    mobileno: memberInfo.mobile
                }
            }
        );
        txCount++;
    }
}
console.log(`✅ Updated ${txCount} transactions.`);

// --- Update Payouts ---
console.log('⏳ Checking payouts for missing names...');
const payouts = await Payout.find({
            $or: [
    { Name: { $exists: false } },
    { Name: "" },
    { Name: null },
    { mobileno: { $exists: false } },
    { mobileno: "" },
    { mobileno: null }
]
        });

console.log(`📊 Found ${payouts.length} payouts needing updates.`);

let pCount = 0;
for (const p of payouts) {
    const memberInfo = memberMap.get(p.memberId || p.member_id);
    if (memberInfo) {
        await Payout.updateOne(
            { _id: p._id },
            { 
                        $set: {
                    Name: memberInfo.name,
                    mobileno: memberInfo.mobile
                }
            }
        );
        pCount++;
    }
}
console.log(`✅ Updated ${pCount} payouts.`);

console.log('🎉 Migration completed successfully!');
process.exit(0);
    } catch (error) {
    console.error(`❌ Migration failed: ${error.message}`);
    process.exit(1);
}
};

populateMissingInfo();
