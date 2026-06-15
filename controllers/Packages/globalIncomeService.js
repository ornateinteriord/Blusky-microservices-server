const GlobalIncomeQueue = require("../../models/Packages/GlobalIncomeQueue");
const MemberModel = require("../../models/Users/Member");
const TransactionModel = require("../../models/Transaction/Transaction");

/**
 * Handles adding a member to the Global Income queue and distributing 12% payouts
 * to the previous members in the queue based on the intervals: 150th, 300th, 450th, 600th, 750th.
 * 
 * @param {string} memberId - The ID of the member who just bought the package.
 * @param {number} packageAmount - The amount of the package purchased.
 */
const distributeGlobalIncome = async (memberId, packageAmount) => {
  try {
    const amount = Number(packageAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Get the current highest queue index for this specific package amount
    const lastQueueEntry = await GlobalIncomeQueue.findOne({ package_amount: amount })
      .sort({ queue_index: -1 })
      .exec();
    
    let newQueueIndex = 1;
    if (lastQueueEntry && lastQueueEntry.queue_index) {
      newQueueIndex = lastQueueEntry.queue_index + 1;
    }

    // Add the new purchase to the queue
    const newEntry = new GlobalIncomeQueue({
      member_id: memberId,
      package_amount: amount,
      queue_index: newQueueIndex
    });
    await newEntry.save();

    console.log(`[GlobalIncome] Member ${memberId} added to queue for $${amount} at index ${newQueueIndex}`);

    // Intervals: 150th, 300th, 450th, 600th, 750th relative purchase.
    // That means the difference between current index and beneficiary index is interval - 1.
    // e.g. 150 - 1 = 149, 300 - 1 = 299...
    const payoutIntervals = [
      { diff: 149, payoutNum: 1 },
      { diff: 299, payoutNum: 2 },
      { diff: 449, payoutNum: 3 },
      { diff: 599, payoutNum: 4 },
      { diff: 749, payoutNum: 5 }
    ];

    const payoutAmount = amount * 0.12; // 12% of the package amount

    for (const interval of payoutIntervals) {
      const targetQueueIndex = newQueueIndex - interval.diff;
      
      // If the target index is valid (>= 1), we find the beneficiary
      if (targetQueueIndex >= 1) {
        const beneficiaryEntry = await GlobalIncomeQueue.findOne({ 
          package_amount: amount, 
          queue_index: targetQueueIndex 
        });

        if (beneficiaryEntry && beneficiaryEntry.member_id) {
          const beneficiaryId = beneficiaryEntry.member_id;

          // Add balance to beneficiary's earnings wallet
          await MemberModel.findOneAndUpdate(
            { Member_id: beneficiaryId },
            { $inc: { wallet_balance: payoutAmount } }
          );

          // Generate a fast random txId to prevent DB bottlenecks
          const txId = "GI" + Date.now().toString() + Math.floor(1000 + Math.random() * 9000).toString();

          // Record the transaction
          const transaction = new TransactionModel({
            transaction_id: txId,
            transaction_date: new Date(),
            member_id: beneficiaryId,
            description: `Global Income ($${amount}) from ${memberId} (Payout ${interval.payoutNum}/5)`,
            transaction_type: "Global Income",
            ew_credit: payoutAmount,
            ew_debit: 0,
            uw_credit: 0,
            uw_debit: 0,
            status: "Completed",
            net_amount: payoutAmount,
            gross_amount: payoutAmount
          });
          
          await transaction.save();

          console.log(`[GlobalIncome] Paid $${payoutAmount} to ${beneficiaryId} for $${amount} package (Payout ${interval.payoutNum}/5)`);
        }
      }
    }
  } catch (error) {
    console.error(`[GlobalIncome Error] Failed to distribute global income for ${memberId}:`, error);
  }
};

module.exports = { distributeGlobalIncome };
