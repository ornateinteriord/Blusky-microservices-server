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

    // Intervals: 125th, 150th, 175th, 200th, 225th, 250th, 275th relative purchase.
    // That means the difference between current index and beneficiary index is interval - 1.
    const payoutIntervals = [
      { diff: 124, payoutNum: 1 },
      { diff: 149, payoutNum: 2 },
      { diff: 174, payoutNum: 3 },
      { diff: 199, payoutNum: 4 },
      { diff: 224, payoutNum: 5 },
      { diff: 249, payoutNum: 6 },
      { diff: 274, payoutNum: 7 }
    ];

    const totalPayoutAmount = amount * 0.50; // 50% of the package amount
    const ewCredit = Number((totalPayoutAmount / 2).toFixed(2));
    const uwCredit = Number((totalPayoutAmount - ewCredit).toFixed(2));

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

          // Add balance to beneficiary's earnings wallet and upgrade wallet
          await MemberModel.findOneAndUpdate(
            { Member_id: beneficiaryId },
            { 
              $inc: { 
                wallet_balance: ewCredit,
                upgrade_wallet_balance: uwCredit,
                global_income: totalPayoutAmount
              } 
            }
          );

          // Generate a fast random txId to prevent DB bottlenecks
          const txId = "GI" + Date.now().toString() + Math.floor(1000 + Math.random() * 9000).toString();

          // Record the transaction
          const transaction = new TransactionModel({
            transaction_id: txId,
            transaction_date: new Date(),
            member_id: beneficiaryId,
            description: `Global Income ($${amount}) from ${memberId} (Payout ${interval.payoutNum}/7)`,
            transaction_type: "Global Income",
            ew_credit: ewCredit,
            ew_debit: 0,
            uw_credit: uwCredit,
            uw_debit: 0,
            status: "Completed",
            net_amount: totalPayoutAmount,
            gross_amount: totalPayoutAmount
          });
          
          await transaction.save();

          console.log(`[GlobalIncome] Paid $${totalPayoutAmount} to ${beneficiaryId} for $${amount} package (Payout ${interval.payoutNum}/7)`);
        }
      }
    }
  } catch (error) {
    console.error(`[GlobalIncome Error] Failed to distribute global income for ${memberId}:`, error);
  }
};

module.exports = { distributeGlobalIncome };
